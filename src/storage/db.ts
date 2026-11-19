import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_MY_PALETTE } from '@/core/palette';
import type { PaletteSnapshot, ProjectMeta, ProjectSummary } from '@/core/model';

export interface ProjectSummaryRecord extends Omit<ProjectSummary, 'thumbnail'> {
  thumbnail: Blob | null;
}

export interface GridRecord {
  projectId: string;
  cells: Uint16Array;
  updatedAt: number;
}

export interface PaletteRecord {
  key: string;
  snapshot: PaletteSnapshot;
  source: 'builtin' | 'imported';
}

export interface SettingsRecord {
  key: string;
  value: unknown;
}

export interface AppSettings {
  schemaVersion: 1;
  myPaletteCodes: string[];
  prefs: {
    showGrid: boolean;
    showCodes: boolean;
    stylusOnlyDraw: boolean;
    pdfDpi: 200 | 300;
    pdfOverlap: number;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  myPaletteCodes: [...DEFAULT_MY_PALETTE],
  prefs: {
    showGrid: true,
    showCodes: true,
    stylusOnlyDraw: false,
    pdfDpi: 200,
    pdfOverlap: 1,
  },
};

interface PindouDB extends DBSchema {
  projects: {
    key: string;
    value: ProjectSummaryRecord;
    indexes: { updatedAt: number };
  };
  grids: {
    key: string;
    value: GridRecord;
  };
  palettes: {
    key: string;
    value: PaletteRecord;
  };
  settings: {
    key: string;
    value: SettingsRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<PindouDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<PindouDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PindouDB>('pindou', 1, {
      upgrade(db) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('grids', { keyPath: 'projectId' });
        db.createObjectStore('palettes', { keyPath: 'key' });
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export function paletteKey(ref: { id: string; version: string }): string {
  return `${ref.id}@${ref.version}`;
}

export function metaFromSummary(summary: ProjectSummary): ProjectMeta {
  return {
    schemaVersion: 1,
    id: summary.id,
    name: summary.name,
    width: summary.width,
    height: summary.height,
    beadSizeMm: summary.beadSizeMm,
    boardW: summary.boardW,
    boardH: summary.boardH,
    paletteRef: summary.paletteRef,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  };
}
