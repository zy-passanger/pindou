import type { GeneratedImage, GridRequest, ImageGenRequest, ImageGenResult } from '@/core/imagegen/types';
import { buildOpenAIImagesRequest, parseOpenAIImagesResponse } from '@/core/imagegen/openaiImages';
import {
  buildOpenAIChatGridRequest,
  buildOpenAIChatImageRequest,
  parseOpenAIChatResponse,
} from '@/core/imagegen/openaiChat';
import { buildGeminiGridRequest, buildGeminiImageRequest, parseGeminiResponse } from '@/core/imagegen/gemini';
import { readApiError, redactSecrets, truncateSafe } from '@/core/imagegen/http';

export type FetchLike = typeof fetch;

export interface ImageClientOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class ImageGenError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = 'ImageGenError';
    this.code = code;
    this.status = status;
  }
}

interface JsonResponse {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function assertRequest(req: ImageGenRequest): void {
  if (!req.baseUrl.trim()) throw new ImageGenError('请填写 Base URL', 'config');
  if (!req.apiKey.trim()) throw new ImageGenError('请填写 API Key', 'config');
  if (!req.model.trim()) throw new ImageGenError('请填写模型名', 'config');
  if (!req.prompt.trim()) throw new ImageGenError('请先输入提示词', 'config');
}

function friendlyHttpMessage(status: number, body: string): string {
  const detail = truncateSafe(body);
  if (status === 401 || status === 403) return '鉴权失败，请检查 API Key、Base URL 和模型权限。';
  if (status === 429) return '请求过多或额度不足，请稍后再试；本次不会自动重试。';
  if (status >= 500) return `服务商暂时不可用（HTTP ${status}），请稍后再试。`;
  return detail ? `请求失败（HTTP ${status}）：${detail}` : `请求失败（HTTP ${status}）`;
}

async function postJson(
  request: JsonResponse,
  options: ImageClientOptions,
  defaultTimeoutMs: number,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const controller = new AbortController();
  const external = options.signal;
  let timedOut = false;
  const abortFromExternal = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', abortFromExternal, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new ImageGenError(`请求超时（${Math.round(timeoutMs / 1000)} 秒），本次不会自动重试。`, 'timeout');
    }
    if (external?.aborted) throw new ImageGenError('已取消生成', 'aborted');
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ImageGenError('已取消生成', 'aborted');
    }
    throw new ImageGenError(
      `无法连接 ${request.url}。服务商可能不允许浏览器直连（CORS），或当前网络不可达。`,
      'network',
    );
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', abortFromExternal);
  }

  const rawText = await response.text().catch(() => '');
  let body: unknown = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const apiMessage = body ? readApiError(body) : null;
    const detail = apiMessage ? truncateSafe(apiMessage) : '';
    let message: string;
    if (response.status === 401 || response.status === 403) {
      message = `鉴权失败，请检查 API Key、Base URL 和模型权限。${detail ? ` 详情：${detail}` : ''}`;
    } else if (response.status === 429) {
      message = `请求过多或额度不足，请稍后再试；本次不会自动重试。${detail ? ` 详情：${detail}` : ''}`;
    } else if (response.status >= 500) {
      message = `服务商暂时不可用（HTTP ${response.status}），请稍后再试。${detail ? ` 详情：${detail}` : ''}`;
    } else {
      message = detail ? `请求失败（HTTP ${response.status}）：${detail}` : friendlyHttpMessage(response.status, rawText);
    }
    throw new ImageGenError(message, 'http', response.status);
  }
  if (!body) throw new ImageGenError('服务商返回了无法解析的响应', 'bad_response');
  const apiMessage = readApiError(body);
  if (apiMessage) throw new ImageGenError(truncateSafe(apiMessage), 'api');
  return body;
}

export async function generateImage(req: ImageGenRequest, options: ImageClientOptions = {}): Promise<ImageGenResult> {
  assertRequest(req);
  let body: unknown;
  let images: GeneratedImage[] = [];
  let text = '';
  if (req.provider === 'openai-images') {
    body = await postJson(buildOpenAIImagesRequest(req), options, 120_000);
    images = parseOpenAIImagesResponse(body, 'openai-images');
  } else if (req.provider === 'openai-chat') {
    body = await postJson(buildOpenAIChatImageRequest(req), options, 120_000);
    const parsed = parseOpenAIChatResponse(body);
    images = parsed.images;
    text = parsed.text;
  } else {
    body = await postJson(buildGeminiImageRequest(req), options, 120_000);
    const parsed = parseGeminiResponse(body);
    images = parsed.images;
    text = parsed.text;
  }
  if (!images.length) {
    throw new ImageGenError(
      '模型返回中没有找到图片。请确认模型支持图片输出，或改用 OpenAI Images 接口。',
      'no_image',
    );
  }
  return { images, text: text || undefined };
}

export async function generateGridText(
  req: GridRequest,
  system: string,
  user: string,
  options: ImageClientOptions = {},
): Promise<string> {
  assertRequest(req);
  if (req.provider === 'openai-images') {
    throw new ImageGenError('OpenAI Images 不支持直接输出色号网格，请改用 OpenAI Chat 或 Gemini。', 'config');
  }
  try {
    if (req.provider === 'openai-chat') {
      const body = await postJson(buildOpenAIChatGridRequest(req, system, user), options, 90_000);
      return parseOpenAIChatResponse(body).text;
    }
    const body = await postJson(buildGeminiGridRequest(req, system, user), options, 90_000);
    return parseGeminiResponse(body).text;
  } catch (error) {
    if (error instanceof ImageGenError && error.status === 400) {
      throw new ImageGenError(
        '模型不接受当前请求格式。部分 Chat 服务不支持图片/长文本输出，请检查模型名与接口。',
        'bad_request',
        400,
      );
    }
    throw error;
  }
}

export function safeErrorMessage(error: unknown, apiKey?: string): string {
  if (error instanceof ImageGenError) {
    return redactSecrets(error.message, apiKey);
  }
  if (error instanceof Error) return redactSecrets(error.message, apiKey);
  return '生成失败，请稍后重试。';
}
