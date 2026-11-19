import { EMPTY } from './constants';
import type { BeadColor } from './model';
import { adjustRgb, hexToOklab, hexToRgb, luminance, rgbToOklab, type Rgb } from './color';
import { createMatcher, type MatchMode } from './matcher';
import { extractAutoPalette } from './autoPalette';

export interface QuantizeOptions {
  brightness: number;
  contrast: number;
  saturation: number;
  removeBackground: boolean;
  backgroundHex: string | null;
  backgroundTolerance: number;
  alphaThreshold: number;
  maxColors: number;
  dither: boolean;
  matchMode?: MatchMode;
  /**
   * 自动配色：先从当前图片聚类出 K 个主色，再映射到色卡。
   * 关闭后走旧逻辑（先匹配全部色卡，再按用量保留 maxColors 个）。
   */
  autoPalette?: boolean;
  /** 合并 OKLab 距离小于该阈值的近色，避免同一白色被拆成多种色号。 */
  mergeNear?: number;
}

export interface QuantizeInput {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  palette: BeadColor[];
  allowed: Uint8Array;
}

export interface QuantizeResult {
  cells: Uint16Array;
  counts: Uint32Array;
  total: number;
  colorCount: number;
  durationMs: number;
}

interface PreparedCell {
  rgb: Rgb;
  empty: boolean;
}

function prepareCells(input: QuantizeInput, options: QuantizeOptions): PreparedCell[] {
  const { data, width, height } = input;
  const count = width * height;
  const cells: PreparedCell[] = new Array(count);
  const bgLab = options.removeBackground && options.backgroundHex ? hexToOklab(options.backgroundHex) : null;
  const tolerance = Math.max(0, options.backgroundTolerance) / 100;
  const alphaThreshold = Math.max(0, Math.min(255, options.alphaThreshold));
  // 1 = 位于背景色容差内；2 = 与外边缘连通，确认是背景。
  const bgMask = bgLab ? new Uint8Array(count) : null;

  for (let i = 0; i < count; i += 1) {
    const offset = i * 4;
    const a = data[offset + 3];
    const raw = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
    if (a < alphaThreshold) {
      cells[i] = { rgb: raw, empty: true };
      continue;
    }
    if (bgLab) {
      const lab = rgbToOklab(raw.r, raw.g, raw.b);
      const dl = lab[0] - bgLab[0];
      const da = lab[1] - bgLab[1];
      const db = lab[2] - bgLab[2];
      if (Math.sqrt(dl * dl + da * da + db * db) <= tolerance) {
        bgMask![i] = 1;
        cells[i] = {
          rgb: adjustRgb(raw, options.brightness, options.contrast, options.saturation),
          empty: false,
        };
        continue;
      }
    }
    cells[i] = {
      rgb: adjustRgb(raw, options.brightness, options.contrast, options.saturation),
      empty: false,
    };
  }

  if (bgMask) {
    // 只删除从图片外边缘能走到的背景色；被深色线稿围住的白发、脸部高光保持为豆子。
    const stack = new Int32Array(count);
    let top = 0;
    const seed = (index: number) => {
      if (bgMask[index] !== 1) return;
      bgMask[index] = 2;
      stack[top++] = index;
    };
    for (let x = 0; x < width; x += 1) {
      seed(x);
      seed((height - 1) * width + x);
    }
    for (let y = 0; y < height; y += 1) {
      seed(y * width);
      seed(y * width + width - 1);
    }
    while (top > 0) {
      const index = stack[--top];
      const x = index % width;
      const y = Math.floor(index / width);
      if (x > 0) seed(index - 1);
      if (x + 1 < width) seed(index + 1);
      if (y > 0) seed(index - width);
      if (y + 1 < height) seed(index + width);
    }
    for (let i = 0; i < count; i += 1) {
      if (bgMask[i] === 2) cells[i].empty = true;
    }
  }

  return cells;
}

type Matcher = { nearest(rgb: Rgb): number; colors: BeadColor[]; mode?: MatchMode };

