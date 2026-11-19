import seed from '@/data/seed-projects.json';
import { base64ToUint16 } from './projectFile';
import { computeStats } from './stats';
import { MARD_PALETTE } from './palette';
import type { Project } from './model';

interface SeedEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  beadSizeMm: 2.6 | 5;
  boardW: number;
  boardH: number;
  cellsBase64: string;
  updatedLabel?: string;
}

export interface SeedProject {
  project: Project;
  totalBeads: number;
  colorCount: number;
  updatedLabel: string;
}

export function createSeedProjects(): SeedProject[] {
  const now = Date.now();
  return (seed as SeedEntry[]).map((entry, index) => {
    const cells = base64ToUint16(entry.cellsBase64);
    const project: Project = {
      schemaVersion: 1,
      id: entry.id,
      name: entry.name,
      width: entry.width,
      height: entry.height,
      beadSizeMm: entry.beadSizeMm,
      boardW: entry.boardW,
      boardH: entry.boardH,
      paletteRef: { id: MARD_PALETTE.id, version: MARD_PALETTE.version },
      palette: MARD_PALETTE,
      cells,
      createdAt: now - (index + 1) * 86400000,
      updatedAt: now - (index + 1) * 3600000 * (index + 1),
    };
    const stats = computeStats(cells, MARD_PALETTE);
    return {
      project,
      totalBeads: stats.total,
      colorCount: stats.colorCount,
      updatedLabel: entry.updatedLabel ?? '示例图纸',
    };
  });
}
