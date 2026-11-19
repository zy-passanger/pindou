/* 拼豆工坊 · 原型画布渲染工具 */
(function () {
  'use strict';

  var M = window.MOCK;
  var EMPTY = M.EMPTY;
  var palette = M.colors;

  function sizeCanvas(canvas) {
    var w = Math.max(1, Math.round(canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 1));
    var h = Math.max(1, Math.round(canvas.clientHeight || (canvas.parentElement && canvas.parentElement.clientHeight) || 1));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pw = Math.round(w * dpr);
    var ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h, dpr: dpr };
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function renderPatternCore(ctx, cw, ch, pattern, opts) {
    opts = opts || {};
    var pad = opts.pad !== undefined ? opts.pad : 16;
    var photo = !!opts.photo;
    var board = opts.board !== false;
    var grid = !!opts.grid;
    var transparent = !!opts.transparent;

    if (!opts.noClear) ctx.clearRect(0, 0, cw, ch);

    if (!transparent) {
      if (photo) {
        var bg = ctx.createLinearGradient(0, 0, cw, ch);
        bg.addColorStop(0, '#F7EFE1');
        bg.addColorStop(0.55, '#EFE3D0');
        bg.addColorStop(1, '#E4D5BD');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, cw, ch);
      } else if (opts.background) {
        ctx.fillStyle = opts.background;
        ctx.fillRect(0, 0, cw, ch);
      }
    }

    var availW = Math.max(1, cw - pad * 2);
    var availH = Math.max(1, ch - pad * 2);
    var cell = Math.min(availW / pattern.width, availH / pattern.height);
    var bw = cell * pattern.width;
    var bh = cell * pattern.height;
    var x0 = (cw - bw) / 2;
    var y0 = (ch - bh) / 2;

    if (board || photo) {
      ctx.save();
      ctx.shadowColor = photo ? 'rgba(70,52,30,.24)' : 'rgba(70,52,30,.14)';
      ctx.shadowBlur = Math.min(photo ? 28 : 18, Math.max(6, cell * (photo ? 3 : 2)));
      ctx.shadowOffsetY = Math.min(photo ? 10 : 7, Math.max(2, cell * (photo ? 1.4 : 0.9)));
      roundRect(ctx, x0, y0, bw, bh, Math.min(photo ? 18 : 12, Math.max(4, cell * 1.6)));
      ctx.fillStyle = '#FFFCF5';
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(100,78,50,.16)';
      ctx.lineWidth = 1;
      roundRect(ctx, x0 + 0.5, y0 + 0.5, bw - 1, bh - 1, Math.min(photo ? 18 : 12, Math.max(4, cell * 1.6)));
      ctx.stroke();
    }

    var gap = cell >= 5 ? Math.min(0.8, cell * 0.07) : 0;

    for (var y = 0; y < pattern.height; y++) {
      for (var x = 0; x < pattern.width; x++) {
        var v = pattern.cells[y * pattern.width + x];
        if (v === EMPTY) continue;
        var c = palette[v];
        var px = x0 + x * cell;
        var py = y0 + y * cell;
        ctx.fillStyle = c.hex;

        if (photo && cell >= 3.5) {
          roundRect(ctx, px + gap, py + gap, cell - gap * 2, cell - gap * 2, Math.min(cell * 0.34, 3.4));
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.18)';
          ctx.beginPath();
          ctx.arc(px + cell * 0.34, py + cell * 0.30, Math.max(0.6, cell * 0.11), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(px + gap, py + gap, cell - gap * 2, cell - gap * 2);
        }
      }
    }

    if (grid && cell >= 3) {
      ctx.strokeStyle = 'rgba(90,72,50,.14)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (var gx = 0; gx <= pattern.width; gx++) {
        var lx = x0 + gx * cell;
        ctx.moveTo(lx, y0);
        ctx.lineTo(lx, y0 + bh);
      }
      for (var gy = 0; gy <= pattern.height; gy++) {
        var ly = y0 + gy * cell;
        ctx.moveTo(x0, ly);
        ctx.lineTo(x0 + bw, ly);
      }
      ctx.stroke();
    }

    if (opts.border !== false) {
      ctx.strokeStyle = 'rgba(80,62,42,.20)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, bw - 1, bh - 1);
    }

    if (photo) {
      var vg = ctx.createRadialGradient(cw / 2, ch * 0.42, Math.min(cw, ch) * 0.2, cw / 2, ch * 0.5, Math.max(cw, ch) * 0.76);
      vg.addColorStop(0, 'rgba(255,255,255,0)');
      vg.addColorStop(1, 'rgba(80,55,30,.10)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, cw, ch);
    }

    return { x0: x0, y0: y0, cell: cell, bw: bw, bh: bh };
  }

  function drawThumb(canvas, project) {
    var s = sizeCanvas(canvas);
    s.ctx.clearRect(0, 0, s.w, s.h);
    var pad = Math.max(9, Math.min(s.w, s.h) * 0.075);
    renderPatternCore(s.ctx, s.w, s.h, project, {
      transparent: true,
      board: true,
      pad: pad
    });
  }

  function drawSampleThumb(canvas, sample) {
    var s = sizeCanvas(canvas);
    renderPatternCore(s.ctx, s.w, s.h, sample.pattern, {
      photo: true,
      pad: Math.max(8, Math.min(s.w, s.h) * 0.08)
    });
  }

  function drawPatternPreview(canvas, pattern, opts) {
    opts = opts || {};
    var s = sizeCanvas(canvas);
    renderPatternCore(s.ctx, s.w, s.h, pattern, {
      background: opts.background || '#F4ECDD',
      board: true,
      grid: !!opts.grid,
      pad: opts.pad !== undefined ? opts.pad : Math.max(10, Math.min(s.w, s.h) * 0.045)
    });
  }

  function drawPhoto(canvas, pattern) {
    var s = sizeCanvas(canvas);
    renderPatternCore(s.ctx, s.w, s.h, pattern, {
      photo: true,
      pad: Math.max(12, Math.min(s.w, s.h) * 0.08)
    });
  }

  function drawCrop(canvas, sample, opts) {
    var s = sizeCanvas(canvas);
    var w = s.w;
    var h = s.h;
    var ctx = s.ctx;
    var size = Math.min(w, h);
    var ox = (w - size) / 2;
    var oy = (h - size) / 2;

    ctx.fillStyle = '#DCD0BD';
    ctx.fillRect(0, 0, w, h);

    var off = document.createElement('canvas');
    off.width = 640;
    off.height = 640;
    var octx = off.getContext('2d');
    renderPatternCore(octx, 640, 640, sample.pattern, {
      photo: true,
      pad: 54
    });

    var base = opts.fit === 'contain' ? Math.min(size / 640, size / 640) : Math.max(size / 640, size / 640);
    var scale = base * opts.zoom;

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, size, size);
    ctx.clip();
    ctx.translate(ox + size / 2, oy + size / 2);
    ctx.rotate((opts.rotate || 0) * Math.PI / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(off, -320, -320);
    ctx.restore();

    // 三分线
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = 1;
    for (var i = 1; i <= 2; i++) {
      var px = ox + (size * i) / 3;
      var py = oy + (size * i) / 3;
      ctx.beginPath();
      ctx.moveTo(px, oy);
      ctx.lineTo(px, oy + size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ox, py);
      ctx.lineTo(ox + size, py);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,253,247,.9)';
    ctx.lineWidth = 2;
    var corner = Math.min(22, size * 0.09);
    var inset = 7;
    [[ox + inset, oy + inset, 1, 1], [ox + size - inset, oy + inset, -1, 1],
      [ox + inset, oy + size - inset, 1, -1], [ox + size - inset, oy + size - inset, -1, -1]].forEach(function (c) {
      ctx.beginPath();
      ctx.moveTo(c[0] + c[2] * corner, c[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(c[0], c[1] + c[3] * corner);
      ctx.stroke();
    });
    ctx.restore();

    var vg = ctx.createRadialGradient(w / 2, h / 2, size * 0.28, w / 2, h / 2, size * 0.76);
    vg.addColorStop(0, 'rgba(40,30,20,0)');
    vg.addColorStop(1, 'rgba(40,30,20,.16)');
    ctx.fillStyle = vg;
    ctx.fillRect(ox, oy, size, size);
  }

  function drawBlueprint(canvas, project, opts) {
    opts = opts || {};
    var s = sizeCanvas(canvas);
    var ctx = s.ctx;
    var w = s.w;
    var h = s.h;

    ctx.fillStyle = '#FFFDF7';
    ctx.fillRect(0, 0, w, h);

    var legendH = opts.legend ? Math.min(30, h * 0.2) : 0;
    var patternAreaH = h - legendH;
    var p = {
      width: project.width,
      height: project.height,
      cells: project.cells
    };
    renderPatternCore(ctx, w, patternAreaH, p, {
      transparent: true,
      noClear: true,
      board: false,
      grid: !!opts.grid,
      pad: Math.max(8, Math.min(w, patternAreaH) * 0.04),
      border: false
    });

    if (opts.legend) {
      var used = {};
      for (var i = 0; i < project.cells.length; i++) {
        var v = project.cells[i];
        if (v !== EMPTY) used[v] = (used[v] || 0) + 1;
      }
      var entries = Object.keys(used).map(function (k) { return { c: palette[k], n: used[k] }; })
        .sort(function (a, b) { return b.n - a.n; }).slice(0, 10);
      var ly = patternAreaH + legendH / 2;
      var lx = 10;
      ctx.font = '500 7px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'middle';
      entries.forEach(function (e, idx) {
        if (lx > w - 34) return;
        ctx.fillStyle = e.c.hex;
        ctx.beginPath();
        ctx.arc(lx + 4, ly, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.08)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.fillStyle = '#7B7164';
        ctx.fillText(e.c.code, lx + 11, ly + 0.5);
        lx += 15 + ctx.measureText(e.c.code).width + 8;
      });
    }

    if (opts.grid !== false) {
      ctx.strokeStyle = 'rgba(90,72,50,.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    }
  }

  function drawPdfPreview(canvas, project, opts) {
    opts = opts || {};
    var s = sizeCanvas(canvas);
    var ctx = s.ctx;
    var w = s.w;
    var h = s.h;

    ctx.fillStyle = '#E9E1D3';
    ctx.fillRect(0, 0, w, h);

    var pageH = h - 10;
    var pageW = pageH * (210 / 297);
    if (pageW > w - 20) {
      pageW = w - 20;
      pageH = pageW * (297 / 210);
    }
    var px = (w - pageW) / 2;
    var py = (h - pageH) / 2 + 2;

    // 页面堆叠
    if ((opts.pages || 1) > 1) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      roundRect(ctx, px + 5, py - 4, pageW, pageH, 3);
      ctx.fillStyle = '#FFFDF7';
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = 'rgba(50,36,20,.18)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, px, py, pageW, pageH, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    var margin = Math.max(5, pageW * 0.055);
    // 顶部标题
    ctx.fillStyle = '#2A241E';
    ctx.font = '600 ' + Math.max(5, pageW * 0.036) + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(project.name || '拼豆图纸', px + margin, py + margin);
    ctx.fillStyle = '#9C9080';
    ctx.font = '400 ' + Math.max(3.5, pageW * 0.021) + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(project.width + ' × ' + project.height + ' · ' + project.beadSizeMm + 'mm', px + margin, py + margin + pageW * 0.05);

    var contentY = py + margin + pageW * 0.095;
    var contentH = pageH - (contentY - py) - margin - pageH * 0.10;
    var contentW = pageW - margin * 2;
    ctx.save();
    ctx.translate(px + margin, contentY);
    renderPatternCore(ctx, contentW, contentH, { width: project.width, height: project.height, cells: project.cells }, {
      transparent: true,
      noClear: true,
      board: false,
      grid: !!opts.grid,
      pad: 2,
      border: false
    });
    ctx.restore();

    // 图例条
    var ly = py + pageH - margin - pageH * 0.045;
    ctx.fillStyle = '#F4ECDD';
    roundRect(ctx, px + margin, ly - 3, contentW, Math.max(8, pageH * 0.055), 2);
    ctx.fill();
    var used = {};
    for (var i = 0; i < project.cells.length; i++) {
      var v = project.cells[i];
      if (v !== EMPTY) used[v] = (used[v] || 0) + 1;
    }
    var entries = Object.keys(used).slice(0, 8);
    var lx = px + margin + 4;
    entries.forEach(function (k) {
      ctx.fillStyle = palette[k].hex;
      ctx.beginPath();
      ctx.arc(lx + 2.5, ly + 2.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
      lx += 7;
    });
    ctx.fillStyle = '#7B7164';
    ctx.font = '400 ' + Math.max(3, pageW * 0.018) + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('共 ' + (opts.pages || 1) + ' 页', px + pageW - margin - pageW * 0.12, ly);

    // 页脚页码
    ctx.fillStyle = '#B0A596';
    ctx.font = '400 ' + Math.max(3, pageW * 0.017) + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('1 / ' + (opts.pages || 1), px + pageW - margin, py + pageH - margin + 1);
    ctx.textAlign = 'left';
  }

  window.PindouCanvas = {
    sizeCanvas: sizeCanvas,
    roundRect: roundRect,
    renderPatternCore: renderPatternCore,
    drawThumb: drawThumb,
    drawSampleThumb: drawSampleThumb,
    drawPatternPreview: drawPatternPreview,
    drawPhoto: drawPhoto,
    drawCrop: drawCrop,
    drawBlueprint: drawBlueprint,
    drawPdfPreview: drawPdfPreview
  };
})();
