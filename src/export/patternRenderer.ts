import { EMPTY } from '@/core/constants';
import type { Project } from '@/core/model';
import type { ProjectStats } from '@/core/stats';
import { drawCellLabels } from '@/rendering/cellLabels';
import { drawExportPreview } from './sheetPreview';

export interface PngOptions {
  scale: number;
  codes: boolean;
  coords: boolean;
  legend: boolean;
  patternOnly: boolean;
}

export interface BlueprintLayout {
  width: number;
  height: number;
  cell: number;
  margin: number;
  gutter: number;
  headerH: number;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  legendCols: number;
  legendRowH: number;
  legendH: number;
  patternOnly: boolean;
}

export const MAX_EXPORT_PX = 16384;
export const MAX_EXPORT_AREA = 24_000_000;

function assertExportArea(width: number, height: number): void {
  if (width > MAX_EXPORT_PX || height > MAX_EXPORT_PX || width * height > MAX_EXPORT_AREA) {
    throw new Error('图片过大，请降低每格像素或改用 A4 PDF');
  }
}

function legendMetrics(cell: number): { title: number; code: number; detail: number; headerH: number; rowH: number } {
  const title = Math.max(10, Math.round(cell * 0.7));
  const code = Math.max(8, Math.round(cell * 0.42));
  const detail = Math.max(7, Math.round(cell * 0.34));
  return {
    title,
    code,
    detail,
    headerH: Math.max(32, title + 16),
    rowH: Math.max(30, code + detail + 10),
  };
}

export function measureBlueprint(project: Project, stats: ProjectStats, options: PngOptions): BlueprintLayout {
  const minCell = options.codes && !options.patternOnly ? 16 : 4;
  const cell = Math.max(minCell, Math.min(64, Math.round(options.scale)));
  if (options.patternOnly) {
    const width = project.width * cell + 24;
    const height = project.height * cell + 24;
    assertExportArea(width, height);
    return {
      width, height, cell, margin: 12, gutter: 0, headerH: 0,
      gridX: 12, gridY: 12, gridW: project.width * cell, gridH: project.height * cell,
      legendCols: 0, legendRowH: 0, legendH: 0, patternOnly: true,
    };
  }
  const margin = Math.max(20, Math.round(cell * 2.2));
  const gutter = Math.max(20, Math.round(cell * 1.8));
  const headerH = Math.max(64, Math.round(cell * 3.2));
  const gridW = project.width * cell;
  const gridH = project.height * cell;
  const contentW = gridW + gutter;
  const legendEntries = options.legend ? stats.list.length : 0;
  const legendCols = legendEntries ? Math.max(1, Math.floor(contentW / 170)) : 0;
  const legend = legendMetrics(cell);
  const legendRowH = legend.rowH;
  const legendH = legendEntries ? legend.headerH + Math.ceil(legendEntries / legendCols) * legendRowH + 24 : 0;
  const width = margin * 2 + contentW;
  const height = margin + headerH + gutter + gridH + (legendEntries ? 18 + legendH : 0) + margin;
  assertExportArea(width, height);
  return {
    width, height, cell, margin, gutter, headerH,
    gridX: margin + gutter, gridY: margin + headerH + gutter, gridW, gridH,
    legendCols, legendRowH, legendH, patternOnly: false,
  };
}

