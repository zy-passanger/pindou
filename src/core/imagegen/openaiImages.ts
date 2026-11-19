import type { GeneratedImage, ImageGenRequest } from './types';
import { joinApiUrl, readApiError } from './http';

export interface OpenAIImagesRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export function buildOpenAIImagesRequest(req: ImageGenRequest): OpenAIImagesRequest {
  return {
    url: joinApiUrl(req.baseUrl, '/images/generations'),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: {
      model: req.model,
      prompt: req.prompt,
      n: 1,
      size: '1024x1024',
    },
  };
}

export function parseOpenAIImagesResponse(value: unknown, provider: 'openai-images'): GeneratedImage[] {
  const apiError = readApiError(value);
  if (apiError) throw new Error(apiError);
  if (!value || typeof value !== 'object') throw new Error('图片接口返回格式不正确');
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) throw new Error('图片接口响应缺少 data');
  const images: GeneratedImage[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const revisedPrompt = typeof record.revised_prompt === 'string' ? record.revised_prompt : undefined;
    if (typeof record.b64_json === 'string' && record.b64_json.trim()) {
      images.push({
        kind: 'base64',
        value: record.b64_json.trim(),
        mime: 'image/png',
        revisedPrompt,
        provider,
      });
      continue;
    }
    if (typeof record.url === 'string' && /^https?:\/\//i.test(record.url)) {
      images.push({
        kind: 'url',
        value: record.url,
        revisedPrompt,
        provider,
      });
    }
  }
  if (!images.length) throw new Error('图片接口没有返回可用图片');
  return images;
}
