import { hexToRgb } from '@/core/color';
import { EMPTY } from '@/core/constants';
import type { Project } from '@/core/model';

export const MIN_EDITOR_CODE_CELL = 14;
export const READABLE_CODE_CELL = 22;

function linearChannel(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

const darkLuminance = linearChannel(17);

export function codeTextColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luminance = 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
  const darkContrast = (Math.max(luminance, darkLuminance) + 0.05) / (Math.min(luminance, darkLuminance) + 0.05);
  const whiteContrast = 1.05 / (luminance + 0.05);
  return darkContrast >= whiteContrast ? '#111111' : '#FFFFFF';
}

export function drawCellLabels(
  ctx: CanvasRenderingContext2D,
  project: Pick<Project, 'width' | 'height' | 'cells' | 'palette'>,
  options: {
    cell: number;
    originX: number;
    originY: number;
    startCol?: number;
    endCol?: number;
    startRow?: number;
    endRow?: number;
    mirror?: boolean;
  },
): number {
  const { width, height, cells, palette } = project;
  const { cell, originX, originY, mirror = false } = options;
  const startCol = Math.max(0, Math.ceil(options.startCol ?? 0));
  const endCol = Math.min(width - 1, Math.floor(options.endCol ?? width - 1));
  const startRow = Math.max(0, Math.ceil(options.startRow ?? 0));
  const endRow = Math.min(height - 1, Math.floor(options.endRow ?? height - 1));
  const nominalSize = cell * 0.44;
  const nominalFont = `600 ${nominalSize}px Arial, sans-serif`;
  const maxTextWidth = cell * 0.8;
  const labels = new Map<number, { code: string; font: string; color: string }>();
  let drawn = 0;

  ctx.save();
  try {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const sourceCol = mirror ? width - 1 - col : col;
        const value = cells[row * width + sourceCol];
        if (value === EMPTY) continue;

        let label = labels.get(value);
        if (!label) {
          const color = palette.colors[value];
          if (!color) continue;
          ctx.font = nominalFont;
          const measuredWidth = ctx.measureText(color.code).width;
          // Keep font sizing proportional to the cell, including high-DPI exports.
          const fontSize = measuredWidth > maxTextWidth ? nominalSize * maxTextWidth / measuredWidth : nominalSize;
          label = {
            code: color.code,
            font: `600 ${fontSize}px Arial, sans-serif`,
            color: codeTextColor(color.hex),
          };
          labels.set(value, label);
        }

        ctx.font = label.font;
        ctx.fillStyle = label.color;
        // Origins and bounds refer to the full grid, even for a clipped or mirrored tile.
        ctx.fillText(label.code, originX + (col + 0.5) * cell, originY + (row + 0.5) * cell);
        drawn += 1;
      }
    }
  } finally {
    ctx.restore();
  }
  return drawn;
}
