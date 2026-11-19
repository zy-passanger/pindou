import { describe, expect, it, vi } from 'vitest';
import { generateGridText, generateImage, ImageGenError, safeErrorMessage } from './client';

const request = {
  provider: 'openai-images' as const,
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test-key',
  model: 'gpt-image-1',
  prompt: 'a cat',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('imagegen client', () => {
  it('发送 POST、CORS、Bearer 并解析 b64 图片', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return response({ data: [{ b64_json: 'AAAA' }] });
    }) as unknown as typeof fetch;
    const result = await generateImage(request, { fetchImpl });
    expect(result.images[0]).toMatchObject({ kind: 'base64', value: 'AAAA' });
    expect(calls[0].url).toBe('https://api.openai.com/v1/images/generations');
    expect(calls[0].init.mode).toBe('cors');
    expect(calls[0].init.credentials).toBe('omit');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test-key');
  });

  it('401 返回鉴权提示，不泄露响应体里的密钥', async () => {
    const fetchImpl = vi.fn(async () => response({ error: { message: 'invalid key sk-secret-value' } }, 401)) as unknown as typeof fetch;
    await expect(generateImage(request, { fetchImpl })).rejects.toMatchObject({ code: 'http', status: 401 });
    try {
      await generateImage(request, { fetchImpl });
    } catch (error) {
      const message = safeErrorMessage(error, request.apiKey);
      expect(message).toContain('鉴权失败');
      expect(message).not.toContain('sk-secret-value');
    }
  });

  it('网络/CORS 失败给出直连提示', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(generateImage(request, { fetchImpl })).rejects.toMatchObject({ code: 'network' });
    try {
      await generateImage(request, { fetchImpl });
    } catch (error) {
      expect(safeErrorMessage(error)).toContain('CORS');
    }
  });

  it('Chat 网格返回文本；OpenAI Images 网格直接拒绝', async () => {
    const fetchImpl = vi.fn(async () => response({
      choices: [{ message: { content: '{"width":2,"height":2,"palette":{"a":"#000000"},"rows":["aa","aa"]}' } }],
    })) as unknown as typeof fetch;
    const text = await generateGridText({
      provider: 'openai-chat',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'key',
      model: 'gpt-4o',
      prompt: 'cat',
      width: 2,
      height: 2,
      maxColors: 4,
    }, 'system', 'user', { fetchImpl });
    expect(text).toContain('"width":2');
    await expect(generateGridText({
      provider: 'openai-images',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'key',
      model: 'gpt-image-1',
      prompt: 'cat',
      width: 2,
      height: 2,
      maxColors: 4,
    }, 'system', 'user', { fetchImpl })).rejects.toBeInstanceOf(ImageGenError);
  });
});
