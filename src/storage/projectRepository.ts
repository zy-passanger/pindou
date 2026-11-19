import { DEFAULT_SETTINGS, getDb, paletteKey, type AppSettings, type GridRecord, type PaletteRecord, type ProjectSummaryRecord } from './db';
import { computeStats } from '@/core/stats';
import { MARD_PALETTE, DEFAULT_MY_PALETTE } from '@/core/palette';
import { createSeedProjects } from '@/core/seed';
import { renderThumbnail } from '@/export/thumbnail';
import { encodeProjectFile, parseProjectFile } from '@/core/projectFile';
import { cloneProject, newId, type Project, type ProjectSummary } from '@/core/model';

const BUILTIN_KEY = paletteKey(MARD_PALETTE);
const SETTINGS_KEY = 'app';
const SEEDED_KEY = 'seeded';

export function isBuiltinPalette(project: Project): boolean {
  return project.paletteRef.id === MARD_PALETTE.id && project.paletteRef.version === MARD_PALETTE.version;
}

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  const db = await getDb();
  const records = await db.getAll('projects');
  return records.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function resolvePalette(project: { paletteRef: { id: string; version: string } }): Promise<Project['palette']> {
  if (project.paletteRef.id === MARD_PALETTE.id && project.paletteRef.version === MARD_PALETTE.version) {
    return MARD_PALETTE;
  }
  const db = await getDb();
  const record = await db.get('palettes', paletteKey(project.paletteRef));
  return record?.snapshot ?? MARD_PALETTE;
}

export async function getProject(id: string): Promise<Project | null> {
  const db = await getDb();
  const meta = await db.get('projects', id);
  if (!meta) return null;
  const grid = await db.get('grids', id);
  if (!grid) return null;
  const palette = await resolvePalette(meta);
  return {
    schemaVersion: 1,
    id: meta.id,
    name: meta.name,
    width: meta.width,
    height: meta.height,
    beadSizeMm: meta.beadSizeMm,
    boardW: meta.boardW,
    boardH: meta.boardH,
    paletteRef: meta.paletteRef,
    palette,
    cells: grid.cells,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

let persistenceRequested = false;

/** 首次保存时静默申请持久化存储，降低被系统清理的概率。 */
function requestPersistentStorage(): void {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    void navigator.storage?.persist?.();
  } catch {
    // 隐私模式或旧浏览器不支持，忽略即可。
  }
}

export async function saveProject(project: Project, options: { thumbnail?: Blob | null; keepTimestamp?: boolean } = {}): Promise<ProjectSummary> {
  requestPersistentStorage();
  const db = await getDb();
  const stats = computeStats(project.cells, project.palette);
  const previous = await db.get('projects', project.id);
  const now = Date.now();
  if (!options.keepTimestamp) project.updatedAt = now;
  const thumbnail = options.thumbnail !== undefined ? options.thumbnail : previous?.thumbnail ?? null;
  const summary: ProjectSummaryRecord = {
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
  const tx = db.transaction(['projects', 'grids', 'palettes'], 'readwrite');
  await tx.objectStore('projects').put(summary);
  const grid: GridRecord = { projectId: project.id, cells: project.cells, updatedAt: project.updatedAt };
  await tx.objectStore('grids').put(grid);
  if (!isBuiltinPalette(project)) {
    const record: PaletteRecord = {
      key: paletteKey(project.paletteRef),
      snapshot: project.palette,
      source: 'imported',
    };
    await tx.objectStore('palettes').put(record);
  }
  await tx.done;
  return summary;
}

export async function saveProjectWithThumbnail(project: Project): Promise<ProjectSummary> {
  const thumbnail = await renderThumbnail(project);
  return saveProject(project, { thumbnail });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['projects', 'grids'], 'readwrite');
  await tx.objectStore('projects').delete(id);
  await tx.objectStore('grids').delete(id);
  await tx.done;
}

export async function duplicateProject(project: Project): Promise<Project> {
  const copy = cloneProject(project, {
    id: newId(),
    name: `${project.name} 副本`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await saveProjectWithThumbnail(copy);
  return copy;
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const record = await db.get('settings', SETTINGS_KEY);
  if (!record) return structuredCloneSettings();
  return normalizeSettings(record.value);
}

export function structuredCloneSettings(): AppSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as AppSettings;
}

function normalizeSettings(value: unknown): AppSettings {
  const base = structuredCloneSettings();
  if (!value || typeof value !== 'object') return base;
  const input = value as Partial<AppSettings>;
  const valid = new Set(MARD_PALETTE.colors.map((color) => color.code));
  const codes = Array.isArray(input.myPaletteCodes)
    ? Array.from(new Set(input.myPaletteCodes.filter((code): code is string => typeof code === 'string' && valid.has(code))))
    : base.myPaletteCodes;
  return {
    schemaVersion: 1,
    myPaletteCodes: codes,
    prefs: {
      showGrid: input.prefs?.showGrid ?? base.prefs.showGrid,
      showCodes: input.prefs?.showCodes ?? base.prefs.showCodes,
      stylusOnlyDraw: input.prefs?.stylusOnlyDraw ?? base.prefs.stylusOnlyDraw,
      pdfDpi: input.prefs?.pdfDpi === 300 ? 300 : 200,
      pdfOverlap: Math.max(0, Math.min(3, Number(input.prefs?.pdfOverlap ?? base.prefs.pdfOverlap))),
    },
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb();
  await db.put('settings', { key: SETTINGS_KEY, value: settings });
}

export async function saveMyPaletteCodes(codes: string[]): Promise<void> {
  const settings = await getSettings();
  settings.myPaletteCodes = codes;
  await saveSettings(settings);
}

export async function seedIfNeeded(): Promise<void> {
  const db = await getDb();
  const seeded = await db.get('settings', SEEDED_KEY);
  if (seeded?.value) return;
  const count = await db.count('projects');
  if (count === 0) {
    const seeds = createSeedProjects();
    for (const seed of seeds) {
      const thumbnail = await renderThumbnail(seed.project);
      await saveProject(seed.project, { thumbnail, keepTimestamp: true });
    }
  }
  await db.put('settings', { key: SEEDED_KEY, value: true });
}

export async function importProjectFile(text: string, fileName: string): Promise<Project> {
  const parsed = parseProjectFile(text);
  const project: Project = {
    ...parsed,
    id: newId(),
    name: parsed.name || fileName.replace(/\.pindou\.json$/i, '') || '导入的图纸',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveProjectWithThumbnail(project);
  return project;
}

export function exportProjectFile(project: Project): string {
  return encodeProjectFile(project);
}

export async function exportProjectText(project: Project): Promise<string> {
  return exportProjectFile(project);
}

export { BUILTIN_KEY };
