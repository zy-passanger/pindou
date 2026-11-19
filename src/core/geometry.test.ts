import { describe, expect, it } from 'vitest';
import { EMPTY } from './constants';
import {
  bresenham,
  createGrid,
  ellipseCells,
  flipHorizontal,
  flipVertical,
  rectCells,
  replaceColor,
  resizeGrid,
  rotateLeft,
  rotateRight,
} from './geometry';

function gridFrom(values: number[][], fill = EMPTY) {
  const height = values.length;
  const width = values[0].length;
  const cells = new Uint16Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) cells[y * width + x] = values[y][x] ?? fill;
  }
  return { width, height, cells };
}

describe('geometry', () => {
  it('创建空白网格', () => {
    const grid = createGrid(3, 2);
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect(Array.from(grid.cells)).toEqual([EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY]);
  });

  it('按锚点扩边保留内容', () => {
    const grid = gridFrom([[1, 2], [3, 4]]);
    const topLeft = resizeGrid(grid, 4, 4, 'top-left');
    expect(topLeft.cells[0]).toBe(1);
    expect(topLeft.cells[4 * 1 + 1]).toBe(4);
    const bottomRight = resizeGrid(grid, 4, 4, 'bottom-right');
    expect(bottomRight.cells[2 * 4 + 2]).toBe(1);
    expect(bottomRight.cells[3 * 4 + 3]).toBe(4);
    const center = resizeGrid(grid, 4, 4, 'center');
    expect(center.cells[4 + 1]).toBe(1);
    expect(center.cells[2 * 4 + 2]).toBe(4);
  });

  it('缩小画布会裁剪越界内容', () => {
    const grid = gridFrom([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    const cropped = resizeGrid(grid, 2, 2, 'top-left');
    expect(Array.from(cropped.cells)).toEqual([1, 2, 4, 5]);
  });

  it('水平与垂直翻转', () => {
    const grid = gridFrom([[1, 2, 3], [4, 5, 6]]);
    expect(Array.from(flipHorizontal(grid).cells)).toEqual([3, 2, 1, 6, 5, 4]);
    expect(Array.from(flipVertical(grid).cells)).toEqual([4, 5, 6, 1, 2, 3]);
  });

  it('顺时针与逆时针旋转交换宽高并可还原', () => {
    const grid = gridFrom([[1, 2, 3], [4, 5, 6]]);
    const right = rotateRight(grid);
    expect([right.width, right.height]).toEqual([2, 3]);
    expect(Array.from(right.cells)).toEqual([4, 1, 5, 2, 6, 3]);
    const back = rotateLeft(right);
    expect([back.width, back.height]).toEqual([3, 2]);
    expect(Array.from(back.cells)).toEqual(Array.from(grid.cells));
  });

  it('替换颜色只影响目标索引', () => {
    const grid = gridFrom([[1, 2, 1], [EMPTY, 1, 3]]);
    expect(Array.from(replaceColor(grid, 1, 2).cells)).toEqual([2, 2, 2, EMPTY, 2, 3]);
  });

  it('Bresenham 生成连续线段', () => {
    const points = bresenham(0, 0, 3, 2);
    expect(points[0]).toEqual([0, 0]);
    expect(points.at(-1)).toEqual([3, 2]);
    for (let i = 1; i < points.length; i += 1) {
      expect(Math.abs(points[i][0] - points[i - 1][0])).toBeLessThanOrEqual(1);
      expect(Math.abs(points[i][1] - points[i - 1][1])).toBeLessThanOrEqual(1);
    }
  });

  it('矩形边框与填充', () => {
    expect(rectCells([2, 2], [0, 0], false)).toHaveLength(8);
    expect(rectCells([2, 2], [0, 0], true)).toHaveLength(9);
  });

  it('椭圆覆盖中心且不越界', () => {
    const points = ellipseCells([0, 0], [4, 4]);
    expect(points).toContainEqual([2, 2]);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(4);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(4);
    }
  });
});
