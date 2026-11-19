import { rgbToOklab } from './color';

export interface ResampledImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const DETAIL_RANGE = 90;
const CHROMA_THRESHOLD = 0.085;
const CHROMA_COUNT = 2;
const SATURATION_FLOOR = 24;
const DARK_LUM = 85;
const LIGHT_LUM = 245;
const DETAIL_AVG_LUM_MIN = 60;
const DETAIL_AVG_LUM_MAX = 205;

/**
 * 4×4 面积平均 + 细节保留。
 *
 * 纯面积平均会把细眼线、眼睛高光和小面积彩色饰品一起糊掉；拼豆图纸需要的是
 * 可读的像素画，不是缩略图。因此高对比格子（亮度跨度 > 90）按优先级保留：
 *   1. 高彩度像素（紫色眼睛、红色衣纹、金色饰件），要求至少 2 个子像素命中；
 *   2. 最深像素（线稿、眼睛轮廓）；
 *   3. 最浅像素（眼睛高光、白衣亮部）。
 * 低对比格子仍做面积平均，避免照片噪点被放大成彩点。
 */
export function resampleArea(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): ResampledImage {
  if (!targetWidth || !targetHeight) {
    return { width: 0, height: 0, data: new Uint8ClampedArray(0) };
  }
  if (sourceWidth < targetWidth || sourceHeight < targetHeight) {
    throw new Error('源图尺寸不能小于目标尺寸');
  }
  const stepX = sourceWidth / targetWidth;
  const stepY = sourceHeight / targetHeight;
  if (!Number.isInteger(stepX) || !Number.isInteger(stepY)) {
    throw new Error('源图尺寸必须是目标尺寸的整数倍');
  }
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const sampleCount = stepX * stepY;

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let darkest = { r: 0, g: 0, b: 0, lum: 999 };
      let lightest = { r: 0, g: 0, b: 0, lum: -1 };
      let minLum = 999;
      let maxLum = -1;
      for (let dy = 0; dy < stepY; dy += 1) {
        for (let dx = 0; dx < stepX; dx += 1) {
          const offset = ((y * stepY + dy) * sourceWidth + (x * stepX + dx)) * 4;
          const alpha = source[offset + 3] / 255;
          if (alpha <= 0) continue;
          const sr = source[offset];
          const sg = source[offset + 1];
          const sb = source[offset + 2];
          const lum = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
          if (lum < darkest.lum) darkest = { r: sr, g: sg, b: sb, lum };
          if (lum > lightest.lum) lightest = { r: sr, g: sg, b: sb, lum };
          if (lum < minLum) minLum = lum;
          if (lum > maxLum) maxLum = lum;
          r += sr * alpha;
          g += sg * alpha;
          b += sb * alpha;
          a += alpha;
        }
      }

      const dest = (y * targetWidth + x) * 4;
      if (a > 0) {
        const avgLum = 0.2126 * (r / a) + 0.7152 * (g / a) + 0.0722 * (b / a);
        let detail: { r: number; g: number; b: number } | null = null;
        if (maxLum - minLum > DETAIL_RANGE && avgLum > DETAIL_AVG_LUM_MIN) {
          let maxChroma = 0;
          let chromaCount = 0;
          let chromaColor: { r: number; g: number; b: number } | null = null;
          for (let dy = 0; dy < stepY; dy += 1) {
            for (let dx = 0; dx < stepX; dx += 1) {
              const offset = ((y * stepY + dy) * sourceWidth + (x * stepX + dx)) * 4;
              if (source[offset + 3] <= 0) continue;
              const sr = source[offset];
              const sg = source[offset + 1];
              const sb = source[offset + 2];
              if (Math.max(sr, sg, sb) - Math.min(sr, sg, sb) < SATURATION_FLOOR) continue;
              const lab = rgbToOklab(sr, sg, sb);
              const chroma = Math.hypot(lab[1], lab[2]);
              if (chroma > CHROMA_THRESHOLD) chromaCount += 1;
              if (chroma > maxChroma) {
                maxChroma = chroma;
                chromaColor = { r: sr, g: sg, b: sb };
              }
            }
          }
          if (chromaCount >= CHROMA_COUNT && maxChroma > CHROMA_THRESHOLD && chromaColor) {
            detail = chromaColor;
          } else if (darkest.lum < DARK_LUM && avgLum > 80) {
            detail = darkest;
          } else if (lightest.lum > LIGHT_LUM && avgLum < DETAIL_AVG_LUM_MAX) {
            detail = lightest;
          }
        }
        if (detail) {
          output[dest] = detail.r;
          output[dest + 1] = detail.g;
          output[dest + 2] = detail.b;
        } else {
          output[dest] = Math.round(r / a);
          output[dest + 1] = Math.round(g / a);
          output[dest + 2] = Math.round(b / a);
        }
      }
      output[dest + 3] = Math.round((a / sampleCount) * 255);
    }
  }

  return { width: targetWidth, height: targetHeight, data: output };
}
