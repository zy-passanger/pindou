import { converter } from 'culori';
import type { BeadColor } from './model';

const toOklab = converter('oklab');

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  let value = hex.replace('#', '');
  if (value.length === 3) value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
  const num = Number.parseInt(value, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const c = toOklab({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255 }) as { l: number; a: number; b: number };
  return [c.l, c.a, c.b];
}

export function hexToOklab(hex: string): [number, number, number] {
  const rgb = hexToRgb(hex);
  return rgbToOklab(rgb.r, rgb.g, rgb.b);
}

export function oklabDistanceSq(a: [number, number, number], b: [number, number, number]): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function adjustRgb(rgb: Rgb, brightness: number, contrast: number, saturation: number): Rgb {
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;
  const co = contrast / 100;
  const sa = saturation / 100;
  const br = brightness / 100;
  r = (r - 0.5) * co + 0.5;
  g = (g - 0.5) * co + 0.5;
  b = (b - 0.5) * co + 0.5;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  r = lum + (r - lum) * sa;
  g = lum + (g - lum) * sa;
  b = lum + (b - lum) * sa;
  return {
    r: Math.max(0, Math.min(255, r * br * 255)),
    g: Math.max(0, Math.min(255, g * br * 255)),
    b: Math.max(0, Math.min(255, b * br * 255)),
  };
}

/**
 * 预计算色卡 OKLab 的匹配器。
 * allowed 为 Uint8Array（长度 = colors.length，1 = 允许）。
 */
export class PaletteMatcher {
  readonly colors: BeadColor[];
  private readonly labs: Float32Array;
  private readonly allowedIndices: Int32Array;

  constructor(colors: BeadColor[], allowed?: Uint8Array) {
    this.colors = colors;
    this.labs = new Float32Array(colors.length * 3);
    const allowedList: number[] = [];
    colors.forEach((color, index) => {
      const [l, a, b] = hexToOklab(color.hex);
      this.labs[index * 3] = l;
      this.labs[index * 3 + 1] = a;
      this.labs[index * 3 + 2] = b;
      if (!allowed || allowed[index]) allowedList.push(index);
    });
    if (allowedList.length === 0) {
      for (let i = 0; i < colors.length; i += 1) allowedList.push(i);
    }
    this.allowedIndices = Int32Array.from(allowedList);
  }

  get allowedCount(): number {
    return this.allowedIndices.length;
  }

  nearestFromLab(l: number, a: number, b: number): number {
    let best = this.allowedIndices[0] ?? 0;
    let bestDist = Number.POSITIVE_INFINITY;
    const labs = this.labs;
    const allowed = this.allowedIndices;
    for (let i = 0; i < allowed.length; i += 1) {
      const index = allowed[i];
      const dl = l - labs[index * 3];
      const da = a - labs[index * 3 + 1];
      const db = b - labs[index * 3 + 2];
      const dist = dl * dl + da * da + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    }
    return best;
  }

  nearest(rgb: Rgb): number {
    const lab = rgbToOklab(rgb.r, rgb.g, rgb.b);
    return this.nearestFromLab(lab[0], lab[1], lab[2]);
  }
}
