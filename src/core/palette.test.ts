import { describe, expect, it } from 'vitest';
import {
  ALL_CODES,
  codesToAllowedArray,
  DEFAULT_MY_PALETTE,
  INDEX_BY_CODE,
  MARD_COLORS,
  MARD_PALETTE,
  normalizeCode,
  parseCodeList,
} from './palette';

describe('MARD 色卡', () => {
  it('内置 291 色，其中 221 个常用色', () => {
    expect(MARD_COLORS).toHaveLength(291);
    expect(MARD_COLORS.filter((color) => color.common)).toHaveLength(221);
    expect(DEFAULT_MY_PALETTE).toHaveLength(221);
    expect(MARD_PALETTE.id).toBe('mard');
    expect(new Set(ALL_CODES).size).toBe(291);
  });

  it('色号编码唯一且均有合法 HEX', () => {
    expect(new Set(MARD_COLORS.map((color) => color.code)).size).toBe(291);
    for (const color of MARD_COLORS) {
      expect(color.code).toMatch(/^[A-Z]+\d{1,2}$/);
      expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('normalizeCode 补零并拒绝未知色号', () => {
    expect(normalizeCode('a1')).toBe('A01');
    expect(normalizeCode(' f04 ')).toBe('F04');
    expect(normalizeCode('Z99')).toBeNull();
    expect(normalizeCode('Z1')).toBe('Z1');
    expect(normalizeCode('Z01')).toBe('Z1');
    expect(normalizeCode('')).toBeNull();
  });

  it('parseCodeList 支持多种分隔符并去重', () => {
    const codes = parseCodeList('A1, B02，F04; a1\nC3、B02');
    expect(codes).toEqual(['A01', 'B02', 'F04', 'C03']);
  });

  it('codesToAllowedArray 只标记已知色号', () => {
    const allowed = codesToAllowedArray(['A01', 'F04', 'Z99']);
    expect(allowed).toHaveLength(291);
    expect(allowed.reduce((sum, value) => sum + value, 0)).toBe(2);
    expect(allowed[INDEX_BY_CODE.get('A01')!]).toBe(1);
    expect(allowed[INDEX_BY_CODE.get('F04')!]).toBe(1);
  });
});
