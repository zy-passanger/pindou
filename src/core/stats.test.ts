import { describe, expect, it } from 'vitest';
import { EMPTY } from './constants';
import type { PaletteSnapshot } from './model';
import { computeStats, countForColor, mostUsedIndex, usageRows } from './stats';
import { createProject } from './model';

const palette: PaletteSnapshot = {
  id: 'test',
  version: '1',
  colors: [
    { code: 'A', name: '红', hex: '#FF0000', series: 'A', common: true },
    { code: 'B', name: '绿', hex: '#00FF00', series: 'B', common: true },
    { code: 'C', name: '蓝', hex: '#0000FF', series: 'C', common: false },
  ],
};

describe('stats', () => {
  it('按颜色统计并降序排序', () => {
    const stats = computeStats(new Uint16Array([0, 0, 1, EMPTY, 2, 0, 1]), palette);
    expect(stats.total).toBe(6);
    expect(stats.colorCount).toBe(3);
    expect(stats.list.map((item) => item.color.code)).toEqual(['A', 'B', 'C']);
    expect(stats.list.map((item) => item.count)).toEqual([3, 2, 1]);
    expect(Array.from(stats.counts)).toEqual([3, 2, 1]);
    expect(countForColor(stats, 1)).toBe(2);
  });

  it('忽略空格和越界索引', () => {
    const stats = computeStats(new Uint16Array([EMPTY, 99, 0]), palette);
    expect(stats.total).toBe(1);
    expect(stats.colorCount).toBe(1);
    expect(mostUsedIndex(stats)).toBe(0);
  });

  it('空图纸返回零值', () => {
    const stats = computeStats(new Uint16Array([EMPTY, EMPTY]), palette);
    expect(stats.total).toBe(0);
    expect(stats.colorCount).toBe(0);
    expect(stats.list).toEqual([]);
    expect(mostUsedIndex(stats)).toBeNull();
  });

  it('usageRows 计算占比与字段', () => {
    const project = createProject({
      name: 'A',
      width: 2,
      height: 2,
      beadSizeMm: 2.6,
      palette,
      cells: new Uint16Array([0, 0, 1, EMPTY]),
    });
    const stats = computeStats(project.cells, palette);
    const rows = usageRows(project, stats);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ code: 'A', count: 2 });
    expect(rows[0].percent).toBeCloseTo(200 / 3, 10);
    expect(rows[1]).toMatchObject({ code: 'B', count: 1 });
  });
});
