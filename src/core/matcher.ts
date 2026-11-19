import type { BeadColor } from './model';
import { hexToRgb, PaletteMatcher, rgbToOklab, type Rgb } from './color';

export type MatchMode = 'standard' | 'faithful';

export interface MatchOptions {
  mode: MatchMode;
}

const DEFAULT_MATCH: MatchOptions = { mode: 'faithful' };

function hueOf(a: number, b: number): number {
  return Math.atan2(b, a);
}

function hueDistance(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

function chromaOf(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}

/**
 * 保色匹配：在 OKLab 距离基础上，对高饱和源像素额外惩罚色相偏差，
 * 对低饱和源像素按亮度优先。避免蓝围巾被映成灰、白发被拆成粉灰。
 */
export class FaithfulMatcher {
  readonly colors: BeadColor[];
  private readonly labs: Float32Array;
  private readonly hues: Float32Array;
  private readonly chromas: Float32Array;
  private readonly allowedIndices: Int32Array;

  constructor(colors: BeadColor[], allowed?: Uint8Array) {
    this.colors = colors;
    this.labs = new Float32Array(colors.length * 3);
    this.hues = new Float32Array(colors.length);
    this.chromas = new Float32Array(colors.length);
    const allowedList: number[] = [];
    colors.forEach((color, index) => {
      const { r, g, b } = hexToRgb(color.hex);
      const [l, a, bb] = rgbToOklab(r, g, b);
      this.labs[index * 3] = l;
      this.labs[index * 3 + 1] = a;
      this.labs[index * 3 + 2] = bb;
      this.hues[index] = hueOf(a, bb);
      this.chromas[index] = chromaOf(a, bb);
      if (!allowed || allowed[index]) allowedList.push(index);
    });
    if (allowedList.length === 0) for (let i = 0; i < colors.length; i += 1) allowedList.push(i);
    this.allowedIndices = Int32Array.from(allowedList);
  }

  nearest(rgb: Rgb): number {
    const [l, a, b] = rgbToOklab(rgb.r, rgb.g, rgb.b);
    return this.nearestLab(l, a, b);
  }

  /**
   * 从 OKLab 中心点找最近色号。exclude 用于自动配色为不同聚类分配唯一色号，
   * 避免两个聚类收敛到同一个豆色后凭空少一个颜色。
   */
  nearestLab(l: number, a: number, b: number, exclude?: Uint8Array): number {
    const srcChroma = chromaOf(a, b);
    const srcHue = hueOf(a, b);
    const colorful = srcChroma > 0.015;
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let k = 0; k < this.allowedIndices.length; k += 1) {
      const i = this.allowedIndices[k];
      if (exclude && exclude[i]) continue;
      const dl = l - this.labs[i * 3];
      const da = a - this.labs[i * 3 + 1];
      const db = b - this.labs[i * 3 + 2];
      let score = dl * dl + da * da + db * db;
      if (colorful) {
        const hueDiff = hueDistance(srcHue, this.hues[i]);
        // 源像素越饱和，对色相偏差惩罚越大；避免蓝色被映成灰。
        const chromaWeight = Math.min(1.6, srcChroma * 12);
        score += hueDiff * hueDiff * chromaWeight * 0.012;
        // 目标也应有相近的彩度，避免高饱和被映成低饱和灰。
        const chromaDiff = Math.abs(srcChroma - this.chromas[i]);
        score += chromaDiff * chromaDiff * 0.4;
      } else {
        // 低饱和：明度优先，减少白/浅灰被拆成多种近色。
        score = dl * dl * 2.2 + (da * da + db * db) * 0.35;
      }
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }
}

export function createMatcher(colors: BeadColor[], allowed: Uint8Array | undefined, options?: Partial<MatchOptions>) {
  const mode = options?.mode ?? DEFAULT_MATCH.mode;
  if (mode === 'standard') return new PaletteMatcher(colors, allowed) as { nearest(rgb: Rgb): number };
  return new FaithfulMatcher(colors, allowed);
}

export type { Rgb };
