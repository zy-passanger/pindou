import { describe, expect, it } from 'vitest';
import { buildGeminiGridRequest, buildGeminiImageRequest, parseGeminiResponse } from './gemini';

const request = {
  provider: 'gemini' as const,
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  apiKey: 'AIza-test-key',
  model: 'gemini-2.5-flash-image',
  prompt: 'pixel cat',
};

describe('gemini', () => {
  it('图片请求使用 x-goog-api-key，不把 key 放 URL', () => {
    const built = buildGeminiImageRequest(request);
    expect(built.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent');
    expect(built.url).not.toContain('key=');
    expect(built.headers['x-goog-api-key']).toBe('AIza-test-key');
    expect(built.body.generationConfig).toEqual({ responseModalities: ['TEXT', 'IMAGE'] });
  });

  it('网格请求使用 application/json', () => {
    const built = buildGeminiGridRequest(request, 'system', 'user');
    expect(built.body.generationConfig).toMatchObject({ responseMimeType: 'application/json' });
    expect(built.body.systemInstruction).toEqual({ parts: [{ text: 'system' }] });
  });

  it('解析 inlineData 图片与文本', () => {
    const parsed = parseGeminiResponse({
      candidates: [{
        content: {
          parts: [
            { text: 'here is your image' },
            { inlineData: { mimeType: 'image/png', data: 'AAAA' } },
          ],
        },
      }],
    });
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0]).toMatchObject({ kind: 'base64', value: 'AAAA', mime: 'image/png' });
    expect(parsed.text).toBe('here is your image');
  });

  it('兼容 Imagen predictions 和错误响应', () => {
    const parsed = parseGeminiResponse({ predictions: [{ bytesBase64Encoded: 'BBBB', mimeType: 'image/jpeg' }] });
    expect(parsed.images[0]).toMatchObject({ kind: 'base64', value: 'BBBB', mime: 'image/jpeg' });
    expect(() => parseGeminiResponse({ error: { message: 'quota' } })).toThrow('quota');
  });
});
