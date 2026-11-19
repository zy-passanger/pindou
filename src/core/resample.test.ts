import { describe, expect, it } from 'vitest';
import { resampleArea } from './resample';

type Pixel = [number, number, number, number];

function makeSource(pixels: Pixel[], width = 4, height = 4): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((pixel, index) => data.set(pixel, index * 4));
  return data;
}

function fill(color: Pixel, count: number, rest: Pixel[]): Pixel[] {
  return [...Array.from({ length: count }, () => color), ...rest];
}

describe('resampleArea', () => {
  it('低对比格子做面积平均', () => {
    const source = makeSource([
      ...Array.from({ length: 8 }, () => [128, 128, 128, 255] as Pixel),
      ...Array.from({ length: 8 }, () => [144, 144, 144, 255] as Pixel),
    ]);
    const result = resampleArea(source, 4, 4, 1, 1);
    expect(result.width).toBe(1);
    expect(result.data[0]).toBe(136);
    expect(result.data[1]).toBe(136);
    expect(result.data[2]).toBe(136);
    expect(result.data[3]).toBe(255);
  });

  it('高对比格子保留最深色线稿，而不是被白色平均掉', () => {
    const source = makeSource(fill([255, 255, 255, 255], 15, [[0, 0, 0, 255]]));
    const result = resampleArea(source, 4, 4, 1, 1);
    expect(Array.from(result.data)).toEqual([0, 0, 0, 255]);
  });

  it('高彩度细节优先保留，紫色眼睛不会被肤色/白色average掉', () => {
    const source = makeSource(fill([255, 243, 227, 255], 14, [
      [123, 63, 181, 255],
      [123, 63, 181, 255],
    ]));
    const result = resampleArea(source, 4, 4, 1, 1);
    expect(Array.from(result.data)).toEqual([123, 63, 181, 255]);
  });

  it('高对比格子保留最浅的高光', () => {
    const source = makeSource(fill([96, 96, 96, 255], 14, [
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ]));
    const result = resampleArea(source, 4, 4, 1, 1);
    expect(Array.from(result.data)).toEqual([255, 255, 255, 255]);
  });

  it('透明子像素不参与颜色平均，但计入 alpha', () => {
    const source = makeSource(fill([0, 0, 0, 255], 8, Array.from({ length: 8 }, () => [0, 0, 0, 0] as Pixel)));
    const result = resampleArea(source, 4, 4, 1, 1);
    expect(Array.from(result.data)).toEqual([0, 0, 0, 128]);
  });

  it('支持非 4 倍的整数倍缩放', () => {
    const source = makeSource(Array.from({ length: 4 }, () => [200, 100, 50, 255] as Pixel), 2, 2);
    const result = resampleArea(source, 2, 2, 1, 1);
    expect(Array.from(result.data)).toEqual([200, 100, 50, 255]);
  });

  it('源图不是目标尺寸的整数倍时抛出明确错误', () => {
    expect(() => resampleArea(new Uint8ClampedArray(16), 4, 4, 3, 1)).toThrow('整数倍');
    expect(() => resampleArea(new Uint8ClampedArray(16), 4, 4, 1, 3)).toThrow('整数倍');
    expect(() => resampleArea(new Uint8ClampedArray(16), 4, 4, 5, 1)).toThrow('源图尺寸');
    expect(() => resampleArea(new Uint8ClampedArray(16), 4, 4, 0, 1)).not.toThrow();
  });
});