export function drawBlueprint(canvas: HTMLCanvasElement, project: Project, stats: ProjectStats, options: PngOptions, renderScale = 1): BlueprintLayout {
  const layout = measureBlueprint(project, stats, options);
  canvas.width = Math.ceil(layout.width * renderScale);
  canvas.height = Math.ceil(layout.height * renderScale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建图纸画布');
  ctx.scale(renderScale, renderScale);
  const { cell, gridX, gridY, gridW, gridH } = layout;

  ctx.fillStyle = '#FFFDF7';
  ctx.fillRect(0, 0, layout.width, layout.height);

  if (options.patternOnly) {
    ctx.fillStyle = '#FFFCF5';
    ctx.fillRect(gridX, gridY, gridW, gridH);
    for (let y = 0; y < project.height; y += 1) {
      for (let x = 0; x < project.width; x += 1) {
        const value = project.cells[y * project.width + x];
        if (value === EMPTY) continue;
        ctx.fillStyle = project.palette.colors[value]?.hex ?? '#eee';
        ctx.fillRect(gridX + x * cell, gridY + y * cell, cell, cell);
      }
    }
    drawGrid(ctx, project, layout, options.coords, false);
    return layout;
  }

  // Header
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#2A241E';
  ctx.font = `700 ${Math.max(18, Math.round(cell * 2.2))}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillText(project.name, layout.margin, layout.margin);
  ctx.fillStyle = '#7B7164';
  ctx.font = `400 ${Math.max(10, Math.round(cell * 0.85))}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillText(`${project.width}×${project.height} · ${project.beadSizeMm}mm · ${stats.colorCount} 色 · ${stats.total.toLocaleString('zh-CN')} 颗 · ${new Date().toLocaleDateString('zh-CN')}`, layout.margin, layout.margin + Math.max(28, cell * 2.5));

  ctx.textAlign = 'right';
  ctx.fillStyle = '#2A241E';
  ctx.font = `600 ${Math.max(11, Math.round(cell * 0.9))}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillText(`共 ${stats.total.toLocaleString('zh-CN')} 颗`, layout.width - layout.margin, layout.margin);
  ctx.fillStyle = '#7B7164';
  ctx.font = `400 ${Math.max(9, Math.round(cell * 0.7))}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillText(`${project.width} × ${project.height} 格`, layout.width - layout.margin, layout.margin + Math.max(24, cell * 2.1));
  ctx.textAlign = 'left';

  // Board & cells
  ctx.fillStyle = '#FFFCF5';
  ctx.fillRect(gridX, gridY, gridW, gridH);
  for (let y = 0; y < project.height; y += 1) {
    for (let x = 0; x < project.width; x += 1) {
      const value = project.cells[y * project.width + x];
      if (value === EMPTY) continue;
      ctx.fillStyle = project.palette.colors[value]?.hex ?? '#eee';
      ctx.fillRect(gridX + x * cell, gridY + y * cell, cell, cell);
    }
  }

  drawGrid(ctx, project, layout, options.coords, true);

  if (options.codes) {
    drawCellLabels(ctx, project, { cell, originX: gridX, originY: gridY });
  }

  if (options.legend && stats.list.length) {
    const legendY = gridY + gridH + 18;
    const legendX = layout.margin;
    const legendW = layout.width - layout.margin * 2;
    ctx.fillStyle = '#F7F1E6';
    ctx.fillRect(legendX, legendY, legendW, layout.legendH);
    ctx.strokeStyle = 'rgba(150,125,90,.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX + 0.5, legendY + 0.5, legendW - 1, layout.legendH - 1);
    const legend = legendMetrics(cell);
    ctx.fillStyle = '#2A241E';
    ctx.font = `600 ${legend.title}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillText('色号与用量', legendX + 12, legendY + 8);
    const entryW = legendW / layout.legendCols;
    const entryTop = legendY + legend.headerH;
    stats.list.forEach((entry, index) => {
      const col = index % layout.legendCols;
      const row = Math.floor(index / layout.legendCols);
      const x = legendX + col * entryW + 12;
      const y = entryTop + row * layout.legendRowH;
      ctx.fillStyle = entry.color.hex;
      ctx.beginPath();
      ctx.arc(x + 5, y + 6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.10)';
      ctx.stroke();
      ctx.fillStyle = '#2A241E';
      ctx.font = `600 ${legend.code}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.fillText(entry.color.code, x + 15, y + 1);
      ctx.fillStyle = '#7B7164';
      ctx.font = `400 ${legend.detail}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      // 名称从色号正下方开始，保证两行不叠在一起。
      ctx.fillText(`${entry.color.name} · ${entry.count.toLocaleString('zh-CN')}颗`, x + 15, y + legend.code + 3);
    });
    ctx.fillStyle = '#9C9080';
    ctx.font = `400 ${Math.max(7, Math.round(cell * 0.34))}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillText('屏幕色值仅供参考，实物颜色以品牌色卡为准。', legendX + 12, legendY + layout.legendH - 14);
  }

  return layout;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  project: Project,
  layout: BlueprintLayout,
  coords: boolean,
  drawCoordinates: boolean,
): void {
  const { cell, gridX, gridY, gridW, gridH } = layout;
  const labelStep = cell >= 12 ? 5 : 10;
  const labelFont = Math.max(7, Math.min(11, cell * 0.55));

  for (let x = 0; x <= project.width; x += 1) {
    const px = gridX + x * cell;
    const isBoard = x > 0 && x % project.boardW === 0;
    const is10 = x % 10 === 0;
    const is5 = x % 5 === 0;
    ctx.strokeStyle = isBoard ? 'rgba(60,45,30,.62)' : is10 ? 'rgba(90,72,50,.28)' : is5 ? 'rgba(90,72,50,.16)' : 'rgba(90,72,50,.08)';
    ctx.lineWidth = isBoard ? 1.3 : 0.6;
    ctx.beginPath();
    ctx.moveTo(px, gridY);
    ctx.lineTo(px, gridY + gridH);
    ctx.stroke();
  }
  for (let y = 0; y <= project.height; y += 1) {
    const py = gridY + y * cell;
    const isBoard = y > 0 && y % project.boardH === 0;
    const is10 = y % 10 === 0;
    const is5 = y % 5 === 0;
    ctx.strokeStyle = isBoard ? 'rgba(60,45,30,.62)' : is10 ? 'rgba(90,72,50,.28)' : is5 ? 'rgba(90,72,50,.16)' : 'rgba(90,72,50,.08)';
    ctx.lineWidth = isBoard ? 1.3 : 0.6;
    ctx.beginPath();
    ctx.moveTo(gridX, py);
    ctx.lineTo(gridX + gridW, py);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(60,45,30,.65)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(gridX + 0.5, gridY + 0.5, gridW - 1, gridH - 1);

  if (!coords || !drawCoordinates) return;
  ctx.fillStyle = '#8E8272';
  ctx.font = `500 ${labelFont.toFixed(1)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  for (let x = 0; x < project.width; x += labelStep) {
    ctx.fillText(String(x + 1), gridX + x * cell + 2, gridY - 4);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < project.height; y += labelStep) {
    ctx.fillText(String(y + 1), gridX - 4, gridY + y * cell + cell / 2);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

export function drawBlueprintPreview(canvas: HTMLCanvasElement, project: Project, stats: ProjectStats, options: PngOptions): void {
  const layout = measureBlueprint(project, stats, options);
  const scale = Math.min(1, 1200 / Math.max(layout.width, layout.height));
  const page = document.createElement('canvas');
  drawBlueprint(page, project, stats, options, scale);
  drawExportPreview(canvas, page, project, {
    gridX: layout.gridX * scale,
    gridY: layout.gridY * scale,
    cell: layout.cell * scale,
    title: 'PNG 整图',
    codes: options.codes && !options.patternOnly,
  });
}
