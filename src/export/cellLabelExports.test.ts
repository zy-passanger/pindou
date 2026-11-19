import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY } from '@/core/constants';
import { createProject, type PaletteSnapshot } from '@/core/model';
import { computePagination } from '@/core/pagination';
import { computeStats } from '@/core/stats';
import { drawBlueprint, drawBlueprintPreview, measureBlueprint, type PngOptions } from './patternRenderer';
import { drawPdfPreview, renderPatternPage, type PdfExportOptions } from './pdf';

const palette: PaletteSnapshot = {
  id: 'test', version: '1', colors: [
    { code: 'H07', name: '黑', hex: '#000000', series: 'H', common: true },
    { code: 'A25', name: '黄', hex: '#FFD87C', series: 'A', common: true },
  ],
};
const project = createProject({
  name: '标注测试', width: 4, height: 2, beadSizeMm: 2.6, palette,
  cells: new Uint16Array([0, EMPTY, 1, EMPTY, 1, 0, EMPTY, 1]),
});
const stats = computeStats(project.cells, palette);
const pngOptions: PngOptions = { scale: 24, codes: true, coords: false, legend: false, patternOnly: false };
const pdfOptions: PdfExportOptions = { mode: 'actual', overlap: 1, mirror: false, codes: true, legend: false, dpi: 200 };

function makeCanvas() {
  const calls: Array<{ text: string; x: number; y: number; font: string; color: string }> = [];
  const stack: Array<Record<string, unknown>> = [];
  const ctx = {
    font: '10px Arial', fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1,
    textAlign: 'left', textBaseline: 'top',
    save: vi.fn(() => stack.push({ font: ctx.font, fillStyle: ctx.fillStyle, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline })),
    restore: vi.fn(() => Object.assign(ctx, stack.pop())),
    scale: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), drawImage: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * Number.parseFloat(ctx.font.match(/[\d.]+(?=px)/)?.[0] ?? '10') * 0.55 })),
    fillText: vi.fn((text: string, x: number, y: number) => calls.push({ text, x, y, font: ctx.font, color: ctx.fillStyle })),
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls, ctx, labels: () => calls.filter((call) => palette.colors.some((color) => color.code === call.text)) };
}

afterEach(() => vi.unstubAllGlobals());

describe('PNG 格内色号', () => {
  it('每个非空色块在正确的格子中心标注一次', () => {
    const { canvas, labels } = makeCanvas();
    const layout = drawBlueprint(canvas, project, stats, pngOptions);
    expect(labels()).toHaveLength(stats.total);
    expect(labels()[0]).toMatchObject({ text: 'H07', x: layout.gridX + 12, y: layout.gridY + 12, color: '#FFFFFF' });
    expect(labels()[1]).toMatchObject({ text: 'A25', x: layout.gridX + 60, y: layout.gridY + 12, color: '#111111' });
  });

  it('选择低分辨率时保留色号并自动采用至少 16px 格子', () => {
    const { canvas, labels } = makeCanvas();
    expect(drawBlueprint(canvas, project, stats, { ...pngOptions, scale: 8 }).cell).toBe(16);
    expect(labels()).toHaveLength(stats.total);
  });

  it.each([{ codes: false, patternOnly: false }, { codes: true, patternOnly: true }])('关闭色号或仅图案不画格内文字 %j', (overrides) => {
    const { canvas, labels } = makeCanvas();
    drawBlueprint(canvas, project, stats, { ...pngOptions, ...overrides });
    expect(labels()).toHaveLength(0);
  });

  it('图例的色号、颜色名和下一行不互相叠压', () => {
    const { canvas, calls } = makeCanvas();
    const layout = drawBlueprint(canvas, project, stats, { ...pngOptions, scale: 32, legend: true });
    const legendCalls = calls.filter((call) => call.y > layout.gridY + layout.gridH);
    const codeCalls = legendCalls.filter((call) => call.text === 'H07' || call.text === 'A25');
    const nameCalls = legendCalls.filter((call) => call.text.includes('·') && call.text.includes('颗'));
    expect(codeCalls).toHaveLength(2);
    expect(nameCalls).toHaveLength(2);
    for (const code of codeCalls) {
      const name = nameCalls
        .filter((call) => Math.abs(call.x - code.x) < 1)
        .sort((a, b) => a.y - b.y)
        .find((call) => call.y > code.y);
      expect(name).toBeTruthy();
      expect(name!.y).toBeGreaterThan(code.y + 10);
    }
    const sortedCodes = [...codeCalls].sort((a, b) => a.y - b.y);
    if (sortedCodes.length > 1) {
      const firstNames = nameCalls
        .filter((call) => call.x === sortedCodes[0].x && call.y > sortedCodes[0].y)
        .sort((a, b) => a.y - b.y);
      const firstEnd = firstNames[0]?.y ?? sortedCodes[0].y;
      expect(sortedCodes[1].y).toBeGreaterThan(firstEnd + 2);
    }
    expect(layout.legendH).toBeGreaterThan(33 + 2 * 30);
  });

  it('图例末行与脚注保留独立空间', () => {
    const layout = measureBlueprint(project, stats, { ...pngOptions, legend: true });
    const rows = Math.ceil(stats.colorCount / layout.legendCols);
    expect(layout.legendH).toBeGreaterThan(32 + rows * layout.legendRowH + 14);
  });
});

