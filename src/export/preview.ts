import { EMPTY } from '@/core/constants';
import type { BeadColor, PaletteSnapshot, Project } from '@/core/model';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function drawPatternCanvas(
  canvas: HTMLCanvasElement,
  palette: BeadColor[],
  width: number,
  height: number,
  cells: Uint16Array,
  options: { grid?: boolean; background?: string; pad?: number } = {},
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = options.background ?? '#F4ECDD';
  ctx.fillRect(0, 0, cw, ch);
  const pad = options.pad ?? Math.max(10, Math.min(cw, ch) * 0.05);
  const cell = Math.min((cw - pad * 2) / width, (ch - pad * 2) / height);
  const bw = cell * width;
  const bh = cell * height;
  const x0 = (cw - bw) / 2;
  const y0 = (ch - bh) / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(70,52,30,.18)';
  ctx.shadowBlur = Math.min(20, cell * 2);
  ctx.shadowOffsetY = Math.min(8, cell);
  roundRect(ctx, x0, y0, bw, bh, Math.min(12, cell * 1.4));
  ctx.fillStyle = '#FFFCF5';
  ctx.fill();
  ctx.restore();

  const gap = cell >= 6 ? 0.6 : 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = cells[y * width + x];
      if (value === EMPTY) continue;
      const color = palette[value];
      if (!color) continue;
      ctx.fillStyle = color.hex;
      ctx.fillRect(x0 + x * cell + gap, y0 + y * cell + gap, Math.max(0.6, cell - gap * 2), Math.max(0.6, cell - gap * 2));
    }
  }

  if (options.grid && cell >= 4) {
    ctx.strokeStyle = 'rgba(90,72,50,.14)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 1) {
      const px = x0 + x * cell;
      ctx.moveTo(px, y0);
      ctx.lineTo(px, y0 + bh);
    }
    for (let y = 0; y <= height; y += 1) {
      const py = y0 + y * cell;
      ctx.moveTo(x0, py);
      ctx.lineTo(x0 + bw, py);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(80,62,42,.20)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, bw - 1, bh - 1);
}

/** 生成示例图片（用于导入向导的演示，不参与真实效果）。 */
export function createSampleImage(project: Project, size = 640): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#F7EFE1');
  bg.addColorStop(0.55, '#EFE3D0');
  bg.addColorStop(1, '#E4D5BD');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  // 无外边距、无圆角、无间隙：让示例图与目标网格 1:1 对齐，
  // 便于演示背景移除与色卡匹配，而不是模拟真实照片的模糊。
  const cell = Math.min(size / project.width, size / project.height);
  const bw = cell * project.width;
  const bh = cell * project.height;
  const x0 = (size - bw) / 2;
  const y0 = (size - bh) / 2;
  for (let y = 0; y < project.height; y += 1) {
    for (let x = 0; x < project.width; x += 1) {
      const value = project.cells[y * project.width + x];
      if (value === EMPTY) continue;
      const color = project.palette.colors[value];
      if (!color) continue;
      ctx.fillStyle = color.hex;
      ctx.fillRect(x0 + x * cell, y0 + y * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  return canvas;
}

export function paletteSnapshotColors(palette: PaletteSnapshot): BeadColor[] {
  return palette.colors;
}
