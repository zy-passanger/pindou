import type { Project } from '@/core/model';
import type { ProjectStats } from '@/core/stats';
import { computePagination, type PdfMode } from '@/core/pagination';
import { sanitizeFileName } from '@/core/projectFile';
import { downloadBlob } from '@/utils/download';
import { drawCellLabels } from '@/rendering/cellLabels';
import { drawExportPreview } from './sheetPreview';

export interface PdfExportOptions {
  mode: PdfMode;
  overlap: number;
  mirror: boolean;
  codes: boolean;
  legend: boolean;
  dpi: 200 | 300;
  onProgress?: (current: number, total: number) => void;
}

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 10;
const HEADER_MM = 12;
const FOOTER_MM = 10;
const GUTTER_MM = 6;

function mmToPx(dpi: number): number {
  return dpi / 25.4;
}

export function renderPatternPage(
  canvas: HTMLCanvasElement,
  project: Project,
  stats: ProjectStats,
  tile: ReturnType<typeof computePagination>['tiles'][number],
  pagination: ReturnType<typeof computePagination>,
  options: PdfExportOptions,
  dpi = options.dpi as number,
): { gridX: number; gridY: number; cell: number } {
  const pxPerMm = mmToPx(dpi);
  canvas.width = Math.round(A4_WIDTH_MM * pxPerMm);
  canvas.height = Math.round(A4_HEIGHT_MM * pxPerMm);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建图纸画布');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const margin = MARGIN_MM * pxPerMm;
  const header = HEADER_MM * pxPerMm;
  const footer = FOOTER_MM * pxPerMm;
  const gutter = GUTTER_MM * pxPerMm;
  const cellPx = tile.cellMm * pxPerMm;
  const cols = tile.colEnd - tile.colStart + 1;
  const rows = tile.rowEnd - tile.rowStart + 1;
  const gridW = cols * cellPx;
  const gridH = rows * cellPx;
  // 图纸比可打印区窄时水平居中；保留左侧标注空间。
  const gridX = margin + Math.max(gutter, (canvas.width - margin * 2 - gridW) / 2);
  const gridY = margin + header + gutter;

  ctx.fillStyle = '#2A241E';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `700 ${Math.round(5.2 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillText(`${project.name} · 拼豆图纸`, margin, margin);
  ctx.fillStyle = '#7B7164';
  ctx.font = `400 ${Math.round(2.8 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  const scaleText = options.mode === 'actual'
    ? `1:1 实物 · ${project.beadSizeMm}mm/格`
    : options.mode === 'fit' ? '整图缩放适配' : `自定义 · ${tile.cellMm.toFixed(1)}mm/格`;
  ctx.fillText(`${project.width}×${project.height} · ${stats.total.toLocaleString('zh-CN')} 颗 · ${stats.colorCount} 色 · ${scaleText}${options.mirror ? ' · 镜像' : ''}`, margin, margin + 7 * pxPerMm);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#2A241E';
  ctx.font = `600 ${Math.round(3.2 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillText(`第 ${tile.pageIndex + 1} / ${pagination.totalPages} 页`, canvas.width - margin, margin);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#FFFCF5';
  ctx.fillRect(gridX, gridY, gridW, gridH);

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const globalX = tile.colStart + x;
      const globalY = tile.rowStart + y;
      const sourceX = options.mirror ? project.width - 1 - globalX : globalX;
      const value = project.cells[globalY * project.width + sourceX];
      if (value === 0xffff) continue;
      const color = project.palette.colors[value];
      if (!color) continue;
      ctx.fillStyle = color.hex;
      ctx.fillRect(gridX + x * cellPx, gridY + y * cellPx, Math.ceil(cellPx), Math.ceil(cellPx));
    }
  }

  // Grid & board boundaries
  for (let x = 0; x <= cols; x += 1) {
    const globalX = tile.colStart + x;
    const isBoard = globalX > 0 && globalX % project.boardW === 0;
    const is10 = globalX % 10 === 0;
    const is5 = globalX % 5 === 0;
    ctx.strokeStyle = isBoard ? 'rgba(60,45,30,.65)' : is10 ? 'rgba(90,72,50,.28)' : is5 ? 'rgba(90,72,50,.16)' : 'rgba(90,72,50,.08)';
    ctx.lineWidth = Math.max(0.5, (isBoard ? 0.5 : 0.24) * pxPerMm);
    ctx.beginPath();
    ctx.moveTo(gridX + x * cellPx, gridY);
    ctx.lineTo(gridX + x * cellPx, gridY + gridH);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y += 1) {
    const globalY = tile.rowStart + y;
    const isBoard = globalY > 0 && globalY % project.boardH === 0;
    const is10 = globalY % 10 === 0;
    const is5 = globalY % 5 === 0;
    ctx.strokeStyle = isBoard ? 'rgba(60,45,30,.65)' : is10 ? 'rgba(90,72,50,.28)' : is5 ? 'rgba(90,72,50,.16)' : 'rgba(90,72,50,.08)';
    ctx.lineWidth = Math.max(0.5, (isBoard ? 0.5 : 0.24) * pxPerMm);
    ctx.beginPath();
    ctx.moveTo(gridX, gridY + y * cellPx);
    ctx.lineTo(gridX + gridW, gridY + y * cellPx);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(60,45,30,.65)';
  ctx.lineWidth = Math.max(0.6, 0.35 * pxPerMm);
  ctx.strokeRect(gridX + 0.5, gridY + 0.5, gridW - 1, gridH - 1);

  if (options.codes) {
    drawCellLabels(ctx, project, {
      cell: cellPx,
      originX: gridX - tile.colStart * cellPx,
      originY: gridY - tile.rowStart * cellPx,
      startCol: tile.colStart, endCol: tile.colEnd,
      startRow: tile.rowStart, endRow: tile.rowEnd,
      mirror: options.mirror,
    });
  }

  // Coordinates
  const labelStep = cellPx >= 14 ? 5 : 10;
  ctx.fillStyle = '#8E8272';
  ctx.font = `500 ${Math.max(6, Math.min(10, cellPx * 0.5)).toFixed(1)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  for (let x = 0; x < cols; x += labelStep) {
    ctx.fillText(String(tile.colStart + x + 1), gridX + x * cellPx + 1, gridY - 2 * pxPerMm);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < rows; y += labelStep) {
    ctx.fillText(String(tile.rowStart + y + 1), gridX - 1.5 * pxPerMm, gridY + y * cellPx + cellPx / 2);
  }

  // Footer
  ctx.fillStyle = '#7B7164';
  ctx.font = `400 ${Math.round(2.4 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`列 ${tile.colStart + 1}–${tile.colEnd + 1} · 行 ${tile.rowStart + 1}–${tile.rowEnd + 1}${pagination.patternPages > 1 ? ` · 重叠 ${options.overlap} 格` : ''}`, margin, canvas.height - margin);
  ctx.textAlign = 'right';
  ctx.fillText(options.mirror ? '镜像图纸 · 熨烫后成品方向正确' : '屏幕色值仅供参考', canvas.width - margin, canvas.height - margin);
  ctx.textAlign = 'left';

  // Single-page legend panel: 单页图纸没有独立图例页，把完整用量放在图案下方，
  // 让打印出来的纸就能直接照着备豆。
  if (pagination.patternPages === 1 && options.legend && stats.list.length) {
    const gap = 8 * pxPerMm;
    const startY = gridY + gridH + gap;
    const availableH = canvas.height - margin - footer - startY;
    if (availableH > 24 * pxPerMm) {
      const titleH = 9 * pxPerMm;
      const rowH = 7 * pxPerMm;
      const cols = gridW >= 120 * pxPerMm ? 3 : 2;
      const colW = gridW / cols;
      const maxRows = Math.max(1, Math.floor((availableH - titleH - 4 * pxPerMm) / rowH));
      const shown = Math.min(stats.list.length, maxRows * cols);
      const rows = Math.max(1, Math.ceil(shown / cols));
      const panelH = titleH + rows * rowH + 4 * pxPerMm;
      ctx.fillStyle = '#F8F2E7';
      ctx.fillRect(gridX, startY, gridW, panelH);
      ctx.strokeStyle = 'rgba(150,125,90,.22)';
      ctx.lineWidth = 1;
      ctx.strokeRect(gridX + 0.5, startY + 0.5, gridW - 1, panelH - 1);

      ctx.fillStyle = '#2A241E';
      ctx.font = `600 ${Math.round(2.9 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText('色号与用量', gridX + 3 * pxPerMm, startY + 3 * pxPerMm);
      ctx.fillStyle = '#8E8272';
      ctx.font = `400 ${Math.round(2.2 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(`共 ${stats.colorCount} 色 · ${stats.total.toLocaleString('zh-CN')} 颗`, gridX + gridW - 3 * pxPerMm, startY + 3.4 * pxPerMm);
      ctx.textAlign = 'left';

      stats.list.slice(0, shown).forEach((entry, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = gridX + col * colW + 3 * pxPerMm;
        const y = startY + titleH + row * rowH;
        ctx.fillStyle = entry.color.hex;
        ctx.beginPath();
        ctx.arc(x + 2 * pxPerMm, y + 2.2 * pxPerMm, 2 * pxPerMm, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.12)';
        ctx.stroke();
        ctx.fillStyle = '#2A241E';
        ctx.font = `600 ${Math.round(2.5 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.fillText(entry.color.code, x + 5.2 * pxPerMm, y + 0.2 * pxPerMm);
        ctx.fillStyle = '#7B7164';
        ctx.font = `400 ${Math.round(1.9 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.fillText(`${entry.color.name} · ${entry.count.toLocaleString('zh-CN')} 颗`, x + 5.2 * pxPerMm, y + 3.5 * pxPerMm);
      });

      if (shown < stats.list.length) {
        ctx.fillStyle = '#9C9080';
        ctx.font = `400 ${Math.round(2 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`其余 ${stats.list.length - shown} 色见 CSV 清单`, gridX + gridW - 3 * pxPerMm, startY + panelH - 3.4 * pxPerMm);
        ctx.textAlign = 'left';
      }
    }
  }
  return { gridX, gridY, cell: cellPx };
}

export function drawPdfPreview(canvas: HTMLCanvasElement, project: Project, stats: ProjectStats, options: PdfExportOptions): void {
  const pagination = computePagination(project.width, project.height, {
    mode: options.mode,
    cellMm: options.mode === 'actual' ? project.beadSizeMm : 3.5,
    overlap: options.overlap,
    legendPage: options.legend,
    legendColorCount: stats.colorCount,
  });
  const tile = pagination.tiles[0];
  const page = document.createElement('canvas');
  const layout = renderPatternPage(page, project, stats, tile, pagination, options, 100);
  drawExportPreview(canvas, page, project, {
    ...layout,
    title: `A4 第 1 / ${pagination.totalPages} 页`,
    codes: options.codes,
    mirror: options.mirror,
    startCol: tile.colStart, endCol: tile.colEnd,
    startRow: tile.rowStart, endRow: tile.rowEnd,
  });
}

function renderLegendPage(
  canvas: HTMLCanvasElement,
  project: Project,
  stats: ProjectStats,
  pageIndex: number,
  totalLegendPages: number,
  totalPages: number,
  pageNumber: number,
  dpi: number,
): void {
  const pxPerMm = mmToPx(dpi);
  canvas.width = Math.round(A4_WIDTH_MM * pxPerMm);
  canvas.height = Math.round(A4_HEIGHT_MM * pxPerMm);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建图纸画布');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const margin = MARGIN_MM * pxPerMm;
  ctx.fillStyle = '#2A241E';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `700 ${Math.round(5.2 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillText(`${project.name} · 色号与用量`, margin, margin);
  ctx.fillStyle = '#7B7164';
  ctx.font = `400 ${Math.round(2.8 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillText(`共 ${stats.colorCount} 色 · ${stats.total.toLocaleString('zh-CN')} 颗${totalLegendPages > 1 ? ` · 第 ${pageIndex + 1}/${totalLegendPages} 张图例` : ''}`, margin, margin + 7 * pxPerMm);

  const entries = stats.list.slice(pageIndex * 130, pageIndex * 130 + 130);
  const cols = 5;
  const rows = 26;
  const colW = (A4_WIDTH_MM - MARGIN_MM * 2) / cols;
  const rowH = 8;
  const startY = MARGIN_MM + HEADER_MM + 8;
  entries.forEach((entry, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = (MARGIN_MM + col * colW) * pxPerMm;
    const y = (startY + row * rowH) * pxPerMm;
    ctx.fillStyle = entry.color.hex;
    ctx.beginPath();
    ctx.arc(x + 2.1 * pxPerMm, y + 2.1 * pxPerMm, 2.1 * pxPerMm, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.fillStyle = '#2A241E';
    ctx.font = `600 ${Math.round(2.6 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillText(entry.color.code, x + 5 * pxPerMm, y);
    ctx.fillStyle = '#7B7164';
    ctx.font = `400 ${Math.round(2.1 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillText(`${entry.color.name} · ${entry.count.toLocaleString('zh-CN')} 颗`, x + 5 * pxPerMm, y + 3.2 * pxPerMm);
  });

  ctx.fillStyle = '#7B7164';
  ctx.font = `400 ${Math.round(2.4 * pxPerMm)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`第 ${pageNumber} / ${totalPages} 页 · 屏幕色值仅供参考`, canvas.width - margin, canvas.height - margin);
  ctx.textAlign = 'left';
}

export async function buildPdf(
  project: Project,
  stats: ProjectStats,
  options: PdfExportOptions,
): Promise<Blob> {
  const pagination = computePagination(project.width, project.height, {
    mode: options.mode,
    cellMm: options.mode === 'actual' ? project.beadSizeMm : 3.5,
    overlap: options.overlap,
    legendPage: options.legend,
    legendColorCount: stats.colorCount,
  });
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const totalPages = pagination.totalPages;
  let pageNumber = 0;
  let first = true;
  const addCanvas = (canvas: HTMLCanvasElement) => {
    if (!first) pdf.addPage('a4', 'portrait');
    first = false;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, 'FAST');
    pageNumber += 1;
  };

  for (const tile of pagination.tiles) {
    const canvas = document.createElement('canvas');
    renderPatternPage(canvas, project, stats, tile, pagination, options);
    addCanvas(canvas);
    options.onProgress?.(pageNumber, totalPages);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  for (let i = 0; i < pagination.legendPages; i += 1) {
    const canvas = document.createElement('canvas');
    renderLegendPage(canvas, project, stats, i, pagination.legendPages, totalPages, pageNumber + 1, options.dpi);
    addCanvas(canvas);
    options.onProgress?.(pageNumber, totalPages);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return pdf.output('blob');
}

export async function exportPdf(project: Project, stats: ProjectStats, options: PdfExportOptions): Promise<Blob> {
  const blob = await buildPdf(project, stats, options);
  const fileName = `${sanitizeFileName(project.name)}_A4.pdf`;
  downloadBlob(blob, fileName);
  return blob;
}
