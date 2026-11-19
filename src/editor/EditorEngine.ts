import { EMPTY } from '@/core/constants';
import type { Project } from '@/core/model';
import { drawCellLabels, MIN_EDITOR_CODE_CELL, READABLE_CODE_CELL } from '@/rendering/cellLabels';
import { fillInteriorHoles } from '@/core/fillHoles';
import {
  bresenham,
  ellipseCells,
  flipHorizontal,
  flipVertical,
  lineCells,
  rectCells,
  resizeGrid,
  rotateLeft,
  rotateRight,
  type Anchor,
  type Grid,
  type Point,
} from '@/core/geometry';
import type { CellCoord, ChangeReason, EditorCallbacks, Symmetry, ToolId } from './types';

const RULER = 24;
const HISTORY_LIMIT = 60;

interface Snapshot {
  width: number;
  height: number;
  cells: Uint16Array;
}

interface StrokeState {
  before: Snapshot;
  changed: boolean;
  last: CellCoord;
}

interface ShapeState {
  start: Point;
  current: Point;
  before: Snapshot;
  changed: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export class EditorEngine {
  readonly stage: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  project: Project;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly callbacks: EditorCallbacks;
  private readonly view = { zoom: 1, panX: 0, panY: 0 };
  private readonly undoStack: Snapshot[] = [];
  private readonly redoStack: Snapshot[] = [];
  private cw = 1;
  private ch = 1;
  private baseCell = 8;
  private cellPx = 8;
  private originX = RULER;
  private originY = RULER;
  private dpr = 1;
  private readonly pointers = new Map<number, { x: number; y: number; type: string }>();
  private stroke: StrokeState | null = null;
  private shape: ShapeState | null = null;
  private shapePreview: { cells: Point[]; color: number } | null = null;
  private pan: { startX: number; startY: number; panX: number; panY: number } | null = null;
  private pinch: { dist: number; zoom: number; cellX: number; cellY: number } | null = null;
  private hover: CellCoord | null = null;
  private lastHoverKey = '';
  private destroyed = false;
  private readonly resizeObserver: ResizeObserver;

  constructor(stage: HTMLElement, project: Project, callbacks: EditorCallbacks) {
    this.stage = stage;
    this.project = project;
    this.callbacks = callbacks;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'editor-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-label', '拼豆画布。单指或鼠标绘制，双指缩放，滚轮缩放。');
    stage.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.bind();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(stage);
    this.updateCursor();
    this.resize();
  }

  private get colors() {
    return this.project.palette.colors;
  }

  private options() {
    return this.callbacks.getOptions();
  }

