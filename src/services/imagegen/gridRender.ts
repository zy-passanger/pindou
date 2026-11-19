import type { GridData } from '@/core/imagegen/types';
import { canvasToBlob } from './decode';

export function renderGridCanvas(grid: GridData, cellPx = 12): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width * cellPx;
  canvas.height = grid.height * cellPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建网格画布');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < grid.height; y += 1) {
    const row = grid.rows[y] ?? '';
    for (let x = 0; x < grid.width; x += 1) {
      const key = row[x];
      const color = key ? grid.palette[key] : undefined;
      ctx.fillStyle = color ?? '#FFFFFF';
      ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
    }
  }
  return canvas;
}

export function gridToBlob(grid: GridData, cellPx = 12): Promise<Blob> {
  return canvasToBlob(renderGridCanvas(grid, cellPx), 'image/png');
}
