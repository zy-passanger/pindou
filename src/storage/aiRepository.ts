import { getDb, type GenerationImageRecord, type GenerationRecord } from './db';
import { requestPersistentStorage } from './projectRepository';
import type { AiMode, AiProviderId, AiSettingsValue, AiSizePreset } from '@/core/imagegen/types';

const AI_SETTINGS_KEY = 'default';
export const AI_HISTORY_LIMIT = 20;

const PROVIDERS: AiProviderId[] = ['openai-images', 'openai-chat', 'gemini'];
const MODES: AiMode[] = ['image', 'grid'];
const SIZES: AiSizePreset[] = ['44x52', '52x52', '78x78', '104x104'];

export const DEFAULT_AI_SETTINGS: AiSettingsValue = {
  schemaVersion: 1,
  activeProvider: 'openai-images',
  providers: {
    'openai-images': {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      imageModel: 'gpt-image-1',
      gridModel: '',
    },
    'openai-chat': {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      imageModel: '',
      gridModel: 'gpt-4o',
    },
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: '',
      imageModel: 'gemini-2.5-flash-image',
      gridModel: 'gemini-2.5-flash',
    },
  },
  defaults: {
    mode: 'image',
    sizePreset: '52x52',
    maxColors: 12,
    style: '像素风',
    rememberKey: true,
  },
};

function cloneDefaults(): AiSettingsValue {
  return JSON.parse(JSON.stringify(DEFAULT_AI_SETTINGS)) as AiSettingsValue;
}

function normalizeBaseUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const url = new URL(value.trim());
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return fallback;
    return value.trim().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function normalizeText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function normalizeKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 600);
}

/** 防御性读取：未知字段丢弃，非法 URL/尺寸/颜色数回退默认值。 */
export function normalizeAiSettings(value: unknown): AiSettingsValue {
  const base = cloneDefaults();
  if (!value || typeof value !== 'object') return base;
  const input = value as Partial<AiSettingsValue>;
  const rememberKey = input.defaults?.rememberKey !== false;
  const providers = {} as AiSettingsValue['providers'];
  for (const id of PROVIDERS) {
    const fallback = base.providers[id];
    const raw = input.providers?.[id];
    providers[id] = {
      baseUrl: normalizeBaseUrl(raw?.baseUrl, fallback.baseUrl),
      apiKey: rememberKey ? normalizeKey(raw?.apiKey) : '',
      imageModel: normalizeText(raw?.imageModel, fallback.imageModel, 160),
      gridModel: normalizeText(raw?.gridModel, fallback.gridModel, 160),
    };
  }
  const mode = MODES.includes(input.defaults?.mode as AiMode) ? input.defaults!.mode : base.defaults.mode;
  const sizePreset = SIZES.includes(input.defaults?.sizePreset as AiSizePreset)
    ? input.defaults!.sizePreset
    : base.defaults.sizePreset;
  const maxColorsRaw = Number(input.defaults?.maxColors);
  const maxColors = Number.isFinite(maxColorsRaw)
    ? Math.max(4, Math.min(48, Math.round(maxColorsRaw)))
    : base.defaults.maxColors;
  return {
    schemaVersion: 1,
    activeProvider: PROVIDERS.includes(input.activeProvider as AiProviderId)
      ? input.activeProvider!
      : base.activeProvider,
    providers,
    defaults: {
      mode: mode as AiMode,
      sizePreset: sizePreset as AiSizePreset,
      maxColors,
      style: normalizeText(input.defaults?.style, base.defaults.style, 30),
      rememberKey,
    },
  };
}

export async function getAiSettings(): Promise<AiSettingsValue> {
  const db = await getDb();
  const record = await db.get('aiSettings', AI_SETTINGS_KEY);
  return normalizeAiSettings(record?.value);
}

export async function saveAiSettings(value: AiSettingsValue): Promise<AiSettingsValue> {
  requestPersistentStorage();
  const normalized = normalizeAiSettings(value);
  const db = await getDb();
  await db.put('aiSettings', {
    key: AI_SETTINGS_KEY,
    value: normalized,
    updatedAt: Date.now(),
  });
  return normalized;
}

export async function saveGeneration(
  record: GenerationRecord,
  image: Blob,
  mime: string,
): Promise<void> {
  requestPersistentStorage();
  const db = await getDb();
  const imageRecord: GenerationImageRecord = { id: record.id, blob: image, mime };
  try {
    const tx = db.transaction(['generations', 'generationImages'], 'readwrite');
    await tx.objectStore('generations').put(record);
    await tx.objectStore('generationImages').put(imageRecord);
    await tx.done;
  } catch {
    // 配额不足时先淘汰最旧的一半，再重试一次；仍失败则交给 UI 提示，不阻断当前预览。
    await pruneGenerations(Math.floor(AI_HISTORY_LIMIT / 2)).catch(() => 0);
    try {
      const tx = db.transaction(['generations', 'generationImages'], 'readwrite');
      await tx.objectStore('generations').put(record);
      await tx.objectStore('generationImages').put(imageRecord);
      await tx.done;
    } catch {
      throw new Error('本地存储空间不足，生成结果未写入历史');
    }
  }
  await pruneGenerations(AI_HISTORY_LIMIT).catch(() => 0);
}

export async function listRecentGenerations(limit = AI_HISTORY_LIMIT): Promise<GenerationRecord[]> {
  const db = await getDb();
  const records = await db.getAllFromIndex('generations', 'createdAt');
  return records.slice(-Math.max(1, limit)).reverse();
}

export async function getGenerationImage(id: string): Promise<GenerationImageRecord | null> {
  const db = await getDb();
  return (await db.get('generationImages', id)) ?? null;
}

export async function deleteGeneration(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['generations', 'generationImages'], 'readwrite');
  await tx.objectStore('generations').delete(id);
  await tx.objectStore('generationImages').delete(id);
  await tx.done;
}

export async function clearGenerations(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['generations', 'generationImages'], 'readwrite');
  await tx.objectStore('generations').clear();
  await tx.objectStore('generationImages').clear();
  await tx.done;
}

export async function markGenerationProject(id: string, projectId: string): Promise<void> {
  const db = await getDb();
  const record = await db.get('generations', id);
  if (!record) return;
  await db.put('generations', { ...record, projectId });
}

export async function pruneGenerations(max = AI_HISTORY_LIMIT): Promise<number> {
  const db = await getDb();
  const records = await db.getAllFromIndex('generations', 'createdAt');
  const excess = records.length - Math.max(0, max);
  if (excess <= 0) return 0;
  const tx = db.transaction(['generations', 'generationImages'], 'readwrite');
  for (const record of records.slice(0, excess)) {
    await tx.objectStore('generations').delete(record.id);
    await tx.objectStore('generationImages').delete(record.id);
  }
  await tx.done;
  return excess;
}
