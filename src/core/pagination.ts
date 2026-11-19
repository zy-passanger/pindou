export type PdfMode = 'fit' | 'actual' | 'custom';

export interface PdfPaginationOptions {
  mode: PdfMode;
  cellMm?: number;
  overlap: number;
  legendPage: boolean;
  legendColorCount?: number;
}

export interface PdfTile {
  pageIndex: number;
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
  pagesX: number;
  pagesY: number;
  cols: number;
  rows: number;
  cellMm: number;
}

export interface PdfPagination {
  tiles: PdfTile[];
  patternPages: number;
  legendPages: number;
  totalPages: number;
  pagesX: number;
  pagesY: number;
  cellMm: number;
}

export const A4 = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 10,
  headerMm: 12,
  footerMm: 10,
  legendPageMm: 40,
};

export function printableArea(): { width: number; height: number } {
  return {
    width: A4.widthMm - A4.marginMm * 2,
    height: A4.heightMm - A4.marginMm * 2 - A4.headerMm - A4.footerMm,
  };
}

export function computePagination(
  width: number,
  height: number,
  options: PdfPaginationOptions,
): PdfPagination {
  const area = printableArea();
  const overlap = Math.max(0, Math.min(3, Math.round(options.overlap)));
  let cellMm: number;
  let cols: number;
  let rows: number;

  if (options.mode === 'fit') {
    cellMm = Math.min(area.width / width, area.height / height);
    cols = width;
    rows = height;
  } else {
    cellMm = options.mode === 'actual'
      ? (options.cellMm && options.cellMm > 0 ? options.cellMm : 2.6)
      : Math.max(0.5, options.cellMm ?? 3.5);
    cols = Math.max(1, Math.floor(area.width / cellMm));
    rows = Math.max(1, Math.floor(area.height / cellMm));
  }

  if (options.mode === 'fit') {
    const tile: PdfTile = {
      pageIndex: 0,
      colStart: 0,
      colEnd: width - 1,
      rowStart: 0,
      rowEnd: height - 1,
      pagesX: 1,
      pagesY: 1,
      cols: width,
      rows: height,
      cellMm,
    };
    const legendPages = options.legendPage ? 0 : 0;
    return {
      tiles: [tile],
      patternPages: 1,
      legendPages,
      totalPages: 1,
      pagesX: 1,
      pagesY: 1,
      cellMm,
    };
  }

  // 均衡分页：先按容量决定页数，再把行列尽量平均分配。
  // 直接按固定步长会在最后一页留下很窄的条带（例如 104 格 × 2.6mm 只剩 7 行），
  // 既不便于拼接，也浪费纸张。重叠格数按容量上限收敛。
  const effectiveOverlap = Math.min(overlap, Math.max(0, Math.min(cols, rows) - 1));
  const pagesX = Math.max(1, Math.ceil((width - effectiveOverlap) / Math.max(1, cols - effectiveOverlap)));
  const pagesY = Math.max(1, Math.ceil((height - effectiveOverlap) / Math.max(1, rows - effectiveOverlap)));
  const tileCols = Math.min(cols, Math.ceil((width - effectiveOverlap) / pagesX) + effectiveOverlap);
  const tileRows = Math.min(rows, Math.ceil((height - effectiveOverlap) / pagesY) + effectiveOverlap);
  const stepX = Math.max(1, tileCols - effectiveOverlap);
  const stepY = Math.max(1, tileRows - effectiveOverlap);
  const tiles: PdfTile[] = [];
  for (let py = 0; py < pagesY; py += 1) {
    for (let px = 0; px < pagesX; px += 1) {
      const colStart = px * stepX;
      const rowStart = py * stepY;
      if (colStart >= width || rowStart >= height) continue;
      tiles.push({
        pageIndex: tiles.length,
        colStart,
        colEnd: Math.min(width - 1, colStart + tileCols - 1),
        rowStart,
        rowEnd: Math.min(height - 1, rowStart + tileRows - 1),
        pagesX,
        pagesY,
        cols: Math.min(tileCols, width - colStart),
        rows: Math.min(tileRows, height - rowStart),
        cellMm,
      });
    }
  }
  const patternPages = tiles.length;
  const legendPages = options.legendPage && patternPages > 1
    ? Math.max(1, Math.ceil((options.legendColorCount ?? 1) / 130))
    : 0;
  return {
    tiles,
    patternPages,
    legendPages,
    totalPages: patternPages + legendPages,
    pagesX,
    pagesY,
    cellMm,
  };
}

/** 测试用：每页覆盖的行列范围。 */
export function tileCovers(tile: PdfTile, width: number, height: number): { cols: number[]; rows: number[] } {
  const cols: number[] = [];
  const rows: number[] = [];
  for (let x = tile.colStart; x <= tile.colEnd && x < width; x += 1) cols.push(x);
  for (let y = tile.rowStart; y <= tile.rowEnd && y < height; y += 1) rows.push(y);
  return { cols, rows };
}
