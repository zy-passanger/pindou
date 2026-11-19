import { EMPTY } from './constants';
import type { BeadColor, PaletteSnapshot, Project } from './model';

export interface ColorUsage {
  index: number;
  color: BeadColor;
  count: number;
}

export interface ProjectStats {
  total: number;
  colorCount: number;
  counts: Uint32Array;
  list: ColorUsage[];
}

export function computeStats(cells: Uint16Array, palette: PaletteSnapshot): ProjectStats {
  const counts = new Uint32Array(palette.colors.length);
  for (let i = 0; i < cells.length; i += 1) {
    const value = cells[i];
    if (value !== EMPTY && value < counts.length) counts[value] += 1;
  }
  const list: ColorUsage[] = [];
  let total = 0;
  for (let i = 0; i < counts.length; i += 1) {
    const count = counts[i];
    if (!count) continue;
    total += count;
    list.push({ index: i, color: palette.colors[i], count });
  }
  list.sort((a, b) => b.count - a.count);
  return { total, colorCount: list.length, counts, list };
}

export function mostUsedIndex(stats: ProjectStats): number | null {
  return stats.list.length ? stats.list[0].index : null;
}

export function countForColor(stats: ProjectStats, index: number): number {
  return stats.counts[index] ?? 0;
}

export function usageRows(project: Project, stats: ProjectStats): Array<{
  code: string;
  name: string;
  hex: string;
  count: number;
  percent: number;
}> {
  return stats.list.map((item) => ({
    code: item.color.code,
    name: item.color.name,
    hex: item.color.hex,
    count: item.count,
    percent: stats.total ? (item.count / stats.total) * 100 : 0,
  }));
}
