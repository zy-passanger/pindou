import { describe, expect, it, vi } from 'vitest';
import { EMPTY } from '@/core/constants';
import type { PaletteSnapshot, Project } from '@/core/model';
import { codeTextColor, drawCellLabels, MIN_EDITOR_CODE_CELL, READABLE_CODE_CELL } from './cellLabels';

const palette: PaletteSnapshot = {
  id: 'test',
  version: '1',
  colors: [
    { code: 'A01', name: '黑', hex: '#000000', series: 'A', common: true },
    { code: 'B02', name: '白', hex: '#FFFFFF', series: 'B', common: true },
    { code: 'C03', name: '黄', hex: '#FFD87C', series: 'C', common: true },
    { code: 'D04', name: '深青', hex: '#113D47', series: 'D', common: true },
  ],
};

type TextState = Pick<CanvasRenderingContext2D, 'font' | 'fillStyle' | 'textAlign' | 'textBaseline'>;

function fontSize(font: string): number {
  return Number.parseFloat(font.match(/[\d.]+px/)![0]);
}

function mockContext() {
  const calls: (TextState & { text: string; x: number; y: number })[] = [];
  const saved: TextState[] = [];
  const ctx: TextState & Pick<CanvasRenderingContext2D, 'save' | 'restore' | 'measureText' | 'fillText'> = {
    font: '13px serif',
    fillStyle: '#123456',
    textAlign: 'left',
    textBaseline: 'top',
    save: vi.fn(() => { saved.push(getState()); }),
    restore: vi.fn(() => { Object.assign(ctx, saved.pop()); }),
    measureText: vi.fn((text: string) => ({ width: text.length * fontSize(ctx.font) * 0.5 }) as TextMetrics),
    fillText: vi.fn((text: string, x: number, y: number) => { calls.push({ text, x, y, ...getState() }); }),
  };
  function getState(): TextState {
    return { font: ctx.font, fillStyle: ctx.fillStyle, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline };
  }
  return { ctx: ctx as CanvasRenderingContext2D, calls, getState };
}

function projectFrom(rows: number[][], snapshot: PaletteSnapshot = palette): Pick<Project, 'width' | 'height' | 'cells' | 'palette'> {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    cells: new Uint16Array(rows.flat()),
    palette: snapshot,
  };
}

describe('codeTextColor', () => {
  it.each([
    ['#000000', '#FFFFFF'],
    ['#FFFFFF', '#111111'],
    ['#FFD87C', '#111111'],
    ['#113D47', '#FFFFFF'],
    ['#FF0000', '#111111'],
    ['#777777', '#FFFFFF'],
    ['#808080', '#111111'],
  ])('%s 使用 WCAG 对比度更高的文字颜色 %s', (hex, expected) => {
    expect(codeTextColor(hex)).toBe(expected);
  });
});

