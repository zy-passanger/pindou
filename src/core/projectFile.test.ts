import { describe, expect, it } from 'vitest';
import { EMPTY } from './constants';
import { createProject, type PaletteSnapshot } from './model';
import {
  base64ToUint16,
  encodeProjectFile,
  parseProjectFile,
  sanitizeFileName,
  uint16ToBase64,
} from './projectFile';

const palette: PaletteSnapshot = {
  id: 'test',
  version: '1',
  colors: [
    { code: 'A01', name: '红', hex: '#FF0000', series: 'A', common: true },
    { code: 'B01', name: '蓝', hex: '#0000FF', series: 'B', common: false },
  ],
};

describe('projectFile', () => {
  it('Uint16 数据 base64 往返保持一致', () => {
    const cells = new Uint16Array([0, 1, EMPTY, 65535, 42]);
    const decoded = base64ToUint16(uint16ToBase64(cells));
    expect(Array.from(decoded)).toEqual(Array.from(cells));
  });

  it('工程文件编码后可完整解析', () => {
    const cells = new Uint16Array(3 * 2).fill(EMPTY);
    cells[0] = 0;
    cells[4] = 1;
    const project = createProject({ name: '测试图纸', width: 3, height: 2, beadSizeMm: 2.6, palette, cells });
    const parsed = parseProjectFile(encodeProjectFile(project));
    expect(parsed.id).toBe(project.id);
    expect(parsed.name).toBe('测试图纸');
    expect(parsed.width).toBe(3);
    expect(parsed.height).toBe(2);
    expect(parsed.beadSizeMm).toBe(2.6);
    expect(Array.from(parsed.cells)).toEqual(Array.from(cells));
    expect(parsed.palette.colors).toHaveLength(2);
    expect(parsed.paletteRef).toEqual({ id: 'test', version: '1' });
  });

  it('拒绝非法 JSON 和错误格式', () => {
    expect(() => parseProjectFile('{')).toThrow('工程文件不是有效的 JSON');
    expect(() => parseProjectFile(JSON.stringify({ format: 'other' }))).toThrow('不支持的工程文件版本');
  });

  it('拒绝尺寸或数据长度不匹配的文件', () => {
    const project = createProject({ name: 'A', width: 2, height: 2, beadSizeMm: 2.6, palette });
    const data = JSON.parse(encodeProjectFile(project));
    data.project.width = 3;
    expect(() => parseProjectFile(JSON.stringify(data))).toThrow('图纸数据长度不匹配');
  });

  it('拒绝越界色号', () => {
    const project = createProject({ name: 'A', width: 2, height: 2, beadSizeMm: 2.6, palette });
    project.cells[0] = 9;
    expect(() => parseProjectFile(encodeProjectFile(project))).toThrow('图纸包含无效色号');
  });

  it('拒绝重复或非法色卡', () => {
    const project = createProject({ name: 'A', width: 2, height: 2, beadSizeMm: 2.6, palette });
    const data = JSON.parse(encodeProjectFile(project));
    data.palette.colors[1].code = 'A01';
    expect(() => parseProjectFile(JSON.stringify(data))).toThrow('色号重复或无效');
    data.palette.colors[1].code = 'B01';
    data.palette.colors[0].hex = 'red';
    expect(() => parseProjectFile(JSON.stringify(data))).toThrow('色值无效');
  });

  it('清理文件名中的非法字符', () => {
    expect(sanitizeFileName('我的/图纸:1?*')).toBe('我的_图纸_1__');
    expect(sanitizeFileName('   ')).toBe('未命名图纸');
    expect(sanitizeFileName('a'.repeat(100))).toHaveLength(80);
  });
});
