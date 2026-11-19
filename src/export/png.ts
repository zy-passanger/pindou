import type { Project } from '@/core/model';
import type { ProjectStats } from '@/core/stats';
import { downloadBlob } from '@/utils/download';
import { sanitizeFileName } from '@/core/projectFile';
import { drawBlueprint, type PngOptions } from './patternRenderer';

export async function buildPng(project: Project, stats: ProjectStats, options: PngOptions): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('当前环境不支持导出');
  const canvas = document.createElement('canvas');
  drawBlueprint(canvas, project, stats, options);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG 生成失败'));
    }, 'image/png');
  });
}

export async function exportPng(project: Project, stats: ProjectStats, options: PngOptions): Promise<Blob> {
  const blob = await buildPng(project, stats, options);
  downloadBlob(blob, `${sanitizeFileName(project.name)}_图纸.png`);
  return blob;
}
