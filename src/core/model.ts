import { EMPTY } from './constants';

export type BeadSizeMm = 2.6 | 5;

export interface BeadColor {
  code: string;
  name: string;
  hex: string;
  series: string;
  common: boolean;
}

export interface PaletteRef {
  id: string;
  version: string;
}

export interface PaletteSnapshot extends PaletteRef {
  colors: BeadColor[];
}

export interface ProjectMeta {
  schemaVersion: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  beadSizeMm: BeadSizeMm;
  boardW: number;
  boardH: number;
  paletteRef: PaletteRef;
  createdAt: number;
  updatedAt: number;
}

export interface Project extends ProjectMeta {
  palette: PaletteSnapshot;
  cells: Uint16Array;
}

export interface ProjectSummary extends ProjectMeta {
  totalBeads: number;
  colorCount: number;
  thumbnail: Blob | null;
}

export interface BoardPreset {
  size: number;
  label: string;
  boards: number;
}

export const BOARD_PRESETS: Record<'2.6' | '5', number[]> = {
  '2.6': [52, 50, 78, 104],
  '5': [29, 57],
};

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function boardSizeForBead(beadSizeMm: BeadSizeMm): number {
  return beadSizeMm === 5 ? 29 : 52;
}

export function createEmptyCells(width: number, height: number): Uint16Array {
  const cells = new Uint16Array(width * height);
  cells.fill(EMPTY);
  return cells;
}

export function createProject(options: {
  name: string;
  width: number;
  height: number;
  beadSizeMm: BeadSizeMm;
  palette: PaletteSnapshot;
  boardW?: number;
  boardH?: number;
  cells?: Uint16Array;
}): Project {
  const now = Date.now();
  const board = boardSizeForBead(options.beadSizeMm);
  return {
    schemaVersion: 1,
    id: newId(),
    name: options.name || '未命名图纸',
    width: options.width,
    height: options.height,
    beadSizeMm: options.beadSizeMm,
    boardW: options.boardW ?? board,
    boardH: options.boardH ?? board,
    paletteRef: { id: options.palette.id, version: options.palette.version },
    palette: options.palette,
    cells: options.cells ?? createEmptyCells(options.width, options.height),
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneProject(project: Project, overrides: Partial<ProjectMeta> & { name?: string } = {}): Project {
  return {
    ...project,
    ...overrides,
    id: overrides.id ?? newId(),
    cells: project.cells.slice(),
    palette: project.palette,
    paletteRef: overrides.paletteRef ?? project.paletteRef,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

export function physicalSize(project: { width: number; height: number; beadSizeMm: number }): string {
  const w = (project.width * project.beadSizeMm / 10).toFixed(1);
  const h = (project.height * project.beadSizeMm / 10).toFixed(1);
  return `${w} × ${h} cm`;
}

export function boardCount(project: { width: number; height: number; boardW: number; boardH: number }): number {
  return Math.ceil(project.width / project.boardW) * Math.ceil(project.height / project.boardH);
}

export function projectToSummary(
  project: Project,
  stats: { total: number; colorCount: number },
  thumbnail: Blob | null,
): ProjectSummary {
  return {
    schemaVersion: 1,
    id: project.id,
    name: project.name,
    width: project.width,
    height: project.height,
    beadSizeMm: project.beadSizeMm,
    boardW: project.boardW,
    boardH: project.boardH,
    paletteRef: project.paletteRef,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    totalBeads: stats.total,
    colorCount: stats.colorCount,
    thumbnail,
  };
}
