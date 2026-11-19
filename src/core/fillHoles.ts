import { EMPTY } from './constants';

export interface FillHolesOptions {
  /** 补全后仍可回退：不修改传入的 cells。 */
  maxHoleSize?: number;
}

export interface FillHolesResult {
  cells: Uint16Array;
  filled: number;
  holes: number;
}

/**
 * 补全图案内部的空白：
 * 只有“被豆子完全围住、且与画布外边缘不连通”的空白才会被补，
 * 图案外部的留白保持不动。补入颜色取周围已落豆中最多的颜色，
 * 再逐层向内推进，形成没有空洞的连续色块。
 */
export function fillInteriorHoles(cells: Uint16Array, width: number, height: number, options: FillHolesOptions = {}): FillHolesResult {
  const count = width * height;
  const next = cells.slice();
  if (width < 1 || height < 1 || cells.length !== count) return { cells: next, filled: 0, holes: 0 };
  const maxHoleSize = options.maxHoleSize ?? Number.POSITIVE_INFINITY;

  // 从外边缘泛洪，标出真正的“外部空白”。
  const reachable = new Uint8Array(count);
  const stack: number[] = [];
  const seed = (index: number) => {
    if (reachable[index] || cells[index] !== EMPTY) return;
    reachable[index] = 1;
    stack.push(index);
  };
  for (let x = 0; x < width; x += 1) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (stack.length) {
    const index = stack.pop() as number;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) seed(index - 1);
    if (x + 1 < width) seed(index + 1);
    if (y > 0) seed(index - width);
    if (y + 1 < height) seed(index + width);
  }

  const holes = new Uint8Array(count);
  let holeCount = 0;
  for (let i = 0; i < count; i += 1) {
    if (cells[i] === EMPTY && !reachable[i]) {
      holes[i] = 1;
      holeCount += 1;
    }
  }
  if (!holeCount || holeCount > maxHoleSize) return { cells: next, filled: 0, holes: holeCount };

  const neighbors = (index: number): number[] => {
    const x = index % width;
    const y = Math.floor(index / width);
    const list: number[] = [];
    if (x > 0) list.push(index - 1);
    if (x + 1 < width) list.push(index + 1);
    if (y > 0) list.push(index - width);
    if (y + 1 < height) list.push(index + width);
    return list;
  };

  // 第一圈：取相邻已落豆中出现最多的颜色。
  const queue: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (!holes[i]) continue;
    const counts = new Map<number, number>();
    neighbors(i).forEach((n) => {
      const value = cells[n];
      if (value === EMPTY) return;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    let best = -1;
    let bestCount = 0;
    counts.forEach((value, index) => {
      if (value > bestCount) {
        best = index;
        bestCount = value;
      }
    });
    if (best >= 0) {
      next[i] = best;
      queue.push(i);
    }
  }

  // 后续各圈：跟随已经补上的邻居，向内部推进。
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    neighbors(index).forEach((n) => {
      if (!holes[n] || next[n] !== EMPTY) return;
      next[n] = next[index];
      queue.push(n);
    });
  }

  // 极少数被多层包围的孤立空洞：回退到周围的任一颜色，保证没有洞。
  if (next.subarray(0, count).some((value, index) => holes[index] && value === EMPTY)) {
    for (let i = 0; i < count; i += 1) {
      if (!holes[i] || next[i] !== EMPTY) continue;
      const source = neighbors(i).find((n) => next[n] !== EMPTY);
      if (source !== undefined) next[i] = next[source];
    }
  }

  let filled = 0;
  for (let i = 0; i < count; i += 1) if (holes[i] && next[i] !== EMPTY) filled += 1;
  return { cells: next, filled, holes: holeCount };
}

/** 只统计内部空洞数量，不生成补全结果；设置面板用它显示可修复的格数。 */
export function countInteriorHoles(cells: Uint16Array, width: number, height: number): number {
  const count = width * height;
  if (width < 1 || height < 1 || cells.length !== count) return 0;
  const reachable = new Uint8Array(count);
  const stack: number[] = [];
  const seed = (index: number) => {
    if (reachable[index] || cells[index] !== EMPTY) return;
    reachable[index] = 1;
    stack.push(index);
  };
  for (let x = 0; x < width; x += 1) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (stack.length) {
    const index = stack.pop() as number;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) seed(index - 1);
    if (x + 1 < width) seed(index + 1);
    if (y > 0) seed(index - width);
    if (y + 1 < height) seed(index + width);
  }
  let holes = 0;
  for (let i = 0; i < count; i += 1) {
    if (cells[i] === EMPTY && !reachable[i]) holes += 1;
  }
  return holes;
}
