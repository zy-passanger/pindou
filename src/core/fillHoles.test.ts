import { describe, expect, it } from 'vitest';
import { EMPTY } from './constants';
import { countInteriorHoles, fillInteriorHoles } from './fillHoles';

function grid(rows: number[]): Uint16Array {
  return new Uint16Array(rows.map((value) => (value < 0 ? EMPTY : value)));
}

describe('fillInteriorHoles', () => {
  it('补全完全封闭的单格空白，外部留白保持不动', () => {
    const cells = grid([
      -1, -1, -1, -1, -1,
      -1, 1, 1, 1, -1,
      -1, 1, -1, 1, -1,
      -1, 1, 1, 1, -1,
      -1, -1, -1, -1, -1,
    ]);
    const result = fillInteriorHoles(cells, 5, 5);
    expect(result.filled).toBe(1);
    expect(result.holes).toBe(1);
    expect(result.cells[2 * 5 + 2]).toBe(1);
    expect(Array.from(result.cells).filter((value) => value === EMPTY)).toHaveLength(16);
    expect(cells[2 * 5 + 2]).toBe(EMPTY);
  });

  it('大洞会全部补上，并保留边界两侧的不同颜色', () => {
    const cells = grid([
      -1, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, 1, 1, 1, 1, 2, 2, 2, -1,
      -1, 1, -1, -1, -1, -1, -1, 2, -1,
      -1, 1, -1, -1, -1, -1, -1, 2, -1,
      -1, 1, 1, 1, 1, 2, 2, 2, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1,
    ]);
    const result = fillInteriorHoles(cells, 9, 6);
    expect(result.holes).toBe(10);
    expect(result.filled).toBe(10);
    expect(Array.from(result.cells).some((value) => value === EMPTY)).toBe(true); // 外部留白仍在
    expect(result.cells[2 * 9 + 2]).toBe(1);
    expect(result.cells[2 * 9 + 6]).toBe(2);
  });

  it('多个互不相连的洞都会补全', () => {
    const cells = grid([
      -1, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, 1, 1, 1, 1, 2, 2, 2, -1,
      -1, 1, -1, 1, 1, 2, -1, 2, -1,
      -1, 1, 1, 1, 1, 2, 2, 2, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1,
    ]);
    const result = fillInteriorHoles(cells, 9, 5);
    expect(result.holes).toBe(2);
    expect(result.filled).toBe(2);
    expect(result.cells[2 * 9 + 2]).toBe(1);
    expect(result.cells[2 * 9 + 6]).toBe(2);
  });

  it('只统计内部空洞，外部空白和已落豆都不计入', () => {
    const cells = grid([
      -1, -1, -1, -1, -1, -1, -1, -1, -1,
      -1, 1, 1, 1, 1, 2, 2, 2, -1,
      -1, 1, -1, 1, 1, 2, -1, 2, -1,
      -1, 1, 1, 1, 1, 2, 2, 2, -1,
      -1, -1, -1, -1, -1, -1, -1, -1, -1,
    ]);
    expect(countInteriorHoles(cells, 9, 5)).toBe(2);
    expect(countInteriorHoles(cells, 9, 5)).toBe(2);
    expect(countInteriorHoles(cells, 0, 5)).toBe(0);
    expect(countInteriorHoles(grid([1, 2, 3, 4]), 2, 2)).toBe(0);
  });

  it('没有洞时返回等值副本且不写回原数组', () => {
    const cells = grid([1, 2, 3, 4]);
    const result = fillInteriorHoles(cells, 2, 2);
    expect(result.filled).toBe(0);
    expect(result.holes).toBe(0);
    expect(Array.from(result.cells)).toEqual([1, 2, 3, 4]);
    expect(result.cells).not.toBe(cells);
  });

  it('空画布、非法尺寸和超过 maxHoleSize 时安全返回', () => {
    const empty = grid([-1, -1, -1, -1]);
    expect(fillInteriorHoles(empty, 2, 2).filled).toBe(0);
    expect(fillInteriorHoles(empty, 0, 2).filled).toBe(0);
    const cells = grid([
      -1, -1, -1, -1, -1,
      -1, 1, 1, 1, -1,
      -1, 1, -1, 1, -1,
      -1, 1, 1, 1, -1,
      -1, -1, -1, -1, -1,
    ]);
    const result = fillInteriorHoles(cells, 5, 5, { maxHoleSize: 0 });
    expect(result.holes).toBe(1);
    expect(result.filled).toBe(0);
    expect(result.cells[2 * 5 + 2]).toBe(EMPTY);
  });
});