function asMatcher(m: { nearest(rgb: Rgb): number; colors?: BeadColor[] }, palette: BeadColor[]): Matcher {
  return { nearest: (rgb) => m.nearest(rgb), colors: m.colors ?? palette, mode: (m as { mode?: MatchMode }).mode } as Matcher;
}

function mapWithoutDither(cells: PreparedCell[], matcher: Matcher): Uint16Array {
  const result = new Uint16Array(cells.length);
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (cell.empty) {
      result[i] = EMPTY;
      continue;
    }
    result[i] = matcher.nearest(cell.rgb);
  }
  return result;
}

function mapWithDither(cells: PreparedCell[], width: number, height: number, matcher: Matcher): Uint16Array {
  const result = new Uint16Array(cells.length);
  const error = new Float32Array(cells.length * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const cell = cells[index];
      if (cell.empty) {
        result[index] = EMPTY;
        continue;
      }
      const r = clamp(cell.rgb.r + error[index * 3]);
      const g = clamp(cell.rgb.g + error[index * 3 + 1]);
      const b = clamp(cell.rgb.b + error[index * 3 + 2]);
      const chosen = matcher.nearest({ r, g, b });
      result[index] = chosen;
      const color = matcher.colors[chosen];
      const target = hexToRgb(color.hex);
      const er = r - target.r;
      const eg = g - target.g;
      const eb = b - target.b;
      distribute(error, width, height, x, y, er, eg, eb);
    }
  }
  return result;
}

function distribute(
  error: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  er: number,
  eg: number,
  eb: number,
): void {
  const add = (dx: number, dy: number, factor: number) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
    const offset = (ny * width + nx) * 3;
    error[offset] += er * factor;
    error[offset + 1] += eg * factor;
    error[offset + 2] += eb * factor;
  };
  add(1, 0, 7 / 16);
  add(-1, 1, 3 / 16);
  add(0, 1, 5 / 16);
  add(1, 1, 1 / 16);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function countColors(cells: Uint16Array, size: number): { counts: Uint32Array; total: number; distinct: number } {
  const counts = new Uint32Array(size);
  let total = 0;
  for (let i = 0; i < cells.length; i += 1) {
    const value = cells[i];
    if (value === EMPTY) continue;
    if (value < counts.length) counts[value] += 1;
    total += 1;
  }
  let distinct = 0;
  for (let i = 0; i < counts.length; i += 1) if (counts[i]) distinct += 1;
  return { counts, total, distinct };
}

function limitCells(
  cells: PreparedCell[],
  width: number,
  height: number,
  palette: BeadColor[],
  matcher: Matcher,
  maxColors: number,
  dither: boolean,
): Uint16Array {
  const initial = mapWithoutDither(cells, matcher);
  const first = countColors(initial, palette.length);
  if (!maxColors || first.distinct <= maxColors) {
    return dither ? mapWithDither(cells, width, height, matcher) : initial;
  }
  const used: number[] = [];
  for (let i = 0; i < first.counts.length; i += 1) if (first.counts[i]) used.push(i);
  // 低频但高对比的色必须保留：眼睛/描边（最深）与白发/高光（最浅）。
  // 只按出现频率取色会把只有十几颗的黑色眼睛丢掉，眼睛就会被映成深灰蓝。
  const chosen = new Set<number>();
  if (maxColors >= 4) {
    const byLuminance = [...used].sort((a, b) => luminance(palette[a].hex) - luminance(palette[b].hex));
    const reserve = maxColors >= 6 ? 2 : 1;
    byLuminance.slice(0, reserve).forEach((index) => chosen.add(index));
    byLuminance.slice(-reserve).forEach((index) => chosen.add(index));
  }
  const byCount = [...used].sort((a, b) => first.counts[b] - first.counts[a]);
  for (const index of byCount) {
    if (chosen.size >= maxColors) break;
    chosen.add(index);
  }
  const kept = [...chosen].slice(0, Math.max(1, maxColors));
  const allowed = new Uint8Array(palette.length);
  kept.forEach((index) => { allowed[index] = 1; });
  const limitedMatcher = asMatcher(createMatcher(palette, allowed, { mode: matcher.mode ?? 'standard' }), palette);
  return dither
    ? mapWithDither(cells, width, height, limitedMatcher)
    : mapWithoutDither(cells, limitedMatcher);
}