describe('drawCellLabels', () => {
  it('导出编辑器可见与清晰字号阈值', () => {
    expect(MIN_EDITOR_CODE_CELL).toBe(14);
    expect(READABLE_CODE_CELL).toBe(22);
  });

  it('每个有效占用格只绘制一次，保留完整色号、前导零与对比色', () => {
    const { ctx, calls } = mockContext();
    const project = projectFrom([[0, EMPTY, 1], [2, 99, 3]]);
    expect(drawCellLabels(ctx, project, { cell: 20, originX: 5, originY: -3 })).toBe(4);
    expect(calls.map(({ text, x, y, fillStyle }) => [text, x, y, fillStyle])).toEqual([
      ['A01', 15, 7, '#FFFFFF'],
      ['B02', 55, 7, '#111111'],
      ['C03', 15, 27, '#111111'],
      ['D04', 55, 27, '#FFFFFF'],
    ]);
    for (const call of calls) {
      expect(call.font).toBe('600 8.8px Arial, sans-serif');
      expect(call.textAlign).toBe('center');
      expect(call.textBaseline).toBe('middle');
    }
  });

  it('跳过空格、越界索引、缺失色卡项及缺失格子', () => {
    const { ctx, calls } = mockContext();
    const snapshot = { ...palette, colors: [...palette.colors] };
    delete snapshot.colors[1];
    const project = {
      width: 6,
      height: 1,
      cells: new Uint16Array([EMPTY, 99, palette.colors.length, 1, 0]),
      palette: snapshot,
    };
    expect(drawCellLabels(ctx, project, { cell: 10, originX: 0, originY: 0 })).toBe(1);
    expect(calls.map(({ text, x, y }) => [text, x, y])).toEqual([['A01', 45, 5]]);
    expect(ctx.measureText).toHaveBeenCalledTimes(1);
  });

  it('空图纸不绘制或测量文字', () => {
    const { ctx, calls } = mockContext();
    expect(drawCellLabels(ctx, projectFrom([[EMPTY, EMPTY]]), { cell: 20, originX: 0, originY: 0 })).toBe(0);
    expect(calls).toEqual([]);
    expect(ctx.measureText).not.toHaveBeenCalled();
  });

  it('行列边界包含两端，偏移始终以全局零格为原点', () => {
    const { ctx, calls } = mockContext();
    const project = projectFrom([[0, 1, 2, 3], [3, 2, 1, 0], [0, 2, 3, 1]]);
    expect(drawCellLabels(ctx, project, {
      cell: 10, originX: -12, originY: 7,
      startCol: 1, endCol: 2, startRow: 1, endRow: 2,
    })).toBe(4);
    expect(calls.map(({ text, x, y }) => [text, x, y])).toEqual([
      ['C03', 3, 22], ['B02', 13, 22], ['C03', 3, 32], ['D04', 13, 32],
    ]);
  });

  it('把越界的绘制范围夹取到图纸内', () => {
    const { ctx, calls } = mockContext();
    expect(drawCellLabels(ctx, projectFrom([[0, 1], [2, 3]]), {
      cell: 10, originX: 0, originY: 0,
      startCol: -10, endCol: 10, startRow: -10, endRow: 10,
    })).toBe(4);
    expect(calls.map(({ text, x, y }) => [text, x, y])).toEqual([
      ['A01', 5, 5], ['B02', 15, 5], ['C03', 5, 15], ['D04', 15, 15],
    ]);
  });

  it.each([
    { startCol: 2, endCol: 1 },
    { startRow: 2, endRow: 1 },
    { startCol: 5 },
    { endCol: -1 },
    { startRow: 5 },
    { endRow: -1 },
  ])('空范围或范围完全越界时不绘制：%j', (bounds) => {
    const { ctx, calls } = mockContext();
    expect(drawCellLabels(ctx, projectFrom([[0, 1], [2, 3]]), {
      cell: 10, originX: 0, originY: 0, ...bounds,
    })).toBe(0);
    expect(calls).toEqual([]);
    expect(ctx.measureText).not.toHaveBeenCalled();
  });

  it('镜像只反转格子位置，色号文字本身不反转', () => {
    const { ctx, calls } = mockContext();
    const project = projectFrom([[0, EMPTY, 1, 2], [3, 0, EMPTY, 1]]);
    // The mock has no transform methods: mirroring must only change the source index.
    expect(drawCellLabels(ctx, project, { cell: 12, originX: 30, originY: -6, mirror: true })).toBe(6);
    expect(calls.map(({ text, x, y }) => [text, x, y])).toEqual([
      ['C03', 36, 0], ['B02', 48, 0], ['A01', 72, 0],
      ['B02', 36, 12], ['A01', 60, 12], ['D04', 72, 12],
    ]);
  });

  it('镜像裁剪使用整幅图纸宽度而不是裁剪区域宽度', () => {
    const { ctx, calls } = mockContext();
    expect(drawCellLabels(ctx, projectFrom([[0, 1, 2, 3]]), {
      cell: 20, originX: 100, originY: 200, startCol: 2, endCol: 3, mirror: true,
    })).toBe(2);
    expect(calls.map(({ text, x, y }) => [text, x, y])).toEqual([
      ['B02', 150, 210], ['A01', 170, 210],
    ]);
  });

  it('长色号按测量宽度缩至格宽的 80%，每个使用的色卡项只测量一次', () => {
    const { ctx, calls } = mockContext();
    const longCode = 'LONG-000007';
    const snapshot = { ...palette, colors: [{ ...palette.colors[0], code: longCode }, palette.colors[1], palette.colors[2]] };
    expect(drawCellLabels(ctx, projectFrom([[0, 1, 0, 1, 0]], snapshot), { cell: 30, originX: 0, originY: 0 })).toBe(5);
    expect(ctx.measureText).toHaveBeenCalledTimes(2);
    expect(ctx.measureText).toHaveBeenNthCalledWith(1, longCode);
    expect(ctx.measureText).toHaveBeenNthCalledWith(2, 'B02');
    for (const call of calls) {
      const size = fontSize(call.font);
      if (call.text === longCode) {
        expect(size).toBeLessThan(30 * 0.44);
        expect(size * longCode.length * 0.5).toBeCloseTo(30 * 0.8, 10);
      } else {
        expect(call.text).toBe('B02');
        expect(size).toBeCloseTo(30 * 0.44, 10);
      }
    }
  });

  it('即使色号相同，不同色卡项也使用各自的缓存样式', () => {
    const { ctx, calls } = mockContext();
    const snapshot = { ...palette, colors: [palette.colors[0], { ...palette.colors[1], code: 'A01' }] };
    expect(drawCellLabels(ctx, projectFrom([[0, 1, 0, 1]], snapshot), { cell: 20, originX: 0, originY: 0 })).toBe(4);
    expect(ctx.measureText).toHaveBeenCalledTimes(2);
    expect(calls.map(({ fillStyle }) => fillStyle)).toEqual(['#FFFFFF', '#111111', '#FFFFFF', '#111111']);
  });

  it.each([1, 4, MIN_EDITOR_CODE_CELL - 1])('格宽 %s 低于编辑器阈值时仍然绘制，交由调用方决定可见性', (cell) => {
    const { ctx, calls } = mockContext();
    expect(drawCellLabels(ctx, projectFrom([[0]]), { cell, originX: 0, originY: 0 })).toBe(1);
    expect(fontSize(calls[0].font)).toBeCloseTo(cell * 0.44, 10);
  });

  it.each(['A01', 'LONG-000007'])('色号 %s 的字号在 300 DPI 下是 200 DPI 的 1.5 倍，且缓存不跨调用', (code) => {
    const { ctx, calls } = mockContext();
    const snapshot = { ...palette, colors: [{ ...palette.colors[0], code }] };
    const project = projectFrom([[0]], snapshot);
    drawCellLabels(ctx, project, { cell: 5 * 200 / 25.4, originX: 0, originY: 0 });
    drawCellLabels(ctx, project, { cell: 5 * 300 / 25.4, originX: 0, originY: 0 });
    expect(calls).toHaveLength(2);
    expect(fontSize(calls[1].font) / fontSize(calls[0].font)).toBeCloseTo(1.5, 10);
    expect(ctx.measureText).toHaveBeenCalledTimes(2);
  });

  it('不修改项目或参数，并保存与恢复画笔状态', () => {
    const { ctx, getState } = mockContext();
    const project = projectFrom([[0, 1], [EMPTY, 2]], structuredClone(palette));
    const before = structuredClone(project);
    const initialState = getState();
    for (const color of project.palette.colors) Object.freeze(color);
    Object.freeze(project.palette.colors);
    Object.freeze(project.palette);
    Object.freeze(project);
    const options = Object.freeze({ cell: 16, originX: 15, originY: -3, mirror: true });
    expect(drawCellLabels(ctx, project, options)).toBe(3);
    expect(project).toEqual(before);
    expect(getState()).toEqual(initialState);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });

  it('绘制抛错时仍恢复画笔状态', () => {
    const { ctx, getState } = mockContext();
    const initialState = getState();
    vi.mocked(ctx.fillText).mockImplementationOnce(() => { throw new Error('render failed'); });
    expect(() => drawCellLabels(ctx, projectFrom([[0]]), { cell: 20, originX: 0, originY: 0 })).toThrow('render failed');
    expect(getState()).toEqual(initialState);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
});
