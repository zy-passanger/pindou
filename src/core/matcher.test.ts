import { describe, expect, it } from 'vitest';
import { codesToAllowedArray, DEFAULT_MY_PALETTE, MARD_COLORS } from './palette';
import { FaithfulMatcher } from './matcher';
import { PaletteMatcher } from './color';

const allowed = codesToAllowedArray(DEFAULT_MY_PALETTE);
const codeFor = (matcher: { nearest(rgb: { r: number; g: number; b: number }): number }, rgb: { r: number; g: number; b: number }) =>
  MARD_COLORS[matcher.nearest(rgb)].code;

describe('FaithfulMatcher 保色匹配', () => {
  it('深蓝围巾不会被标准最近色映成灰色', () => {
    const scarf = { r: 49, g: 63, b: 76 };
    expect(codeFor(new PaletteMatcher(MARD_COLORS, allowed), scarf)).toBe('H05');
    expect(['C12', 'C18']).toContain(codeFor(new FaithfulMatcher(MARD_COLORS, allowed), scarf));
  });

  it('金色光环保持金色系而非偏红橙', () => {
    const halo = { r: 222, g: 179, b: 124 };
    expect(codeFor(new FaithfulMatcher(MARD_COLORS, allowed), halo)).toMatch(/^G/);
  });

  it('低饱和白色不会被拆到明显彩色', () => {
    const hair = { r: 243, g: 243, b: 241 };
    const code = codeFor(new FaithfulMatcher(MARD_COLORS, allowed), hair);
    expect(['E16', 'H17', 'H22', 'H12', 'H09', 'H10']).toContain(code);
  });

  it('纯白仍匹配白色而不是近黑', () => {
    const code = codeFor(new FaithfulMatcher(MARD_COLORS, allowed), { r: 255, g: 255, b: 255 });
    expect(['H01', 'H02', 'H18', 'H17', 'H09']).toContain(code);
  });
});