export function quantizeImage(input: QuantizeInput, options: QuantizeOptions): QuantizeResult {
  const started = performance.now();
  const prepared = prepareCells(input, options);
  const matchMode = options.matchMode ?? 'faithful';
  const matcher = asMatcher(createMatcher(input.palette, input.allowed, { mode: matchMode }), input.palette);
  (matcher as { mode?: MatchMode }).mode = matchMode;
  const maxColors = Math.max(0, options.maxColors || 0);
  let cells: Uint16Array;

  if (options.autoPalette && maxColors > 0) {
    // 先按图片自身的颜色分布选出 K 个主色，再只用这些色号落豆。
    const auto = extractAutoPalette(prepared, input.palette, input.allowed, maxColors);
    if (auto.indices.length) {
      const mask = new Uint8Array(input.palette.length);
      auto.indices.forEach((index) => { mask[index] = 1; });
      const autoMatcher = asMatcher(createMatcher(input.palette, mask, { mode: matchMode }), input.palette);
      (autoMatcher as { mode?: MatchMode }).mode = matchMode;
      cells = options.dither
        ? mapWithDither(prepared, input.width, input.height, autoMatcher)
        : mapWithoutDither(prepared, autoMatcher);
    } else {
      cells = limitCells(prepared, input.width, input.height, input.palette, matcher, maxColors, options.dither);
    }
  } else {
    cells = limitCells(prepared, input.width, input.height, input.palette, matcher, maxColors, options.dither);
  }
  let { counts, total, distinct } = countColors(cells, input.palette.length);
  let finalCells = cells;
  if (options.mergeNear && options.mergeNear > 0) {
    const merged = mergeNearColors(cells, input.palette, options.mergeNear);
    finalCells = merged;
    const recounted = countColors(finalCells, input.palette.length);
    counts = recounted.counts;
    total = recounted.total;
    distinct = recounted.distinct;
  }
  return {
    cells: finalCells,
    counts,
    total,
    colorCount: distinct,
    durationMs: Math.round(performance.now() - started),
  };
}

/** 将已量化结果中 OKLab 距离小于阈值的近色合并到该组内用量最多的色。 */
export function mergeNearColors(cells: Uint16Array, palette: BeadColor[], threshold: number): Uint16Array {
  const counts = new Map<number, number>();
  for (let i = 0; i < cells.length; i += 1) {
    const v = cells[i];
    if (v !== EMPTY) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const used = [...counts.keys()];
  const labs = new Map<number, [number, number, number]>();
  used.forEach((i) => {
    const { r, g, b } = hexToRgb(palette[i].hex);
    labs.set(i, rgbToOklab(r, g, b));
  });
  const parent = new Map<number, number>(used.map((i) => [i, i]));
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (let i = 0; i < used.length; i += 1) {
    for (let j = i + 1; j < used.length; j += 1) {
      const a = used[i], b = used[j];
      const la = labs.get(a)!, lb = labs.get(b)!;
      const d = Math.sqrt((la[0]-lb[0])**2 + (la[1]-lb[1])**2 + (la[2]-lb[2])**2);
      if (d < threshold) {
        const ra = find(a), rb = find(b);
        if (ra !== rb) {
          const ca = counts.get(ra) ?? 0, cb = counts.get(rb) ?? 0;
          if (ca >= cb) parent.set(rb, ra);
          else parent.set(ra, rb);
        }
      }
    }
  }
  const result = new Uint16Array(cells.length);
  for (let i = 0; i < cells.length; i += 1) {
    const v = cells[i];
    result[i] = v === EMPTY ? EMPTY : find(v);
  }
  return result;
}
