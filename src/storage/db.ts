import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_MY_PALETTE } from '@/core/palette';
import type { PaletteSnapshot, ProjectMeta, ProjectSummary } from '@/core/model';
import type { AiMode, AiProviderId, AiSettingsValue, GridData } from '@/core/imagegen/types';

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

export interface AiSettingsRecord {
  key: string;
  value: AiSettingsValue;
  updatedAt: number;
}

export interface GenerationRecord {
  id: string;
  createdAt: number;
  mode: AiMode;
  provider: AiProviderId;
  model: string;
  prompt: string;
  width: number;
  height: number;
  maxColors: number;
  revisedPrompt?: string;
  projectId?: string;
  mime: string;
  imageWidth: number;
  imageHeight: number;
  thumbnail: Blob | null;
  grid?: GridData;
}

export interface GenerationImageRecord {
  id: string;
  blob: Blob;
  mime: string;
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
  aiSettings: {
    key: string;
    value: AiSettingsRecord;
  };
  generations: {
    key: string;
    value: GenerationRecord;
    indexes: { createdAt: number; projectId: string };
  };
  generationImages: {
    key: string;
    value: GenerationImageRecord;
  };
}

const DB_NAME = 'pindou';
const DB_VERSION = 2;
let dbPromise: Promise<IDBPDatabase<PindouDB>> | null = null;

function notifyDbEvent(type: 'blocked' | 'blocking'): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('pindou:db', { detail: { type } }));
}

export function getDb(): Promise<IDBPDatabase<PindouDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PindouDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v1 的 store 只在全新安装（0→2）时创建；已有 v1 用户升级时不能重建。
        if (oldVersion < 1) {
          const projects = db.createObjectStore('projects', { keyPath: 'id' });
          projects.createIndex('updatedAt', 'updatedAt');
          db.createObjectStore('grids', { keyPath: 'projectId' });
          db.createObjectStore('palettes', { keyPath: 'key' });
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('aiSettings')) {
            db.createObjectStore('aiSettings', { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains('generations')) {
            const generations = db.createObjectStore('generations', { keyPath: 'id' });
            generations.createIndex('createdAt', 'createdAt');
            generations.createIndex('projectId', 'projectId');
          }
          if (!db.objectStoreNames.contains('generationImages')) {
            db.createObjectStore('generationImages', { keyPath: 'id' });
          }
        }
      },
      blocked() {
        // 另一个标签页还持有旧连接；App 监听此事件提示用户关闭旧标签页。
        notifyDbEvent('blocked');
      },
      blocking() {
        // 别的标签页要升级数据库，本连接需要让路；下次调用会重新打开。
        notifyDbEvent('blocking');
        const pending = dbPromise;
        dbPromise = null;
        void pending?.then((db) => db.close()).catch(() => {});
      },
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** 测试或数据库升级失败后丢弃连接缓存，允许下一次重新打开。 */
export function resetDbConnection(): void {
  const pending = dbPromise;
  dbPromise = null;
  void pending?.then((db) => db.close()).catch(() => {});
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
