import type { GridData, GridParseResult } from './types';

export const GRID_MAX_DIMENSION = 52;

export function buildGridSystemPrompt(): string {
  return '你是拼豆像素画设计师。只输出一个 JSON 对象，不要 Markdown 代码块，不要解释，不要输出 JSON 之外的任何文字。';
}

export function buildGridUserPrompt(options: {
  prompt: string;
  style: string;
  width: number;
  height: number;
  maxColors: number;
  enhance: boolean;
}): string {
  const constraints = options.enhance
    ? '\n画面要求：粗深色轮廓、清晰的眼睛和五官、纯色块、无渐变、无抗锯齿、无半透明；主体居中，背景使用单一浅色或简洁纯色；减少零碎噪点，适合拼豆。'
    : '';
  return `主题：${options.prompt}
风格：${options.style}
尺寸：严格 ${options.width}×${options.height} 格，颜色最多 ${options.maxColors} 种。${constraints}

只输出以下 JSON 结构：
{"width":${options.width},"height":${options.height},"palette":{"a":"#RRGGBB","b":"#RRGGBB"},"rows":["每行 ${options.width} 个字符","共 ${options.height} 行"]}
规则：
- palette 的键必须是没有重复的单字符（a-z、A-Z 或 0-9），值必须是 6 位十六进制颜色（#RRGGBB）。
- rows 必须正好 ${options.height} 行，每行正好 ${options.width} 个字符。
- rows 中每个字符都必须出现在 palette 中，不能有空格或换行符。
- palette 最多 ${options.maxColors} 个颜色，按画面需要选择，不要求用满。`;
}

export function buildGridRepairPrompt(options: {
  original: string;
  errors: string[];
  width: number;
  height: number;
  maxColors: number;
}): { system: string; user: string } {
  const original = options.original.length > 14000 ? `${options.original.slice(0, 14000)}\n…（已截断）` : options.original;
  return {
    system: buildGridSystemPrompt(),
    user: `你上一次输出的拼豆网格 JSON 没有通过校验。请修正后只输出完整 JSON，不要解释。

校验错误：
${options.errors.slice(0, 8).map((error, index) => `${index + 1}. ${error}`).join('\n')}

要求：
- 尺寸严格 ${options.width}×${options.height}；rows 正好 ${options.height} 行，每行正好 ${options.width} 个字符。
- palette 键为不重复单字符，值为 #RRGGBB；rows 只能使用 palette 中的字符。
- 颜色最多 ${options.maxColors} 种。
- 必须输出完整网格，不能省略行或用“...”代替。

上一次输出：
${original}`,
  };
}

export function extractGridJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return body.slice(start, end + 1);
}

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim());
}

/**
 * 严格校验 LLM 返回的网格。错误信息尽量具体，方便用户让模型修正。
 */
export function parseGridResponse(
  text: string,
  expected: { width: number; height: number; maxColors: number },
): GridParseResult {
  const errors: string[] = [];
  const jsonText = extractGridJson(text);
  if (!jsonText) return { ok: false, errors: ['没有找到 JSON 对象'] };
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ok: false, errors: ['JSON 解析失败，可能缺括号、引号或逗号'] };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['JSON 顶层必须是对象'] };
  const input = raw as Record<string, unknown>;
  const width = Number(input.width);
  const height = Number(input.height);

  if (!Array.isArray(input.rows)) {
    return { ok: false, errors: ['缺少 rows 数组'] };
  }
  const rawRows = input.rows;
  if (input.rows.length !== expected.height) {
    errors.push(`rows 有 ${input.rows.length} 行，要求 ${expected.height} 行`);
  }
  const rows: string[] = [];
  rawRows.forEach((row, index) => {
    let line: string;
    if (typeof row === 'string') line = row.trim();
    else if (Array.isArray(row)) line = row.map((part) => String(part)).join('').trim();
    else {
      errors.push(`第 ${index + 1} 行不是字符串`);
      line = '';
    }
    if (line.length !== expected.width) {
      errors.push(`第 ${index + 1} 行有 ${line.length} 格，要求 ${expected.width} 格`);
    }
    rows.push(line);
  });

  if (Number.isFinite(width) && width !== expected.width) {
    errors.push(`width 为 ${width}，要求 ${expected.width}`);
  }
  if (Number.isFinite(height) && height !== expected.height) {
    errors.push(`height 为 ${height}，要求 ${expected.height}`);
  }

  if (!input.palette || typeof input.palette !== 'object' || Array.isArray(input.palette)) {
    return { ok: false, errors: [...errors, '缺少 palette 对象'].slice(0, 8) };
  }
  const paletteRaw = input.palette as Record<string, unknown>;
  const palette: Record<string, string> = {};
  const entries = Object.entries(paletteRaw);
  if (entries.length > expected.maxColors) {
    errors.push(`palette 有 ${entries.length} 种颜色，要求最多 ${expected.maxColors} 种`);
  }
  for (const [key, value] of entries) {
    if (key.length !== 1 || !/[a-z0-9]/i.test(key)) {
      errors.push(`palette 键「${key}」必须是单个字母或数字`);
      continue;
    }
    if (!isHex(value)) {
      errors.push(`palette 颜色 ${key}=${String(value)} 不是 #RRGGBB`);
      continue;
    }
    palette[key] = value.trim().toUpperCase();
  }

  const allowed = new Set(Object.keys(palette));
  for (let index = 0; index < rows.length && errors.length < 8; index += 1) {
    const line = rows[index];
    for (const char of line) {
      if (!allowed.has(char)) {
        errors.push(`第 ${index + 1} 行出现未定义字符「${char}」`);
        break;
      }
    }
  }

  if (errors.length) return { ok: false, errors: errors.slice(0, 8) };
  if (!Object.keys(palette).length) return { ok: false, errors: ['palette 为空'] };

  return {
    ok: true,
    errors: [],
    grid: {
      width: expected.width,
      height: expected.height,
      palette,
      rows: rows.slice(0, expected.height),
    },
  };
}

export function gridPaletteEntries(grid: GridData): Array<{ key: string; hex: string }> {
  return Object.entries(grid.palette).map(([key, hex]) => ({ key, hex }));
}
