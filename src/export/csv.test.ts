import { describe, expect, it } from 'vitest';
import { buildUsageCsv } from './csv';
import type { Project, PaletteSnapshot } from '@/core/model';
import { computeStats } from '@/core/stats';

const palette: PaletteSnapshot = {
  id: 'test',
  version: '1',
  colors: [
    { code: 'A01', name: '红,色"亮', hex: '#FF0000', series: 'A', common: true },
    { code: 'B02', name: '蓝', hex: '#0000FF', series: 'B', common: true },
  ],
};

function projectWith(cells: Uint16Array): Project {
  return {
    schemaVersion: 1,
    id: 'p1',
    name: '测试',
    width: 2,
    height: 1,
    beadSizeMm: 2.6,
    boardW: 52,
    boardH: 52,
    paletteRef: { id: 'test', version: '1' },
    palette,
    cells,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('buildUsageCsv', () => {
  it('输出 BOM、CRLF、表头与按用量排序的行', () => {
    const project = projectWith(new Uint16Array([0, 0, 1]));
    const csv = buildUsageCsv(project, computeStats(project.cells, palette));
    expect(csv.startsWith('\uFEFF色号,颜色名,HEX,颗数,占比\r\n')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toContain('A01');
    expect(lines[1]).toContain('66.7%');
    expect(lines[2]).toContain('B02');
    expect(lines[2]).toContain('33.3%');
  });

  it('转义包含逗号和引号的颜色名', () => {
    const project = projectWith(new Uint16Array([0]));
    const csv = buildUsageCsv(project, computeStats(project.cells, palette));
    expect(csv).toContain('"红,色""亮"');
  });

  it('空图纸只有表头', () => {
    const project = projectWith(new Uint16Array([0xffff]));
    const csv = buildUsageCsv(project, computeStats(project.cells, palette));
    expect(csv).toBe('\uFEFF色号,颜色名,HEX,颗数,占比');
  });
});
