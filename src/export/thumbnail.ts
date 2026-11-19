import type { Project } from '@/core/model';
import { EMPTY } from '@/core/constants';

export async function renderThumbnail(project: Project): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  // 空图纸用 UI 的豆子占位图，避免首页出现一块纯白缩略图。
  if (!project.cells.some((value) => value !== EMPTY)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const width = canvas.width;
  const height = canvas.height;
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#FBF6EC');
  bg.addColorStop(1, '#EFE5D4');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const pad = 22;
  const cell = Math.min((width - pad * 2) / project.width, (height - pad * 2) / project.height);
  const boardW = cell * project.width;
  const boardH = cell * project.height;
  const x0 = (width - boardW) / 2;
  const y0 = (height - boardH) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(70,52,30,.16)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#FFFCF5';
  ctx.fillRect(x0, y0, boardW, boardH);
  ctx.restore();
  const gap = cell >= 4 ? 0.5 : 0;
  for (let y = 0; y < project.height; y += 1) {
    for (let x = 0; x < project.width; x += 1) {
      const value = project.cells[y * project.width + x];
      if (value === EMPTY) continue;
      ctx.fillStyle = project.palette.colors[value]?.hex ?? '#eee';
      ctx.fillRect(x0 + x * cell + gap, y0 + y * cell + gap, Math.max(0.6, cell - gap * 2), Math.max(0.6, cell - gap * 2));
    }
  }
  ctx.strokeStyle = 'rgba(100,78,50,.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, boardW - 1, boardH - 1);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      canvas.toBlob((png) => resolve(png ?? null), 'image/png');
    }, 'image/webp', 0.85);
  });
}
