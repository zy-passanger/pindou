import type { BeadColor } from './model';
import { rgbToOklab, type Rgb } from './color';
import { FaithfulMatcher } from './matcher';

export interface AutoPaletteSample {
  rgb: Rgb;
  empty: boolean;
}

export interface AutoPaletteResult {
  /** 入选的色卡下标（按聚类权重从大到小）。 */
  indices: number[];
  /** 每个入选色号的聚类权重（格数），用于预览与统计。 */
  weights: Map<number, number>;
  /** 实际聚类数量。 */
  clusters: number;
}

interface ColorBin {
  rgb: Rgb;
  l: number;
  a: number;
  b: number;
  weight: number;
}

const MAX_ITERATIONS = 28;
const CONVERGED = 1e-4;

function makeBins(cells: AutoPaletteSample[]): ColorBin[] {
  const map = new Map<number, ColorBin>();
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (cell.empty) continue;
    const r = Math.max(0, Math.min(255, Math.round(cell.rgb.r)));
    const g = Math.max(0, Math.min(255, Math.round(cell.rgb.g)));
    const b = Math.max(0, Math.min(255, Math.round(cell.rgb.b)));
    const key = (r << 16) | (g << 8) | b;
    const existing = map.get(key);
    if (existing) {
      existing.weight += 1;
      continue;
    }
    const [l, a, bb] = rgbToOklab(r, g, b);
    map.set(key, { rgb: { r, g, b }, l, a, b: bb, weight: 1 });
  }
  return [...map.values()];
}

function weightedMean(bins: ColorBin[], assignment: Int32Array, cluster: number): [number, number, number, number] | null {
  let l = 0;
  let a = 0;
  let b = 0;
  let weight = 0;
  for (let i = 0; i < bins.length; i += 1) {
    if (assignment[i] !== cluster) continue;
    const bin = bins[i];
    l += bin.l * bin.weight;
    a += bin.a * bin.weight;
    b += bin.b * bin.weight;
    weight += bin.weight;
  }
  if (!weight) return null;
  return [l / weight, a / weight, b / weight, weight];
}

/**
 * 从当前图片本身提取配色，不依赖任何参考图纸或预设色号。
 *
 * 做法：把有效像素的 RGB 聚成唯一色 bin，在 OKLab 空间做按格数加权的 k-means；
 * 初始种子固定取最深、最浅、最高彩度，再按距离补足，保证眼睛/描边、白发/高光、
 * 高饱和点缀不会被大面积肤色或背景吞掉。聚类中心最后再映射到 MARD 色卡，
 * 并在分配色号时排除已被占用的色号，保证 K 个聚类得到 K 个不同豆色。
 *
 * 因此换一张图时会重新统计该图的颜色分布，得到不同的色号组合；
 * 只有「K、加权方式、种子策略、映射方式」是固定的，具体色号不跨图复用。
 */
