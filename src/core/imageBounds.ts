import { rgbToOklab } from './color';

export interface PixelSource {
  width: number;
  height: number;
  /** RGBA */
  data: Uint8ClampedArray;
}

export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectBoundsOptions {
  /** 小于该 alpha 视为透明。 */
  alphaThreshold?: number;
  /** 不透明背景色的 OKLab 容差。 */
  backgroundTolerance?: number;
}

export interface AutoFrame {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

function floodBackground(mask: Uint8Array, width: number, height: number): void {
  const stack = new Int32Array(width * height);
  let top = 0;
  const seed = (index: number) => {
    if (mask[index] !== 1) return;
    mask[index] = 2;
    stack[top++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (top > 0) {
    const index = stack[--top];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) seed(index - 1);
    if (x + 1 < width) seed(index + 1);
    if (y > 0) seed(index - width);
    if (y + 1 < height) seed(index + width);
  }
}

function opaqueBackgroundLab(source: PixelSource): [number, number, number] | null {
  const { width, height, data } = source;
  // 边缘像素按 5bit 粗分桶，取出现最多的颜色作为背景；
  // 比只看四个角更稳，允许主体贴边或有轻微渐变。
  const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();
  let border = 0;
  const sample = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
    border += 1;
  };
  for (let x = 0; x < width; x += 1) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    sample(0, y);
    sample(width - 1, y);
  }
  let best: { r: number; g: number; b: number; count: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best || best.count < border * 0.12) return null;
  return rgbToOklab(best.r / best.count, best.g / best.count, best.b / best.count);
}

/**
 * 找画面中真正的主体边界：
 * - 有空透明通道时，用 alpha 边界；
 * - 不透明图用边缘主色 + OKLab 容差做连通背景剔除，
 *   被主体围住的白色高光仍算主体。
 * 返回 null 表示没有可裁的独立主体（例如整张照片都是内容）。
 */
export function detectContentBounds(source: PixelSource, options: DetectBoundsOptions = {}): ContentBounds | null {
  const { width, height, data } = source;
  if (width < 3 || height < 3) return null;
  const total = width * height;
  const alphaThreshold = options.alphaThreshold ?? 16;
  const backgroundTolerance = Math.max(0.01, options.backgroundTolerance ?? 0.055);
  const mask = new Uint8Array(total);

  let translucent = 0;
  for (let i = 0; i < total; i += 1) {
    if (data[i * 4 + 3] < 250) translucent += 1;
  }

  if (translucent > total * 0.005) {
    for (let i = 0; i < total; i += 1) {
      mask[i] = data[i * 4 + 3] > alphaThreshold ? 1 : 0;
    }
  } else {
    const background = opaqueBackgroundLab(source);
    if (!background) return null;
    for (let i = 0; i < total; i += 1) {
      const offset = i * 4;
      const lab = rgbToOklab(data[offset], data[offset + 1], data[offset + 2]);
      const dl = lab[0] - background[0];
      const da = lab[1] - background[1];
      const db = lab[2] - background[2];
      mask[i] = Math.sqrt(dl * dl + da * da + db * db) <= backgroundTolerance ? 1 : 0;
    }
    // 只删除与画布外边缘连通的背景色，围住的高光/白发保留。
    floodBackground(mask, width, height);
    for (let i = 0; i < total; i += 1) {
      mask[i] = mask[i] === 2 ? 0 : 1;
    }
  }

  let content = 0;
  const colCount = new Uint32Array(width);
  const rowCount = new Uint32Array(height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      content += 1;
      colCount[x] += 1;
      rowCount[y] += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (content < total * 0.004 || maxX < minX || maxY < minY) return null;

  // 去掉零星的抗锯齿/噪点行，避免一个像素把取景撑到全图。
  const minLine = Math.max(2, Math.round(Math.min(width, height) * 0.006));
  while (minX <= maxX && colCount[minX] < minLine) minX += 1;
  while (maxX >= minX && colCount[maxX] < minLine) maxX -= 1;
  while (minY <= maxY && rowCount[minY] < minLine) minY += 1;
  while (maxY >= minY && rowCount[maxY] < minLine) maxY -= 1;
  if (maxX < minX || maxY < minY) return null;

  const bounds = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  // 主体几乎铺满整张图时没有裁剪收益，交给默认取景。
  if (bounds.width >= width * 0.985 && bounds.height >= height * 0.985) return null;
  return bounds;
}

/**
 * 把主体边界换算成裁剪组件的 zoom/offset（相对原图居中 + fill 基准）。
 * padding 是画布四周保留的安全边，按画布比例计。
 */
export function frameContentBounds(
  imageWidth: number,
  imageHeight: number,
  bounds: ContentBounds,
  targetWidth: number,
  targetHeight: number,
  padding = 0.035,
): AutoFrame {
  const iw = Math.max(1, imageWidth);
  const ih = Math.max(1, imageHeight);
  const bw = Math.max(1, bounds.width);
  const bh = Math.max(1, bounds.height);
  const innerW = targetWidth * (1 - padding * 2);
  const innerH = targetHeight * (1 - padding * 2);
  const base = Math.max(targetWidth / iw, targetHeight / ih);
  const scale = Math.min(innerW / bw, innerH / bh);
  const zoom = Math.max(1, Math.min(8, scale / base));
  const centerX = bounds.x + bw / 2;
  const centerY = bounds.y + bh / 2;
  const normalize = (value: number) => (Math.abs(value) < 1e-9 ? 0 : value);
  return {
    zoom,
    offsetX: normalize(-((centerX - iw / 2) * base * zoom) / targetWidth),
    offsetY: normalize(-((centerY - ih / 2) * base * zoom) / targetHeight),
  };
}
