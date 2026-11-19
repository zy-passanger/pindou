import { describe, expect, it } from 'vitest';
import type { BeadColor } from './model';
import { MARD_PALETTE } from './palette';
import { extractAutoPalette, type AutoPaletteSample } from './autoPalette';
import { hexToRgb, luminance } from './color';

const palette: BeadColor[] = [
  { code: 'INK', name: '墨黑', hex: '#111111', series: 'K', common: true },
  { code: 'WHITE', name: '白', hex: '#FFFFFF', series: 'W', common: true },
  { code: 'SKIN', name: '肤色', hex: '#E8B58C', series: 'S', common: true },
  { code: 'GOLD', name: '金', hex: '#D6A23F', series: 'G', common: true },
  { code: 'NAVY', name: '藏蓝', hex: '#25406E', series: 'N', common: true },
  { code: 'PINK', name: '粉', hex: '#F2A0B5', series: 'P', common: true },
  { code: 'GREEN', name: '绿', hex: '#3F7A4E', series: 'G', common: true },
  { code: 'GRAY', name: '灰', hex: '#808080', series: 'H', common: true },
];

const allowed = new Uint8Array(palette.length).fill(1);

function cellsOf(entries: Array<[string, number]>): AutoPaletteSample[] {
  const cells: AutoPaletteSample[] = [];
  entries.forEach(([hex, count]) => {
    const rgb = hexToRgb(hex);
    for (let i = 0; i < count; i += 1) cells.push({ rgb, empty: false });
  });
  return cells;
}

function codesOf(indices: number[], colors: BeadColor[] = palette): string[] {
  return indices.map((index) => colors[index].code).sort();
}

describe('extractAutoPalette', () => {
  it('每次按当前图片重新取色，换图得到不同色号组合', () => {
    const warm = extractAutoPalette(
      cellsOf([['#E8B58C', 120], ['#D6A23F', 36], ['#111111', 8], ['#FFFFFF', 5]]),
      palette,
      allowed,
      4,
    );
    const cool = extractAutoPalette(
      cellsOf([['#25406E', 120], ['#3F7A4E', 36], ['#111111', 8], ['#FFFFFF', 5]]),
      palette,
      allowed,
      4,
    );

    expect(codesOf(warm.indices)).toContain('SKIN');
    expect(codesOf(warm.indices)).toContain('GOLD');
    expect(codesOf(cool.indices)).toContain('NAVY');
    expect(codesOf(cool.indices)).toContain('GREEN');
    expect(codesOf(cool.indices)).not.toContain('SKIN');
    expect(codesOf(cool.indices)).not.toContain('GOLD');
    expect(codesOf(warm.indices)).not.toEqual(codesOf(cool.indices));
  });

  it('低频的深色眼睛与浅色高光不会被大面积主色挤掉', () => {
    const result = extractAutoPalette(
      cellsOf([['#E8B58C', 500], ['#D6A23F', 90], ['#111111', 3], ['#FFFFFF', 2]]),
      palette,
      allowed,
      4,
    );
    expect(codesOf(result.indices)).toContain('INK');
    expect(codesOf(result.indices)).toContain('WHITE');
    expect(result.indices).toHaveLength(4);
    expect(new Set(result.indices).size).toBe(4);
  });

  it('低频粉色点缀会被单独保留', () => {
    const result = extractAutoPalette(
      cellsOf([['#E8B58C', 400], ['#25406E', 80], ['#111111', 10], ['#F2A0B5', 8]]),
      palette,
      allowed,
      4,
    );
    expect(codesOf(result.indices)).toContain('PINK');
  });

  it('色号数量受 K、色卡数量和允许范围限制', () => {
    const cells = cellsOf([['#E8B58C', 20], ['#25406E', 20], ['#3F7A4E', 20], ['#111111', 20]]);
    expect(extractAutoPalette(cells, palette, allowed, 2).indices).toHaveLength(2);
    expect(extractAutoPalette(cells, palette, allowed, 99).indices.length).toBeLessThanOrEqual(palette.length);
    const onlyGreen = new Uint8Array(palette.length);
    onlyGreen[6] = 1;
    expect(extractAutoPalette(cells, palette, onlyGreen, 4).indices).toEqual([6]);
  });

  it('相同输入产生相同配色（确定性）', () => {
    const cells = cellsOf([['#E8B58C', 77], ['#D6A23F', 31], ['#25406E', 19], ['#F2A0B5', 7], ['#111111', 3]]);
    const first = extractAutoPalette(cells, palette, allowed, 5);
    const second = extractAutoPalette(cells, palette, allowed, 5);
    expect(first.indices).toEqual(second.indices);
    expect(first.indices).toHaveLength(5);
  });

  it('空图、K=0 和安全输入返回空结果', () => {
    const empty: AutoPaletteSample[] = [{ rgb: { r: 0, g: 0, b: 0 }, empty: true }];
    expect(extractAutoPalette(empty, palette, allowed, 8).indices).toEqual([]);
    expect(extractAutoPalette([], palette, allowed, 8).indices).toEqual([]);
    expect(extractAutoPalette(cellsOf([['#E8B58C', 4]]), palette, allowed, 0).indices).toEqual([]);
  });

  it('MARD 色卡：人像关键色系（深色、浅色、蓝、金）都能入选', () => {
    const mard = MARD_PALETTE.colors;
    const allowAll = new Uint8Array(mard.length).fill(1);
    const result = extractAutoPalette(
      cellsOf([
        ['#F7F7F2', 180],
        ['#EDC3A0', 260],
        ['#8A5A3C', 90],
        ['#243A63', 70],
        ['#D6A23F', 18],
        ['#1A1A1A', 9],
        ['#F0A6B8', 8],
      ]),
      mard,
      allowAll,
      7,
    );
    const selected = result.indices.map((index) => {
      const rgb = hexToRgb(mard[index].hex);
      return { hex: mard[index].hex, ...rgb, lum: luminance(mard[index].hex) };
    });
    expect(selected.some((color) => color.lum < 60)).toBe(true);
    expect(selected.some((color) => color.lum > 235)).toBe(true);
    expect(selected.some((color) => color.b > color.r + 18)).toBe(true);
    expect(selected.some((color) => color.r > color.b + 45 && color.g > color.b + 10)).toBe(true);
    expect(selected).toHaveLength(7);
  });
});
