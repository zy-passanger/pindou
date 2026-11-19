import { describe, expect, it } from 'vitest';
import { EMPTY } from './constants';
import type { BeadColor } from './model';
import { quantizeImage, type QuantizeInput, type QuantizeOptions } from './quantize';

const palette: BeadColor[] = [
  { code: 'K', name: '黑', hex: '#000000', series: 'K', common: true },
  { code: 'W', name: '白', hex: '#FFFFFF', series: 'W', common: true },
  { code: 'R', name: '红', hex: '#FF0000', series: 'R', common: true },
  { code: 'B', name: '蓝', hex: '#0000FF', series: 'B', common: true },
];

const allowed = new Uint8Array([1, 1, 1, 1]);

function inputFromPixels(pixels: Array<[number, number, number, number]>): QuantizeInput {
  return {
    width: pixels.length,
    height: 1,
    data: new Uint8ClampedArray(pixels.flat()),
    palette,
    allowed,
  };
}

const options: QuantizeOptions = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  removeBackground: false,
  backgroundHex: null,
  backgroundTolerance: 8,
  alphaThreshold: 1,
  maxColors: 0,
  dither: false,
};

describe('quantizeImage', () => {
  it('把精确色值映射到色卡，并保留透明空格', () => {
    const input = inputFromPixels([
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [255, 0, 0, 255],
      [0, 0, 0, 0],
    ]);
    const result = quantizeImage(input, options);
    expect(Array.from(result.cells)).toEqual([0, 1, 2, EMPTY]);
    expect(result.total).toBe(3);
    expect(result.colorCount).toBe(3);
    expect(result.counts[0]).toBe(1);
  });

  it('按透明度阈值去掉透明像素', () => {
    const input = inputFromPixels([
      [0, 0, 0, 100],
      [0, 0, 0, 255],
    ]);
    const result = quantizeImage(input, { ...options, alphaThreshold: 128 });
    expect(Array.from(result.cells)).toEqual([EMPTY, 0]);
  });

  it('背景移除支持容差', () => {
    const input = inputFromPixels([
      [255, 255, 255, 255],
      [250, 250, 250, 255],
      [0, 0, 0, 255],
    ]);
    const result = quantizeImage(input, {
      ...options,
      removeBackground: true,
      backgroundHex: '#FFFFFF',
      backgroundTolerance: 8,
    });
    expect(Array.from(result.cells)).toEqual([EMPTY, EMPTY, 0]);
  });

  it('被深色线稿围住的白发/高光不会被当成背景删除', () => {
    const w = 5, h = 5;
    const pixels: number[] = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const white = x === 0 || y === 0 || x === w - 1 || y === h - 1 || (x === 2 && y === 2);
        const blackRing = !white && x >= 1 && x <= 3 && y >= 1 && y <= 3;
        const rgb = white ? [255, 255, 255] : blackRing ? [0, 0, 0] : [255, 0, 0];
        pixels.push(...rgb, 255);
      }
    }
    const result = quantizeImage(
      { width: w, height: h, data: new Uint8ClampedArray(pixels), palette, allowed },
      { ...options, removeBackground: true, backgroundHex: '#FFFFFF', backgroundTolerance: 8 },
    );
    // 外圈白色背景被移除
    expect(result.cells[0]).toBe(EMPTY);
    expect(result.cells[4]).toBe(EMPTY);
    // 被黑色线稿包围的白色内部保留为白色豆子
    expect(result.cells[2 * w + 2]).toBe(1);
    expect(result.total).toBe(9);
  });

  it('保色模式优先保留高饱和像素的色相，不把蓝映成灰', () => {
    const scarf: QuantizeInput = {
      width: 1, height: 1,
      data: new Uint8ClampedArray([49, 63, 76, 255]),
      palette,
      allowed: new Uint8Array([1, 1, 1, 1]),
    };
    // 当前 palette: K 黑 / W 白 / R 红 / B 蓝
    const result = quantizeImage(scarf, { ...options, matchMode: 'faithful' });
    // 源色偏蓝，保色模式应选蓝色 B(3)，而不是黑/灰
    expect(result.cells[0]).toBe(3);
  });

  it('mergeNear 会把 OKLab 距离很近的色号合并', () => {
    const nearPalette = [
      { code: 'W1', name: '白', hex: '#FFFFFF', series: 'W', common: true },
      { code: 'W2', name: '近白', hex: '#FEFEFE', series: 'W', common: true },
      { code: 'R1', name: '红', hex: '#FF0000', series: 'R', common: true },
    ];
    const input: QuantizeInput = {
      width: 2, height: 1,
      data: new Uint8ClampedArray([255,255,255,255, 254,254,254,255]),
      palette: nearPalette,
      allowed: new Uint8Array([1,1,1]),
    };
    const merged = quantizeImage(input, { ...options, matchMode: 'standard', mergeNear: 0.02 });
    expect(merged.colorCount).toBe(1);
  });

  it('只使用允许的色卡范围', () => {
    const input = inputFromPixels([
      [255, 0, 0, 255],
      [255, 255, 255, 255],
    ]);
    const restricted = quantizeImage({ ...input, allowed: new Uint8Array([0, 0, 0, 1]) }, options);
    expect(Array.from(restricted.cells)).toEqual([3, 3]);
  });

  it('限制最多颜色数', () => {
    const input = inputFromPixels([
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]);
    const result = quantizeImage(input, { ...options, maxColors: 1 });
    expect(result.colorCount).toBe(1);
    expect(Array.from(result.cells)).toEqual([2, 2, 2, 2]);
  });

  it('限色时保留低频但关键的黑色眼睛色与白色', () => {
    const pixels: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 30; i += 1) pixels.push([255, 255, 255, 255]); // 白
    for (let i = 0; i < 12; i += 1) pixels.push([255, 0, 0, 255]);     // 红
    for (let i = 0; i < 8; i += 1) pixels.push([0, 255, 0, 255]);      // 绿
    pixels.push([0, 0, 0, 255]);                                        // 黑色眼睛，仅 1 颗
    const input: QuantizeInput = {
      width: pixels.length, height: 1,
      data: new Uint8ClampedArray(pixels.flat()),
      palette, allowed,
    };
    const result = quantizeImage(input, { ...options, maxColors: 3 });
    expect(Array.from(result.cells)).toContain(0); // K 黑
    expect(Array.from(result.cells)).toContain(1); // W 白
    expect(result.colorCount).toBeLessThanOrEqual(3);
  });

  it('自动配色按图片聚类选色，低频点缀不会被用量挤掉', () => {
    const richPalette: BeadColor[] = [
      { code: 'SKIN', name: '肤', hex: '#E8B58C', series: 'S', common: true },
      { code: 'NAVY', name: '藏蓝', hex: '#25406E', series: 'N', common: true },
      { code: 'INK', name: '墨', hex: '#111111', series: 'K', common: true },
      { code: 'PINK', name: '粉', hex: '#F2A0B5', series: 'P', common: true },
      { code: 'GOLD', name: '金', hex: '#D6A23F', series: 'G', common: true },
    ];
    const pixels: Array<[number, number, number, number]> = [];
    const push = (hex: string, count: number) => {
      const value = Number.parseInt(hex.slice(1), 16);
      for (let i = 0; i < count; i += 1) {
        pixels.push([(value >> 16) & 255, (value >> 8) & 255, value & 255, 255]);
      }
    };
    push('#E8B58C', 300);
    push('#25406E', 80);
    push('#111111', 12);
    push('#F2A0B5', 6);
    const richInput: QuantizeInput = {
      width: pixels.length,
      height: 1,
      data: new Uint8ClampedArray(pixels.flat()),
      palette: richPalette,
      allowed: new Uint8Array(richPalette.length).fill(1),
    };
    const result = quantizeImage(richInput, { ...options, maxColors: 4, autoPalette: true });
    const used = new Set(Array.from(result.cells));
    expect(used.has(2)).toBe(true); // 黑眼睛
    expect(used.has(3)).toBe(true); // 粉色点缀
    expect(result.colorCount).toBe(4);
  });

  it('抖动结果稳定且不改变总颗数', () => {
    const pixels: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 64; i += 1) {
      const value = Math.round((i / 63) * 255);
      pixels.push([value, value, value, 255]);
    }
    const input: QuantizeInput = {
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(pixels.flat()),
      palette,
      allowed,
    };
    const first = quantizeImage(input, { ...options, dither: true });
    const second = quantizeImage(input, { ...options, dither: true });
    expect(first.total).toBe(64);
    expect(Array.from(first.cells)).toEqual(Array.from(second.cells));
  });

  it('亮度预处理会改变匹配结果', () => {
    const input = inputFromPixels([
      [160, 160, 160, 255],
      [160, 160, 160, 255],
    ]);
    const dark = quantizeImage(input, { ...options, brightness: 40 });
    const bright = quantizeImage(input, { ...options, brightness: 160 });
    expect(dark.cells[0]).not.toBe(bright.cells[0]);
  });
});
