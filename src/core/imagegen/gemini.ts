import type { GeneratedImage, ImageGenRequest } from './types';
import { joinGeminiUrl, readApiError } from './http';

export interface GeminiRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function headers(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };
}

export function buildGeminiImageRequest(req: ImageGenRequest): GeminiRequest {
  return {
    url: joinGeminiUrl(req.baseUrl, req.model),
    headers: headers(req.apiKey),
    body: {
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    },
  };
}

export function buildGeminiGridRequest(req: ImageGenRequest, system: string, user: string): GeminiRequest {
  return {
    url: joinGeminiUrl(req.baseUrl, req.model),
    headers: headers(req.apiKey),
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    },
  };
}

export function parseGeminiResponse(value: unknown): { images: GeneratedImage[]; text: string } {
  const apiError = readApiError(value);
  if (apiError) throw new Error(apiError);
  if (!value || typeof value !== 'object') throw new Error('Gemini 接口返回格式不正确');
  const images: GeneratedImage[] = [];
  let text = '';

  const predictions = (value as { predictions?: unknown }).predictions;
  if (Array.isArray(predictions)) {
    for (const item of predictions) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      if (typeof record.bytesBase64Encoded === 'string') {
        const mime = typeof record.mimeType === 'string' ? record.mimeType : 'image/png';
        images.push({ kind: 'base64', value: record.bytesBase64Encoded, mime, provider: 'gemini' });
      }
    }
  }

  const candidates = (value as { candidates?: unknown }).candidates;
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const content = (candidate as { content?: unknown }).content;
      if (!content || typeof content !== 'object') continue;
      const parts = (content as { parts?: unknown }).parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        if (!part || typeof part !== 'object') continue;
        const record = part as Record<string, unknown>;
        if (typeof record.text === 'string') text += record.text;
        const inline = record.inlineData ?? record.inline_data;
        if (inline && typeof inline === 'object') {
          const data = (inline as Record<string, unknown>).data;
          const mime = (inline as Record<string, unknown>).mimeType ?? (inline as Record<string, unknown>).mime_type;
          if (typeof data === 'string' && data.trim()) {
            images.push({
              kind: 'base64',
              value: data,
              mime: typeof mime === 'string' ? mime : 'image/png',
              provider: 'gemini',
            });
          }
        }
      }
    }
  }

  return { images, text: text.trim() };
}
