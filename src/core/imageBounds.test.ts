import { describe, expect, it } from 'vitest';
import { detectContentBounds, frameContentBounds, type PixelSource } from './imageBounds';

function makeSource(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [r, g, b, a] = paint(x, y);
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return { width, height, data };
}

describe('detectContentBounds', () => {
  it('透明留白图按 alpha 找到主体边界', () => {
    const source = makeSource(20, 20, (x, y) => (
      x >= 5 && x <= 14 && y >= 3 && y <= 16 ? [230, 120, 80, 255] : [0, 0, 0, 0]
    ));
    expect(detectContentBounds(source)).toEqual({ x: 5, y: 3, width: 10, height: 14 });
  });

  it('不透明浅色背景只剔除与外边缘连通的区域', () => {
    const source = makeSource(20, 20, (x, y) => {
      const ring = x >= 4 && x <= 15 && y >= 4 && y <= 15;
      const inner = x >= 8 && x <= 11 && y >= 8 && y <= 11;
      if (ring && !inner) return [30, 30, 30, 255];
      return [255, 255, 255, 255]; // 外圈背景和主体内部高光都是白色
    });
    expect(detectContentBounds(source)).toEqual({ x: 4, y: 4, width: 12, height: 12 });
  });

  it('主体铺满整图或没有独立背景时返回 null', () => {
    const full = makeSource(10, 10, (x, y) => [x * 20, y * 20, 120, 255]);
    expect(detectContentBounds(full)).toBeNull();

    const photo = makeSource(10, 10, (x, y) => ((x + y) % 2 ? [200, 100, 30, 255] : [20, 120, 200, 255]));
    expect(detectContentBounds(photo)).toBeNull();
  });

  it('忽略边缘零星噪点，主体边界不被一个像素撑大', () => {
    const source = makeSource(40, 40, (x, y) => {
      if (x === 1 && y === 1) return [0, 0, 0, 255];
      return x >= 10 && x <= 29 && y >= 8 && y <= 31 ? [40, 80, 160, 255] : [255, 255, 255, 255];
    });
    expect(detectContentBounds(source)).toEqual({ x: 10, y: 8, width: 20, height: 24 });
  });
});

describe('frameContentBounds', () => {
  it('居中主体按目标比例放大到画布', () => {
    const frame = frameContentBounds(100, 100, { x: 25, y: 25, width: 50, height: 50 }, 52, 52, 0);
    expect(frame.zoom).toBeCloseTo(2, 6);
    expect(frame.offsetX).toBeCloseTo(0, 6);
    expect(frame.offsetY).toBeCloseTo(0, 6);
  });

  it('偏右主体通过负向偏移回到画布中心', () => {
    const frame = frameContentBounds(100, 100, { x: 50, y: 25, width: 50, height: 50 }, 50, 50, 0);
    expect(frame.zoom).toBeCloseTo(2, 6);
    expect(frame.offsetX).toBeCloseTo(-0.5, 6);
    expect(frame.offsetY).toBeCloseTo(0, 6);
  });

  it('缩放被限制在 1–8 倍，且留出安全边', () => {
    const tiny = frameContentBounds(1000, 1000, { x: 490, y: 490, width: 12, height: 12 }, 52, 52);
    expect(tiny.zoom).toBeLessThanOrEqual(8);
    const full = frameContentBounds(100, 100, { x: 0, y: 0, width: 100, height: 100 }, 52, 52);
    expect(full.zoom).toBe(1);
    expect(full.offsetX).toBe(0);
    expect(full.offsetY).toBe(0);
  });
});
