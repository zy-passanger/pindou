/* 拼豆工坊 · 原型画布编辑器引擎 */
(function () {
  'use strict';

  var M = window.MOCK;
  var EMPTY = M.EMPTY;
  var palette = M.colors;
  var RULER = 24;

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function EditorCanvas(stage, project, opts) {
    this.stage = stage;
    this.project = project;
    this.opts = opts || {};
    this.history = this.opts.history || { undo: [], redo: [] };
    this.view = this.opts.view || { zoom: 1, panX: 0, panY: 0 };

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'editor-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-label', '拼豆画布。单指或鼠标绘制，双指缩放，滚轮缩放。');
    this.canvas.style.userSelect = 'none';
    stage.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.tool = this.opts.tool || 'pencil';
    this.brush = this.opts.brush || 1;
    this.symmetry = this.opts.symmetry || 'none';
    this.colorIndex = this.opts.colorIndex || 0;
    this.showCodes = !!this.opts.showCodes;
    this.showGrid = this.opts.showGrid !== false;

    this.cw = 1;
    this.ch = 1;
    this.baseCell = 8;
    this.cellPx = 8;
    this.originX = RULER;
    this.originY = RULER;
    this.dpr = 1;

    this.pointers = new Map();
    this.pending = null;
    this.stroke = null;
    this.shape = null;
    this.shapePreview = null;
    this.pan = null;
    this.pinch = null;
    this.hover = null;
    this.lastHoverKey = '';
    this.destroyed = false;
    this.raf = 0;

    this.bind();
    this.ro = new ResizeObserver(this.resize.bind(this));
    this.ro.observe(stage);
    this.resize();
  }

  EditorCanvas.prototype.bind = function () {
    var self = this;
    this.canvas.addEventListener('pointerdown', function (e) { self.onPointerDown(e); });
    this.canvas.addEventListener('pointermove', function (e) { self.onPointerMove(e); });
    this.canvas.addEventListener('pointerup', function (e) { self.onPointerUp(e); });
    this.canvas.addEventListener('pointercancel', function (e) { self.onPointerCancel(e); });
    this.canvas.addEventListener('pointerleave', function () {
      if (!self.pointers.size) {
        self.hover = null;
        self.lastHoverKey = '';
        if (self.opts.onHover) self.opts.onHover(null);
        self.draw();
      }
    });
    this.canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var pt = self.toCanvasPoint(e);
      self.zoomAt(Math.exp(-e.deltaY * 0.0015), pt.x, pt.y);
    }, { passive: false });
    this.canvas.addEventListener('dblclick', function (e) {
      var pt = self.toCanvasPoint(e);
      self.zoomAt(1.6, pt.x, pt.y);
    });
    this.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  EditorCanvas.prototype.resize = function () {
    if (this.destroyed) return;
    var cw = Math.max(1, this.stage.clientWidth);
    var ch = Math.max(1, this.stage.clientHeight);
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
    this.emitZoom();
  };

  EditorCanvas.prototype.computeFit = function () {
    var availW = Math.max(30, this.cw - RULER * 2 - 16);
    var availH = Math.max(30, this.ch - RULER * 2 - 16);
    this.baseCell = Math.max(1.5, Math.min(availW / this.project.width, availH / this.project.height));
  };

  EditorCanvas.prototype.computeView = function () {
    this.cellPx = this.baseCell * this.view.zoom;
    var bw = this.project.width * this.cellPx;
    var bh = this.project.height * this.cellPx;
    this.originX = (this.cw - bw) / 2 + this.view.panX;
    this.originY = (this.ch - bh) / 2 + this.view.panY;
  };

  EditorCanvas.prototype.clampPan = function () {
    var cw = this.cw;
    var ch = this.ch;
    var bw = this.project.width * this.cellPx;
    var bh = this.project.height * this.cellPx;
    var margin = 64;
    var maxX = Math.max(0, (cw + bw) / 2 - margin);
    var maxY = Math.max(0, (ch + bh) / 2 - margin);
    this.view.panX = clamp(this.view.panX, -maxX, maxX);
    this.view.panY = clamp(this.view.panY, -maxY, maxY);
  };

  EditorCanvas.prototype.toCanvasPoint = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    var scaleX = rect.width / this.cw || 1;
    var scaleY = rect.height / this.ch || 1;
    return {
      x: (e.clientX - rect.left) / scaleX,
      y: (e.clientY - rect.top) / scaleY
    };
  };

  EditorCanvas.prototype.clientToCanvas = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var scaleX = rect.width / this.cw || 1;
    var scaleY = rect.height / this.ch || 1;
    return {
      x: (clientX - rect.left) / scaleX,
      y: (clientY - rect.top) / scaleY
    };
  };

  EditorCanvas.prototype.cellAt = function (x, y) {
    var cx = Math.floor((x - this.originX) / this.cellPx);
    var cy = Math.floor((y - this.originY) / this.cellPx);
    if (cx < 0 || cy < 0 || cx >= this.project.width || cy >= this.project.height) return null;
    return { x: cx, y: cy };
  };

  /* ---------- 绘制 ---------- */

  EditorCanvas.prototype.draw = function () {
    if (this.destroyed) return;
    var ctx = this.ctx;
    var cw = this.cw;
    var ch = this.ch;
    this.computeView();

    var bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, '#F2EADD');
    bg.addColorStop(1, '#E8DECE');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    var w = this.project.width;
    var h = this.project.height;
    var cell = this.cellPx;
    var ox = this.originX;
    var oy = this.originY;
    var bw = w * cell;
    var bh = h * cell;
    var radius = Math.min(14, Math.max(3, cell * 1.5));

    ctx.save();
    ctx.shadowColor = 'rgba(70,52,30,.18)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 9;
    PindouCanvas.roundRect(ctx, ox, oy, bw, bh, radius);
    ctx.fillStyle = '#FFFCF5';
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(100,78,50,.22)';
    ctx.lineWidth = 1;
    PindouCanvas.roundRect(ctx, ox + 0.5, oy + 0.5, Math.max(1, bw - 1), Math.max(1, bh - 1), radius);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.clip();

    var x0 = Math.max(0, Math.floor((0 - ox) / cell));
    var x1 = Math.min(w - 1, Math.ceil((cw - ox) / cell));
    var y0 = Math.max(0, Math.floor((0 - oy) / cell));
    var y1 = Math.min(h - 1, Math.ceil((ch - oy) / cell));

    var gap = cell >= 7 ? Math.min(0.7, cell * 0.055) : 0;

    // 豆子
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var v = this.project.cells[y * w + x];
        if (v === EMPTY) continue;
        ctx.fillStyle = palette[v].hex;
        ctx.fillRect(
          ox + x * cell + gap,
          oy + y * cell + gap,
          Math.max(0.6, cell - gap * 2),
          Math.max(0.6, cell - gap * 2)
        );
      }
    }

    // 空格上的钉点
    if (this.showGrid && cell >= 9) {
      ctx.fillStyle = 'rgba(120,96,64,.14)';
      for (var ey = y0; ey <= y1; ey++) {
        for (var ex = x0; ex <= x1; ex++) {
          if (this.project.cells[ey * w + ex] !== EMPTY) continue;
          var dx = ox + ex * cell + cell / 2;
          var dy = oy + ey * cell + cell / 2;
          ctx.fillRect(dx - 0.45, dy - 0.45, 0.9, 0.9);
        }
      }
    }

    // 网格
    if (this.showGrid) {
      var step = cell >= 5 ? 1 : 5;
      for (var gx = x0; gx <= x1 + 1; gx++) {
        if (gx % step !== 0) continue;
        var px = ox + gx * cell;
        if (px < -1 || px > cw + 1) continue;
        var isBoardX = gx > 0 && gx % this.project.boardW === 0;
        var is10X = gx % 10 === 0;
        var is5X = gx % 5 === 0;
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
      for (var gy = y0; gy <= y1 + 1; gy++) {
        if (gy % step !== 0) continue;
        var py = oy + gy * cell;
        if (py < -1 || py > ch + 1) continue;
        var isBoardY = gy > 0 && gy % this.project.boardH === 0;
        var is10Y = gy % 10 === 0;
        var is5Y = gy % 5 === 0;
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
    }

    // 板边界（即使关闭网格也保留）
    if (this.showGrid) {
      ctx.strokeStyle = 'rgba(74,58,40,.40)';
      ctx.lineWidth = 1.5;
      for (var bx = this.project.boardW; bx < w; bx += this.project.boardW) {
        var bpx = ox + bx * cell;
        ctx.beginPath();
        ctx.moveTo(bpx, Math.max(0, oy));
        ctx.lineTo(bpx, Math.min(ch, oy + bh));
        ctx.stroke();
      }
      for (var by = this.project.boardH; by < h; by += this.project.boardH) {
        var bpy = oy + by * cell;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, ox), bpy);
        ctx.lineTo(Math.min(cw, ox + bw), bpy);
        ctx.stroke();
      }
    }

    // 格内色号
    if (this.showCodes && cell >= 20) {
      var fs = Math.min(9.5, Math.max(5.5, cell * 0.30));
      ctx.font = '600 ' + fs.toFixed(1) + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var cy = y0; cy <= y1; cy++) {
        for (var cx = x0; cx <= x1; cx++) {
          var cv = this.project.cells[cy * w + cx];
          if (cv === EMPTY) continue;
          var col = palette[cv];
          ctx.fillStyle = luminance(col.hex) > 158 ? 'rgba(42,36,30,.78)' : 'rgba(255,255,255,.86)';
          ctx.fillText(col.code, ox + cx * cell + cell / 2, oy + cy * cell + cell / 2 + 0.5);
        }
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // 图形工具预览
    if (this.shapePreview && this.shapePreview.cells.length) {
      ctx.save();
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = palette[this.shapePreview.color].hex;
      this.shapePreview.cells.forEach(function (c) {
        ctx.fillRect(ox + c[0] * cell, oy + c[1] * cell, cell, cell);
      });
      ctx.restore();
    }

    // 悬停格
    if (this.hover && this.pointers.size === 0) {
      ctx.strokeStyle = '#D95D4E';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        ox + this.hover.x * cell + 1,
        oy + this.hover.y * cell + 1,
        Math.max(1, cell - 2),
        Math.max(1, cell - 2)
      );
    }

    ctx.restore();
    this.drawRulers();
  };

  EditorCanvas.prototype.drawRulers = function () {
    var ctx = this.ctx;
    var cw = this.cw;
    var ch = this.ch;
    var cell = this.cellPx;
    var ox = this.originX;
    var oy = this.originY;
    var bw = this.project.width * cell;
    var bh = this.project.height * cell;
    var topY = oy - RULER;
    var leftX = ox - RULER;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.clip();

    // 贴着图纸的上/左标尺
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

    // 角落小豆
    var ccx = leftX + RULER / 2;
    var ccy = topY + RULER / 2;
    ctx.fillStyle = '#D95D4E';
    ctx.beginPath();
    ctx.arc(ccx, ccy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.beginPath();
    ctx.arc(ccx, ccy, 1.4, 0, Math.PI * 2);
    ctx.fill();

    var labelStep = cell >= 11 ? 5 : 10;
    var tickStep = cell >= 6 ? 1 : 5;

    ctx.fillStyle = '#8E8272';
    ctx.font = '500 8px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    var wx0 = Math.max(0, Math.floor((0 - ox) / cell));
    var wx1 = Math.min(this.project.width, Math.ceil((cw - ox) / cell));
    for (var x = wx0; x <= wx1; x++) {
      var px = ox + x * cell;
      if (px < ox - 0.5 || px > ox + bw - 2) continue;
      if (x % tickStep === 0) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(110,88,60,.24)';
        ctx.moveTo(px + 0.5, oy - 4);
        ctx.lineTo(px + 0.5, oy);
        ctx.stroke();
      }
      if (x % labelStep === 0 && x < this.project.width) {
        var label = String(x + 1);
        if (px + 2 + label.length * 4.8 <= ox + bw) ctx.fillText(label, px + 2, topY + 5);
      }
    }

    var hy0 = Math.max(0, Math.floor((0 - oy) / cell));
    var hy1 = Math.min(this.project.height, Math.ceil((ch - oy) / cell));
    ctx.textBaseline = 'middle';
    for (var y = hy0; y <= hy1; y++) {
      var py = oy + y * cell;
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
  };

  /* ---------- 交互 ---------- */

  EditorCanvas.prototype.onPointerDown = function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.canvas.setPointerCapture) {
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

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

    var pt = this.toCanvasPoint(e);
    var cell = this.cellAt(pt.x, pt.y);
    this.pending = { id: e.pointerId, startX: pt.x, startY: pt.y };

    if (this.tool === 'pan') {
      this.pan = { startX: pt.x, startY: pt.y, panX: this.view.panX, panY: this.view.panY };
      this.updateCursor(true);
      return;
    }

    if (!cell) return;

    if (this.tool === 'eyedropper') {
      var v = this.project.cells[cell.y * this.project.width + cell.x];
      if (v !== EMPTY && this.opts.onPick) this.opts.onPick(v);
      return;
    }

    if (this.tool === 'fill') {
      var before = this.snapshot();
      if (this.floodFill(cell.x, cell.y, this.colorIndex)) {
        this.pushHistory(before);
        this.draw();
        this.emitChange();
      }
      return;
    }

    if (this.tool === 'pencil' || this.tool === 'eraser') {
      this.stroke = { before: this.snapshot(), changed: false, last: cell };
      this.paintAt(cell.x, cell.y);
      this.draw();
      return;
    }

    if (this.tool === 'line' || this.tool === 'rect' || this.tool === 'ellipse') {
      this.shape = { start: cell, current: cell, before: this.snapshot(), changed: false };
      this.updateShapePreview();
      this.draw();
    }
  };

  EditorCanvas.prototype.onPointerMove = function (e) {
    var p = this.pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }

    if (this.pinch) {
      this.updatePinch();
      return;
    }

    var pt = this.toCanvasPoint(e);
    var cell = this.cellAt(pt.x, pt.y);
    var key = cell ? cell.x + ',' + cell.y : '';
    if (key !== this.lastHoverKey) {
      this.lastHoverKey = key;
      this.hover = cell;
      if (this.opts.onHover) this.opts.onHover(cell);
      if (!this.stroke && !this.shape) this.draw();
    }

    if (this.pan) {
      this.view.panX = this.pan.panX + (pt.x - this.pan.startX);
      this.view.panY = this.pan.panY + (pt.y - this.pan.startY);
      this.clampPan();
      this.computeView();
      this.draw();
      return;
    }

    if (this.stroke) {
      if (!cell) return;
      var last = this.stroke.last;
      this.paintLine(last.x, last.y, cell.x, cell.y);
      this.stroke.last = cell;
      this.draw();
      return;
    }

    if (this.shape) {
      if (cell) {
        this.shape.current = cell;
        this.updateShapePreview();
        this.draw();
      }
    }
  };

  EditorCanvas.prototype.onPointerUp = function (e) {
    this.pointers.delete(e.pointerId);

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
        this.emitChange();
      }
      this.stroke = null;
      this.draw();
      return;
    }

    if (this.shape) {
      this.commitShape();
      this.shape = null;
      this.shapePreview = null;
      this.draw();
      return;
    }

    this.pending = null;
  };

  EditorCanvas.prototype.onPointerCancel = function (e) {
    this.pointers.delete(e.pointerId);
    this.pinch = null;
    this.pan = null;
    this.cancelStroke();
    if (this.shape) {
      this.shape = null;
      this.shapePreview = null;
    }
    this.draw();
  };

  EditorCanvas.prototype.cancelStroke = function () {
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
  };

  EditorCanvas.prototype.startPinch = function () {
    var pts = Array.from(this.pointers.values());
    if (pts.length < 2) return;
    var a = this.clientToCanvas(pts[0].x, pts[0].y);
    var b = this.clientToCanvas(pts[1].x, pts[1].y);
    var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    var dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    this.pinch = {
      dist: dist,
      zoom: this.view.zoom,
      cellX: (mid.x - this.originX) / this.cellPx,
      cellY: (mid.y - this.originY) / this.cellPx
    };
  };

  EditorCanvas.prototype.updatePinch = function () {
    var pts = Array.from(this.pointers.values());
    if (pts.length < 2 || !this.pinch) return;
    var a = this.clientToCanvas(pts[0].x, pts[0].y);
    var b = this.clientToCanvas(pts[1].x, pts[1].y);
    var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    var dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    var z = clamp(this.pinch.zoom * (dist / this.pinch.dist), 0.25, 10);
    this.view.zoom = z;
    this.cellPx = this.baseCell * z;
    var cw = this.cw;
    var ch = this.ch;
    var bw = this.project.width * this.cellPx;
    var bh = this.project.height * this.cellPx;
    var centeredX = (cw - bw) / 2;
    var centeredY = (ch - bh) / 2;
    this.view.panX = mid.x - centeredX - this.pinch.cellX * this.cellPx;
    this.view.panY = mid.y - centeredY - this.pinch.cellY * this.cellPx;
    this.clampPan();
    this.computeView();
    this.draw();
    this.emitZoom();
  };

  EditorCanvas.prototype.zoomAt = function (factor, sx, sy) {
    if (sx === undefined) sx = this.cw / 2;
    if (sy === undefined) sy = this.ch / 2;
    var fx = (sx - this.originX) / this.cellPx;
    var fy = (sy - this.originY) / this.cellPx;
    var nz = clamp(this.view.zoom * factor, 0.25, 10);
    if (Math.abs(nz - this.view.zoom) < 0.0001) return;
    this.view.zoom = nz;
    this.cellPx = this.baseCell * nz;
    var cw = this.cw;
    var ch = this.ch;
    var bw = this.project.width * this.cellPx;
    var bh = this.project.height * this.cellPx;
    var centeredX = (cw - bw) / 2;
    var centeredY = (ch - bh) / 2;
    this.view.panX = sx - centeredX - fx * this.cellPx;
    this.view.panY = sy - centeredY - fy * this.cellPx;
    this.clampPan();
    this.computeView();
    this.draw();
    this.emitZoom();
  };

  EditorCanvas.prototype.zoomIn = function () { this.zoomAt(1.25); };
  EditorCanvas.prototype.zoomOut = function () { this.zoomAt(0.8); };
  EditorCanvas.prototype.fit = function () {
    this.view.zoom = 1;
    this.view.panX = 0;
    this.view.panY = 0;
    this.computeView();
    this.draw();
    this.emitZoom();
  };

  /* ---------- 编辑 ---------- */

  EditorCanvas.prototype.snapshot = function () {
    return {
      width: this.project.width,
      height: this.project.height,
      cells: this.project.cells.slice()
    };
  };

  EditorCanvas.prototype.restore = function (snap, emit) {
    this.project.width = snap.width;
    this.project.height = snap.height;
    this.project.cells = snap.cells.slice();
    this.project.updatedLabel = '刚刚';
    this.resize();
    if (emit !== false) this.emitChange();
  };

  EditorCanvas.prototype.pushHistory = function (snap) {
    this.history.undo.push(snap);
    if (this.history.undo.length > 40) this.history.undo.shift();
    this.history.redo.length = 0;
  };

  EditorCanvas.prototype.undo = function () {
    if (!this.history.undo.length) return false;
    var current = this.snapshot();
    var prev = this.history.undo.pop();
    this.history.redo.push(current);
    if (this.history.redo.length > 40) this.history.redo.shift();
    this.restore(prev);
    return true;
  };

  EditorCanvas.prototype.redo = function () {
    if (!this.history.redo.length) return false;
    var current = this.snapshot();
    var next = this.history.redo.pop();
    this.history.undo.push(current);
    if (this.history.undo.length > 40) this.history.undo.shift();
    this.restore(next);
    return true;
  };

  EditorCanvas.prototype.capture = function () {
    return this.snapshot();
  };

  EditorCanvas.prototype.commitExternal = function (snap) {
    this.pushHistory(snap);
    this.project.updatedLabel = '刚刚';
    this.resize();
    this.emitChange();
  };

  EditorCanvas.prototype.setCell = function (x, y, value) {
    var w = this.project.width;
    var h = this.project.height;
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    var i = y * w + x;
    if (this.project.cells[i] === value) return false;
    this.project.cells[i] = value;
    return true;
  };

  EditorCanvas.prototype.applyPoint = function (x, y, value) {
    var w = this.project.width;
    var h = this.project.height;
    var changed = this.setCell(x, y, value);
    var sym = this.symmetry;
    if (sym === 'h' || sym === 'both') changed = this.setCell(w - 1 - x, y, value) || changed;
    if (sym === 'v' || sym === 'both') changed = this.setCell(x, h - 1 - y, value) || changed;
    if (sym === 'both') changed = this.setCell(w - 1 - x, h - 1 - y, value) || changed;
    return changed;
  };

  EditorCanvas.prototype.brushOffsets = function () {
    if (this.brush <= 1) return [[0, 0]];
    if (this.brush === 2) return [[0, 0], [1, 0], [0, 1], [1, 1]];
    return [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  };

  EditorCanvas.prototype.paintAt = function (x, y) {
    var value = this.tool === 'eraser' ? EMPTY : this.colorIndex;
    var offsets = this.brushOffsets();
    var changed = false;
    for (var i = 0; i < offsets.length; i++) {
      if (this.applyPoint(x + offsets[i][0], y + offsets[i][1], value)) changed = true;
    }
    if (changed && this.stroke) this.stroke.changed = true;
    return changed;
  };

  EditorCanvas.prototype.paintLine = function (x0, y0, x1, y1) {
    var dx = Math.abs(x1 - x0);
    var dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1;
    var sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    var guard = 0;
    while (guard++ < 2000) {
      this.paintAt(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  };

  EditorCanvas.prototype.floodFill = function (x, y, value) {
    var w = this.project.width;
    var h = this.project.height;
    var cells = this.project.cells;
    var target = cells[y * w + x];
    if (target === value) return false;
    var stack = [x, y];
    var guard = 0;
    while (stack.length && guard++ < w * h * 4) {
      var cy = stack.pop();
      var cx = stack.pop();
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      var i = cy * w + cx;
      if (cells[i] !== target) continue;
      cells[i] = value;
      stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
    }
    return true;
  };

  EditorCanvas.prototype.shapeCells = function (a, b) {
    var w = this.project.width;
    var h = this.project.height;
    var list = [];
    var seen = {};
    var add = function (x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      var key = x + ',' + y;
      if (seen[key]) return;
      seen[key] = 1;
      list.push([x, y]);
    };
    var addSym = function (x, y) {
      add(x, y);
      if (this.symmetry === 'h' || this.symmetry === 'both') add(w - 1 - x, y);
      if (this.symmetry === 'v' || this.symmetry === 'both') add(x, h - 1 - y);
      if (this.symmetry === 'both') add(w - 1 - x, h - 1 - y);
    }.bind(this);

    if (this.tool === 'line') {
      var x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
      var dx = Math.abs(x1 - x0);
      var dy = Math.abs(y1 - y0);
      var sx = x0 < x1 ? 1 : -1;
      var sy = y0 < y1 ? 1 : -1;
      var err = dx - dy;
      var guard = 0;
      while (guard++ < 2000) {
        addSym(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        var e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
      }
    } else if (this.tool === 'rect') {
      var rx0 = Math.min(a.x, b.x), rx1 = Math.max(a.x, b.x);
      var ry0 = Math.min(a.y, b.y), ry1 = Math.max(a.y, b.y);
      for (var ry = ry0; ry <= ry1; ry++) {
        for (var rx = rx0; rx <= rx1; rx++) addSym(rx, ry);
      }
    } else if (this.tool === 'ellipse') {
      var cx = (a.x + b.x) / 2;
      var cy = (a.y + b.y) / 2;
      var rxr = Math.max(0.5, Math.abs(b.x - a.x) / 2 + 0.5);
      var ryr = Math.max(0.5, Math.abs(b.y - a.y) / 2 + 0.5);
      for (var ey = Math.floor(cy - ryr); ey <= Math.ceil(cy + ryr); ey++) {
        for (var ex = Math.floor(cx - rxr); ex <= Math.ceil(cx + rxr); ex++) {
          var ndx = (ex + 0.5 - cx) / rxr;
          var ndy = (ey + 0.5 - cy) / ryr;
          if (ndx * ndx + ndy * ndy <= 1) addSym(ex, ey);
        }
      }
    }
    return list;
  };

  EditorCanvas.prototype.updateShapePreview = function () {
    if (!this.shape) return;
    this.shapePreview = {
      cells: this.shapeCells(this.shape.start, this.shape.current),
      color: this.colorIndex
    };
  };

  EditorCanvas.prototype.commitShape = function () {
    if (!this.shape || !this.shapePreview) return;
    var cells = this.shapePreview.cells;
    if (!cells.length) return;
    var changed = false;
    for (var i = 0; i < cells.length; i++) {
      if (this.setCell(cells[i][0], cells[i][1], this.colorIndex)) changed = true;
    }
    if (changed) {
      this.pushHistory(this.shape.before);
      this.emitChange();
    }
  };

  EditorCanvas.prototype.emitChange = function () {
    if (this.opts.onChange) this.opts.onChange();
  };

  EditorCanvas.prototype.emitZoom = function () {
    if (this.opts.onZoom) this.opts.onZoom(this.view.zoom);
  };

  EditorCanvas.prototype.updateCursor = function (panning) {
    var cur = 'crosshair';
    if (this.tool === 'pan') cur = panning ? 'grabbing' : 'grab';
    else if (this.tool === 'fill') cur = 'copy';
    else if (this.tool === 'eraser') cur = 'cell';
    this.canvas.style.cursor = cur;
  };

  EditorCanvas.prototype.setTool = function (tool) {
    this.tool = tool;
    this.pan = null;
    this.updateCursor(false);
  };

  EditorCanvas.prototype.setColor = function (index) {
    this.colorIndex = index;
  };

  EditorCanvas.prototype.setBrush = function (n) {
    this.brush = n;
  };

  EditorCanvas.prototype.setSymmetry = function (sym) {
    this.symmetry = sym;
  };

  EditorCanvas.prototype.setShowCodes = function (v) {
    this.showCodes = !!v;
    this.draw();
  };

  EditorCanvas.prototype.setShowGrid = function (v) {
    this.showGrid = !!v;
    this.draw();
  };

  EditorCanvas.prototype.destroy = function () {
    this.destroyed = true;
    if (this.ro) this.ro.disconnect();
    this.canvas.remove();
  };

  window.EditorCanvas = EditorCanvas;
})();