export function extractAutoPalette(
  cells: AutoPaletteSample[],
  palette: BeadColor[],
  allowed: Uint8Array,
  maxColors: number,
): AutoPaletteResult {
  const target = Math.max(0, Math.floor(maxColors));
  const bins = makeBins(cells);
  if (!target || !bins.length || !palette.length) {
    return { indices: [], weights: new Map(), clusters: 0 };
  }

  const allowedIndices: number[] = [];
  allowed.forEach((value, index) => {
    if (value) allowedIndices.push(index);
  });
  if (!allowedIndices.length) return { indices: [], weights: new Map(), clusters: 0 };

  const k = Math.min(target, allowedIndices.length, bins.length);
  if (k <= 0) return { indices: [], weights: new Map(), clusters: 0 };

  let darkest = 0;
  let lightest = 0;
  let mostChromatic = 0;
  let maxChroma = -1;
  for (let i = 0; i < bins.length; i += 1) {
    const bin = bins[i];
    if (bin.l < bins[darkest].l) darkest = i;
    if (bin.l > bins[lightest].l) lightest = i;
    const chroma = Math.hypot(bin.a, bin.b);
    if (chroma > maxChroma) {
      maxChroma = chroma;
      mostChromatic = i;
    }
  }

  const centers: Array<[number, number, number]> = [];
  const seedBins: number[] = [];
  const addSeed = (index: number) => {
    if (seedBins.includes(index) || seedBins.length >= k) return;
    seedBins.push(index);
    centers.push([bins[index].l, bins[index].a, bins[index].b]);
  };
  // K=1 时直接用主色聚类；K≥2 必留最暗与最亮；K≥3 再留最高彩度。
  if (k === 1) {
    let heaviest = 0;
    for (let i = 1; i < bins.length; i += 1) if (bins[i].weight > bins[heaviest].weight) heaviest = i;
    addSeed(heaviest);
  } else {
    addSeed(darkest);
    addSeed(lightest);
    if (k >= 3) addSeed(mostChromatic);
  }

  // 确定性最远点补种：加权距离，既覆盖大面积色，也不忽略小而独立的色块。
  while (centers.length < k) {
    let bestBin = -1;
    let bestScore = -1;
    for (let i = 0; i < bins.length; i += 1) {
      if (seedBins.includes(i)) continue;
      const bin = bins[i];
      let minDist = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centers.length; c += 1) {
        const center = centers[c];
        const dl = bin.l - center[0];
        const da = bin.a - center[1];
        const db = bin.b - center[2];
        const dist = dl * dl + da * da + db * db;
        if (dist < minDist) minDist = dist;
      }
      const score = minDist * Math.sqrt(bin.weight + 1);
      if (score > bestScore) {
        bestScore = score;
        bestBin = i;
      }
    }
    if (bestBin < 0) break;
    addSeed(bestBin);
  }

  const clusterCount = centers.length;
  const assignment = new Int32Array(bins.length);
  let changed = true;
  for (let iteration = 0; iteration < MAX_ITERATIONS && changed; iteration += 1) {
    changed = false;
    for (let i = 0; i < bins.length; i += 1) {
      const bin = bins[i];
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let c = 0; c < clusterCount; c += 1) {
        const center = centers[c];
        const dl = bin.l - center[0];
        const da = bin.a - center[1];
        const db = bin.b - center[2];
        const dist = dl * dl + da * da + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best;
        changed = true;
      }
    }

    let maxShift = 0;
    for (let c = 0; c < clusterCount; c += 1) {
      const mean = weightedMean(bins, assignment, c);
      if (!mean) {
        // 空聚类：把它重新放到离现有中心最远的色 bin 上，避免浪费一个颜色名额。
        let farthest = -1;
        let farthestDist = -1;
        for (let i = 0; i < bins.length; i += 1) {
          const bin = bins[i];
          let minDist = Number.POSITIVE_INFINITY;
          for (let j = 0; j < clusterCount; j += 1) {
            const center = centers[j];
            const dl = bin.l - center[0];
            const da = bin.a - center[1];
            const db = bin.b - center[2];
            const dist = dl * dl + da * da + db * db;
            if (dist < minDist) minDist = dist;
          }
          if (minDist > farthestDist) {
            farthestDist = minDist;
            farthest = i;
          }
        }
        if (farthest >= 0) {
          centers[c] = [bins[farthest].l, bins[farthest].a, bins[farthest].b];
          maxShift = Math.max(maxShift, 0.01);
        }
        continue;
      }
      const prev = centers[c];
      const next: [number, number, number] = [mean[0], mean[1], mean[2]];
      const shift = Math.hypot(prev[0] - next[0], prev[1] - next[1], prev[2] - next[2]);
      if (shift > maxShift) maxShift = shift;
      centers[c] = next;
    }
    if (maxShift < CONVERGED) break;
  }

  const clusterWeights = new Float64Array(clusterCount);
  for (let i = 0; i < bins.length; i += 1) clusterWeights[assignment[i]] += bins[i].weight;

  // 保护最深/最浅/最高彩度的聚类，让它们先挑色号：黑眼睛不会被深蓝抢走，
  // 白发不会被浅灰或肤色抢走，金色/粉色点缀也不会被大面积主色挤掉。
  const protectedClusters: number[] = [];
  const protect = (binIndex: number) => {
    const bin = bins[binIndex];
    if (!bin || bin.weight <= 0) return;
    const cluster = assignment[binIndex];
    if (!protectedClusters.includes(cluster)) protectedClusters.push(cluster);
  };
  protect(darkest);
  protect(lightest);
  protect(mostChromatic);

  const order: number[] = [...protectedClusters];
  const rest: number[] = [];
  for (let c = 0; c < clusterCount; c += 1) {
    if (clusterWeights[c] > 0 && !order.includes(c)) rest.push(c);
  }
  rest.sort((a, b) => clusterWeights[b] - clusterWeights[a]);
  order.push(...rest);

  const matcher = new FaithfulMatcher(palette, allowed);
  const excluded = new Uint8Array(palette.length);
  const indices: number[] = [];
  const weights = new Map<number, number>();
  for (const cluster of order) {
    const center = centers[cluster];
    const index = matcher.nearestLab(center[0], center[1], center[2], excluded);
    if (index < 0) continue;
    excluded[index] = 1;
    indices.push(index);
    weights.set(index, clusterWeights[cluster]);
  }

  return { indices, weights, clusters: order.length };
}
