import { describe, expect, it } from 'vitest';
import { A4, computePagination, printableArea, tileCovers } from './pagination';

const base = {
  mode: 'actual' as const,
  cellMm: 2.6,
  overlap: 1,
  legendPage: true,
};

describe('computePagination', () => {
  it('适配模式把整图放进一页', () => {
    const page = computePagination(52, 52, { ...base, mode: 'fit' });
    expect(page.patternPages).toBe(1);
    expect(page.totalPages).toBe(1);
    expect(page.pagesX).toBe(1);
    expect(page.pagesY).toBe(1);
    expect(page.tiles[0].colEnd).toBe(51);
    expect(page.tiles[0].rowEnd).toBe(51);
    expect(page.cellMm).toBeCloseTo(Math.min(190 / 52, 255 / 52), 5);
    expect(page.legendPages).toBe(0);
  });

  it('52×52 实物尺寸只占一页，不需要图例页', () => {
    const page = computePagination(52, 52, base);
    expect(page.totalPages).toBe(1);
    expect(page.legendPages).toBe(0);
    expect(tileCovers(page.tiles[0], 52, 52).cols).toHaveLength(52);
    expect(tileCovers(page.tiles[0], 52, 52).rows).toHaveLength(52);
  });

  it('104×104 均衡分成 2×2 页，而不是留下窄条', () => {
    const page = computePagination(104, 104, base);
    expect(page.pagesX).toBe(2);
    expect(page.pagesY).toBe(2);
    expect(page.patternPages).toBe(4);
    const spans = page.tiles.map((tile) => tileCovers(tile, 104, 104).cols.length);
    expect(spans).toEqual([53, 52, 53, 52]);
    for (const tile of page.tiles) {
      if (tile.rowStart < 52) expect(tileCovers(tile, 104, 104).rows.length).toBe(53);
    }
  });

  it('所有格子都被至少一页覆盖，且相邻页保留重叠边', () => {
    for (const overlap of [0, 1, 2, 3]) {
      const page = computePagination(104, 104, { ...base, overlap });
      const covered = new Set<number>();
      for (const tile of page.tiles) {
        for (const x of tileCovers(tile, 104, 104).cols) {
          for (const y of tileCovers(tile, 104, 104).rows) covered.add(y * 104 + x);
        }
      }
      expect(covered.size).toBe(104 * 104);

      const first = page.tiles[0];
      const right = page.tiles[1];
      const expectedOverlap = Math.min(overlap, Math.min(first.cols, first.rows) - 1);
      if (overlap > 0) {
        expect(first.colEnd - right.colStart + 1).toBe(expectedOverlap);
      } else {
        expect(right.colStart).toBe(first.colEnd + 1);
      }
    }
  });

  it('单页宽度不超过打印区域', () => {
    const area = printableArea();
    for (const [width, height] of [[52, 52], [104, 104], [300, 300], [300, 52], [17, 291]]) {
      const page = computePagination(width, height, { ...base, mode: 'actual' });
      for (const tile of page.tiles) {
        expect((tile.colEnd - tile.colStart + 1) * tile.cellMm).toBeLessThanOrEqual(area.width + 1e-9);
        expect((tile.rowEnd - tile.rowStart + 1) * tile.cellMm).toBeLessThanOrEqual(area.height + 1e-9);
      }
    }
  });

  it('图例页按 130 色分页，并计入总页数', () => {
    const page = computePagination(300, 300, { ...base, legendColorCount: 291 });
    expect(page.pagesX).toBe(5);
    expect(page.pagesY).toBe(4);
    expect(page.patternPages).toBe(20);
    expect(page.legendPages).toBe(3);
    expect(page.totalPages).toBe(23);
  });

  it('图例页只在多页图纸时追加', () => {
    const single = computePagination(52, 52, { ...base, legendColorCount: 291 });
    expect(single.legendPages).toBe(0);
    const multi = computePagination(104, 104, { ...base, legendColorCount: 291 });
    expect(multi.legendPages).toBe(3);
    expect(multi.totalPages).toBe(7);
  });

  it('重叠数超过容量时收敛，不会产生超过打印区的页', () => {
    const page = computePagination(200, 200, { ...base, cellMm: 20, overlap: 3 });
    const area = printableArea();
    for (const tile of page.tiles) {
      expect(tile.colEnd - tile.colStart + 1).toBeLessThanOrEqual(Math.floor(area.width / 20));
      expect(tile.rowEnd - tile.rowStart + 1).toBeLessThanOrEqual(Math.floor(area.height / 20));
    }
  });

  it('A4 常量与可打印区一致', () => {
    expect(A4.widthMm).toBe(210);
    expect(A4.heightMm).toBe(297);
    expect(printableArea()).toEqual({ width: 190, height: 255 });
  });
});
