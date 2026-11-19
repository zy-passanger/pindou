import type { GeneratedImage, ImageGenRequest } from './types';
import { joinApiUrl, readApiError } from './http';

export interface OpenAIChatRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function baseRequest(req: ImageGenRequest, extra: Record<string, unknown>): OpenAIChatRequest {
  return {
    url: joinApiUrl(req.baseUrl, '/chat/completions'),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: {
      model: req.model,
      messages: [{ role: 'user', content: req.prompt }],
      ...extra,
    },
  };
}

export function buildOpenAIChatImageRequest(req: ImageGenRequest): OpenAIChatRequest {
  return baseRequest(req, { modalities: ['image', 'text'] });
}

export function buildOpenAIChatGridRequest(req: ImageGenRequest, system: string, user: string): OpenAIChatRequest {
  return {
    url: joinApiUrl(req.baseUrl, '/chat/completions'),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: {
      model: req.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  };
}

function splitDataUrl(value: string): { mime: string; base64: string } | null {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i.exec(value.trim());
  if (!match) return null;
  const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  return { mime, base64: match[2] };
}

function imageFromUrlLike(value: unknown): GeneratedImage | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const dataUrl = splitDataUrl(text);
  if (dataUrl) {
    return { kind: 'base64', value: dataUrl.base64, mime: dataUrl.mime, provider: 'openai-chat' };
  }
  if (/^https?:\/\//i.test(text)) {
    return { kind: 'url', value: text, provider: 'openai-chat' };
  }
  return null;
}

function collectPart(part: unknown, images: GeneratedImage[]): string {
  if (typeof part === 'string') {
    collectMarkdownImages(part, images);
    return part;
  }
  if (!part || typeof part !== 'object') return '';
  const record = part as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : '';
  if (type === 'text' && typeof record.text === 'string') {
    collectMarkdownImages(record.text, images);
    return record.text;
  }
  const imageUrl = record.image_url ?? record.imageUrl ?? record.url;
  const nested = imageUrl && typeof imageUrl === 'object' ? (imageUrl as Record<string, unknown>).url : imageUrl;
  const image = imageFromUrlLike(nested);
  if (image) images.push(image);
  if (type === 'image' && record.source && typeof record.source === 'object') {
    const source = record.source as Record<string, unknown>;
    if (typeof source.data === 'string') {
      const mime = typeof source.media_type === 'string' ? source.media_type : 'image/png';
      images.push({ kind: 'base64', value: source.data, mime, provider: 'openai-chat' });
    }
  }
  return '';
}

function collectMarkdownImages(text: string, images: GeneratedImage[]): void {
  const pattern = /!\[[^\]]*\]\((data:image\/(?:png|jpeg|jpg|webp);base64,[^)\s]+|https?:\/\/[^)\s]+)\)/gi;
  for (const match of text.matchAll(pattern)) {
    const image = imageFromUrlLike(match[1]);
    if (image) images.push(image);
  }
  const dataPattern = /data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+/gi;
  for (const match of text.matchAll(dataPattern)) {
    const image = imageFromUrlLike(match[0]);
    if (image) images.push(image);
  }
}

function dedupe(images: GeneratedImage[]): GeneratedImage[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = `${image.kind}:${image.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseOpenAIChatResponse(value: unknown): { images: GeneratedImage[]; text: string } {
  const apiError = readApiError(value);
  if (apiError) throw new Error(apiError);
  if (!value || typeof value !== 'object') throw new Error('Chat 接口返回格式不正确');
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) throw new Error('Chat 接口响应缺少 choices');
  const message = (choices[0] as { message?: unknown })?.message;
  if (!message || typeof message !== 'object') throw new Error('Chat 接口响应缺少 message');
  const record = message as Record<string, unknown>;
  const images: GeneratedImage[] = [];
  let text = '';

  if (Array.isArray(record.images)) {
    for (const image of record.images) {
      const parsed = collectPart(image, images);
      if (parsed) text += parsed;
    }
  }
  const content = record.content;
  if (typeof content === 'string') {
    collectMarkdownImages(content, images);
    text += content;
  } else if (Array.isArray(content)) {
    for (const part of content) text += collectPart(part, images);
  }

  return { images: dedupe(images), text: text.trim() };
}
