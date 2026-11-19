import { EMPTY } from './constants';
import type { BeadColor, PaletteSnapshot, Project } from './model';

export interface ProjectFileV1 {
  format: 'pindou';
  schemaVersion: 1;
  appVersion: string;
  project: {
    id: string;
    name: string;
    width: number;
    height: number;
    beadSizeMm: 2.6 | 5;
    boardW: number;
    boardH: number;
    createdAt: number;
    updatedAt: number;
    cellsEncoding: 'u16le-base64';
    cellsBase64: string;
  };
  palette: PaletteSnapshot;
}

export function uint16ToBase64(cells: Uint16Array): string {
  const bytes = new Uint8Array(cells.buffer, cells.byteOffset, cells.byteLength);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToUint16(value: string): Uint16Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Uint16Array(copy.buffer);
}

export function encodeProjectFile(project: Project): string {
  const payload: ProjectFileV1 = {
    format: 'pindou',
    schemaVersion: 1,
    appVersion: '0.1.0',
    project: {
      id: project.id,
      name: project.name,
      width: project.width,
      height: project.height,
      beadSizeMm: project.beadSizeMm,
      boardW: project.boardW,
      boardH: project.boardH,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      cellsEncoding: 'u16le-base64',
      cellsBase64: uint16ToBase64(project.cells),
    },
    palette: project.palette,
  };
  return JSON.stringify(payload, null, 2);
}

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function validatePalette(value: unknown): PaletteSnapshot {
  if (!value || typeof value !== 'object') throw new Error('色卡数据缺失');
  const palette = value as Partial<PaletteSnapshot>;
  if (typeof palette.id !== 'string' || typeof palette.version !== 'string') throw new Error('色卡标识无效');
  if (!Array.isArray(palette.colors) || palette.colors.length === 0 || palette.colors.length > 600) {
    throw new Error('色卡颜色数量无效');
  }
  const seen = new Set<string>();
  const colors: BeadColor[] = palette.colors.map((color) => {
    if (!color || typeof color.code !== 'string' || seen.has(color.code)) throw new Error('色号重复或无效');
    if (!isHex(color.hex)) throw new Error(`色值无效：${color.code}`);
    seen.add(color.code);
    return {
      code: color.code,
      name: String(color.name ?? color.code),
      hex: color.hex.toUpperCase(),
      series: String(color.series ?? color.code[0]),
      common: Boolean(color.common),
    };
  });
  return { id: palette.id, version: palette.version, colors };
}

export function parseProjectFile(text: string): Project {
  if (text.length > 20 * 1024 * 1024) throw new Error('工程文件过大');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('工程文件不是有效的 JSON');
  }
  if (!data || typeof data !== 'object') throw new Error('工程文件内容无效');
  const file = data as Partial<ProjectFileV1>;
  if (file.format !== 'pindou' || file.schemaVersion !== 1) throw new Error('不支持的工程文件版本');
  const raw = file.project;
  if (!raw) throw new Error('工程内容缺失');
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 300 || height > 300) {
    throw new Error('图纸尺寸无效');
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) throw new Error('图纸名称无效');
  if (raw.cellsEncoding !== 'u16le-base64' || typeof raw.cellsBase64 !== 'string') {
    throw new Error('图纸数据编码无效');
  }
  const palette = validatePalette(file.palette);
  let cells: Uint16Array;
  try {
    cells = base64ToUint16(raw.cellsBase64);
  } catch {
    throw new Error('图纸数据无法解码');
  }
  if (cells.length !== width * height) throw new Error('图纸数据长度不匹配');
  for (let i = 0; i < cells.length; i += 1) {
    const value = cells[i];
    if (value !== EMPTY && value >= palette.colors.length) throw new Error('图纸包含无效色号');
  }
  return {
    schemaVersion: 1,
    id: String(raw.id || ''),
    name: raw.name.trim().slice(0, 40),
    width,
    height,
    beadSizeMm: raw.beadSizeMm === 5 ? 5 : 2.6,
    boardW: Number(raw.boardW) || 52,
    boardH: Number(raw.boardH) || 52,
    paletteRef: { id: palette.id, version: palette.version },
    palette,
    cells,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return (cleaned || '未命名图纸').slice(0, 80);
}
