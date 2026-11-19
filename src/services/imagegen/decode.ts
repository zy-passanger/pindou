import type { GeneratedImage } from '@/core/imagegen/types';
import { ImageGenError } from './client';

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8192;

export function base64ToBytes(value: string): Uint8Array {
  const cleaned = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const normalized = cleaned.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  try {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    throw new ImageGenError('图片 base64 数据无效', 'bad_image');
  }
}

export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

async function validateBlob(blob: Blob): Promise<{ blob: Blob; mime: string }> {
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new ImageGenError('生成图片超过 25MB，已拒绝载入', 'image_too_large');
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) throw new ImageGenError('生成结果不是 PNG/JPEG/WebP 图片', 'bad_image');
  return { blob: new Blob([blob], { type: mime }), mime };
}

export async function generatedImageToBlob(
  image: GeneratedImage,
  signal?: AbortSignal,
): Promise<{ blob: Blob; mime: string }> {
  if (image.kind === 'base64') {
    const bytes = base64ToBytes(image.value);
    const mime = sniffImageMime(bytes);
    if (!mime) throw new ImageGenError('模型返回的 base64 不是 PNG/JPEG/WebP 图片', 'bad_image');
    return validateBlob(new Blob([bytes as unknown as BlobPart], { type: mime }));
  }
  const response = await fetch(image.value, {
    mode: 'cors',
    credentials: 'omit',
    signal,
  });
  if (!response.ok) {
    throw new ImageGenError(
      `无法下载生成图片（HTTP ${response.status}）。图片地址可能已过期或不允许跨域读取。`,
      'image_download',
      response.status,
    );
  }
  const raw = await response.blob();
  return validateBlob(raw);
}

export async function imageElementFromBlob(blob: Blob): Promise<{ image: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('生成图片无法解码'));
      image.src = url;
    });
    if (image.naturalWidth > MAX_IMAGE_DIMENSION || image.naturalHeight > MAX_IMAGE_DIMENSION) {
      throw new Error(`生成图片尺寸过大（最大 ${MAX_IMAGE_DIMENSION}px）`);
    }
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('生成图片尺寸为 0');
    return { image, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error instanceof ImageGenError
      ? error
      : new ImageGenError(error instanceof Error ? error.message : '生成图片无法解码', 'bad_image');
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new ImageGenError('图片编码失败', 'encode'));
    }, type, quality);
  });
}

/** 历史图最长边压到 maxPx，避免把大图原样塞进 IndexedDB。 */
export async function downscaleImageBlob(
  blob: Blob,
  maxPx = 1024,
): Promise<{ blob: Blob; width: number; height: number; mime: string }> {
  const { image, url } = await imageElementFromBlob(blob);
  try {
    const scale = Math.min(1, maxPx / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageGenError('无法创建图片画布', 'canvas');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, width, height);
    let encoded: Blob;
    try {
      encoded = await canvasToBlob(canvas, 'image/webp', 0.86);
    } catch {
      encoded = await canvasToBlob(canvas, 'image/png');
    }
    return { blob: encoded, width, height, mime: encoded.type || 'image/png' };
  } finally {
    URL.revokeObjectURL(url);
  }
}
