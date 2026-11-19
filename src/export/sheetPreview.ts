import { EMPTY } from '@/core/constants';
import type { Project } from '@/core/model';
import { drawCellLabels } from '@/rendering/cellLabels';

interface ExportPreviewOptions {
  gridX: number;
  gridY: number;
  cell: number;
  title: string;
  codes: boolean;
  mirror?: boolean;
  startCol?: number;
  endCol?: number;
  startRow?: number;
  endRow?: number;
}

/** 左侧是真实图纸缩略图，右侧放大同一位置，避免整图缩小时看不清格内色号。 */
export function drawExportPreview(
  canvas: HTMLCanvasElement,
  page: HTMLCanvasElement,
  project: Project,
  options: ExportPreviewOptions,
): void {
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#F3EDE1';
  ctx.fillRect(0, 0, 640, 360);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#2A241E';
  ctx.font = '600 19px "Microsoft YaHei", sans-serif';
  ctx.fillText(options.title, 20, 16);
  ctx.fillText(options.codes ? '逐格色号 · 局部放大' : '图案 · 局部放大', 306, 16);

  const fit = Math.min(260 / page.width, 292 / page.height);
  const pageX = 20 + (260 - page.width * fit) / 2;
  const pageY = 48;
  ctx.drawImage(page, pageX, pageY, page.width * fit, page.height * fit);

  const minX = options.startCol ?? 0;
  const minY = options.startRow ?? 0;
  const maxX = options.endCol ?? project.width - 1;
  const maxY = options.endRow ?? project.height - 1;
  const cols = Math.min(7, maxX - minX + 1);
  const rows = Math.min(6, maxY - minY + 1);
  const lastX = maxX - cols + 1;
  const lastY = maxY - rows + 1;
  const valueAt = (x: number, y: number) => project.cells[y * project.width + (options.mirror ? project.width - 1 - x : x)];

  let startX = minX;
  let startY = minY;
  let best = -1;
  const stepX = Math.max(1, Math.floor((lastX - minX) / 12));
  const stepY = Math.max(1, Math.floor((lastY - minY) / 12));
  for (let y = minY; y <= lastY; y += stepY) {
    for (let x = minX; x <= lastX; x += stepX) {
      const colors = new Set<number>();
      let occupied = 0;
      for (let dy = 0; dy < rows; dy += 1) {
        for (let dx = 0; dx < cols; dx += 1) {
          const value = valueAt(x + dx, y + dy);
          if (value === EMPTY || !project.palette.colors[value]) continue;
          colors.add(value);
          occupied += 1;
        }
      }
      const score = colors.size * 16 + occupied;
      if (score > best) {
        best = score;
        startX = x;
        startY = y;
      }
    }
  }

  const cell = 44;
  const detailX = 306;
  const detailY = 58;
  ctx.fillStyle = '#FFFCF5';
  ctx.fillRect(detailX, detailY, cols * cell, rows * cell);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const color = project.palette.colors[valueAt(startX + x, startY + y)];
      if (!color) continue;
      ctx.fillStyle = color.hex;
      ctx.fillRect(detailX + x * cell, detailY + y * cell, cell, cell);
    }
  }
  ctx.strokeStyle = 'rgba(90,72,50,.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= cols; x += 1) {
    ctx.moveTo(detailX + x * cell, detailY);
    ctx.lineTo(detailX + x * cell, detailY + rows * cell);
  }
  for (let y = 0; y <= rows; y += 1) {
    ctx.moveTo(detailX, detailY + y * cell);
    ctx.lineTo(detailX + cols * cell, detailY + y * cell);
  }
  ctx.stroke();
  if (options.codes) {
    drawCellLabels(ctx, project, {
      cell,
      originX: detailX - startX * cell,
      originY: detailY - startY * cell,
      startCol: startX, endCol: startX + cols - 1,
      startRow: startY, endRow: startY + rows - 1,
      mirror: options.mirror,
    });
  }

  ctx.strokeStyle = '#D95D4E';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    pageX + (options.gridX + (startX - minX) * options.cell) * fit,
    pageY + (options.gridY + (startY - minY) * options.cell) * fit,
    cols * options.cell * fit,
    rows * options.cell * fit,
  );
  ctx.fillStyle = '#7B7164';
  ctx.font = '400 16px "Microsoft YaHei", sans-serif';
  ctx.fillText(`列 ${startX + 1}–${startX + cols} · 行 ${startY + 1}–${startY + rows}`, detailX, 334);
}