  private bind(): void {
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.canvas.addEventListener('pointercancel', (event) => this.onPointerCancel(event));
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.pointers.size) {
        this.hover = null;
        this.lastHoverKey = '';
        this.callbacks.onHover(null);
        this.draw();
      }
    });
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const point = this.toCanvasPoint(event);
      this.zoomAt(Math.exp(-event.deltaY * 0.0015), point.x, point.y);
    }, { passive: false });
    this.canvas.addEventListener('dblclick', (event) => {
      const point = this.toCanvasPoint(event);
      this.zoomAt(1.6, point.x, point.y);
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  resize(): void {
    if (this.destroyed) return;
    const cw = Math.max(1, this.stage.clientWidth);
    const ch = Math.max(1, this.stage.clientHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = cw;
    this.ch = ch;
    this.canvas.width = Math.round(cw * this.dpr);
    this.canvas.height = Math.round(ch * this.dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.computeFit();
    this.cellPx = this.baseCell * this.view.zoom;
    this.clampPan();
    this.computeView();
    this.draw();
    this.callbacks.onZoom(this.view.zoom);
  }

  private computeFit(): void {
    const availW = Math.max(30, this.cw - RULER * 2 - 16);
    const availH = Math.max(30, this.ch - RULER * 2 - 16);
    this.baseCell = Math.max(1.5, Math.min(availW / this.project.width, availH / this.project.height));
  }

  private computeView(): void {
    this.cellPx = this.baseCell * this.view.zoom;
    const bw = this.project.width * this.cellPx;
    const bh = this.project.height * this.cellPx;
    this.originX = (this.cw - bw) / 2 + this.view.panX;
    this.originY = (this.ch - bh) / 2 + this.view.panY;
  }

  private clampPan(): void {
    const bw = this.project.width * this.cellPx;
    const bh = this.project.height * this.cellPx;
    const margin = 64;
    const maxX = Math.max(0, (this.cw + bw) / 2 - margin);
    const maxY = Math.max(0, (this.ch + bh) / 2 - margin);
    this.view.panX = clamp(this.view.panX, -maxX, maxX);
    this.view.panY = clamp(this.view.panY, -maxY, maxY);
  }

  private toCanvasPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.cw || 1;
    const scaleY = rect.height / this.ch || 1;
    return {
      x: (event.clientX - rect.left) / scaleX,
      y: (event.clientY - rect.top) / scaleY,
    };
  }

  private clientToCanvas(clientX: number, clientY: number): { x: number; y: number } {
    return this.toCanvasPoint({ clientX, clientY });
  }

  private cellAt(x: number, y: number): CellCoord | null {
    const cx = Math.floor((x - this.originX) / this.cellPx);
    const cy = Math.floor((y - this.originY) / this.cellPx);
    if (cx < 0 || cy < 0 || cx >= this.project.width || cy >= this.project.height) return null;
    return { x: cx, y: cy };
  }

  private getOptionsSafe() {
    const opts = this.options();
    const colorIndex = opts.colorIndex >= 0 && opts.colorIndex < this.colors.length ? opts.colorIndex : 0;
    return { ...opts, colorIndex };
  }

  draw(): void {
    if (this.destroyed) return;
    const ctx = this.ctx;
    const cw = this.cw;
    const ch = this.ch;
    this.computeView();
    const opts = this.getOptionsSafe();

    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, '#F2EADD');
    bg.addColorStop(1, '#E8DECE');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    const w = this.project.width;
    const h = this.project.height;
    const cell = this.cellPx;
    const ox = this.originX;
    const oy = this.originY;
    const bw = w * cell;
    const bh = h * cell;
    const radius = Math.min(14, Math.max(3, cell * 1.5));

    ctx.save();
    ctx.shadowColor = 'rgba(70,52,30,.18)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 9;
    roundRect(ctx, ox, oy, bw, bh, radius);
    ctx.fillStyle = '#FFFCF5';
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(100,78,50,.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, ox + 0.5, oy + 0.5, Math.max(1, bw - 1), Math.max(1, bh - 1), radius);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.clip();

    const x0 = Math.max(0, Math.floor((0 - ox) / cell));
    const x1 = Math.min(w - 1, Math.ceil((cw - ox) / cell));
    const y0 = Math.max(0, Math.floor((0 - oy) / cell));
    const y1 = Math.min(h - 1, Math.ceil((ch - oy) / cell));
    const gap = cell >= 7 ? Math.min(0.7, cell * 0.055) : 0;

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const value = this.project.cells[y * w + x];
        if (value === EMPTY) continue;
        ctx.fillStyle = this.colors[value]?.hex ?? '#eee';
        ctx.fillRect(
          ox + x * cell + gap,
          oy + y * cell + gap,
          Math.max(0.6, cell - gap * 2),
          Math.max(0.6, cell - gap * 2),
        );
      }
    }

    if (opts.showGrid && cell >= 9) {
      ctx.fillStyle = 'rgba(120,96,64,.14)';
      for (let ey = y0; ey <= y1; ey += 1) {
        for (let ex = x0; ex <= x1; ex += 1) {
          if (this.project.cells[ey * w + ex] !== EMPTY) continue;
          const dx = ox + ex * cell + cell / 2;
          const dy = oy + ey * cell + cell / 2;
          ctx.fillRect(dx - 0.45, dy - 0.45, 0.9, 0.9);
        }
      }
    }

    if (opts.showGrid) {
      const step = cell >= 5 ? 1 : 5;
      for (let gx = x0; gx <= x1 + 1; gx += 1) {
        if (gx % step !== 0) continue;
        const px = ox + gx * cell;
        if (px < -1 || px > cw + 1) continue;
        const isBoardX = gx > 0 && gx % this.project.boardW === 0;
        const is10X = gx % 10 === 0;
        const is5X = gx % 5 === 0;
        ctx.strokeStyle = isBoardX
          ? 'rgba(74,58,40,.48)'
          : is10X
            ? 'rgba(90,72,50,.19)'
            : is5X
              ? 'rgba(90,72,50,.11)'
              : 'rgba(90,72,50,.055)';
        ctx.lineWidth = isBoardX ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(px, Math.max(0, oy));
        ctx.lineTo(px, Math.min(ch, oy + bh));
        ctx.stroke();
      }
      for (let gy = y0; gy <= y1 + 1; gy += 1) {
        if (gy % step !== 0) continue;
        const py = oy + gy * cell;
        if (py < -1 || py > ch + 1) continue;
        const isBoardY = gy > 0 && gy % this.project.boardH === 0;
        const is10Y = gy % 10 === 0;
        const is5Y = gy % 5 === 0;
        ctx.strokeStyle = isBoardY
          ? 'rgba(74,58,40,.48)'
          : is10Y
            ? 'rgba(90,72,50,.19)'
            : is5Y
              ? 'rgba(90,72,50,.11)'
              : 'rgba(90,72,50,.055)';
        ctx.lineWidth = isBoardY ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, ox), py);
        ctx.lineTo(Math.min(cw, ox + bw), py);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(74,58,40,.40)';
      ctx.lineWidth = 1.5;
      for (let bx = this.project.boardW; bx < w; bx += this.project.boardW) {
        const bpx = ox + bx * cell;
        ctx.beginPath();
        ctx.moveTo(bpx, Math.max(0, oy));
        ctx.lineTo(bpx, Math.min(ch, oy + bh));
        ctx.stroke();
      }
      for (let by = this.project.boardH; by < h; by += this.project.boardH) {
        const bpy = oy + by * cell;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, ox), bpy);
        ctx.lineTo(Math.min(cw, ox + bw), bpy);
        ctx.stroke();
      }
    }

    if (opts.showCodes && cell >= MIN_EDITOR_CODE_CELL) {
      drawCellLabels(ctx, this.project, {
        cell, originX: ox, originY: oy,
        startCol: x0, endCol: x1, startRow: y0, endRow: y1,
      });
    }

    if (this.shapePreview?.cells.length) {
      ctx.save();
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = this.colors[this.shapePreview.color]?.hex ?? '#ddd';
      this.shapePreview.cells.forEach(([x, y]) => {
        ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      });
      ctx.restore();
    }

    if (this.hover && this.pointers.size === 0) {
      ctx.strokeStyle = '#D95D4E';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        ox + this.hover.x * cell + 1,
        oy + this.hover.y * cell + 1,
        Math.max(1, cell - 2),
        Math.max(1, cell - 2),
      );
    }

    ctx.restore();
    this.drawRulers();
  }

  private drawRulers(): void {
    const ctx = this.ctx;
    const cw = this.cw;
    const ch = this.ch;
    const cell = this.cellPx;
    const ox = this.originX;
    const oy = this.originY;
    const bw = this.project.width * cell;
    const bh = this.project.height * cell;
    const topY = oy - RULER;
    const leftX = ox - RULER;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.clip();

    ctx.fillStyle = '#F8F2E7';
    ctx.fillRect(ox, topY, bw, RULER);
    ctx.fillRect(leftX, oy, RULER, bh);
    ctx.fillRect(leftX, topY, RULER, RULER);

    ctx.strokeStyle = 'rgba(110,88,60,.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, oy + 0.5);
    ctx.lineTo(ox + bw, oy + 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox + 0.5, oy);
    ctx.lineTo(ox + 0.5, oy + bh);
    ctx.stroke();

    const ccx = leftX + RULER / 2;
    const ccy = topY + RULER / 2;
    ctx.fillStyle = '#D95D4E';
    ctx.beginPath();
    ctx.arc(ccx, ccy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.beginPath();
    ctx.arc(ccx, ccy, 1.4, 0, Math.PI * 2);
    ctx.fill();

    const labelStep = cell >= 11 ? 5 : 10;
    const tickStep = cell >= 6 ? 1 : 5;
    ctx.fillStyle = '#8E8272';
    ctx.font = '500 8px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const wx0 = Math.max(0, Math.floor((0 - ox) / cell));
    const wx1 = Math.min(this.project.width, Math.ceil((cw - ox) / cell));
    for (let x = wx0; x <= wx1; x += 1) {
      const px = ox + x * cell;
      if (px < ox - 0.5 || px > ox + bw - 2) continue;
      if (x % tickStep === 0) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(110,88,60,.24)';
        ctx.moveTo(px + 0.5, oy - 4);
        ctx.lineTo(px + 0.5, oy);
        ctx.stroke();
      }
      if (x % labelStep === 0 && x < this.project.width) {
        const label = String(x + 1);
        if (px + 2 + label.length * 4.8 <= ox + bw) ctx.fillText(label, px + 2, topY + 5);
      }
    }

    const hy0 = Math.max(0, Math.floor((0 - oy) / cell));
    const hy1 = Math.min(this.project.height, Math.ceil((ch - oy) / cell));
    ctx.textBaseline = 'middle';
    for (let y = hy0; y <= hy1; y += 1) {
      const py = oy + y * cell;
      if (py < oy - 0.5 || py > oy + bh - 2) continue;
      if (y % tickStep === 0) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(110,88,60,.24)';
        ctx.moveTo(ox - 4, py + 0.5);
        ctx.lineTo(ox, py + 0.5);
        ctx.stroke();
      }
      if (y % labelStep === 0 && y < this.project.height) {
        ctx.fillText(String(y + 1), leftX + 3, py + 4);
      }
    }

    ctx.restore();
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // ignore unsupported capture
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });

    if (this.pointers.size === 2) {
      this.cancelStroke();
      this.pan = null;
      this.shape = null;
      this.shapePreview = null;
      this.startPinch();
      this.draw();
      return;
    }
    if (this.pointers.size > 2) return;

    const point = this.toCanvasPoint(event);
    const cell = this.cellAt(point.x, point.y);
    const opts = this.getOptionsSafe();

    if (opts.tool === 'pan') {
      this.pan = { startX: point.x, startY: point.y, panX: this.view.panX, panY: this.view.panY };
      this.updateCursor(true);
      return;
    }

    if (!cell) return;

    if (opts.tool === 'eyedropper') {
      const value = this.project.cells[cell.y * this.project.width + cell.x];
      if (value !== EMPTY) this.callbacks.onPick(value);
      return;
    }

    if (opts.tool === 'fill') {
      const before = this.snapshot();
      if (this.floodFill(cell.x, cell.y, opts.colorIndex)) {
        this.pushHistory(before);
        this.draw();
        this.callbacks.onChange('fill');
      }
      return;
    }

    if (opts.tool === 'pencil' || opts.tool === 'eraser') {
      this.stroke = { before: this.snapshot(), changed: false, last: cell };
      this.paintAt(cell.x, cell.y, opts);
      this.draw();
      return;
    }

    if (opts.tool === 'line' || opts.tool === 'rect' || opts.tool === 'ellipse') {
      this.shape = {
        start: [cell.x, cell.y],
        current: [cell.x, cell.y],
        before: this.snapshot(),
        changed: false,
      };
      this.updateShapePreview(opts);
      this.draw();
    }
  }

  private onPointerMove(event: PointerEvent): void {
    const pointer = this.pointers.get(event.pointerId);
    if (pointer) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }
    if (this.pinch) {
      this.updatePinch();
      return;
    }

    const point = this.toCanvasPoint(event);
    const cell = this.cellAt(point.x, point.y);
    const key = cell ? `${cell.x},${cell.y}` : '';
    if (key !== this.lastHoverKey) {
      this.lastHoverKey = key;
      this.hover = cell;
      this.callbacks.onHover(cell);
      if (!this.stroke && !this.shape) this.draw();
    }

    if (this.pan) {
      this.view.panX = this.pan.panX + (point.x - this.pan.startX);
      this.view.panY = this.pan.panY + (point.y - this.pan.startY);
      this.clampPan();
      this.computeView();
      this.draw();
      return;
    }

    const opts = this.getOptionsSafe();
    if (this.stroke) {
      if (!cell) return;
      this.paintLine(this.stroke.last.x, this.stroke.last.y, cell.x, cell.y, opts);
      this.stroke.last = cell;
      this.draw();
      return;
    }

    if (this.shape) {
      if (cell) {
        this.shape.current = [cell.x, cell.y];
        this.updateShapePreview(opts);
        this.draw();
      }
    }
  }

  private onPointerUp(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      this.draw();
      return;
    }
    if (this.pan) {
      this.pan = null;
      this.updateCursor(false);
      this.draw();
      return;
    }
    if (this.stroke) {
      if (this.stroke.changed) {
        this.pushHistory(this.stroke.before);
        this.project.updatedAt = Date.now();
        this.callbacks.onChange('stroke');
      }
      this.stroke = null;
      this.draw();
      return;
    }
    if (this.shape) {
      this.commitShape(this.getOptionsSafe());
      this.shape = null;
      this.shapePreview = null;
      this.draw();
    }
  }

  private onPointerCancel(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    this.pinch = null;
    this.pan = null;
    this.cancelStroke();
    this.shape = null;
    this.shapePreview = null;
    this.draw();
  }

  private cancelStroke(): void {
    if (this.stroke) {
      if (this.stroke.changed) {
        this.restore(this.stroke.before, false);
      }
      this.stroke = null;
    }
    if (this.shape) {
      this.shape = null;
      this.shapePreview = null;
    }
  }

  private startPinch(): void {
    const points = Array.from(this.pointers.values());
    if (points.length < 2) return;
    const a = this.clientToCanvas(points[0].x, points[0].y);
    const b = this.clientToCanvas(points[1].x, points[1].y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    this.pinch = {
      dist,
      zoom: this.view.zoom,
      cellX: (mid.x - this.originX) / this.cellPx,
      cellY: (mid.y - this.originY) / this.cellPx,
    };
  }

  private updatePinch(): void {
    const points = Array.from(this.pointers.values());
    if (points.length < 2 || !this.pinch) return;
    const a = this.clientToCanvas(points[0].x, points[0].y);
    const b = this.clientToCanvas(points[1].x, points[1].y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const zoom = clamp(this.pinch.zoom * (dist / this.pinch.dist), 0.25, 20);
    this.view.zoom = zoom;
    this.cellPx = this.baseCell * zoom;
    const bw = this.project.width * this.cellPx;
    const bh = this.project.height * this.cellPx;
    const centeredX = (this.cw - bw) / 2;
    const centeredY = (this.ch - bh) / 2;
    this.view.panX = mid.x - centeredX - this.pinch.cellX * this.cellPx;
    this.view.panY = mid.y - centeredY - this.pinch.cellY * this.cellPx;
    this.clampPan();
    this.computeView();
    this.draw();
    this.callbacks.onZoom(zoom);
  }

  private zoomAt(factor: number, sx = this.cw / 2, sy = this.ch / 2): void {
    const fx = (sx - this.originX) / this.cellPx;
    const fy = (sy - this.originY) / this.cellPx;
    const nextZoom = clamp(this.view.zoom * factor, 0.25, 20);
    if (Math.abs(nextZoom - this.view.zoom) < 0.0001) return;
    this.view.zoom = nextZoom;
    this.cellPx = this.baseCell * nextZoom;
    const bw = this.project.width * this.cellPx;
    const bh = this.project.height * this.cellPx;
    const centeredX = (this.cw - bw) / 2;
    const centeredY = (this.ch - bh) / 2;
    this.view.panX = sx - centeredX - fx * this.cellPx;
    this.view.panY = sy - centeredY - fy * this.cellPx;
    this.clampPan();
    this.computeView();
    this.draw();
    this.callbacks.onZoom(nextZoom);
  }

  zoomIn(): void { this.zoomAt(1.25); }
  zoomOut(): void { this.zoomAt(0.8); }

  zoomToCodes(): void {
    this.zoomAt(Math.max(1, READABLE_CODE_CELL / this.cellPx));
  }

  getCellSize(): number {
    return this.cellPx;
  }

  fit(): void {
    this.view.zoom = 1;
    this.view.panX = 0;
    this.view.panY = 0;
    this.computeView();
    this.draw();
    this.callbacks.onZoom(1);
  }

  private snapshot(): Snapshot {
    return {
      width: this.project.width,
      height: this.project.height,
      cells: this.project.cells.slice(),
    };
  }

  private restore(snapshot: Snapshot, emit = true): void {
    this.project.width = snapshot.width;
    this.project.height = snapshot.height;
    this.project.cells = snapshot.cells.slice();
    this.project.updatedAt = Date.now();
    this.resize();
    if (emit) this.callbacks.onChange('undo');
  }

  private pushHistory(snapshot: Snapshot): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): boolean {
    if (!this.undoStack.length) return false;
    const current = this.snapshot();
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(current);
    if (this.redoStack.length > HISTORY_LIMIT) this.redoStack.shift();
    this.restore(previous, false);
    this.callbacks.onChange('undo');
    return true;
  }

  redo(): boolean {
    if (!this.redoStack.length) return false;
    const current = this.snapshot();
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(current);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.restore(next, false);
    this.callbacks.onChange('redo');
    return true;
  }

  private setCell(x: number, y: number, value: number): boolean {
    if (x < 0 || y < 0 || x >= this.project.width || y >= this.project.height) return false;
    const index = y * this.project.width + x;
    if (this.project.cells[index] === value) return false;
    this.project.cells[index] = value;
    return true;
  }

  private applyPoint(x: number, y: number, value: number, symmetry: Symmetry): boolean {
    const w = this.project.width;
    const h = this.project.height;
    let changed = this.setCell(x, y, value);
    if (symmetry === 'h' || symmetry === 'both') changed = this.setCell(w - 1 - x, y, value) || changed;
    if (symmetry === 'v' || symmetry === 'both') changed = this.setCell(x, h - 1 - y, value) || changed;
    if (symmetry === 'both') changed = this.setCell(w - 1 - x, h - 1 - y, value) || changed;
    return changed;
  }

  private brushOffsets(brush: number): Point[] {
    if (brush <= 1) return [[0, 0]];
    if (brush === 2) return [[0, 0], [1, 0], [0, 1], [1, 1]];
    return [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  }

  private paintAt(x: number, y: number, opts: ReturnType<EditorEngine['getOptionsSafe']>): boolean {
    const value = opts.tool === 'eraser' ? EMPTY : opts.colorIndex;
    const offsets = this.brushOffsets(opts.brush);
    let changed = false;
    offsets.forEach(([dx, dy]) => {
      if (this.applyPoint(x + dx, y + dy, value, opts.symmetry)) changed = true;
    });
    if (changed && this.stroke) this.stroke.changed = true;
    return changed;
  }

  private paintLine(x0: number, y0: number, x1: number, y1: number, opts: ReturnType<EditorEngine['getOptionsSafe']>): void {
    bresenham(x0, y0, x1, y1).forEach(([x, y]) => this.paintAt(x, y, opts));
  }

  private floodFill(x: number, y: number, value: number): boolean {
    const w = this.project.width;
    const h = this.project.height;
    const cells = this.project.cells;
    const target = cells[y * w + x];
    if (target === value) return false;
    const stack: number[] = [x, y];
    let guard = 0;
    while (stack.length && guard < w * h * 4) {
      guard += 1;
      const cy = stack.pop() as number;
      const cx = stack.pop() as number;
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      const index = cy * w + cx;
      if (cells[index] !== target) continue;
      cells[index] = value;
      stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
    }
    return true;
  }

  private shapePoints(start: Point, end: Point, tool: ToolId, symmetry: Symmetry): Point[] {
    let points: Point[];
    if (tool === 'line') points = lineCells(start, end);
    else if (tool === 'rect') points = rectCells(start, end, true);
    else points = ellipseCells(start, end);
    if (symmetry === 'none') return points;
    const w = this.project.width;
    const h = this.project.height;
    const seen = new Set<string>();
    const result: Point[] = [];
    const add = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const key = `${x},${y}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push([x, y]);
    };
    points.forEach(([x, y]) => {
      add(x, y);
      if (symmetry === 'h' || symmetry === 'both') add(w - 1 - x, y);
      if (symmetry === 'v' || symmetry === 'both') add(x, h - 1 - y);
      if (symmetry === 'both') add(w - 1 - x, h - 1 - y);
    });
    return result;
  }

  private updateShapePreview(opts: ReturnType<EditorEngine['getOptionsSafe']>): void {
    if (!this.shape) return;
    this.shapePreview = {
      cells: this.shapePoints(this.shape.start, this.shape.current, opts.tool, opts.symmetry),
      color: opts.colorIndex,
    };
  }

  private commitShape(opts: ReturnType<EditorEngine['getOptionsSafe']>): void {
    if (!this.shape || !this.shapePreview) return;
    let changed = false;
    this.shapePreview.cells.forEach(([x, y]) => {
      if (this.setCell(x, y, opts.colorIndex)) changed = true;
    });
    if (changed) {
      this.pushHistory(this.shape.before);
      this.project.updatedAt = Date.now();
      this.callbacks.onChange('shape');
    }
  }

  /** 由外部（设置/图片导入）替换整个网格；会进入撤销栈。 */
  replaceAll(cells: Uint16Array, width: number, height: number, reason: ChangeReason = 'import'): void {
    const before = this.snapshot();
    this.project.width = width;
    this.project.height = height;
    this.project.cells = cells;
    this.project.updatedAt = Date.now();
    this.pushHistory(before);
    this.view.zoom = 1;
    this.view.panX = 0;
    this.view.panY = 0;
    this.resize();
    this.callbacks.onChange(reason);
  }

  /** 修改豆径与板型：只影响物理尺寸与板线，不改变格子内容。 */
  setBoard(beadSizeMm: 2.6 | 5, boardW: number, boardH: number): void {
    if (this.project.beadSizeMm === beadSizeMm && this.project.boardW === boardW && this.project.boardH === boardH) return;
    this.project.beadSizeMm = beadSizeMm;
    this.project.boardW = Math.max(1, Math.round(boardW));
    this.project.boardH = Math.max(1, Math.round(boardH));
    this.project.updatedAt = Date.now();
    this.draw();
    this.callbacks.onChange('transform');
  }

  resizeProject(width: number, height: number, anchor: Anchor): void {
    const nextWidth = clamp(Math.round(width), 1, 300);
    const nextHeight = clamp(Math.round(height), 1, 300);
    if (nextWidth === this.project.width && nextHeight === this.project.height) return;
    const before = this.snapshot();
    const grid = resizeGrid(this.grid(), nextWidth, nextHeight, anchor);
    this.project.width = grid.width;
    this.project.height = grid.height;
    this.project.cells = grid.cells;
    this.project.updatedAt = Date.now();
    this.pushHistory(before);
    this.view.zoom = 1;
    this.view.panX = 0;
    this.view.panY = 0;
    this.resize();
    this.callbacks.onChange('resize');
  }

  flip(horizontal: boolean): void {
    const before = this.snapshot();
    const grid = horizontal ? flipHorizontal(this.grid()) : flipVertical(this.grid());
    this.project.cells = grid.cells;
    this.project.updatedAt = Date.now();
    this.pushHistory(before);
    this.resize();
    this.callbacks.onChange('transform');
  }

  rotate(left = false): void {
    const before = this.snapshot();
    const grid = left ? rotateLeft(this.grid()) : rotateRight(this.grid());
    this.project.width = grid.width;
    this.project.height = grid.height;
    this.project.cells = grid.cells;
    this.project.updatedAt = Date.now();
    this.pushHistory(before);
    this.view.zoom = 1;
    this.view.panX = 0;
    this.view.panY = 0;
    this.resize();
    this.callbacks.onChange('transform');
  }

  replaceColor(from: number, to: number): boolean {
    if (from === to || from < 0 || to < 0) return false;
    const before = this.snapshot();
    let changed = false;
    for (let i = 0; i < this.project.cells.length; i += 1) {
      if (this.project.cells[i] === from) {
        this.project.cells[i] = to;
        changed = true;
      }
    }
    if (!changed) return false;
    this.project.updatedAt = Date.now();
    this.pushHistory(before);
    this.draw();
    this.callbacks.onChange('replace');
    return true;
  }

  /**
   * 补全图案内部被误删的空白：只补被豆子围住、与画布外边缘不连通的区域。
   * 返回补入的格数，0 表示没有可补的内部空洞。
   */
  fillHoles(): number {
    const result = fillInteriorHoles(this.project.cells, this.project.width, this.project.height);
    if (!result.filled) return 0;
    const before = this.snapshot();
    this.project.cells = result.cells;
    this.project.updatedAt = Date.now();
    this.pushHistory(before);
    this.draw();
    this.callbacks.onChange('fill');
    return result.filled;
  }

  clear(): void {
    const before = this.snapshot();
    this.project.cells = new Uint16Array(this.project.width * this.project.height);
    this.project.cells.fill(EMPTY);
    this.project.updatedAt = Date.now();
    this.pushHistory(before);
    this.draw();
    this.callbacks.onChange('clear');
  }

  private grid(): Grid {
    return { width: this.project.width, height: this.project.height, cells: this.project.cells };
  }

  onOptionsChanged(): void {
    this.shape = null;
    this.shapePreview = null;
    this.updateCursor();
    this.draw();
  }

  redraw(): void {
    this.draw();
  }

  private updateCursor(panning = false): void {
    const tool = this.options().tool;
    let cursor = 'crosshair';
    if (tool === 'pan') cursor = panning ? 'grabbing' : 'grab';
    else if (tool === 'fill') cursor = 'copy';
    else if (tool === 'eraser') cursor = 'cell';
    this.canvas.style.cursor = cursor;
  }

  getZoom(): number {
    return this.view.zoom;
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }
}
