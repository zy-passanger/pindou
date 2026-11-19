import { sanitizeFileName } from '@/core/projectFile';
import type { Project } from '@/core/model';
import type { ProjectStats } from '@/core/stats';
import { downloadText } from '@/utils/download';

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildUsageCsv(project: Project, stats: ProjectStats): string {
  const rows = ['色号,颜色名,HEX,颗数,占比'];
  stats.list.forEach((item) => {
    const percent = stats.total ? (item.count / stats.total) * 100 : 0;
    rows.push([
      item.color.code,
      csvEscape(item.color.name),
      item.color.hex,
      String(item.count),
      percent.toFixed(1) + '%',
    ].join(','));
  });
  return '\uFEFF' + rows.join('\r\n');
}

export function exportUsageCsv(project: Project, stats: ProjectStats): void {
  const csv = buildUsageCsv(project, stats);
  downloadText(csv, `${sanitizeFileName(project.name)}_用量.csv`, 'text/csv;charset=utf-8');
}
