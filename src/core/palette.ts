import paletteJson from '@/data/palettes/mard.v1.json';
import type { BeadColor, PaletteSnapshot } from './model';

const data = paletteJson as unknown as PaletteSnapshot;

export const MARD_PALETTE: PaletteSnapshot = data;
export const MARD_COLORS: BeadColor[] = data.colors;
export const PALETTE_SIZE = MARD_COLORS.length;

export const PALETTE_BY_CODE = new Map<string, BeadColor>(
  MARD_COLORS.map((color) => [color.code, color]),
);
export const INDEX_BY_CODE = new Map<string, number>(
  MARD_COLORS.map((color, index) => [color.code, index]),
);

/** 默认「我的色卡」：221 常用色。 */
export const DEFAULT_MY_PALETTE: string[] = MARD_COLORS
  .filter((color) => color.common)
  .map((color) => color.code);

export const ALL_CODES: string[] = MARD_COLORS.map((color) => color.code);

export function normalizeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  // 特殊效果系列 Z1–Z8 在色卡里保留一位数字；普通系列则补零成 A01。
  if (PALETTE_BY_CODE.has(code)) return code;
  const match = /^([A-Z]+)(\d{1,2})$/.exec(code);
  if (!match) return null;
  const [, series, digits] = match;
  const twoDigit = `${series}${digits.padStart(2, '0')}`;
  if (PALETTE_BY_CODE.has(twoDigit)) return twoDigit;
  if (series === 'Z' && digits.length === 2 && digits.startsWith('0')) {
    const short = `Z${Number(digits)}`;
    if (PALETTE_BY_CODE.has(short)) return short;
  }
  return null;
}

export function parseCodeList(text: string): string[] {
  const seen = new Set<string>();
  text
    .split(/[\s,，;；、|]+/)
    .forEach((token) => {
      const code = normalizeCode(token);
      if (code) seen.add(code);
    });
  return Array.from(seen);
}

export function filterValidCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  codes.forEach((raw) => {
    const code = normalizeCode(raw);
    if (code) seen.add(code);
  });
  return Array.from(seen);
}

export function codesToAllowedArray(codes: Iterable<string>): Uint8Array {
  const allowed = new Uint8Array(PALETTE_SIZE);
  for (const code of codes) {
    const index = INDEX_BY_CODE.get(code);
    if (index !== undefined) allowed[index] = 1;
  }
  return allowed;
}

export function codesInPalette(codes: string[], palette: PaletteSnapshot): string[] {
  const set = new Set(palette.colors.map((color) => color.code));
  return codes.filter((code) => set.has(code));
}
