import { describe, expect, it } from 'vitest';
import { buildOpenAIImagesRequest, parseOpenAIImagesResponse } from './openaiImages';

const request = {
  provider: 'openai-images' as const,
  baseUrl: 'https://api.openai.com/v1/',
  apiKey: 'sk-test-key',
  model: 'gpt-image-1',
  prompt: 'a cute cat',
};

describe('openaiImages', () => {
  it('构建 Images 请求：URL、Bearer 和 n/size', () => {
    const built = buildOpenAIImagesRequest(request);
    expect(built.url).toBe('https://api.openai.com/v1/images/generations');
    expect(built.headers.Authorization).toBe('Bearer sk-test-key');
    expect(built.body).toMatchObject({ model: 'gpt-image-1', prompt: 'a cute cat', n: 1, size: '1024x1024' });
  });

  it('允许直接填完整端点', () => {
    const built = buildOpenAIImagesRequest({ ...request, baseUrl: 'https://gateway.example.com/v1/images/generations' });
    expect(built.url).toBe('https://gateway.example.com/v1/images/generations');
  });

  it('解析 b64_json 与 url 两种返回', () => {
    const images = parseOpenAIImagesResponse({
      data: [
        { b64_json: 'AAAA', revised_prompt: 'revised' },
        { url: 'https://cdn.example.com/a.png' },
      ],
    }, 'openai-images');
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ kind: 'base64', value: 'AAAA', revisedPrompt: 'revised' });
    expect(images[1]).toMatchObject({ kind: 'url', value: 'https://cdn.example.com/a.png' });
  });

  it('错误响应与空 data 抛出可读错误', () => {
    expect(() => parseOpenAIImagesResponse({ error: { message: 'invalid key' } }, 'openai-images')).toThrow('invalid key');
    expect(() => parseOpenAIImagesResponse({ data: [] }, 'openai-images')).toThrow('没有返回可用图片');
    expect(() => parseOpenAIImagesResponse({}, 'openai-images')).toThrow('缺少 data');
  });
});
