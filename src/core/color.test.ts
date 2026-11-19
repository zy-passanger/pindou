import { describe, expect, it } from 'vitest';
import {
  adjustRgb,
  hexToOklab,
  hexToRgb,
  luminance,
  PaletteMatcher,
  rgbToHex,
  rgbToOklab,
} from './color';
import type { BeadColor } from './model';

const palette: BeadColor[] = [
  { code: 'K', name: '黑', hex: '#000000', series: 'K', common: true },
  { code: 'W', name: '白', hex: '#FFFFFF', series: 'W', common: true },
  { code: 'R', name: '红', hex: '#FF0000', series: 'R', common: true },
];

describe('color', () => {
  it('解析 3 位和 6 位 HEX', () => {
    expect(hexToRgb('#FF8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(hexToRgb('#F80')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('输出大写 HEX 并夹取范围', () => {
    expect(rgbToHex(255, 128, 0)).toBe('#FF8000');
    expect(rgbToHex(-5, 300, 12.4)).toBe('#00FF0C');
  });

  it('OKLab 转换与距离稳定', () => {
    const black = rgbToOklab(0, 0, 0);
    expect(black[0]).toBeCloseTo(0, 5);
    const white = hexToOklab('#FFFFFF');
    expect(white[0]).toBeCloseTo(1, 4);
    expect(hexToOklab('#FF0000')).toEqual(rgbToOklab(255, 0, 0));
  });

  it('匹配器返回最接近的允许色', () => {
    const matcher = new PaletteMatcher(palette);
    expect(matcher.nearest({ r: 250, g: 10, b: 10 })).toBe(2);
    expect(matcher.nearest({ r: 245, g: 245, b: 245 })).toBe(1);
    expect(matcher.nearest({ r: 8, g: 8, b: 8 })).toBe(0);
  });

  it('我的色卡限制会排除不允许的颜色', () => {
    const allowed = new Uint8Array([0, 0, 1]);
    const matcher = new PaletteMatcher(palette, allowed);
    expect(matcher.allowedCount).toBe(1);
    expect(matcher.nearest({ r: 255, g: 0, b: 0 })).toBe(2);
    expect(matcher.nearest({ r: 0, g: 0, b: 0 })).toBe(2);
  });

  it('空限制回退到全部颜色', () => {
    const matcher = new PaletteMatcher(palette, new Uint8Array([0, 0, 0]));
    expect(matcher.allowedCount).toBe(3);
  });

  it('亮度、对比度、饱和度按比例调整', () => {
    expect(adjustRgb({ r: 255, g: 0, b: 0 }, 50, 100, 100)).toEqual({ r: 127.5, g: 0, b: 0 });
    const gray = adjustRgb({ r: 255, g: 0, b: 0 }, 100, 0, 100);
    expect(gray.r).toBeCloseTo(127.5, 5);
    expect(gray.g).toBeCloseTo(127.5, 5);
    expect(gray.b).toBeCloseTo(127.5, 5);
  });

  it('计算亮度用于文字对比', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#FFFFFF')).toBeCloseTo(255, 5);
    expect(luminance('#FF0000')).toBeCloseTo(54.213, 3);
  });
});
