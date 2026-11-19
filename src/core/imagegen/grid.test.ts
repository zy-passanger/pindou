import { describe, expect, it } from 'vitest';
import { buildGridRepairPrompt, buildGridUserPrompt, extractGridJson, parseGridResponse } from './grid';

const expected = { width: 4, height: 3, maxColors: 4 };

function validGrid(overrides: Record<string, unknown> = {}) {
  return {
    width: 4,
    height: 3,
    palette: { a: '#FF0000', b: '#00FF00', c: '#0000FF' },
    rows: ['aabb', 'abcc', 'ccaa'],
    ...overrides,
  };
}

describe('grid parsing', () => {
  it('解析合法网格并规范化颜色大小写', () => {
    const result = parseGridResponse(JSON.stringify(validGrid({ palette: { a: '#ff0000', b: '#00ff00', c: '#0000ff' } })), expected);
    expect(result.ok).toBe(true);
    expect(result.grid?.rows).toEqual(['aabb', 'abcc', 'ccaa']);
    expect(result.grid?.palette.a).toBe('#FF0000');
  });

  it('支持 Markdown 代码块和前后解释文字', () => {
    const text = '这是结果：\n```json\n' + JSON.stringify(validGrid()) + '\n```\n完成';
    expect(extractGridJson(text)).toContain('"rows"');
    expect(parseGridResponse(text, expected).ok).toBe(true);
  });

  it('允许省略 width/height 但 rows 尺寸正确时自动视为通过', () => {
    const { width: _w, height: _h, ...rest } = validGrid();
    const result = parseGridResponse(JSON.stringify(rest), expected);
    expect(result.ok).toBe(true);
  });

  it('行数/行宽不对时给出具体错误', () => {
    const result = parseGridResponse(JSON.stringify(validGrid({ rows: ['aabb', 'abcc'] })), expected);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('rows 有 2 行');
  });

  it('行宽不对时指出具体行', () => {
    const result = parseGridResponse(JSON.stringify(validGrid({ rows: ['aabb', 'abc', 'ccaa'] })), expected);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('第 2 行有 3 格');
  });

  it('未定义字符、非法颜色和超色数都会被拒绝', () => {
    const unknownChar = parseGridResponse(JSON.stringify(validGrid({ rows: ['aabb', 'abxz', 'ccaa'] })), expected);
    expect(unknownChar.errors.join(' ')).toContain('未定义字符');
    const badHex = parseGridResponse(JSON.stringify(validGrid({ palette: { a: 'red', b: '#00FF00', c: '#0000FF' } })), expected);
    expect(badHex.errors.join(' ')).toContain('#RRGGBB');
    const tooMany = parseGridResponse(JSON.stringify(validGrid({
      palette: { a: '#FF0000', b: '#00FF00', c: '#0000FF', d: '#FFFFFF', e: '#000000' },
    })), expected);
    expect(tooMany.errors.join(' ')).toContain('最多 4 种');
  });

  it('修复提示词包含错误和原始输出', () => {
    const repair = buildGridRepairPrompt({
      original: '{"rows":[]}',
      errors: ['第 2 行有 3 格'],
      width: 4,
      height: 3,
      maxColors: 4,
    });
    expect(repair.user).toContain('第 2 行有 3 格');
    expect(repair.user).toContain('{"rows":[]}');
    expect(repair.user).toContain('4×3');
  });

  it('用户提示词包含严格尺寸和 JSON 结构', () => {
    const prompt = buildGridUserPrompt({ prompt: '小猫', style: '像素风', width: 4, height: 3, maxColors: 4, enhance: true });
    expect(prompt).toContain('严格 4×3');
    expect(prompt).toContain('"palette"');
    expect(prompt).toContain('粗深色轮廓');
  });
});
