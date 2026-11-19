import { EMPTY } from './constants';

export interface Grid {
  width: number;
  height: number;
  cells: Uint16Array;
}

export type Anchor =
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'center' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right';

export function createGrid(width: number, height: number): Grid {
  const cells = new Uint16Array(width * height);
  cells.fill(EMPTY);
  return { width, height, cells };
}

export function resizeGrid(grid: Grid, newWidth: number, newHeight: number, anchor: Anchor): Grid {
  const next = createGrid(newWidth, newHeight);
  const dx = anchor.includes('left') ? 0 : anchor.includes('right') ? newWidth - grid.width : Math.floor((newWidth - grid.width) / 2);
  const dy = anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? newHeight - grid.height : Math.floor((newHeight - grid.height) / 2);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < newWidth && ny < newHeight) {
        next.cells[ny * newWidth + nx] = grid.cells[y * grid.width + x];
      }
    }
  }
  return next;
}

export function flipHorizontal(grid: Grid): Grid {
  const next = createGrid(grid.width, grid.height);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      next.cells[y * grid.width + (grid.width - 1 - x)] = grid.cells[y * grid.width + x];
    }
  }
  return next;
}

export function flipVertical(grid: Grid): Grid {
  const next = createGrid(grid.width, grid.height);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      next.cells[(grid.height - 1 - y) * grid.width + x] = grid.cells[y * grid.width + x];
    }
  }
  return next;
}

export function rotateRight(grid: Grid): Grid {
  const next = createGrid(grid.height, grid.width);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const nx = grid.height - 1 - y;
      const ny = x;
      next.cells[ny * next.width + nx] = grid.cells[y * grid.width + x];
    }
  }
  return next;
}

export function rotateLeft(grid: Grid): Grid {
  const next = createGrid(grid.height, grid.width);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const nx = y;
      const ny = grid.width - 1 - x;
      next.cells[ny * next.width + nx] = grid.cells[y * grid.width + x];
    }
  }
  return next;
}

export function replaceColor(grid: Grid, from: number, to: number): Grid {
  const next = createGrid(grid.width, grid.height);
  for (let i = 0; i < grid.cells.length; i += 1) {
    next.cells[i] = grid.cells[i] === from ? to : grid.cells[i];
  }
  return next;
}

export type Point = [number, number];

export function bresenham(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = [];
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - x);
  const dy = Math.abs(ty - y);
  const sx = x < tx ? 1 : -1;
  const sy = y < ty ? 1 : -1;
  let err = dx - dy;
  let guard = 0;
  while (guard < 4000) {
    points.push([x, y]);
    if (x === tx && y === ty) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    guard += 1;
  }
  return points;
}

export function lineCells(a: Point, b: Point): Point[] {
  return bresenham(a[0], a[1], b[0], b[1]);
}

export function rectCells(a: Point, b: Point, filled = true): Point[] {
  const x0 = Math.min(a[0], b[0]);
  const x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const y1 = Math.max(a[1], b[1]);
  const points: Point[] = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (filled || x === x0 || x === x1 || y === y0 || y === y1) points.push([x, y]);
    }
  }
  return points;
}

export function ellipseCells(a: Point, b: Point): Point[] {
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2;
  const rx = Math.max(0.5, Math.abs(b[0] - a[0]) / 2 + 0.5);
  const ry = Math.max(0.5, Math.abs(b[1] - a[1]) / 2 + 0.5);
  const points: Point[] = [];
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) points.push([x, y]);
    }
  }
  return points;
}
