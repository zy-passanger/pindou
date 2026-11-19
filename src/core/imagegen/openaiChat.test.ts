import { describe, expect, it } from 'vitest';
import { buildOpenAIChatGridRequest, buildOpenAIChatImageRequest, parseOpenAIChatResponse } from './openaiChat';

const request = {
  provider: 'openai-chat' as const,
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-or-test',
  model: 'google/gemini-2.5-flash-image',
  prompt: 'pixel cat',
};

describe('openaiChat', () => {
  it('图片请求带 modalities，网格请求带 system/user', () => {
    const image = buildOpenAIChatImageRequest(request);
    expect(image.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(image.body.modalities).toEqual(['image', 'text']);
    const grid = buildOpenAIChatGridRequest(request, 'system', 'user');
    expect(grid.body.messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'user' },
    ]);
  });

  it('解析 message.images、content parts、Markdown 与纯 data URL，并去重', () => {
    const dataUrl = 'data:image/png;base64,AAAA';
    const parsed = parseOpenAIChatResponse({
      choices: [{
        message: {
          content: [
            { type: 'text', text: 'look ![x](data:image/png;base64,AAAA)' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
          images: [{ type: 'image_url', image_url: { url: 'https://cdn.example.com/b.png' } }],
        },
      }],
    });
    expect(parsed.images).toHaveLength(2);
    expect(parsed.images).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'base64', value: 'AAAA', mime: 'image/png' }),
      expect.objectContaining({ kind: 'url', value: 'https://cdn.example.com/b.png' }),
    ]));
    expect(parsed.text).toContain('look');
  });

  it('纯文本响应返回 text 和空图片', () => {
    const parsed = parseOpenAIChatResponse({
      choices: [{ message: { content: '{"width":2,"height":2}' } }],
    });
    expect(parsed.images).toEqual([]);
    expect(parsed.text).toContain('"width":2');
  });

  it('异常响应抛出可读错误', () => {
    expect(() => parseOpenAIChatResponse({ error: { message: 'bad model' } })).toThrow('bad model');
    expect(() => parseOpenAIChatResponse({ choices: [] })).toThrow('缺少 choices');
    expect(() => parseOpenAIChatResponse({ choices: [{}] })).toThrow('缺少 message');
  });
});