describe('PDF 格内色号', () => {
  const pagination = computePagination(project.width, project.height, { mode: 'actual', cellMm: 2.6, overlap: 1, legendPage: false });

  it('使用与色块一致的全局坐标', () => {
    const { canvas, labels } = makeCanvas();
    const layout = renderPatternPage(canvas, project, stats, pagination.tiles[0], pagination, pdfOptions);
    expect(labels()).toHaveLength(stats.total);
    expect(labels()[0].x).toBeCloseTo(layout.gridX + layout.cell / 2);
    expect(labels()[0].y).toBeCloseTo(layout.gridY + layout.cell / 2);
  });

  it('镜像只改变色号位置，不反转文字', () => {
    const { canvas, labels } = makeCanvas();
    const layout = renderPatternPage(canvas, project, stats, pagination.tiles[0], pagination, { ...pdfOptions, mirror: true });
    expect(labels().map((label) => label.text)).toEqual(['A25', 'H07', 'A25', 'H07', 'A25']);
    expect(labels()[0].x).toBeCloseTo(layout.gridX + layout.cell * 1.5);
    expect(labels()[1].x).toBeCloseTo(layout.gridX + layout.cell * 3.5);
  });

  it('300 DPI 与 200 DPI 的实体字号相同', () => {
    const low = makeCanvas();
    const high = makeCanvas();
    renderPatternPage(low.canvas, project, stats, pagination.tiles[0], pagination, pdfOptions);
    renderPatternPage(high.canvas, project, stats, pagination.tiles[0], pagination, { ...pdfOptions, dpi: 300 });
    const size = (font: string) => Number.parseFloat(font.match(/[\d.]+(?=px)/)![0]);
    expect(size(high.labels()[0].font) / size(low.labels()[0].font)).toBeCloseTo(1.5);
  });

  it('极小格子不会静默丢弃已请求的色号', () => {
    const { canvas, labels } = makeCanvas();
    const tinyTile = { ...pagination.tiles[0], cellMm: 0.5 };
    renderPatternPage(canvas, project, stats, tinyTile, pagination, pdfOptions);
    expect(labels()).toHaveLength(stats.total);
  });

  it('关闭色号不输出格内文字', () => {
    const { canvas, labels } = makeCanvas();
    renderPatternPage(canvas, project, stats, pagination.tiles[0], pagination, { ...pdfOptions, codes: false });
    expect(labels()).toHaveLength(0);
  });
});

describe('导出面板局部放大预览', () => {
  it.each(['png', 'pdf'] as const)('%s 的色号选项实际影响预览', (format) => {
    vi.stubGlobal('document', { createElement: () => makeCanvas().canvas });
    const withCodes = makeCanvas();
    const withoutCodes = makeCanvas();
    if (format === 'png') {
      drawBlueprintPreview(withCodes.canvas, project, stats, pngOptions);
      drawBlueprintPreview(withoutCodes.canvas, project, stats, { ...pngOptions, codes: false });
    } else {
      drawPdfPreview(withCodes.canvas, project, stats, pdfOptions);
      drawPdfPreview(withoutCodes.canvas, project, stats, { ...pdfOptions, codes: false });
    }
    expect(withCodes.labels()).toHaveLength(stats.total);
    expect(withoutCodes.labels()).toHaveLength(0);
    expect(Array.from(project.cells)).toEqual([0, EMPTY, 1, EMPTY, 1, 0, EMPTY, 1]);
  });
});
