/* 拼豆工坊 · 交互原型应用 */
(function () {
  'use strict';

  var M = window.MOCK;
  var EMPTY = M.EMPTY;
  var palette = M.colors;
  var byCode = M.byCode;
  var indexOfCode = M.indexOf;
  var PC = window.PindouCanvas;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmt(n) { return Number(n || 0).toLocaleString('zh-CN'); }
  function pct(n, total) { return total ? (n / total) * 100 : 0; }

  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var num = parseInt(h, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function luminance(hex) {
    var c = hexToRgb(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  }

  function rgbDistance(rgb, hex) {
    var c = hexToRgb(hex);
    var dr = rgb.r - c.r, dg = rgb.g - c.g, db = rgb.b - c.b;
    return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
  }

  function adjustHex(hex, brightness, contrast, saturation) {
    var c = hexToRgb(hex);
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var br = brightness / 100, co = contrast / 100, sa = saturation / 100;
    r = (r - 0.5) * co + 0.5;
    g = (g - 0.5) * co + 0.5;
    b = (b - 0.5) * co + 0.5;
    var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = lum + (r - lum) * sa;
    g = lum + (g - lum) * sa;
    b = lum + (b - lum) * sa;
    r = clamp(r * br, 0, 1);
    g = clamp(g * br, 0, 1);
    b = clamp(b * br, 0, 1);
    return '#' + [r, g, b].map(function (v) {
      var n = Math.round(v * 255).toString(16);
      return n.length === 1 ? '0' + n : n;
    }).join('');
  }

  function nearestPaletteIndex(rgb, allowed) {
    var best = -1, bestD = Infinity;
    for (var i = 0; i < palette.length; i++) {
      if (allowed && !allowed.has(palette[i].code)) continue;
      var d = rgbDistance(rgb, palette[i].hex);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) {
      for (var j = 0; j < palette.length; j++) {
        var dj = rgbDistance(rgb, palette[j].hex);
        if (dj < bestD) { bestD = dj; best = j; }
      }
    }
    return best;
  }

  function statsOfCells(cells) {
    var counts = {};
    for (var i = 0; i < cells.length; i++) {
      var v = cells[i];
      if (v === EMPTY) continue;
      counts[v] = (counts[v] || 0) + 1;
    }
    var list = Object.keys(counts).map(function (k) {
      var idx = Number(k);
      return { index: idx, color: palette[idx], count: counts[k] };
    }).sort(function (a, b) { return b.count - a.count; });
    var total = list.reduce(function (sum, item) { return sum + item.count; }, 0);
    return { total: total, list: list, colorCount: list.length };
  }

  function statsOfProject(project) {
    return statsOfCells(project.cells);
  }

  function statsOfPattern(pattern) {
    return statsOfCells(pattern.cells);
  }

  function physicalSize(project) {
    var w = (project.width * project.beadSizeMm / 10).toFixed(1);
    var h = (project.height * project.beadSizeMm / 10).toFixed(1);
    return w + ' × ' + h + ' cm';
  }

  function boardCount(project) {
    return Math.ceil(project.width / project.boardW) * Math.ceil(project.height / project.boardH);
  }

  function mostUsedCode(project) {
    var stats = statsOfProject(project);
    return stats.list.length ? stats.list[0].color.code : null;
  }

  function cloneProject(project) {
    return {
      id: project.id,
      name: project.name,
      width: project.width,
      height: project.height,
      boardW: project.boardW,
      boardH: project.boardH,
      beadSizeMm: project.beadSizeMm,
      cells: project.cells.slice(),
      updatedLabel: project.updatedLabel,
      createdAt: project.createdAt || Date.now()
    };
  }

  function newProjectId() {
    return 'p-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 9999).toString(36);
  }

  function projectFromPattern(pattern, name, beadSize) {
    var bead = beadSize || 2.6;
    return {
      id: newProjectId(),
      name: name || '未命名图纸',
      width: pattern.width,
      height: pattern.height,
      boardW: bead === 5 ? 29 : 52,
      boardH: bead === 5 ? 29 : 52,
      beadSizeMm: bead,
      cells: pattern.cells.slice(),
      updatedLabel: '刚刚',
      createdAt: Date.now()
    };
  }

  function emptyProject(width, height, name, beadSize) {
    var bead = beadSize || 2.6;
    var cells = new Uint16Array(width * height);
    cells.fill(EMPTY);
    return {
      id: newProjectId(),
      name: name || '未命名图纸',
      width: width,
      height: height,
      boardW: bead === 5 ? 29 : 52,
      boardH: bead === 5 ? 29 : 52,
      beadSizeMm: bead,
      cells: cells,
      updatedLabel: '刚刚',
      createdAt: Date.now()
    };
  }

  function getProject() {
    for (var i = 0; i < state.projects.length; i++) {
      if (state.projects[i].id === state.currentProjectId) return state.projects[i];
    }
    return null;
  }

  function symLabel(sym) {
    return sym === 'h' ? '水平' : sym === 'v' ? '垂直' : sym === 'both' ? '四向' : '关';
  }

  function toolLabel(tool) {
    return ({
      pencil: '画笔', eraser: '橡皮', fill: '填充', eyedropper: '吸管',
      line: '直线', rect: '矩形', ellipse: '椭圆', pan: '平移'
    })[tool] || '画笔';
  }

  function isOtherSeries(color) {
    return ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].indexOf(color.series) === -1;
  }

  function seriesMatches(color, filter) {
    if (filter === 'all') return true;
    if (filter === '其他') return isOtherSeries(color);
    return color.series === filter;
  }

  /* ---------- 状态 ---------- */

  function freshState() {
    return {
      view: 'home',
      layout: 'wide',
      initialized: false,
      projects: M.projects.map(cloneProject),
      currentProjectId: null,
      selectedColor: 'F04',
      tool: 'pencil',
      brushSize: 1,
      symmetry: 'none',
      shapeFill: true,
      showCodes: false,
      showGrid: true,
      paletteTab: 'used',
      paletteSearch: '',
      seriesFilter: 'all',
      myPalette: new Set(M.defaultMyPalette),
      myPaletteDraft: null,
      myPalettePreset: 'custom',
      myPalettePaste: '',
      paletteReturn: null,
      overlay: null,
      menuOpen: false,
      wizard: null,
      newProject: null,
      settings: null,
      exportFormat: 'png',
      exportPngScale: 16,
      exportPngOptions: { codes: false, coords: false, legend: true, patternOnly: false },
      exportPdfSize: 'actual',
      exportPdfOptions: { mirror: false, codes: false, legend: true },
      exportOverlap: 1,
      projectMenuId: null,
      renameProjectId: null,
      renameValue: '',
      renameReturn: null,
      confirmAction: null,
      confirmReturn: null,
      editorView: { zoom: 1, panX: 0, panY: 0 },
      history: { undo: [], redo: [] },
      editorInstance: null,
      reviewSize: 'auto',
      lastAppW: 0,
      lastAppH: 0
    };
  }

  var state = freshState();

  /* ---------- 本地持久化（原型用 localStorage 演示，正式版用 IndexedDB） ---------- */

  var STORAGE_KEY = 'pindou-demo-v1';
  var persistTimer = 0;

  function serializeDemo() {
    return JSON.stringify({
      version: 1,
      myPalette: Array.from(state.myPalette),
      projects: state.projects.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          width: p.width,
          height: p.height,
          boardW: p.boardW,
          boardH: p.boardH,
          beadSizeMm: p.beadSizeMm,
          cells: Array.from(p.cells),
          updatedLabel: p.updatedLabel,
          createdAt: p.createdAt
        };
      })
    });
  }

  function persistDemo() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      try { localStorage.setItem(STORAGE_KEY, serializeDemo()); } catch (err) { /* ignore quota/private mode */ }
    }, 200);
  }

  function loadStoredDemo() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || data.version !== 1 || !Array.isArray(data.projects)) return;
      var validCodes = new Set(palette.map(function (c) { return c.code; }));
      var loaded = [];
      data.projects.forEach(function (p) {
        if (!p || typeof p.name !== 'string') return;
        var w = Number(p.width);
        var h = Number(p.height);
        if (!(w > 0 && h > 0 && w <= 300 && h <= 300)) return;
        if (!Array.isArray(p.cells) || p.cells.length !== w * h) return;
        var cells = new Uint16Array(w * h);
        for (var i = 0; i < cells.length; i++) {
          var v = Number(p.cells[i]);
          cells[i] = (v >= 0 && v < palette.length) ? v : EMPTY;
        }
        loaded.push({
          id: String(p.id || newProjectId()),
          name: p.name,
          width: w,
          height: h,
          boardW: Number(p.boardW) || 52,
          boardH: Number(p.boardH) || 52,
          beadSizeMm: Number(p.beadSizeMm) || 2.6,
          cells: cells,
          updatedLabel: p.updatedLabel || '已保存',
          createdAt: Number(p.createdAt) || Date.now()
        });
      });
      if (loaded.length) state.projects = loaded;
      if (Array.isArray(data.myPalette)) {
        var set = new Set();
        data.myPalette.forEach(function (code) {
          if (validCodes.has(code)) set.add(code);
        });
        if (set.size) state.myPalette = set;
      }
    } catch (err) { /* ignore corrupt local data */ }
  }

  /* ---------- 评审尺寸 ---------- */

  function computeLayout(width) {
    if (width < 600) return 'phone';
    if (width < 900) return 'tablet';
    return 'wide';
  }

  function syncReviewSizeButtons() {
    $$('.review-size').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.size === state.reviewSize);
    });
  }

  function applyReviewSize(initial) {
    var stage = $('#stage');
    var device = $('#device');
    var scaleWrap = $('#device-scale');
    var app = $('#app');
    if (!stage || !device || !scaleWrap || !app) return { layoutChanged: false, sizeChanged: false };

    var availableW = Math.max(280, stage.clientWidth - 36);
    var availableH = Math.max(380, stage.clientHeight - 46);
    var screenW, screenH;
    if (state.reviewSize === 'auto') {
      screenW = clamp(availableW - 16, 320, 1280);
      screenH = clamp(availableH - 16, 480, 860);
    } else {
      var parts = state.reviewSize.split('x');
      screenW = Number(parts[0]);
      screenH = Number(parts[1]);
    }
    var bezel = screenW < 600 ? 18 : 16;
    var outerW = screenW + bezel;
    var outerH = screenH + bezel;
    var scale = Math.min(1, availableW / outerW, availableH / outerH);
    var prevW = state.lastAppW;
    var prevH = state.lastAppH;

    device.style.width = outerW + 'px';
    device.style.height = outerH + 'px';
    device.style.transform = 'scale(' + scale + ')';
    scaleWrap.style.width = (outerW * scale) + 'px';
    scaleWrap.style.height = (outerH * scale) + 'px';
    device.classList.toggle('device--phone', screenW < 600);
    app.style.width = '100%';
    app.style.height = '100%';

    var layout = computeLayout(screenW);
    var layoutChanged = layout !== state.layout;
    state.layout = layout;
    app.dataset.layout = layout;

    var label = state.reviewSize === 'auto'
      ? '自适应 · ' + screenW + ' × ' + screenH
      : screenW + ' × ' + screenH + ' · ' + (screenW < 600 ? '手机' : screenW < 900 ? '平板竖屏' : '平板横屏');
    var labelEl = $('#device-label');
    if (labelEl) labelEl.textContent = label;

    state.lastAppW = screenW;
    state.lastAppH = screenH;
    var sizeChanged = prevW !== screenW || prevH !== screenH;

    if (layoutChanged && state.initialized && !initial) {
      paintView();
      renderOverlay();
    }
    return { layoutChanged: layoutChanged, sizeChanged: sizeChanged };
  }

  function setReviewSize(size) {
    state.reviewSize = size;
    syncReviewSizeButtons();
    var result = applyReviewSize(false);
    if (!result.layoutChanged) {
      if (state.view === 'home' || state.view === 'system') afterViewRender();
      else if (state.view === 'wizard') afterViewRender();
      else if (state.view === 'editor') {
        if (state.editorInstance) state.editorInstance.resize();
        syncEditorUI();
      }
      if (state.overlay && state.overlay.type === 'export') drawExportPreview();
    }
  }

  /* ---------- 生命周期 ---------- */

  function destroyEditor() {
    if (state.editorInstance) {
      state.editorInstance.destroy();
      state.editorInstance = null;
    }
  }

  function paintView() {
    destroyEditor();
    if (state.view === 'editor' && !getProject()) state.view = 'home';
    var app = $('#app');
    if (app) app.dataset.view = state.view;
    var root = $('#view-root');
    if (!root) return;
    var html = '';
    if (state.view === 'home') html = renderHome();
    else if (state.view === 'editor') html = renderEditor();
    else if (state.view === 'wizard') html = renderWizard();
    else if (state.view === 'system') html = renderDesignSystem();
    root.innerHTML = html;
    afterViewRender();
  }

  function renderOverlay() {
    var root = $('#overlay-root');
    if (!root) return;
    var html = '';
    if (state.menuOpen) html += renderMenu();
    if (state.overlay) html += renderOverlayContent();
    root.innerHTML = html;
    afterOverlayRender();
  }

  function openOverlay(type, extra) {
    state.menuOpen = false;
    state.overlay = Object.assign({ type: type }, extra || {});
    renderOverlay();
  }

  function closeOverlay() {
    if (state.overlay && state.overlay.type === 'mypalette' && state.paletteReturn) {
      state.overlay = state.paletteReturn;
      state.paletteReturn = null;
      renderOverlay();
      return;
    }
    state.overlay = null;
    state.menuOpen = false;
    renderOverlay();
  }

  function go(view) {
    destroyEditor();
    state.view = view;
    state.overlay = null;
    state.menuOpen = false;
    paintView();
    renderOverlay();
  }

  /* ---------- 首页 ---------- */

  function projectCardHTML(project) {
    var s = statsOfProject(project);
    return '<div class="project-card" role="button" tabindex="0" data-action="open-project" data-project="' + project.id + '" aria-label="打开 ' + esc(project.name) + '">' +
      '<div class="project-card__thumb">' +
        '<canvas data-thumb="' + project.id + '" aria-hidden="true"></canvas>' +
        '<span class="project-card__badge">' + icon('bead') + project.width + '×' + project.height + ' · ' + project.beadSizeMm + 'mm</span>' +
        '<button class="project-card__more" data-action="project-more" data-project="' + project.id + '" aria-label="更多操作">' + icon('more') + '</button>' +
      '</div>' +
      '<div class="project-card__body">' +
        '<div class="project-card__title">' + esc(project.name) + '</div>' +
        '<div class="project-card__meta"><span>' + physicalSize(project) + '</span><span class="dot-sep"></span><span>' + s.colorCount + ' 色</span><span class="dot-sep"></span><span>' + boardCount(project) + ' 块板</span></div>' +
        '<div class="project-card__foot"><span class="project-card__count">' + icon('bead') + fmt(s.total) + ' 颗</span><span>' + esc(project.updatedLabel || '') + '</span><span class="project-card__open">打开' + icon('chevron-right') + '</span></div>' +
      '</div>' +
    '</div>';
  }

  function renderHome() {
    var total = state.projects.reduce(function (sum, p) { return sum + statsOfProject(p).total; }, 0);
    var cards = state.projects.length
      ? state.projects.map(projectCardHTML).join('')
      : '<div class="home-empty">' +
          '<div class="home-empty__beads" aria-hidden="true">' +
            '<span style="--bead:#F77C31"></span><span style="--bead:#F551A2"></span><span style="--bead:#41CCFF"></span>' +
          '</div>' +
          '<h3>还没有图纸</h3>' +
          '<p>新建一张空白图纸，或从图片开始自动生成色号图纸。</p>' +
          '<div class="home-empty__actions">' +
            '<button class="btn btn--primary" data-action="open-new">' + icon('plus') + '新建图纸</button>' +
            '<button class="btn btn--secondary" data-action="open-wizard" data-entry="home" aria-label="从图片开始">' + icon('image') + '从图片开始</button>' +
          '</div>' +
        '</div>';
    return '<div class="home"><div class="home__inner">' +
      '<header class="home__header">' +
        '<div class="brand">' +
          '<div class="brand__mark"><span class="logo-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>' +
          '<div class="brand__copy"><div class="brand__name">拼豆工坊</div><div class="brand__sub">PINDOU STUDIO</div></div>' +
        '</div>' +
        '<div class="home__actions">' +
          '<button class="btn btn--secondary" data-action="open-wizard" data-entry="home" aria-label="从图片开始">' + icon('image') + '<span>从图片开始</span></button>' +
          '<button class="btn btn--primary" data-action="open-new">' + icon('plus') + '<span>新建图纸</span></button>' +
        '</div>' +
      '</header>' +
      '<section class="hero">' +
        '<div class="hero__copy">' +
          '<div class="hero__eyebrow">' + icon('sparkles') + '2.6MM 融合豆 · MARD 色卡</div>' +
          '<h1 class="hero__title">把灵感，拼成<br><em>一颗颗豆子。</em></h1>' +
          '<p class="hero__sub">导入图片或从空白开始，自动匹配真实色号，逐格调整后导出能直接照着拼的图纸。</p>' +
        '</div>' +
        '<div class="hero__beads" aria-hidden="true">' +
          '<span class="hero-bead"></span><span class="hero-bead"></span><span class="hero-bead"></span>' +
          '<span class="hero-bead"></span><span class="hero-bead"></span><span class="hero-bead"></span>' +
        '</div>' +
      '</section>' +
      '<div class="section-head"><h2>最近工程</h2><span class="section-head__count">' + state.projects.length + '</span><span class="section-head__hint">共 ' + fmt(total) + ' 颗豆子</span></div>' +
      '<div class="project-grid">' + cards + '</div>' +
      '<footer class="home__footer">' + icon('info') + '<span>屏幕色值仅作预览参考，实物颜色请以品牌色卡为准。工程自动保存在本机。</span></footer>' +
    '</div></div>';
  }

  /* ---------- 编辑器 ---------- */

  function renderCanvasEmpty(show) {
    return '<div class="canvas-empty" data-role="canvas-empty" style="' + (show ? '' : 'display:none;') + '">' +
      '<div class="canvas-empty__beads" aria-hidden="true"><span style="--bead:#F77C31"></span><span style="--bead:#F551A2"></span><span style="--bead:#41CCFF"></span><span style="--bead:#5DE035"></span></div>' +
      '<h3>空白画布，等你落第一颗豆</h3>' +
      '<p>从右侧色板选一个颜色，点按画布开始；也可以导入图片自动生成图纸。</p>' +
      '<button class="btn btn--primary btn--sm" data-action="open-wizard" data-entry="editor">' + icon('image') + '从图片开始</button>' +
    '</div>';
  }

  function renderToolRail() {
    var tools = [['pencil', '画笔'], ['eraser', '橡皮'], ['fill', '填充'], ['eyedropper', '吸管'], ['line', '直线'], ['rect', '矩形'], ['ellipse', '椭圆'], ['pan', '平移']];
    var html = '<aside class="toolrail" aria-label="绘图工具">';
    tools.forEach(function (t) {
      html += '<button class="tool-btn ' + (state.tool === t[0] ? 'is-active' : '') + '" data-action="set-tool" data-tool="' + t[0] + '" aria-label="' + t[1] + '" aria-pressed="' + (state.tool === t[0]) + '">' +
        icon(t[0]) + '<span>' + t[1] + '</span>' +
        (t[0] === 'pencil' ? '<span class="tool-btn__badge" data-role="brush-badge">' + state.brushSize + '</span>' : '') +
      '</button>';
    });
    html += '<div class="toolrail__divider"></div>';
    html += '<button class="tool-btn" data-action="cycle-symmetry" aria-label="对称绘制">' + icon('symmetry') + '<span>对称</span>' +
      '<span class="tool-btn__badge tool-btn__badge--soft" data-role="symmetry-badge" style="' + (state.symmetry === 'none' ? 'display:none;' : '') + '">' + symLabel(state.symmetry) + '</span></button>';
    html += '<button class="tool-btn" data-action="cycle-brush" aria-label="笔刷大小">' + icon('pencil') + '<span>笔刷</span><span class="tool-btn__badge" data-role="brush-badge-2">' + state.brushSize + '</span></button>';
    html += '<div class="toolrail__spacer"></div>';
    html += '<button class="tool-btn" data-action="open-stats" aria-label="用量统计">' + icon('stats') + '<span>统计</span></button>';
    html += '</aside>';
    return html;
  }

  function renderDock() {
    var tools = [['pencil', '画笔'], ['eraser', '橡皮'], ['fill', '填充'], ['eyedropper', '吸管'], ['line', '直线'], ['rect', '矩形'], ['ellipse', '椭圆']];
    var c = byCode[state.selectedColor] || palette[0];
    var html = '<div class="editor-dock"><div class="dock-row"><div class="dock-tools">';
    tools.forEach(function (t) {
      html += '<button class="dock-tool ' + (state.tool === t[0] ? 'is-active' : '') + '" data-action="set-tool" data-tool="' + t[0] + '" aria-label="' + t[1] + '">' +
        icon(t[0]) + '<span>' + t[1] + '</span>' +
        (t[0] === 'pencil' ? '<span class="dock-tool__badge" data-role="brush-badge">' + state.brushSize + '</span>' : '') +
      '</button>';
    });
    html += '</div><span class="dock-divider"></span>';
    html += '<button class="dock-current" data-action="open-palette" aria-label="当前颜色 ' + c.code + ' ' + c.name + '，打开色板">' +
      '<span class="dock-current__ring"></span><span class="bead-dot" data-role="dock-color" style="--bead:' + c.hex + '"></span></button>';
    html += '</div></div>';
    return html;
  }

  function renderStatusbar(project, s) {
    return '<div class="statusbar">' +
      '<span class="statusbar__item">' + icon('pan') + '<span data-role="status-cursor">—</span></span>' +
      '<span class="statusbar__item">' + icon('bead') + '<span><strong data-role="status-total">' + fmt(s.total) + '</strong> 颗</span></span>' +
      '<span class="statusbar__item"><span class="color-dot" style="--bead:' + (byCode[state.selectedColor] || palette[0]).hex + '"></span><span><strong data-role="status-colors">' + s.colorCount + '</strong> 色</span></span>' +
      '<span class="statusbar__right"><span data-role="status-physical">' + project.beadSizeMm + 'mm · ' + project.width + '×' + project.height + ' · ' + physicalSize(project) + '</span><span>缩放 <strong data-role="zoom-label">' + Math.round(state.editorView.zoom * 100) + '%</strong></span></span>' +
    '</div>';
  }

  function renderEditor() {
    var project = getProject();
    if (!project) return renderHome();
    var s = statsOfProject(project);
    var wide = state.layout === 'wide';
    var html = '<div class="editor">' +
      '<div class="editor__top">' +
        '<button class="icon-btn" data-action="go-home" aria-label="返回首页">' + icon('back') + '</button>' +
        '<div class="editor__title"><h1>' + esc(project.name) + '</h1><div class="editor__meta"><span data-role="meta-size">' + project.width + '×' + project.height + '</span><span class="dot-sep"></span><span data-role="meta-bead">' + project.beadSizeMm + 'mm</span><span class="dot-sep dot-sep--save"></span><span class="save-state"><i class="save-dot"></i>已保存</span></div></div>' +
        '<div class="editor__top-spacer"></div>' +
        '<div class="editor__actions">' +
          '<button class="icon-btn" data-action="undo" data-role="undo" aria-label="撤销" ' + (state.history.undo.length ? '' : 'disabled') + '>' + icon('undo') + '</button>' +
          '<button class="icon-btn" data-action="redo" data-role="redo" aria-label="重做" ' + (state.history.redo.length ? '' : 'disabled') + '>' + icon('redo') + '</button>' +
          '<span class="v-divider"></span>' +
          (!wide ? '<button class="icon-btn" data-action="open-palette" aria-label="色板">' + icon('palette') + '</button>' : '') +
          '<button class="icon-btn desktop-only" data-action="open-stats" aria-label="用量统计">' + icon('stats') + '</button>' +
          '<button class="btn btn--primary btn--sm desktop-only" data-action="open-export">' + icon('download') + '<span>导出</span></button>' +
          '<button class="icon-btn" data-action="toggle-menu" aria-label="更多">' + icon('more') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="editor__body">' +
        renderToolRail() +
        '<div class="canvas-wrap">' +
          '<div class="canvas-stage"></div>' +
          '<div class="canvas-chip" data-role="canvas-chip">' + icon('bead') + project.width + '×' + project.height + ' · ' + project.beadSizeMm + 'mm · ' + physicalSize(project) + '</div>' +
          (state.layout === 'phone' ? '<div class="canvas-stats">' + icon('bead') + '<strong data-role="status-total">' + fmt(s.total) + '</strong> 颗<span class="dot-sep"></span><strong data-role="status-colors">' + s.colorCount + '</strong> 色</div>' : '') +
          '<div class="zoom-pill">' +
            '<button data-action="zoom-out" aria-label="缩小">' + icon('zoom-out') + '</button>' +
            '<span class="zoom-pill__value" data-role="zoom-label">' + Math.round(state.editorView.zoom * 100) + '%</span>' +
            '<button data-action="zoom-in" aria-label="放大">' + icon('zoom-in') + '</button>' +
            '<button data-action="zoom-fit" aria-label="适应屏幕">' + icon('fit') + '</button>' +
          '</div>' +
          renderCanvasEmpty(s.total === 0) +
        '</div>' +
        (wide ? '<aside class="palette-panel" aria-label="色板">' + renderPaletteInner() + '</aside>' : '') +
      '</div>' +
      (state.layout !== 'phone' ? renderStatusbar(project, s) : '') +
      (state.layout === 'phone' ? renderDock() : '') +
    '</div>';
    return html;
  }

  /* ---------- 色板 ---------- */

  function renderPaletteCurrent() {
    var project = getProject();
    var c = byCode[state.selectedColor] || palette[0];
    var count = 0;
    if (project) {
      var stats = statsOfProject(project);
      var hit = stats.list.find(function (item) { return item.color.code === c.code; });
      count = hit ? hit.count : 0;
    }
    return '<div class="palette__current" data-role="current-color">' +
      '<span class="bead-dot" style="--bead:' + c.hex + '"></span>' +
      '<div class="palette__current-copy"><div class="palette__current-code">' + c.code + '</div><div class="palette__current-name">' + c.name + '</div></div>' +
      '<div class="palette__current-count"><strong data-role="current-color-count">' + fmt(count) + '</strong>颗</div>' +
    '</div>';
  }

  function renderPaletteTabs() {
    var project = getProject();
    var s = project ? statsOfProject(project) : { colorCount: 0 };
    var tabs = [
      ['used', '已用 ' + s.colorCount],
      ['all', '全部 ' + palette.length],
      ['mine', '我的 ' + state.myPalette.size]
    ];
    return tabs.map(function (t) {
      var active = state.paletteTab === t[0];
      return '<button class="palette-tab ' + (active ? 'is-active' : '') + '" data-action="palette-tab" data-tab="' + t[0] + '" role="tab" aria-selected="' + active + '">' + t[1] + '</button>';
    }).join('');
  }

  function renderSeriesChips() {
    var filters = ['all'].concat(M.series);
    return filters.map(function (f) {
      var label = f === 'all' ? '全部' : f;
      var active = state.seriesFilter === f;
      return '<button class="series-chip ' + (active ? 'is-active' : '') + '" data-action="series-filter" data-series="' + f + '">' + label + '</button>';
    }).join('');
  }

  function renderSwatchGrid() {
    var project = getProject();
    var s = project ? statsOfProject(project) : { list: [], total: 0 };
    var counts = {};
    s.list.forEach(function (item) { counts[item.color.code] = item.count; });
    var query = state.paletteSearch.trim().toLowerCase();
    var list = [];

    if (state.paletteTab === 'used') {
      list = s.list.map(function (item) { return item.color; });
    } else if (state.paletteTab === 'mine') {
      list = palette.filter(function (c) { return state.myPalette.has(c.code); });
    } else {
      list = palette.slice();
    }

    list = list.filter(function (c) {
      if (!seriesMatches(c, state.seriesFilter)) return false;
      if (!query) return true;
      return (c.code + ' ' + c.name).toLowerCase().indexOf(query) !== -1;
    });

    if (!list.length) {
      if (state.paletteTab === 'used' && s.list.length === 0) {
        return '<div class="swatch-grid__empty">' + icon('bead') + '<div>还没有用过的颜色</div><div style="margin-top:4px;font-size:10px">切到「全部」，选一个颜色开始落豆</div></div>';
      }
      return '<div class="swatch-grid__empty">' + icon('search') + '<div>没有匹配的色号</div></div>';
    }

    return list.map(function (c) {
      var selected = state.selectedColor === c.code;
      var count = counts[c.code] || 0;
      return '<button class="swatch ' + (selected ? 'is-selected' : '') + '" data-action="select-color" data-color="' + c.code + '" aria-label="' + c.code + ' ' + c.name + (count ? '，' + count + ' 颗' : '') + '" aria-pressed="' + selected + '">' +
        '<span class="swatch__bead" style="--bead:' + c.hex + '"></span>' +
        '<span class="swatch__code">' + c.code + '</span>' +
        (count ? '<span class="swatch__badge">' + (count > 999 ? '999+' : count) + '</span>' : '') +
      '</button>';
    }).join('');
  }

  function renderPaletteInner(compact) {
    var head = compact
      ? '<div class="palette__head"><span class="palette__compact-label">MARD · 2.6MM</span><button class="text-link" data-action="open-mypalette">我的色卡' + icon('chevron-right') + '</button></div>'
      : '<div class="palette__head"><h2>色板</h2><button class="text-link" data-action="open-mypalette">我的色卡' + icon('chevron-right') + '</button></div>';
    return '<div class="palette">' +
      head +
      renderPaletteCurrent() +
      '<div class="palette__tabs" data-role="palette-tabs" role="tablist">' + renderPaletteTabs() + '</div>' +
      '<div class="palette__search"><div class="search-field">' + icon('search') + '<input type="search" data-input="palette-search" placeholder="搜索色号或颜色名" value="' + esc(state.paletteSearch) + '" aria-label="搜索色板"></div></div>' +
      '<div class="series-row">' + renderSeriesChips() + '</div>' +
      '<div class="swatch-grid" data-role="swatch-grid">' + renderSwatchGrid() + '</div>' +
      '<div class="palette__note">屏幕色值仅供参考，实物颜色以品牌色卡为准。</div>' +
    '</div>';
  }

  function renderPaletteOverlay(side) {
    var cls = side === 'bottom' ? 'sheet sheet--bottom sheet--tall palette-sheet' : 'sheet sheet--right palette-sheet';
    return '<div class="' + cls + '" role="dialog" aria-modal="true" aria-labelledby="palette-title">' +
      (side === 'bottom' ? '<div class="sheet__grabber"></div>' : '') +
      '<div class="sheet__head"><h2 id="palette-title">色板</h2><button class="icon-btn" data-action="close-overlay" aria-label="关闭">' + icon('close') + '</button></div>' +
      '<div class="sheet__body">' + renderPaletteInner(true) + '</div>' +
    '</div>';
  }

  function refreshPaletteTabs() {
    var el = $('[data-role="palette-tabs"]');
    if (el) el.innerHTML = renderPaletteTabs();
  }

  function refreshSwatchGrid() {
    var el = $('[data-role="swatch-grid"]');
    if (el) el.innerHTML = renderSwatchGrid();
  }

  function refreshCurrentColor() {
    var el = $('[data-role="current-color"]');
    if (el) el.outerHTML = renderPaletteCurrent();
    var c = byCode[state.selectedColor] || palette[0];
    var dock = $('[data-role="dock-color"]');
    if (dock) dock.style.setProperty('--bead', c.hex);
  }

  function refreshPaletteAll() {
    refreshPaletteTabs();
    refreshSwatchGrid();
    refreshCurrentColor();
  }

  function updateSwatchSelection() {
    $$('.swatch').forEach(function (el) {
      var on = el.dataset.color === state.selectedColor;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-pressed', String(on));
    });
  }

  /* ---------- 覆盖层 ---------- */

  function renderOverlayContent() {
    var o = state.overlay;
    if (!o) return '';
    var side = state.layout === 'phone' ? 'bottom' : 'right';
    if (o.type === 'new-project') return renderNewProjectOverlay();
    if (o.type === 'palette') return '<div class="scrim" data-action="close-overlay"></div>' + renderPaletteOverlay(side);
    if (o.type === 'stats') return '<div class="scrim" data-action="close-overlay"></div>' + renderStatsOverlay(side);
    if (o.type === 'export') return '<div class="scrim" data-action="close-overlay"></div>' + renderExportOverlay(side);
    if (o.type === 'mypalette') return '<div class="scrim" data-action="close-overlay"></div>' + renderMyPaletteOverlay(side);
    if (o.type === 'settings') return '<div class="scrim" data-action="close-overlay"></div>' + renderSettingsOverlay();
    if (o.type === 'project-menu') return '<div class="scrim" data-action="close-overlay"></div>' + renderProjectMenuOverlay();
    if (o.type === 'rename-project') return '<div class="scrim" data-action="cancel-rename"></div>' + renderRenameOverlay();
    if (o.type === 'confirm') return '<div class="scrim" data-action="cancel-confirm"></div>' + renderConfirmOverlay();
    return '';
  }

  /* ---------- 新建工程 ---------- */

  function newPresets() {
    return state.newProject && state.newProject.beadSize === 5 ? [29, 57] : [52, 50, 78, 104];
  }

  function openNewProject() {
    state.newProject = {
      name: '未命名图纸',
      beadSize: 2.6,
      width: 52,
      height: 52,
      custom: false
    };
    openOverlay('new-project');
  }

  function captureNewProjectName() {
    var input = $('[data-input="new-name"]');
    if (input) state.newProject.name = input.value;
  }

  function renderNewProjectOverlay() {
    var side = state.layout === 'phone';
    var cls = side ? 'sheet sheet--bottom sheet--tall' : 'dialog';
    return '<div class="scrim" data-action="close-overlay"></div>' +
      '<div class="' + cls + '" role="dialog" aria-modal="true" aria-labelledby="new-project-title">' +
        (side ? '<div class="sheet__grabber"></div>' : '') +
        '<div class="' + (side ? 'sheet__head' : 'dialog__head') + '"><h2 id="new-project-title">新建图纸</h2><button class="icon-btn" data-action="close-overlay" aria-label="关闭">' + icon('close') + '</button></div>' +
        '<div class="' + (side ? 'sheet__body' : 'dialog__body') + '">' + renderNewProjectForm() + '</div>' +
        '<div class="' + (side ? 'sheet__foot' : 'dialog__foot') + '"><button class="btn btn--ghost" data-action="close-overlay">取消</button><button class="btn btn--primary" data-action="create-project">' + icon('plus') + '创建图纸</button></div>' +
      '</div>';
  }

  function renderNewProjectForm() {
    var np = state.newProject;
    var presets = newPresets();
    var boardW = np.beadSize === 5 ? 29 : 52;
    var cmW = (np.width * np.beadSize / 10).toFixed(1);
    var cmH = (np.height * np.beadSize / 10).toFixed(1);
    var boards = Math.ceil(np.width / boardW) * Math.ceil(np.height / boardW);
    var presetCards = presets.map(function (n) {
      var active = !np.custom && np.width === n && np.height === n;
      return '<button class="preset-card ' + (active ? 'is-active' : '') + '" data-action="new-preset" data-preset="' + n + '">' +
        '<span class="preset-card__icon">' + icon('grid') + '</span>' +
        '<span class="preset-card__copy"><span class="preset-card__name">' + n + ' × ' + n + '</span><span class="preset-card__meta">' + (n * np.beadSize / 10).toFixed(1) + ' cm · ' + Math.ceil(n / boardW) * Math.ceil(n / boardW) + ' 块板</span></span>' +
      '</button>';
    }).join('');
    var customActive = np.custom || presets.indexOf(np.width) === -1 || np.width !== np.height;
    presetCards += '<button class="preset-card ' + (customActive ? 'is-active' : '') + '" data-action="new-custom" data-preset="custom">' +
      '<span class="preset-card__icon">' + icon('crop') + '</span>' +
      '<span class="preset-card__copy"><span class="preset-card__name">自定义尺寸</span><span class="preset-card__meta">1–300 格</span></span>' +
    '</button>';

    return '<div class="form-stack">' +
      '<div class="field"><label class="field__label" for="new-name">图纸名称</label><input class="input" id="new-name" data-input="new-name" data-autofocus value="' + esc(np.name) + '" maxlength="40" placeholder="给图纸起个名字"></div>' +
      '<div class="form-section"><div class="form-section__title">' + icon('bead') + '豆子规格</div>' +
        '<div class="segmented" style="width:100%">' +
          '<button class="' + (np.beadSize === 2.6 ? 'is-active' : '') + '" data-action="set-bead" data-bead="2.6" style="flex:1">2.6mm 小豆</button>' +
          '<button class="' + (np.beadSize === 5 ? 'is-active' : '') + '" data-action="set-bead" data-bead="5" style="flex:1">5mm 中豆</button>' +
        '</div>' +
      '</div>' +
      '<div class="form-section"><div class="form-section__title">' + icon('grid') + '板型尺寸</div><div class="preset-grid">' + presetCards + '</div></div>' +
      '<div class="dimension-row">' +
        '<div class="dimension-field"><label class="field__label" for="new-width">宽（格）</label><div class="dimension-input-wrap"><input class="input" id="new-width" type="number" min="1" max="300" data-input="new-width" value="' + np.width + '"><span class="dimension-input-wrap__unit">格</span></div></div>' +
        '<button class="icon-btn" data-action="swap-new-size" aria-label="交换宽高" style="margin-bottom:3px">' + icon('swap') + '</button>' +
        '<div class="dimension-field"><label class="field__label" for="new-height">高（格）</label><div class="dimension-input-wrap"><input class="input" id="new-height" type="number" min="1" max="300" data-input="new-height" value="' + np.height + '"><span class="dimension-input-wrap__unit">格</span></div></div>' +
      '</div>' +
      '<div class="preview-summary">' +
        '<div class="preview-summary__board" aria-hidden="true"></div>' +
        '<div class="preview-summary__copy"><div class="preview-summary__title" data-role="new-size">' + np.width + ' × ' + np.height + ' 格</div><div class="preview-summary__meta" data-role="new-meta">' + cmW + ' × ' + cmH + ' cm · ' + boards + ' 块板 · ' + np.beadSize + 'mm 豆</div></div>' +
      '</div>' +
      '<div class="palette-row"><span class="bead-dot" style="--bead:#F04A42"></span><div class="palette-row__copy"><div class="palette-row__title">MARD 融合豆 · 我的色卡</div><div class="palette-row__meta">' + state.myPalette.size + ' 色 · 图片转换只使用这些颜色</div></div><button class="text-link" data-action="open-mypalette-from-new">调整</button></div>' +
    '</div>';
  }

  function updateNewProjectPreview() {
    var np = state.newProject;
    if (!np) return;
    var cmW = (np.width * np.beadSize / 10).toFixed(1);
    var cmH = (np.height * np.beadSize / 10).toFixed(1);
    var boardW = np.beadSize === 5 ? 29 : 52;
    var boards = Math.ceil(np.width / boardW) * Math.ceil(np.height / boardW);
    $$('[data-role="new-size"]').forEach(function (el) { el.textContent = np.width + ' × ' + np.height + ' 格'; });
    $$('[data-role="new-meta"]').forEach(function (el) { el.textContent = cmW + ' × ' + cmH + ' cm · ' + boards + ' 块板 · ' + np.beadSize + 'mm 豆'; });
    $$('[data-preset]').forEach(function (el) {
      var v = el.dataset.preset;
      var active;
      if (v === 'custom') active = np.custom || newPresets().indexOf(np.width) === -1 || np.width !== np.height;
      else active = !np.custom && Number(v) === np.width && np.width === np.height;
      el.classList.toggle('is-active', active);
    });
  }

  /* ---------- 统计 ---------- */

  function openStats() {
    if (!getProject()) return;
    openOverlay('stats');
  }

  function renderStatsOverlay(side) {
    var project = getProject();
    var s = statsOfProject(project);
    return '<div class="sheet sheet--' + side + '" role="dialog" aria-modal="true">' +
      '<div class="sheet__grabber"></div>' +
      '<div class="sheet__head"><h2>用量统计</h2><button class="icon-btn" data-action="close-overlay" aria-label="关闭">' + icon('close') + '</button></div>' +
      '<div class="sheet__body">' + renderStatsBody(project, s) + '</div>' +
      '<div class="sheet__foot"><button class="btn btn--secondary btn--block" data-action="open-export-csv">' + icon('download') + '导出用量 CSV</button></div>' +
    '</div>';
  }

  function renderStatsBody(project, s) {
    if (!s.total) {
      return '<div class="stat-empty">' + icon('bead') + '<div>还没有落下的豆子</div><div style="margin-top:4px">在画布上画几颗，或从图片生成图纸。</div></div>';
    }
    var max = s.list[0] ? s.list[0].count : 1;
    var rows = s.list.map(function (item) {
      var p = pct(item.count, s.total);
      return '<div class="stat-row">' +
        '<span class="stat-row__bead" style="--bead:' + item.color.hex + '"></span>' +
        '<span class="stat-row__copy"><span class="stat-row__code">' + item.color.code + '</span><span class="stat-row__name">' + item.color.name + '</span></span>' +
        '<span class="stat-row__bar"><i style="width:' + Math.max(2, (item.count / max) * 100) + '%;--bead:' + item.color.hex + '"></i></span>' +
        '<span class="stat-row__count">' + fmt(item.count) + '</span>' +
        '<span class="stat-row__pct">' + (p < 1 ? '<1' : Math.round(p)) + '%</span>' +
      '</div>';
    }).join('');
    return '<div class="stat-cards">' +
        '<div class="stat-card stat-card--accent"><div class="stat-card__value">' + fmt(s.total) + '<small>颗</small></div><div class="stat-card__label">总用量</div></div>' +
        '<div class="stat-card"><div class="stat-card__value">' + s.colorCount + '<small>色</small></div><div class="stat-card__label">色号数量</div></div>' +
        '<div class="stat-card"><div class="stat-card__value">' + boardCount(project) + '<small>块</small></div><div class="stat-card__label">按板估算</div></div>' +
      '</div>' +
      '<div class="stat-list__head"><span>按用量排序</span><span>' + project.width + '×' + project.height + ' · ' + physicalSize(project) + '</span></div>' +
      '<div class="stat-list">' + rows + '</div>' +
      '<div class="stat-footnote">用量按已放置的豆子统计，空格不计入。建议按统计多备 5% 左右的损耗。</div>';
  }

  /* ---------- 导出 ---------- */

  function openExport(format) {
    if (!getProject()) return;
    state.exportFormat = format || state.exportFormat || 'png';
    openOverlay('export');
  }

  function renderExportOverlay(side) {
    return '<div class="sheet sheet--' + side + '" role="dialog" aria-modal="true">' +
      '<div class="sheet__grabber"></div>' +
      '<div class="sheet__head"><h2>导出图纸</h2><button class="icon-btn" data-action="close-overlay" aria-label="关闭">' + icon('close') + '</button></div>' +
      '<div class="sheet__body" data-role="export-body">' + renderExportBody() + '</div>' +
      '<div class="sheet__foot" data-role="export-foot">' + renderExportFoot() + '</div>' +
    '</div>';
  }

  function renderExportTabs() {
    return [['png', 'PNG 图纸', 'image'], ['pdf', 'A4 PDF', 'download'], ['csv', '用量 CSV', 'stats']].map(function (t) {
      var active = state.exportFormat === t[0];
      return '<button class="export-tab ' + (active ? 'is-active' : '') + '" data-action="export-format" data-format="' + t[0] + '">' + icon(t[2]) + t[1] + '</button>';
    }).join('');
  }

  function renderExportBody() {
    var project = getProject();
    var s = statsOfProject(project);
    var html = '<div class="export-tabs">' + renderExportTabs() + '</div>';
    if (state.exportFormat === 'png') {
      html += renderPngOptions(project, s);
    } else if (state.exportFormat === 'pdf') {
      html += renderPdfOptions(project, s);
    } else {
      html += renderCsvOptions(project, s);
    }
    return html;
  }

  function renderPngOptions(project, s) {
    var o = state.exportPngOptions;
    return '<div class="export-preview"><canvas data-role="export-preview" aria-label="PNG 导出预览"></canvas><div class="export-preview__caption">' + icon('image') + '<strong>' + project.width + ' × ' + project.height + '</strong><span>·</span><span>' + s.total + ' 颗</span><span>·</span><span>每格 ' + state.exportPngScale + 'px</span></div></div>' +
      '<div class="export-section"><div class="export-section__title">' + icon('grid') + '图纸样式</div>' +
        '<div class="option-row"><div class="option-row__copy"><div class="option-row__title">每格像素</div><div class="option-row__hint">数值越大，导出图片越清晰</div></div><div class="segmented">' + [8, 16, 24, 32].map(function (n) { return '<button class="' + (state.exportPngScale === n ? 'is-active' : '') + '" data-action="export-scale" data-scale="' + n + '">' + n + 'px</button>'; }).join('') + '</div></div>' +
        '<div class="option-row"><div class="option-row__copy"><div class="option-row__title">格内色号</div><div class="option-row__hint">在每格中显示 MARD 色号</div></div><button class="switch ' + (o.codes ? 'is-on' : '') + '" data-action="toggle-export" data-option="codes" role="switch" aria-checked="' + !!o.codes + '"></button></div>' +
        '<div class="option-row"><div class="option-row__copy"><div class="option-row__title">行列坐标</div><div class="option-row__hint">便于按行对照拼豆</div></div><button class="switch ' + (o.coords ? 'is-on' : '') + '" data-action="toggle-export" data-option="coords" role="switch" aria-checked="' + !!o.coords + '"></button></div>' +
        '<div class="option-row"><div class="option-row__copy"><div class="option-row__title">图例与用量</div><div class="option-row__hint">附色号、名称和颗数</div></div><button class="switch ' + (o.legend ? 'is-on' : '') + '" data-action="toggle-export" data-option="legend" role="switch" aria-checked="' + !!o.legend + '"></button></div>' +
      '</div>' +
      '<div class="file-name-row">' + icon('image') + '<span>文件名</span><strong>' + esc(project.name) + '_图纸.png</strong></div>' +
      '<div class="export-note">' + icon('info') + '<span>PNG 适合分享和电子查看；需要打印请使用 A4 PDF。</span></div>';
  }

  function renderPdfOptions(project, s) {
    var o = state.exportPdfOptions;
    var info = pdfPageInfo(project);
    var sizeLabel = state.exportPdfSize === 'actual' ? '1:1 实物' : state.exportPdfSize === 'custom' ? '自定义' : '适配页面';
    return '<div class="export-preview"><canvas data-role="export-preview" aria-label="PDF 导出预览"></canvas><div class="export-preview__caption">' + icon('download') + '<strong>A4 纵向</strong><span>·</span><span>' + (state.exportPdfSize === 'actual' ? project.beadSizeMm + 'mm / 格' : sizeLabel) + '</span></div></div>' +
      '<div class="export-section"><div class="export-section__title">' + icon('grid') + '页面与比例</div>' +
        '<div class="option-row"><div class="option-row__copy"><div class="option-row__title">每格尺寸</div><div class="option-row__hint">' + (state.exportPdfSize === 'actual' ? '按 ' + project.beadSizeMm + 'mm 实物打印，可 1:1 对照' : state.exportPdfSize === 'fit' ? '整张图纸缩放到一页' : '按固定比例分页') + '</div></div>' +
          '<div class="segmented">' + [['fit', '适配'], ['actual', '1:1'], ['custom', '自定义']].map(function (x) { return '<button class="' + (state.exportPdfSize === x[0] ? 'is-active' : '') + '" data-action="export-pdf-size" data-size="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="option-row"><div class="option-row__copy"><div class="option-row__title">重叠边</div><div class="option-row__hint">相邻页重叠的格数，方便拼接</div></div><div class="stepper"><button data-action="overlap-minus" aria-label="减少重叠">' + icon('minus') + '</button><span class="stepper__value" data-role="overlap-value">' + state.exportOverlap + ' 格</span><button data-action="overlap-plus" aria-label="增加重叠">' + icon('plus') + '</button></div></div>' +
        '<div class="export-summary" data-role="pdf-summary">' + icon('grid') + '<span><strong>' + info.pagesX + '×' + info.pagesY + '</strong> 拼版 · 共 <strong>' + info.total + '</strong> 页' + (info.total > info.patternPages ? '（含图例页）' : '') + ' · A4</span></div>' +
      '</div>' +
      '<div class="export-section"><div class="export-section__title">' + icon('settings') + '打印选项</div>' +
        '<div class="option-row"><div class="option-row__copy"><div class="option-row__title">镜像图纸</div><div class="option-row__hint">熨烫后成品方向正确</div></div><button class="switch ' + (o.mirror ? 'is-on' : '') + '" data-action="toggle-export" data-option="mirror" role="switch" aria-checked="' + !!o.mirror + '"></button></div>' +
        '<div class="option-row"><div class="option-row__copy"><div class="option-row__title">格内色号</div><div class="option-row__hint">1:1 模式下字号较小</div></div><button class="switch ' + (o.codes ? 'is-on' : '') + '" data-action="toggle-export" data-option="codes" role="switch" aria-checked="' + !!o.codes + '"></button></div>' +
        '<div class="option-row"><div class="option-row__copy"><div class="option-row__title">图例页</div><div class="option-row__hint">多页图纸附独立色号清单</div></div><button class="switch ' + (o.legend ? 'is-on' : '') + '" data-action="toggle-export" data-option="legend" role="switch" aria-checked="' + !!o.legend + '"></button></div>' +
      '</div>' +
      '<div class="file-name-row">' + icon('download') + '<span>文件名</span><strong>' + esc(project.name) + '_A4.pdf</strong></div>' +
      '<div class="export-note">' + icon('info') + '<span>PDF 会按 A4 自动分页，页边带页码与全局行列号；镜像只影响打印，不改变工程。</span></div>';
  }

  function renderCsvOptions(project, s) {
    var rows = s.list.slice(0, 6).map(function (item) {
      return '<tr><td>' + item.color.code + '</td><td>' + item.color.name + '</td><td style="font-family:var(--mono)">' + item.color.hex + '</td><td>' + fmt(item.count) + '</td><td>' + Math.round(pct(item.count, s.total)) + '%</td></tr>';
    }).join('');
    return '<div class="export-section"><div class="export-section__title">' + icon('stats') + '用量清单预览</div>' +
      '<table class="mini-table"><thead><tr><th>色号</th><th>名称</th><th>HEX</th><th>颗数</th><th>占比</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="export-note" style="margin-top:10px">' + icon('info') + '<span>CSV 共 ' + s.colorCount + ' 行，含 UTF-8 BOM，Excel 直接打开不乱码。</span></div></div>' +
      '<div class="file-name-row">' + icon('stats') + '<span>文件名</span><strong>' + esc(project.name) + '_用量.csv</strong></div>';
  }

  function renderExportFoot() {
    var label = state.exportFormat === 'png' ? '导出 PNG' : state.exportFormat === 'pdf' ? '导出 PDF' : '导出 CSV';
    var ic = state.exportFormat === 'png' ? 'image' : state.exportFormat === 'pdf' ? 'download' : 'stats';
    return '<button class="btn btn--secondary" data-action="share-export" aria-label="分享">' + icon('share') + '</button>' +
      '<button class="btn btn--primary" style="flex:1" data-action="do-export">' + icon(ic) + label + '</button>';
  }

  function pdfPageInfo(project) {
    var printableW = 190;
    var printableH = 250;
    var overlap = state.exportOverlap;
    var pagesX = 1;
    var pagesY = 1;
    var cellMm;
    if (state.exportPdfSize === 'fit') {
      cellMm = Math.min(printableW / project.width, printableH / project.height);
    } else {
      cellMm = state.exportPdfSize === 'actual' ? project.beadSizeMm : 3.5;
      var cols = Math.max(1, Math.floor(printableW / cellMm));
      var rows = Math.max(1, Math.floor(printableH / cellMm));
      var stepX = Math.max(1, cols - overlap);
      var stepY = Math.max(1, rows - overlap);
      pagesX = Math.max(1, Math.ceil((project.width - overlap) / stepX));
      pagesY = Math.max(1, Math.ceil((project.height - overlap) / stepY));
    }
    var patternPages = pagesX * pagesY;
    var total = patternPages + (state.exportPdfOptions.legend && patternPages > 1 ? 1 : 0);
    return { cellMm: cellMm, pagesX: pagesX, pagesY: pagesY, patternPages: patternPages, total: total };
  }

  function refreshExport() {
    var body = $('[data-role="export-body"]');
    if (body) body.innerHTML = renderExportBody();
    var foot = $('[data-role="export-foot"]');
    if (foot) foot.innerHTML = renderExportFoot();
    if (typeof drawExportPreview === 'function') drawExportPreview();
  }

  function simulateExport() {
    var project = getProject();
    if (!project) return;
    var ext = state.exportFormat === 'pdf' ? 'A4.pdf' : state.exportFormat === 'png' ? '图纸.png' : '用量.csv';
    var btn = $('[data-action="do-export"]');
    if (btn) { btn.disabled = true; btn.dataset.oldHtml = btn.innerHTML; btn.innerHTML = icon('refresh') + '生成中…'; }
    setTimeout(function () {
      if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.oldHtml; }
      showToast('已导出 ' + project.name + '_' + ext + '（设计演示）');
    }, 720);
  }

  /* ---------- 我的色卡 ---------- */

  function isDefault221(set) {
    if (set.size !== M.defaultMyPalette.length) return false;
    for (var i = 0; i < M.defaultMyPalette.length; i++) {
      if (!set.has(M.defaultMyPalette[i])) return false;
    }
    return true;
  }

  function openMyPalette(fromNew) {
    state.paletteReturn = fromNew ? state.overlay : null;
    state.myPaletteDraft = new Set(state.myPalette);
    state.myPalettePreset = isDefault221(state.myPaletteDraft)
      ? '221'
      : state.myPaletteDraft.size === palette.length ? '291' : 'custom';
    state.myPalettePaste = '';
    state.menuOpen = false;
    state.overlay = { type: 'mypalette' };
    renderOverlay();
  }

  function renderMyPaletteOverlay(side) {
    var cls = side === 'bottom' ? 'sheet sheet--bottom sheet--tall' : 'sheet sheet--right sheet--wide';
    return '<div class="' + cls + '" role="dialog" aria-modal="true">' +
      (side === 'bottom' ? '<div class="sheet__grabber"></div>' : '') +
      '<div class="sheet__head"><h2>我的色卡</h2><button class="icon-btn" data-action="close-overlay" aria-label="关闭">' + icon('close') + '</button></div>' +
      '<div class="sheet__body">' + renderMyPaletteBody() + '</div>' +
      '<div class="sheet__foot"><button class="btn btn--ghost" data-action="close-overlay">取消</button><button class="btn btn--primary" style="flex:1" data-action="save-mypalette">' + icon('check') + '保存我的色卡</button></div>' +
    '</div>';
  }

  function renderMyPaletteBody() {
    var draft = state.myPaletteDraft || new Set(state.myPalette);
    var total = palette.length;
    var seriesToggles = M.series.map(function (s) {
      var colors = palette.filter(function (c) { return s === '其他' ? isOtherSeries(c) : c.series === s; });
      var all = colors.length > 0 && colors.every(function (c) { return draft.has(c.code); });
      return '<button class="series-toggle ' + (all ? 'is-on' : '') + '" data-action="mypalette-series" data-series="' + s + '">' + (all ? icon('check') : '') + s + '</button>';
    }).join('');
    var picks = palette.map(function (c) {
      var on = draft.has(c.code);
      return '<button class="pick-item ' + (on ? 'is-on' : '') + '" data-action="toggle-my-color" data-color="' + c.code + '" aria-pressed="' + on + '">' +
        '<span class="pick-item__bead" style="--bead:' + c.hex + '"></span>' +
        '<span class="pick-item__copy"><span class="pick-item__code">' + c.code + '</span><span class="pick-item__name">' + c.name + '</span></span>' +
        '<span class="pick-item__check">' + icon('check') + '</span>' +
      '</button>';
    }).join('');

    var defaultOn = isDefault221(draft);
    var fullOn = draft.size === palette.length;
    var summaryTitle = fullOn ? '已启用全部 291 色' : defaultOn ? '已启用 221 常用色' : '已启用 ' + draft.size + ' 色';
    return '<div class="my-palette-summary"><div class="my-palette-summary__num"><span data-role="mypalette-count">' + draft.size + '</span><span style="font-size:11px;color:#6E958D"> / ' + total + '</span></div><div class="my-palette-summary__copy"><div class="my-palette-summary__title">' + summaryTitle + '</div><div class="my-palette-summary__hint">默认启用 221 常用；可增减或粘贴清单，图片转换只使用这些颜色。</div></div></div>' +
      '<div class="preset-row">' +
        '<button class="preset-pill ' + (state.myPalettePreset === '221' ? 'is-active' : '') + '" data-action="mypalette-preset" data-preset="221">221 常用</button>' +
        '<button class="preset-pill ' + (state.myPalettePreset === '291' ? 'is-active' : '') + '" data-action="mypalette-preset" data-preset="291">291 全色</button>' +
        '<button class="preset-pill ' + (state.myPalettePreset === 'custom' ? 'is-active' : '') + '" data-action="mypalette-preset" data-preset="custom">自定义</button>' +
      '</div>' +
      '<div class="series-toggle-row">' + seriesToggles + '</div>' +
      '<div class="paste-box"><div class="paste-box__head">' + icon('edit') + '粘贴色号清单</div>' +
        '<textarea class="textarea" data-input="mypalette-paste" placeholder="A01, A02, F04…&#10;支持逗号、空格或换行分隔，可粘贴 226 色套装清单">' + esc(state.myPalettePaste) + '</textarea>' +
        '<div class="paste-box__foot"><span class="paste-box__hint">例如从商品页面复制的色号列表</span><button class="btn btn--secondary btn--sm" data-action="parse-mypalette">解析并启用</button></div>' +
      '</div>' +
      '<div class="pick-grid">' + picks + '</div>' +
      '<div class="stat-footnote" style="margin-top:14px">原型内置完整 MARD ' + total + ' 色（221 常用 + 70 特殊效果），默认启用 221；也可粘贴 226 色套装清单。屏幕色值仅供参考，数据保存在本机。</div>';
  }

  function toggleMyColor(code) {
    var draft = state.myPaletteDraft;
    if (!draft) return;
    if (draft.has(code)) draft.delete(code); else draft.add(code);
    state.myPalettePreset = 'custom';
    var el = $('.pick-item[data-color="' + code + '"]');
    if (el) {
      var on = draft.has(code);
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-pressed', String(on));
    }
    var count = $('[data-role="mypalette-count"]');
    if (count) count.textContent = draft.size;
    $$('.preset-pill').forEach(function (p) {
      p.classList.toggle('is-active', p.dataset.preset === 'custom');
    });
    refreshMySeriesStates();
  }

  function refreshMySeriesStates() {
    var draft = state.myPaletteDraft || new Set();
    $$('.series-toggle').forEach(function (btn) {
      var s = btn.dataset.series;
      var colors = palette.filter(function (c) { return s === '其他' ? isOtherSeries(c) : c.series === s; });
      var all = colors.length > 0 && colors.every(function (c) { return draft.has(c.code); });
      btn.classList.toggle('is-on', all);
      btn.innerHTML = (all ? icon('check') : '') + s;
    });
  }

  function saveMyPalette() {
    if (state.myPaletteDraft) state.myPalette = new Set(state.myPaletteDraft);
    state.myPaletteDraft = null;
    persistDemo();
    var ret = state.paletteReturn;
    state.paletteReturn = null;
    if (ret) {
      state.overlay = ret;
      renderOverlay();
    } else {
      state.overlay = null;
      renderOverlay();
      if (state.view === 'wizard') paintView();
      else refreshPaletteAll();
    }
    showToast('我的色卡已更新（' + state.myPalette.size + ' 色）');
  }

  /* ---------- 画布设置 ---------- */

  function openSettings() {
    var project = getProject();
    if (!project) return;
    var s = statsOfProject(project);
    var used = s.list.map(function (item) { return item.color.code; });
    state.settings = {
      width: project.width,
      height: project.height,
      anchor: 'center',
      replaceFrom: used[0] || state.selectedColor,
      replaceTo: used[1] || state.selectedColor
    };
    openOverlay('settings');
  }

  function renderSettingsOverlay() {
    var phone = state.layout === 'phone';
    var cls = phone ? 'sheet sheet--bottom sheet--tall' : 'dialog dialog--wide';
    return '<div class="' + cls + '" role="dialog" aria-modal="true" aria-labelledby="settings-title">' +
      (phone ? '<div class="sheet__grabber"></div>' : '') +
      '<div class="' + (phone ? 'sheet__head' : 'dialog__head') + '"><h2 id="settings-title">画布设置</h2><button class="icon-btn" data-action="close-overlay" aria-label="关闭">' + icon('close') + '</button></div>' +
      '<div class="' + (phone ? 'sheet__body' : 'dialog__body') + '">' + renderSettingsBody() + '</div>' +
      '<div class="' + (phone ? 'sheet__foot' : 'dialog__foot') + '"><button class="btn btn--primary btn--block" data-action="close-overlay">完成</button></div>' +
    '</div>';
  }

  function renderSettingsBody() {
    var project = getProject();
    if (!project) return '';
    var s = statsOfProject(project);
    var used = s.list.map(function (item) { return item.color; });
    var anchors = [
      ['top-left', '左上'], ['top', '上'], ['top-right', '右上'],
      ['left', '左'], ['center', '中'], ['right', '右'],
      ['bottom-left', '左下'], ['bottom', '下'], ['bottom-right', '右下']
    ];
    var anchorHtml = anchors.map(function (a) {
      return '<button class="anchor-btn ' + (state.settings.anchor === a[0] ? 'is-active' : '') + '" data-action="set-anchor" data-anchor="' + a[0] + '" aria-label="' + a[1] + '锚点"></button>';
    }).join('');
    var strip = function (which, current) {
      return '<div class="replace-strip">' + used.map(function (c) {
        return '<button class="replace-swatch ' + (current === c.code ? 'is-active' : '') + '" style="--bead:' + c.hex + '" data-action="set-replace" data-which="' + which + '" data-color="' + c.code + '" aria-label="' + c.code + ' ' + c.name + '"></button>';
      }).join('') + '</div>';
    };
    var from = byCode[state.settings.replaceFrom];
    var to = byCode[state.settings.replaceTo];
    return '<div class="settings-section"><div class="settings-section__title">' + icon('grid') + '画布尺寸</div>' +
        '<div class="size-row">' +
          '<div class="field"><label class="field__label">宽（格）</label><input class="input" type="number" min="1" max="300" data-input="settings-width" value="' + state.settings.width + '"></div>' +
          '<div class="field"><label class="field__label">高（格）</label><input class="input" type="number" min="1" max="300" data-input="settings-height" value="' + state.settings.height + '"></div>' +
          '<div class="anchor-grid" role="group" aria-label="缩放锚点">' + anchorHtml + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:10px;align-items:center"><button class="btn btn--secondary btn--sm" data-action="apply-resize">' + icon('crop') + '应用尺寸</button><span class="settings-section__hint" style="margin:0">缩小画布会裁掉超出范围的豆子，可撤销。</span></div>' +
      '</div>' +
      '<div class="settings-section"><div class="settings-section__title">' + icon('layers') + '整图变换</div>' +
        '<div class="transform-grid">' +
          '<button class="transform-btn" data-action="flip-h">' + icon('flip-h') + '水平翻转</button>' +
          '<button class="transform-btn" data-action="flip-v">' + icon('flip-v') + '垂直翻转</button>' +
          '<button class="transform-btn" data-action="rotate-left">' + icon('rotate-left') + '左转 90°</button>' +
          '<button class="transform-btn" data-action="rotate-right">' + icon('rotate-right') + '右转 90°</button>' +
        '</div>' +
      '</div>' +
      '<div class="settings-section"><div class="settings-section__title">' + icon('swap') + '整图替换颜色</div>' +
        (used.length ? '<div class="replace-block">' +
          '<div class="replace-row"><span class="replace-row__label">从</span>' + strip('from', state.settings.replaceFrom) + '</div>' +
          '<div class="replace-row"><span class="replace-row__label">替换为</span>' + strip('to', state.settings.replaceTo) + '</div>' +
          '<div style="display:flex;align-items:center;gap:9px;margin-top:2px"><div class="replace-preview"><span class="bead-dot bead-dot--sm" style="--bead:' + from.hex + '"></span><strong>' + from.code + '</strong><span>→</span><span class="bead-dot bead-dot--sm" style="--bead:' + to.hex + '"></span><strong>' + to.code + '</strong></div><button class="btn btn--secondary btn--sm" data-action="apply-replace" ' + (from.code === to.code ? 'disabled' : '') + '>应用替换</button></div>' +
        '</div>' : '<div class="settings-section__hint">画布还没有使用任何颜色。</div>') +
      '</div>' +
      '<div class="settings-section" style="margin-bottom:0;padding-bottom:0;border-bottom:0"><div class="danger-zone"><div class="danger-zone__copy"><div class="danger-zone__title">清空画布</div><div class="danger-zone__hint">删除所有豆子，可通过撤销恢复。</div></div><button class="btn btn--quiet-danger btn--sm" data-action="ask-clear">清空</button></div></div>';
  }

  /* ---------- 菜单 / 工程菜单 / 重命名 / 确认 ---------- */

  function renderMenu() {
    var items = [];
    items.push('<button class="menu-item" data-action="open-wizard" data-entry="editor">' + icon('image') + '从图片导入</button>');
    items.push('<button class="menu-item" data-action="open-mypalette">' + icon('bead') + '我的色卡</button>');
    items.push('<button class="menu-item" data-action="open-settings">' + icon('settings') + '画布设置</button>');
    items.push('<div class="menu-sep"></div>');
    items.push('<button class="menu-item" data-action="toggle-codes">' + icon('code') + '显示格内色号<span class="menu-item__check ' + (state.showCodes ? 'is-on' : '') + '">' + icon('check') + '</span></button>');
    items.push('<button class="menu-item" data-action="toggle-grid">' + icon('grid') + '显示网格<span class="menu-item__check ' + (state.showGrid ? 'is-on' : '') + '">' + icon('check') + '</span></button>');
    items.push('<button class="menu-item" data-action="cycle-symmetry">' + icon('symmetry') + '对称绘制<span class="menu-item__meta">' + symLabel(state.symmetry) + '</span></button>');
    items.push('<button class="menu-item" data-action="cycle-brush">' + icon('pencil') + '笔刷大小<span class="menu-item__meta">' + state.brushSize + '×' + state.brushSize + '</span></button>');
    items.push('<div class="menu-sep"></div>');
    items.push('<button class="menu-item" data-action="open-stats">' + icon('stats') + '用量统计</button>');
    items.push('<button class="menu-item" data-action="open-export">' + icon('download') + '导出图纸</button>');
    items.push('<div class="menu-sep"></div>');
    items.push('<button class="menu-item" data-action="go-home">' + icon('back') + '返回首页</button>');
    return '<div class="menu-scrim" data-action="close-menu"></div><div class="menu-popover" role="menu">' + items.join('') + '</div>';
  }

  function openProjectMenu(id) {
    state.projectMenuId = id;
    openOverlay('project-menu');
  }

  function renderProjectMenuOverlay() {
    var project = state.projects.find(function (p) { return p.id === state.projectMenuId; });
    if (!project) return '';
    var phone = state.layout === 'phone';
    var cls = phone ? 'sheet sheet--bottom' : 'dialog dialog--narrow';
    return '<div class="' + cls + '" role="dialog" aria-modal="true">' +
      (phone ? '<div class="sheet__grabber"></div>' : '') +
      '<div class="' + (phone ? 'sheet__head' : 'dialog__head') + '"><h2>' + esc(project.name) + '</h2><button class="icon-btn" data-action="close-overlay" aria-label="关闭">' + icon('close') + '</button></div>' +
      '<div class="' + (phone ? 'sheet__body' : 'dialog__body') + '" style="padding-top:8px">' +
        '<button class="menu-item" data-action="menu-open-project" data-project="' + project.id + '">' + icon('arrow-right') + '打开图纸</button>' +
        '<button class="menu-item" data-action="copy-project" data-project="' + project.id + '">' + icon('copy') + '复制一份</button>' +
        '<button class="menu-item" data-action="menu-rename-project" data-project="' + project.id + '">' + icon('edit') + '重命名</button>' +
        '<div class="menu-sep"></div>' +
        '<button class="menu-item menu-item--danger" data-action="menu-delete-project" data-project="' + project.id + '">' + icon('trash') + '删除图纸</button>' +
      '</div>' +
    '</div>';
  }

  function openRename(id) {
    var project = state.projects.find(function (p) { return p.id === id; });
    if (!project) return;
    state.renameProjectId = id;
    state.renameValue = project.name;
    state.renameReturn = state.overlay;
    state.overlay = { type: 'rename-project' };
    renderOverlay();
  }

  function renderRenameOverlay() {
    var phone = state.layout === 'phone';
    var cls = phone ? 'sheet sheet--bottom' : 'dialog dialog--narrow';
    return '<div class="' + cls + '" role="dialog" aria-modal="true">' +
      (phone ? '<div class="sheet__grabber"></div>' : '') +
      '<div class="' + (phone ? 'sheet__head' : 'dialog__head') + '"><h2>重命名图纸</h2><button class="icon-btn" data-action="cancel-rename" aria-label="关闭">' + icon('close') + '</button></div>' +
      '<div class="' + (phone ? 'sheet__body' : 'dialog__body') + '"><div class="field"><label class="field__label">名称</label><input class="input" data-input="rename-name" data-autofocus value="' + esc(state.renameValue) + '" maxlength="40"></div></div>' +
      '<div class="' + (phone ? 'sheet__foot' : 'dialog__foot') + '"><button class="btn btn--ghost" data-action="cancel-rename">取消</button><button class="btn btn--primary" style="flex:1" data-action="save-rename">保存</button></div>' +
    '</div>';
  }

  function openConfirm(action, returnOverlay) {
    state.confirmAction = action;
    state.confirmReturn = returnOverlay || null;
    state.overlay = { type: 'confirm' };
    renderOverlay();
  }

  function renderConfirmOverlay() {
    var isDelete = state.confirmAction && state.confirmAction.type === 'delete-project';
    var title = isDelete ? '删除这张图纸？' : '清空画布？';
    var text = isDelete ? '删除后无法恢复，相关的用量统计也会一起消失。' : '画布上的所有豆子会被删除，可通过撤销恢复。';
    var confirmLabel = isDelete ? '删除' : '清空';
    var phone = state.layout === 'phone';
    var cls = phone ? 'sheet sheet--bottom' : 'dialog dialog--narrow';
    return '<div class="' + cls + '" role="alertdialog" aria-modal="true">' +
      (phone ? '<div class="sheet__grabber"></div>' : '') +
      '<div class="' + (phone ? 'sheet__head' : 'dialog__head') + '"><h2>' + title + '</h2><button class="icon-btn" data-action="cancel-confirm" aria-label="关闭">' + icon('close') + '</button></div>' +
      '<div class="' + (phone ? 'sheet__body' : 'dialog__body') + '"><p style="color:var(--muted);font-size:12px;line-height:1.7">' + text + '</p></div>' +
      '<div class="' + (phone ? 'sheet__foot' : 'dialog__foot') + '"><button class="btn btn--ghost" data-action="cancel-confirm">取消</button><button class="btn btn--danger" style="flex:1" data-action="confirm-action">' + confirmLabel + '</button></div>' +
    '</div>';
  }

  /* ---------- 图片转图纸向导 ---------- */

  function getWizardSample() {
    var id = state.wizard ? state.wizard.sampleId : 'sample-strawberry';
    for (var i = 0; i < M.samples.length; i++) if (M.samples[i].id === id) return M.samples[i];
    return M.samples[0];
  }

  function openWizard(entry) {
    var project = getProject();
    var sample = M.samples[0];
    state.wizard = {
      step: 1,
      entry: entry || 'home',
      sampleId: sample.id,
      zoom: 1,
      rotate: 0,
      fit: 'fill',
      brightness: 100,
      contrast: 100,
      saturation: 100,
      removeBg: true,
      tolerance: 18,
      maxColors: 24,
      dither: false,
      applyMode: entry === 'editor' ? 'replace' : 'new',
      name: entry === 'editor' && project ? project.name + ' 图纸' : sample.name + '图纸',
      nameTouched: false,
      split: 50
    };
    state.view = 'wizard';
    state.overlay = null;
    state.menuOpen = false;
    paintView();
    renderOverlay();
  }

  function closeWizard() {
    var entry = state.wizard ? state.wizard.entry : 'home';
    state.wizard = null;
    state.view = entry === 'editor' && getProject() ? 'editor' : 'home';
    state.overlay = null;
    paintView();
    renderOverlay();
  }

  function renderWizard() {
    var w = state.wizard;
    if (!w) return renderHome();
    var labels = ['选图', '裁剪', '调色', '预览', '应用'];
    var stepper = '';
    labels.forEach(function (label, i) {
      var n = i + 1;
      var cls = n === w.step ? 'is-active' : n < w.step ? 'is-done' : '';
      stepper += '<button class="step ' + cls + '" data-action="wizard-step" data-step="' + n + '" ' + (n > w.step ? 'disabled' : '') + '>' +
        '<span class="step__num">' + (n < w.step ? icon('check') : n) + '</span><span class="step__label">' + label + '</span>' +
      '</button>';
      if (i < labels.length - 1) stepper += '<span class="step__line"></span>';
    });
    return '<div class="wizard">' +
      '<div class="wizard__top"><button class="icon-btn" data-action="close-wizard" aria-label="关闭向导">' + icon('close') + '</button><h1>图片转图纸</h1><div class="stepper">' + stepper + '</div></div>' +
      '<div class="wizard__body"><div class="wizard__inner">' + renderWizardStep() + '</div></div>' +
      '<div class="wizard__foot">' + renderWizardFoot() + '</div>' +
    '</div>';
  }

  function renderWizardStep() {
    if (state.wizard.step === 1) return renderWizardStep1();
    if (state.wizard.step === 2) return renderWizardStep2();
    if (state.wizard.step === 3) return renderWizardStep3();
    if (state.wizard.step === 4) return renderWizardStep4();
    return renderWizardStep5();
  }

  function renderWizardStep1() {
    var samples = M.samples.map(function (s) {
      var active = state.wizard.sampleId === s.id;
      return '<button class="sample-card ' + (active ? 'is-active' : '') + '" data-action="wizard-sample" data-sample="' + s.id + '" aria-pressed="' + active + '">' +
        '<span class="sample-card__thumb"><canvas data-sample-thumb="' + s.id + '" aria-hidden="true"></canvas><span class="sample-card__check">' + icon('check') + '</span></span>' +
        '<span class="sample-card__body"><span class="sample-card__name">' + s.name + '</span><span class="sample-card__meta">' + s.hint + '</span></span>' +
      '</button>';
    }).join('');
    return '<div class="wizard-heading"><div class="wizard-heading__eyebrow">' + icon('image') + 'STEP 1 · 选择图片</div><h2>从一张图片开始</h2><p>主体清晰、背景简单的图片效果最好。原型中请选择下方示例图片。</p></div>' +
      '<button class="dropzone" data-action="wizard-upload-demo">' +
        '<span class="dropzone__icon">' + icon('upload') + '</span>' +
        '<span class="dropzone__title">选择一张图片</span>' +
        '<span class="dropzone__hint">JPG / PNG / WebP，建议 1000px 以上</span>' +
        '<span class="dropzone__demo">' + icon('sparkles') + '原型演示：使用示例图片</span>' +
      '</button>' +
      '<div class="sample-section"><div class="sample-section__head"><h3>示例图片</h3><span>点击选择</span></div><div class="sample-grid">' + samples + '</div></div>';
  }

  function renderWizardStep2() {
    var w = state.wizard;
    return '<div class="wizard-heading"><div class="wizard-heading__eyebrow">' + icon('crop') + 'STEP 2 · 裁剪</div><h2>把主体放进画布</h2><p>裁剪框比例与 52×52 图纸一致，拖动滑块缩放，点击旋转调整方向。</p></div>' +
      '<div class="crop-layout">' +
        '<div class="crop-card"><div class="crop-view"><canvas data-role="crop-canvas" aria-label="裁剪预览"></canvas><span class="crop-view__badge">裁剪预览 · 52×52</span></div></div>' +
        '<div class="crop-side">' +
          '<div class="crop-controls">' +
            '<div class="field"><div class="field__label" style="justify-content:space-between"><span>缩放</span><span class="tabular" data-value="crop-zoom">' + Math.round(w.zoom * 100) + '%</span></div><input class="slider" type="range" min="100" max="200" step="1" value="' + Math.round(w.zoom * 100) + '" data-input="wizard-zoom"></div>' +
            '<div class="crop-controls__row" style="margin-top:13px"><button class="btn btn--secondary btn--sm" data-action="wizard-rotate">' + icon('rotate-right') + '<span data-value="crop-rotate">旋转 ' + w.rotate + '°</span></button></div>' +
            '<div class="crop-controls__row" style="margin-top:10px"><div class="segmented" style="width:100%"><button class="' + (w.fit === 'fill' ? 'is-active' : '') + '" data-action="wizard-fit" data-fit="fill" style="flex:1">填充</button><button class="' + (w.fit === 'contain' ? 'is-active' : '') + '" data-action="wizard-fit" data-fit="contain" style="flex:1">适应</button></div></div>' +
          '</div>' +
          '<div class="crop-tip">' + icon('info') + '<span>裁剪只影响转换所用的画面区域；原型使用示例图演示。</span></div>' +
        '</div>' +
      '</div>';
  }

  function wizardSlider(label, key, min, max, value) {
    return '<div class="control-slider"><span class="control-slider__label">' + label + '</span>' +
      '<input class="slider" type="range" min="' + min + '" max="' + max + '" value="' + value + '" data-input="wizard-' + key + '">' +
      '<span class="control-slider__value" data-value="' + key + '">' + value + '</span></div>';
  }

  function renderWizardStep3() {
    var w = state.wizard;
    var pattern = computeWizardPattern();
    var s = statsOfPattern(pattern);
    return '<div class="wizard-heading"><div class="wizard-heading__eyebrow">' + icon('sparkles') + 'STEP 3 · 调色</div><h2>让颜色更像拼豆</h2><p>调整色彩与色数，结果会自动匹配 MARD 色卡，并只使用「我的色卡」里的颜色。</p></div>' +
      '<div class="import-layout">' +
        '<div class="control-stack">' +
          '<div class="control-card"><div class="control-card__head">' + icon('sparkles') + '色彩调整</div>' +
            wizardSlider('亮度', 'brightness', 50, 150, w.brightness) +
            wizardSlider('对比度', 'contrast', 50, 150, w.contrast) +
            wizardSlider('饱和度', 'saturation', 0, 200, w.saturation) +
          '</div>' +
          '<div class="control-card"><div class="control-card__head">' + icon('image') + '背景处理</div>' +
            '<div class="control-row"><div class="control-label">自动移除浅色背景<div class="option-row__hint">适合白底商品图或线稿</div></div><button class="switch ' + (w.removeBg ? 'is-on' : '') + '" data-action="wizard-toggle" data-key="removeBg" role="switch" aria-checked="' + !!w.removeBg + '"></button></div>' +
            '<div class="control-sub" style="' + (w.removeBg ? '' : 'opacity:.45') + '"><div class="control-slider"><span class="control-slider__label">容差</span><input class="slider" type="range" min="4" max="60" value="' + w.tolerance + '" data-input="wizard-tolerance" ' + (w.removeBg ? '' : 'disabled') + '><span class="control-slider__value" data-value="tolerance">' + w.tolerance + '</span></div></div>' +
          '</div>' +
          '<div class="control-card"><div class="control-card__head">' + icon('palette') + '色卡与颜色</div>' +
            '<div class="control-row"><div class="control-label">最多颜色数<div class="option-row__hint">数值越少，图纸越简洁</div></div><div class="stepper"><button data-action="wizard-colors-minus" aria-label="减少颜色">' + icon('minus') + '</button><span class="stepper__value" data-role="wizard-colors-value">' + w.maxColors + '</span><button data-action="wizard-colors-plus" aria-label="增加颜色">' + icon('plus') + '</button></div></div>' +
            '<div class="control-row"><div class="control-label">Floyd–Steinberg 抖动<div class="option-row__hint">用细密色点表现渐变</div></div><button class="switch ' + (w.dither ? 'is-on' : '') + '" data-action="wizard-toggle" data-key="dither" role="switch" aria-checked="' + !!w.dither + '"></button></div>' +
            '<div class="control-row"><div class="control-label">使用色卡<div class="option-row__hint">MARD · 我的色卡 ' + state.myPalette.size + ' 色</div></div><button class="text-link" data-action="open-mypalette">调整</button></div>' +
          '</div>' +
        '</div>' +
        '<div class="import-preview">' +
          '<div class="import-preview__canvas"><canvas data-role="wizard-preview" aria-label="转换预览"></canvas><span class="processing-pill" data-role="processing"><span class="spinner"></span>处理中</span></div>' +
          '<div class="import-preview__meta"><span>52×52 · 2.6mm</span><span class="spacer"></span><strong data-role="wizard-total">' + fmt(s.total) + '</strong><span>颗</span><span>·</span><strong data-role="wizard-color-count">' + s.colorCount + '</strong><span>色</span></div>' +
        '</div>' +
      '</div>';
  }

  function renderWizardStep4() {
    var w = state.wizard;
    return '<div class="wizard-heading"><div class="wizard-heading__eyebrow">' + icon('eye') + 'STEP 4 · 预览</div><h2>原图与图纸对比</h2><p>拖动中间滑块查看转换效果；如有偏差，可以返回上一步调整色彩或色数。</p></div>' +
      '<div class="compare" data-role="compare" style="--split:' + (w.split || 50) + '%">' +
        '<div class="compare__layer"><canvas data-role="compare-before" aria-label="原图"></canvas></div>' +
        '<div class="compare__layer compare__layer--after"><canvas data-role="compare-after" aria-label="图纸"></canvas></div>' +
        '<div class="compare__divider"><div class="compare__handle">' + icon('chevron-right') + icon('chevron-right') + '</div></div>' +
        '<span class="compare__label compare__label--before">原图</span>' +
        '<span class="compare__label compare__label--after">图纸</span>' +
      '</div>' +
      '<div class="compare-hint">' + icon('pan') + '拖动中间滑块对比原图与转换结果</div>';
  }

  function renderWizardStep5() {
    var w = state.wizard;
    var project = getProject();
    var pattern = computeWizardPattern();
    var s = statsOfPattern(pattern);
    var showName = !(w.entry === 'editor' && w.applyMode === 'replace');
    return '<div class="wizard-heading"><div class="wizard-heading__eyebrow">' + icon('check') + 'STEP 5 · 应用</div><h2>确认并放进画布</h2><p>应用后仍可逐格修改；替换当前画布时可通过撤销恢复原内容。</p></div>' +
      '<div class="apply-grid">' +
        '<div class="apply-thumb"><div class="apply-thumb__canvas"><canvas data-role="wizard-apply-thumb" aria-label="应用预览"></canvas></div><div class="apply-thumb__meta">' + pattern.width + '×' + pattern.height + ' · 2.6mm · ' + (pattern.width * 2.6 / 10).toFixed(1) + ' × ' + (pattern.height * 2.6 / 10).toFixed(1) + ' cm</div></div>' +
        '<div class="apply-form">' +
          '<div class="summary-cards">' +
            '<div class="summary-card"><div class="summary-card__label">总颗数</div><div class="summary-card__value">' + fmt(s.total) + '<small>颗</small></div></div>' +
            '<div class="summary-card"><div class="summary-card__label">颜色</div><div class="summary-card__value">' + s.colorCount + '<small>色</small></div></div>' +
            '<div class="summary-card"><div class="summary-card__label">画布</div><div class="summary-card__value">' + pattern.width + '<small>格</small></div></div>' +
          '</div>' +
          (showName ? '<div class="field"><label class="field__label">图纸名称</label><input class="input" data-input="wizard-name" value="' + esc(w.name) + '" maxlength="40" placeholder="给图纸起个名字"></div>' : '') +
          (w.entry === 'editor' ? '<div class="radio-cards">' +
            '<button class="radio-card ' + (w.applyMode === 'replace' ? 'is-active' : '') + '" data-action="wizard-mode" data-mode="replace"><span class="radio-card__dot"></span><span class="radio-card__copy"><span class="radio-card__title">替换当前画布</span><span class="radio-card__hint">保留工程名称，替换尺寸与内容</span></span></button>' +
            '<button class="radio-card ' + (w.applyMode === 'new' ? 'is-active' : '') + '" data-action="wizard-mode" data-mode="new"><span class="radio-card__dot"></span><span class="radio-card__copy"><span class="radio-card__title">新建工程</span><span class="radio-card__hint">保留当前画布，另存一张新图纸</span></span></button>' +
          '</div>' : '') +
          (w.entry === 'editor' && w.applyMode === 'replace' && project ? '<div class="apply-warning">' + icon('warning') + '<span>当前画布为 ' + project.width + '×' + project.height + '，应用后将变为 ' + pattern.width + '×' + pattern.height + '。原内容可通过撤销恢复。</span></div>' : '') +
          '<div class="export-note" style="margin-top:0">' + icon('info') + '<span>应用后仍可逐格修改；图片转换会尽量贴近我的色卡范围。</span></div>' +
        '</div>' +
      '</div>';
  }

  function renderWizardFoot() {
    var w = state.wizard;
    var hints = ['建议使用主体清晰、背景简单的图片', '裁剪比例与图纸一致', '调整后自动匹配真实色号', '拖动滑块对比原图与图纸', '应用后仍可逐格修改'];
    return '<span class="wizard__hint">' + hints[w.step - 1] + '</span>' +
      (w.step > 1 ? '<button class="btn btn--ghost" data-action="wizard-back">' + icon('back') + '上一步</button>' : '') +
      '<button class="btn btn--primary" data-action="' + (w.step === 5 ? 'wizard-apply' : 'wizard-next') + '">' + (w.step === 5 ? '应用图纸' : '下一步') + icon(w.step === 5 ? 'check' : 'arrow-right') + '</button>';
  }

  function computeWizardPattern() {
    var w = state.wizard;
    var sample = getWizardSample();
    var allowed = state.myPalette && state.myPalette.size ? state.myPalette : null;
    var cells = new Uint16Array(sample.pattern.cells.length);
    var map = {};
    for (var i = 0; i < sample.pattern.cells.length; i++) {
      var v = sample.pattern.cells[i];
      if (v === EMPTY) { cells[i] = EMPTY; continue; }
      if (map[v] === undefined) {
        var adjusted = adjustHex(palette[v].hex, w.brightness, w.contrast, w.saturation);
        map[v] = nearestPaletteIndex(hexToRgb(adjusted), allowed);
      }
      cells[i] = map[v];
    }

    var counts = {};
    for (var j = 0; j < cells.length; j++) {
      var c = cells[j];
      if (c !== EMPTY) counts[c] = (counts[c] || 0) + 1;
    }
    var keys = Object.keys(counts).map(Number).sort(function (a, b) { return counts[b] - counts[a]; });
    if (keys.length > w.maxColors) {
      var keep = keys.slice(0, w.maxColors);
      var keepSet = new Set(keep);
      for (var k = 0; k < cells.length; k++) {
        var val = cells[k];
        if (val === EMPTY || keepSet.has(val)) continue;
        var rgb = hexToRgb(palette[val].hex);
        var best = keep[0], bestD = Infinity;
        for (var m = 0; m < keep.length; m++) {
          var d = rgbDistance(rgb, palette[keep[m]].hex);
          if (d < bestD) { bestD = d; best = keep[m]; }
        }
        cells[k] = best;
      }
    }

    if (w.dither) {
      var used = {};
      for (var q = 0; q < cells.length; q++) if (cells[q] !== EMPTY) used[cells[q]] = 1;
      var usedKeys = Object.keys(used).map(Number);
      if (usedKeys.length > 1) {
        for (var y = 0; y < sample.pattern.height; y++) {
          for (var x = 0; x < sample.pattern.width; x++) {
            var idx = cells[y * sample.pattern.width + x];
            if (idx === EMPTY) continue;
            if ((x * 3 + y * 5) % 7 === 0) {
              var second = usedKeys[0] === idx ? usedKeys[1] : usedKeys[0];
              if (rgbDistance(hexToRgb(palette[idx].hex), palette[second].hex) < 26000) {
                cells[y * sample.pattern.width + x] = second;
              }
            }
          }
        }
      }
    }

    return { width: sample.pattern.width, height: sample.pattern.height, cells: cells };
  }

  function initWizardView() {
    if (!state.wizard) return;
    var step = state.wizard.step;
    if (step === 1) {
      $$('[data-sample-thumb]').forEach(function (canvas) {
        var sample = null;
        for (var i = 0; i < M.samples.length; i++) if (M.samples[i].id === canvas.dataset.sampleThumb) sample = M.samples[i];
        if (sample) PC.drawSampleThumb(canvas, sample);
      });
    } else if (step === 2) {
      drawCropView();
    } else if (step === 3) {
      drawWizardPreview();
    } else if (step === 4) {
      drawWizardCompare();
      bindCompareDrag();
    } else if (step === 5) {
      drawWizardApplyThumb();
    }
    paintAllSliders();
  }

  function drawCropView() {
    var canvas = $('[data-role="crop-canvas"]');
    if (!canvas || !state.wizard) return;
    PC.drawCrop(canvas, getWizardSample(), {
      zoom: state.wizard.zoom,
      rotate: state.wizard.rotate,
      fit: state.wizard.fit
    });
  }

  function drawWizardPreview() {
    var canvas = $('[data-role="wizard-preview"]');
    if (!canvas || !state.wizard) return;
    var pattern = computeWizardPattern();
    PC.drawPatternPreview(canvas, pattern, { background: '#F4ECDD', pad: 10 });
    var s = statsOfPattern(pattern);
    $$('[data-role="wizard-total"]').forEach(function (el) { el.textContent = fmt(s.total); });
    $$('[data-role="wizard-color-count"]').forEach(function (el) { el.textContent = s.colorCount; });
    var proc = $('[data-role="processing"]');
    if (proc) proc.classList.remove('is-on');
  }

  function drawWizardCompare() {
    var before = $('[data-role="compare-before"]');
    var after = $('[data-role="compare-after"]');
    if (!before || !after) return;
    PC.drawPhoto(before, getWizardSample().pattern);
    PC.drawPatternPreview(after, computeWizardPattern(), { background: '#FFFCF5', pad: 8 });
    var compare = $('[data-role="compare"]');
    if (compare) compare.style.setProperty('--split', (state.wizard.split || 50) + '%');
  }

  function drawWizardApplyThumb() {
    var canvas = $('[data-role="wizard-apply-thumb"]');
    if (!canvas) return;
    PC.drawPatternPreview(canvas, computeWizardPattern(), { background: '#F4ECDD', pad: 8 });
  }

  var previewTimer = 0;
  function scheduleWizardPreview() {
    var proc = $('[data-role="processing"]');
    if (proc) proc.classList.add('is-on');
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      if (state.view !== 'wizard' || !state.wizard) return;
      if (state.wizard.step === 3) drawWizardPreview();
      if (state.wizard.step === 4) drawWizardCompare();
    }, 90);
  }

  function updateWizardValueLabels() {
    var w = state.wizard;
    if (!w) return;
    $$('[data-value="brightness"]').forEach(function (el) { el.textContent = w.brightness; });
    $$('[data-value="contrast"]').forEach(function (el) { el.textContent = w.contrast; });
    $$('[data-value="saturation"]').forEach(function (el) { el.textContent = w.saturation; });
    $$('[data-value="tolerance"]').forEach(function (el) { el.textContent = w.tolerance; });
    $$('[data-value="crop-zoom"]').forEach(function (el) { el.textContent = Math.round(w.zoom * 100) + '%'; });
    $$('[data-value="crop-rotate"]').forEach(function (el) { el.textContent = '旋转 ' + w.rotate + '°'; });
  }

  function bindCompareDrag() {
    var compare = $('[data-role="compare"]');
    if (!compare) return;
    var dragging = false;
    function setSplit(clientX) {
      var rect = compare.getBoundingClientRect();
      var p = clamp(((clientX - rect.left) / rect.width) * 100, 5, 95);
      compare.style.setProperty('--split', p + '%');
      state.wizard.split = p;
    }
    compare.addEventListener('pointerdown', function (e) {
      dragging = true;
      if (compare.setPointerCapture) { try { compare.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      setSplit(e.clientX);
    });
    compare.addEventListener('pointermove', function (e) {
      if (dragging) setSplit(e.clientX);
    });
    compare.addEventListener('pointerup', function () { dragging = false; });
    compare.addEventListener('pointercancel', function () { dragging = false; });
    compare.style.setProperty('--split', (state.wizard.split || 50) + '%');
  }

  function applyWizard() {
    var w = state.wizard;
    if (!w) return;
    var pattern = computeWizardPattern();
    var s = statsOfPattern(pattern);
    var project = getProject();
    if (w.entry === 'editor' && w.applyMode === 'replace' && project) {
      state.history.undo.push({ width: project.width, height: project.height, cells: project.cells.slice() });
      if (state.history.undo.length > 40) state.history.undo.shift();
      state.history.redo.length = 0;
      project.width = pattern.width;
      project.height = pattern.height;
      project.cells = pattern.cells.slice();
      project.boardW = project.beadSizeMm === 5 ? 29 : 52;
      project.boardH = project.beadSizeMm === 5 ? 29 : 52;
      project.updatedLabel = '刚刚';
      state.selectedColor = s.list.length ? s.list[0].color.code : state.selectedColor;
      state.editorView = { zoom: 1, panX: 0, panY: 0 };
      state.wizard = null;
      state.view = 'editor';
      paintView();
      renderOverlay();
      showToast('已替换当前画布，可撤销恢复');
    } else {
      var name = w.name && w.name.trim() ? w.name.trim() : (getWizardSample().name + '图纸');
      var created = projectFromPattern(pattern, name, 2.6);
      state.projects.unshift(created);
      state.currentProjectId = created.id;
      state.selectedColor = s.list.length ? s.list[0].color.code : state.selectedColor;
      state.paletteTab = 'used';
      state.paletteSearch = '';
      state.seriesFilter = 'all';
      state.history = { undo: [], redo: [] };
      state.editorView = { zoom: 1, panX: 0, panY: 0 };
      state.wizard = null;
      state.view = 'editor';
      paintView();
      renderOverlay();
      showToast('图纸已加入工程');
    }
  }

  /* ---------- 设计系统 ---------- */

  function renderDesignSystem() {
    var tokens = [
      ['纸张', '#F6F1E7'], ['卡片', '#FFFDF7'], ['浅底', '#F8F2E7'], ['墨色', '#2A241E'],
      ['次级文字', '#7B7164'], ['描边', '#E6DCCB'], ['珊瑚', '#D95D4E'], ['深青', '#2F6B62'],
      ['提示金', '#C9933F'], ['危险', '#B83B32'], ['成功', '#4F7A52'], ['夜色', '#241F1A']
    ];
    var tokenCards = tokens.map(function (t) {
      return '<div class="token-swatch"><div class="token-swatch__chip" style="--c:' + t[1] + '"></div><div class="token-swatch__name">' + t[0] + '</div><div class="token-swatch__hex">' + t[1] + '</div></div>';
    }).join('');
    var beadStrip = palette.map(function (c) {
      return '<span class="demo-swatch" style="--bead:' + c.hex + ';width:22px;height:22px" title="' + c.code + ' ' + c.name + '"></span>';
    }).join('');
    var iconNames = ['back', 'undo', 'redo', 'more', 'download', 'share', 'stats', 'palette', 'pencil', 'eraser', 'fill', 'eyedropper', 'line', 'rect', 'ellipse', 'pan', 'symmetry', 'zoom-in', 'zoom-out', 'fit', 'search', 'close', 'check', 'chevron-right', 'chevron-down', 'plus', 'minus', 'rotate-left', 'rotate-right', 'flip-h', 'flip-v', 'image', 'upload', 'trash', 'copy', 'edit', 'settings', 'grid', 'code', 'warning', 'info', 'arrow-right', 'sparkles', 'folder', 'bead', 'swap', 'eye', 'crop', 'refresh', 'layers', 'clock'];
    var iconCells = iconNames.map(function (n) {
      return '<div class="icon-cell">' + icon(n) + '<span>' + n + '</span></div>';
    }).join('');
    var tools = [['pencil', '画笔', true], ['eraser', '橡皮', false], ['fill', '填充', false], ['pan', '平移', false]];
    var toolDemo = tools.map(function (t) {
      return '<button class="tool-btn ' + (t[2] ? 'is-active' : '') + '" style="width:48px;height:48px">' + icon(t[0]) + '<span>' + t[1] + '</span></button>';
    }).join('');

    return '<div class="ds"><div class="ds__inner">' +
      '<div class="ds__top"><button class="icon-btn" data-action="go-home" aria-label="返回首页">' + icon('back') + '</button><h1>设计系统</h1><span class="badge badge--soft">v0.1</span><button class="btn btn--secondary btn--sm" data-action="go-home">返回首页</button></div>' +
      '<div class="ds-intro"><div class="ds-intro__beads" aria-hidden="true"><span style="--bead:#D95D4E"></span><span style="--bead:#C9933F"></span><span style="--bead:#2F6B62"></span><span style="--bead:#41CCFF"></span></div><div class="ds-intro__copy"><strong>暖纸质手作感 · 触控优先</strong><span>设计 token、组件与状态以原型为准。所有触控目标不小于 44px，色卡是视觉主角，界面保持低饱和。</span></div></div>' +

      '<section class="ds-section"><div class="ds-section__head"><h2>色彩</h2><span>COLOR TOKENS</span></div><div class="ds-grid-4">' + tokenCards + '</div></section>' +

      '<section class="ds-section"><div class="ds-section__head"><h2>MARD 色板</h2><span>' + palette.length + ' COLORS · ' + M.defaultMyPalette.length + ' COMMON</span></div><div class="ds-card"><div style="display:flex;flex-wrap:wrap;gap:5px">' + beadStrip + '</div><div class="stat-footnote" style="margin-top:10px">完整 MARD ' + palette.length + ' 色（' + M.defaultMyPalette.length + ' 常用 + ' + (palette.length - M.defaultMyPalette.length) + ' 特殊效果）；默认启用 ' + M.defaultMyPalette.length + ' 常用。屏幕色值仅供参考。</div></div></section>' +

      '<section class="ds-section"><div class="ds-section__head"><h2>字体</h2><span>TYPE SCALE</span></div><div class="ds-card"><div class="type-samples">' +
        '<div class="type-sample"><span class="type-sample__label">DISPLAY 32</span><span class="type-sample__demo type-display">把灵感拼成豆子</span></div>' +
        '<div class="type-sample"><span class="type-sample__label">TITLE 18</span><span class="type-sample__demo type-title">草莓甜心 · 52×52</span></div>' +
        '<div class="type-sample"><span class="type-sample__label">BODY 13</span><span class="type-sample__demo type-body">导入图片或从空白开始，自动匹配真实色号。</span></div>' +
        '<div class="type-sample"><span class="type-sample__label">CAPTION 10</span><span class="type-sample__demo type-caption">2.6mm 融合豆 · MARD 色卡 · 已保存</span></div>' +
        '<div class="type-sample"><span class="type-sample__label">NUMBER</span><span class="type-sample__demo type-number">1,284 <span style="font-size:10px;color:var(--muted)">颗</span></span></div>' +
      '</div></div></section>' +

      '<section class="ds-section"><div class="ds-section__head"><h2>按钮</h2><span>BUTTONS</span></div><div class="ds-card"><div class="button-demo">' +
        '<button class="btn btn--primary">' + icon('plus') + '新建图纸</button>' +
        '<button class="btn btn--secondary">' + icon('image') + '从图片开始</button>' +
        '<button class="btn btn--ghost">取消</button>' +
        '<button class="btn btn--danger">删除</button>' +
        '<button class="btn btn--primary" disabled>禁用</button>' +
        '<button class="btn btn--primary btn--sm">小号</button>' +
      '</div></div></section>' +

      '<section class="ds-section"><div class="ds-section__head"><h2>工具按钮</h2><span>48 × 48 · ACTIVE STATE</span></div><div class="ds-card"><div class="tool-demo-row" style="padding-left:12px">' + toolDemo + '</div><div class="stat-footnote" style="margin-top:10px">激活态使用珊瑚浅底 + 珊瑚图标，左侧 3px 指示条。</div></div></section>' +

      '<section class="ds-section"><div class="ds-section__head"><h2>豆子色块</h2><span>SWATCH STATES</span></div><div class="ds-card"><div class="swatch-demo-row">' +
        '<div class="swatch-demo"><span class="demo-swatch" style="--bead:#F04A42"></span><span class="swatch-demo__caption">普通</span></div>' +
        '<div class="swatch-demo"><span class="demo-swatch is-selected" style="--bead:#F04A42"></span><span class="swatch-demo__caption">选中</span></div>' +
        '<div class="swatch-demo"><span class="demo-swatch" style="--bead:#F04A42"><span class="demo-swatch__badge">128</span></span><span class="swatch-demo__caption">已用 128</span></div>' +
        '<div class="swatch-demo"><span class="demo-swatch is-off" style="--bead:#F04A42"></span><span class="swatch-demo__caption">未启用</span></div>' +
        '<div class="swatch-demo"><span class="demo-swatch" style="--bead:#FEFFFF"></span><span class="swatch-demo__caption">浅色描边</span></div>' +
      '</div></div></section>' +

      '<section class="ds-section"><div class="ds-section__head"><h2>表单控件</h2><span>INPUTS &amp; CONTROLS</span></div><div class="ds-card">' +
        '<div class="ds-form-row"><span class="ds-form-label">搜索</span><div class="search-field">' + icon('search') + '<input placeholder="搜索色号或颜色名"></div></div>' +
        '<div class="ds-form-row"><span class="ds-form-label">滑块</span><input class="slider" type="range" min="0" max="100" value="64" style="width:160px"></div>' +
        '<div class="ds-form-row"><span class="ds-form-label">开关</span><span class="switch is-on"></span><span class="switch"></span><span class="small muted">开 / 关</span></div>' +
        '<div class="ds-form-row"><span class="ds-form-label">步进器</span><div class="stepper"><button>' + icon('minus') + '</button><span class="stepper__value">24</span><button>' + icon('plus') + '</button></div></div>' +
        '<div class="ds-form-row"><span class="ds-form-label">分段</span><div class="segmented"><button class="is-active">适配</button><button>1:1</button><button>自定义</button></div></div>' +
        '<div class="ds-form-row"><span class="ds-form-label">筛选</span><div style="display:flex;gap:5px"><button class="chip is-active">全部</button><button class="chip">A</button><button class="chip">B</button><button class="chip">其他</button></div></div>' +
      '</div></section>' +

      '<section class="ds-section"><div class="ds-section__head"><h2>反馈与状态</h2><span>FEEDBACK</span></div><div class="ds-grid-2">' +
        '<div class="ds-card"><div class="toast is-visible" style="position:static;transform:none;opacity:1">' + icon('check') + '<span>图纸已保存</span></div><div class="stat-footnote" style="margin-top:10px">Toast · 2.3s 自动消失</div></div>' +
        '<div class="ds-card"><div class="ds-empty-demo"><span class="bead-dot" style="--bead:#D95D4E"></span><h4>还没有图纸</h4><p>新建一张空白图纸，或从图片开始。</p></div></div>' +
        '<div class="ds-card"><div class="ds-skeleton"><div class="sk-line"></div><div class="sk-line sk-line--mid"></div><div class="sk-line sk-line--short"></div></div><div class="stat-footnote" style="margin-top:10px">加载骨架</div></div>' +
        '<div class="ds-card"><div class="ds-error">' + icon('warning') + '<span>图片太小，建议使用 1000px 以上的图片。</span></div><div class="stat-footnote" style="margin-top:10px">错误提示</div></div>' +
      '</div></section>' +

      '<section class="ds-section"><div class="ds-section__head"><h2>Sheet 结构</h2><span>BOTTOM SHEET ANATOMY</span></div><div class="ds-card">' +
        '<div class="sheet-anatomy"><span class="anatomy-label anatomy-label--1">Grabber</span><span class="anatomy-label anatomy-label--2">Header</span><span class="anatomy-label anatomy-label--3">Scroll Body</span><span class="anatomy-label anatomy-label--4">Footer</span>' +
          '<div class="anatomy-grabber"></div><div class="anatomy-head"><strong>用量统计</strong><span class="spacer"></span>' + icon('close') + '</div><div class="anatomy-body">内容区可滚动，底部操作固定；手机端最大高度 88%。</div><div class="anatomy-foot"><span class="btn btn--primary btn--sm">主操作</span></div>' +
        '</div></div></section>' +

      '<section class="ds-section"><div class="ds-section__head"><h2>图标</h2><span>24 × 24 · 1.8 STROKE</span></div><div class="ds-card"><div class="icon-grid">' + iconCells + '</div></div></section>' +

      '<section class="ds-section"><div class="ds-section__head"><h2>响应式布局</h2><span>BREAKPOINTS</span></div><div class="ds-card"><div class="device-mini-row">' +
        '<div class="device-mini"><span class="device-mini__frame device-mini__frame--wide"></span><span>≥ 900 · 双栏</span></div>' +
        '<div class="device-mini"><span class="device-mini__frame device-mini__frame--tablet"></span><span>600–899 · 抽屉</span></div>' +
        '<div class="device-mini"><span class="device-mini__frame device-mini__frame--phone"></span><span>&lt; 600 · 底栏</span></div>' +
      '</div><div class="stat-footnote" style="margin-top:12px">布局由容器宽度驱动，不依赖浏览器视口；评审尺寸切换时可直接验证三种断点。</div></div></section>' +

      '<section class="ds-section"><div class="ds-section__head"><h2>圆角与动效</h2><span>RADIUS &amp; MOTION</span></div><div class="ds-card"><div class="ds-grid-3">' +
        '<div><div style="height:36px;border-radius:10px;background:var(--surface-3);border:1px solid var(--line)"></div><div class="stat-footnote">10 · 输入框/按钮</div></div>' +
        '<div><div style="height:36px;border-radius:16px;background:var(--surface-3);border:1px solid var(--line)"></div><div class="stat-footnote">16 · 卡片</div></div>' +
        '<div><div style="height:36px;border-radius:24px;background:var(--surface-3);border:1px solid var(--line)"></div><div class="stat-footnote">24 · Sheet</div></div>' +
      '</div><div class="stat-footnote" style="margin-top:12px">过渡 120–180ms · cubic-bezier(.2,.8,.2,1)；系统开启减少动效时全部关闭。</div></div></section>' +

      '<div class="home__footer" style="margin-top:8px">' + icon('info') + '<span>设计稿 v0.1 · 评审通过后冻结 token 与组件，进入架构阶段。</span></div>' +
    '</div></div>';
  }

  /* ---------- 通用交互 ---------- */

  function showToast(message, tone) {
    var root = $('#toast-root');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast' + (tone ? ' toast--' + tone : '');
    var ic = tone === 'warn' ? 'warning' : tone === 'info' ? 'info' : 'check';
    el.innerHTML = icon(ic) + '<span>' + esc(message) + '</span>';
    root.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-visible'); });
    setTimeout(function () {
      el.classList.remove('is-visible');
      setTimeout(function () { el.remove(); }, 220);
    }, 2300);
  }

  function paintSlider(el) {
    if (!el || !el.max) return;
    var min = Number(el.min) || 0;
    var max = Number(el.max) || 100;
    var val = Number(el.value) || 0;
    el.style.setProperty('--pct', ((val - min) / (max - min) * 100) + '%');
  }

  function paintAllSliders() {
    $$('.slider').forEach(paintSlider);
  }

  function bindSheetDrag() {
    var sheet = $('.sheet--bottom');
    if (!sheet) return;
    var grab = $('.sheet__grabber', sheet);
    if (!grab) return;
    var dragging = false, startY = 0, dy = 0;
    grab.addEventListener('pointerdown', function (e) {
      dragging = true;
      startY = e.clientY;
      dy = 0;
      if (grab.setPointerCapture) { try { grab.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      sheet.style.transition = 'none';
    });
    grab.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = 'translateY(' + dy + 'px)';
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > 90) closeOverlay();
    }
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
  }

  function drawExportPreview() {
    var project = getProject();
    var canvas = $('[data-role="export-preview"]');
    if (!canvas || !project) return;
    if (state.exportFormat === 'png') {
      PC.drawBlueprint(canvas, project, {
        grid: !state.exportPngOptions.patternOnly,
        legend: state.exportPngOptions.legend && !state.exportPngOptions.patternOnly
      });
    } else if (state.exportFormat === 'pdf') {
      PC.drawPdfPreview(canvas, project, {
        grid: true,
        pages: pdfPageInfo(project).total
      });
    }
  }

  function afterViewRender() {
    if (state.view === 'home') {
      $$('[data-thumb]').forEach(function (canvas) {
        var project = state.projects.find(function (p) { return p.id === canvas.dataset.thumb; });
        if (project) PC.drawThumb(canvas, project);
      });
    } else if (state.view === 'editor') {
      initEditorView();
    } else if (state.view === 'wizard') {
      initWizardView();
    }
    paintAllSliders();
  }

  function afterOverlayRender() {
    paintAllSliders();
    if (state.overlay && state.overlay.type === 'export') {
      requestAnimationFrame(function () { drawExportPreview(); });
    }
    bindSheetDrag();
    var auto = $('[data-autofocus]');
    if (auto) {
      setTimeout(function () {
        if (auto.isConnected) {
          try { auto.focus({ preventScroll: true }); } catch (err) { auto.focus(); }
        }
      }, 40);
    }
    var body = $('.sheet__body, .dialog__body');
    if (body) body.scrollTop = 0;
  }

  function initEditorView() {
    var project = getProject();
    var stage = $('.canvas-stage');
    if (!project || !stage) return;
    var selectedIndex = indexOfCode[state.selectedColor];
    if (selectedIndex === undefined) selectedIndex = indexOfCode['F04'];
    state.editorInstance = new window.EditorCanvas(stage, project, {
      history: state.history,
      view: state.editorView,
      tool: state.tool,
      brush: state.brushSize,
      symmetry: state.symmetry,
      colorIndex: selectedIndex,
      showCodes: state.showCodes,
      showGrid: state.showGrid,
      onChange: function () {
        project.updatedLabel = '刚刚';
        syncEditorUI();
      },
      onZoom: function (zoom) {
        $$('[data-role="zoom-label"]').forEach(function (el) { el.textContent = Math.round(zoom * 100) + '%'; });
      },
      onHover: function (cell) {
        var el = $('[data-role="status-cursor"]');
        if (el) el.textContent = cell ? ('x ' + (cell.x + 1) + '  y ' + (cell.y + 1)) : '—';
      },
      onPick: function (index) {
        var c = palette[index];
        if (!c) return;
        selectColor(c.code);
        setTool('pencil');
        showToast('已吸取 ' + c.code + ' ' + c.name);
      }
    });
    syncEditorUI();
  }

  function syncEditorUI() {
    var project = getProject();
    if (!project) return;
    var s = statsOfProject(project);
    $$('[data-role="status-total"]').forEach(function (el) { el.textContent = fmt(s.total); });
    $$('[data-role="status-colors"]').forEach(function (el) { el.textContent = s.colorCount; });
    $$('[data-role="undo"]').forEach(function (el) { el.disabled = !state.history.undo.length; });
    $$('[data-role="redo"]').forEach(function (el) { el.disabled = !state.history.redo.length; });
    $$('[data-role="zoom-label"]').forEach(function (el) { el.textContent = Math.round(state.editorView.zoom * 100) + '%'; });
    $$('[data-role="meta-size"]').forEach(function (el) { el.textContent = project.width + '×' + project.height; });
    $$('[data-role="meta-bead"]').forEach(function (el) { el.textContent = project.beadSizeMm + 'mm'; });
    var chip = $('[data-role="canvas-chip"]');
    if (chip) chip.innerHTML = icon('bead') + project.width + '×' + project.height + ' · ' + project.beadSizeMm + 'mm · ' + physicalSize(project);
    $$('[data-role="status-physical"]').forEach(function (el) {
      el.textContent = project.beadSizeMm + 'mm · ' + project.width + '×' + project.height + ' · ' + physicalSize(project);
    });
    var empty = $('[data-role="canvas-empty"]');
    if (empty) empty.style.display = s.total === 0 ? 'block' : 'none';
    refreshPaletteTabs();
    if (state.paletteTab === 'used') refreshSwatchGrid();
    refreshCurrentColor();
    persistDemo();
  }

  function selectColor(code) {
    var c = byCode[code];
    if (!c) return;
    state.selectedColor = code;
    if (state.tool === 'eraser') state.tool = 'pencil';
    if (state.editorInstance) {
      state.editorInstance.setColor(indexOfCode[code]);
      state.editorInstance.setTool(state.tool);
    }
    updateSwatchSelection();
    refreshCurrentColor();
    updateToolUI();
    if (state.overlay && state.overlay.type === 'palette') closeOverlay();
  }

  function setTool(tool) {
    state.tool = tool;
    if (state.editorInstance) state.editorInstance.setTool(tool);
    updateToolUI();
  }

  function updateToolUI() {
    $$('[data-action="set-tool"]').forEach(function (el) {
      var on = el.dataset.tool === state.tool;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', String(on));
    });
    $$('[data-role="brush-badge"], [data-role="brush-badge-2"]').forEach(function (el) { el.textContent = state.brushSize; });
    $$('[data-role="symmetry-badge"]').forEach(function (el) {
      el.textContent = symLabel(state.symmetry);
      el.style.display = state.symmetry === 'none' ? 'none' : '';
    });
    var dot = $('.statusbar .color-dot');
    if (dot) dot.style.setProperty('--bead', (byCode[state.selectedColor] || palette[0]).hex);
  }

  function cycleBrush() {
    state.brushSize = state.brushSize === 1 ? 2 : state.brushSize === 2 ? 3 : 1;
    if (state.editorInstance) state.editorInstance.setBrush(state.brushSize);
    updateToolUI();
    if (state.menuOpen) renderOverlay();
    showToast('笔刷 ' + state.brushSize + '×' + state.brushSize);
  }

  function cycleSymmetry() {
    state.symmetry = state.symmetry === 'none' ? 'h' : state.symmetry === 'h' ? 'v' : state.symmetry === 'v' ? 'both' : 'none';
    if (state.editorInstance) state.editorInstance.setSymmetry(state.symmetry);
    updateToolUI();
    if (state.menuOpen) renderOverlay();
    showToast('对称绘制：' + symLabel(state.symmetry));
  }

  function openProject(id) {
    var project = state.projects.find(function (p) { return p.id === id; });
    if (!project) return;
    state.currentProjectId = id;
    var code = mostUsedCode(project);
    if (code) state.selectedColor = code;
    state.tool = 'pencil';
    state.paletteTab = 'used';
    state.paletteSearch = '';
    state.seriesFilter = 'all';
    state.history = { undo: [], redo: [] };
    state.editorView = { zoom: 1, panX: 0, panY: 0 };
    state.view = 'editor';
    state.overlay = null;
    state.menuOpen = false;
    paintView();
    renderOverlay();
  }

  function createNewProject() {
    captureNewProjectName();
    var np = state.newProject;
    if (!np) return;
    var w = clamp(Math.round(Number(np.width) || 1), 1, 300);
    var h = clamp(Math.round(Number(np.height) || 1), 1, 300);
    var name = np.name && np.name.trim() ? np.name.trim() : '未命名图纸';
    var project = emptyProject(w, h, name, np.beadSize);
    state.projects.unshift(project);
    state.currentProjectId = project.id;
    state.paletteTab = 'used';
    state.paletteSearch = '';
    state.seriesFilter = 'all';
    state.history = { undo: [], redo: [] };
    state.editorView = { zoom: 1, panX: 0, panY: 0 };
    state.view = 'editor';
    state.overlay = null;
    paintView();
    renderOverlay();
    persistDemo();
    showToast('已创建 ' + w + '×' + h + ' 图纸');
  }

  function resetDemo() {
    var review = state.reviewSize;
    destroyEditor();
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
    state = freshState();
    state.reviewSize = review;
    syncReviewSizeButtons();
    applyReviewSize(true);
    state.initialized = true;
    paintView();
    renderOverlay();
    showToast('示例已重置', 'info');
  }

  function applyResize() {
    var project = getProject();
    var editor = state.editorInstance;
    var settings = state.settings;
    if (!project || !editor || !settings) return;
    var w = clamp(Math.round(Number(settings.width) || 1), 1, 300);
    var h = clamp(Math.round(Number(settings.height) || 1), 1, 300);
    if (w === project.width && h === project.height) {
      showToast('画布尺寸没有变化', 'info');
      return;
    }
    var snap = editor.capture();
    var anchor = settings.anchor;
    var dx = anchor.indexOf('left') !== -1 ? 0 : anchor.indexOf('right') !== -1 ? w - project.width : Math.floor((w - project.width) / 2);
    var dy = anchor.indexOf('top') !== -1 ? 0 : anchor.indexOf('bottom') !== -1 ? h - project.height : Math.floor((h - project.height) / 2);
    var next = new Uint16Array(w * h);
    next.fill(EMPTY);
    var oldW = project.width;
    var oldH = project.height;
    var oldCells = project.cells;
    for (var y = 0; y < oldH; y++) {
      for (var x = 0; x < oldW; x++) {
        var nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) next[ny * w + nx] = oldCells[y * oldW + x];
      }
    }
    project.width = w;
    project.height = h;
    project.cells = next;
    settings.width = w;
    settings.height = h;
    editor.commitExternal(snap);
    renderOverlay();
    showToast('画布已调整为 ' + w + '×' + h);
  }

  function applyTransform(kind) {
    var project = getProject();
    var editor = state.editorInstance;
    if (!project || !editor) return;
    var snap = editor.capture();
    var w = project.width;
    var h = project.height;
    var cells = project.cells;
    var next;
    if (kind === 'flip-h') {
      next = new Uint16Array(w * h);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) next[y * w + (w - 1 - x)] = cells[y * w + x];
      project.cells = next;
    } else if (kind === 'flip-v') {
      next = new Uint16Array(w * h);
      for (var y2 = 0; y2 < h; y2++) for (var x2 = 0; x2 < w; x2++) next[(h - 1 - y2) * w + x2] = cells[y2 * w + x2];
      project.cells = next;
    } else {
      var nw = h, nh = w;
      next = new Uint16Array(nw * nh);
      for (var y3 = 0; y3 < h; y3++) {
        for (var x3 = 0; x3 < w; x3++) {
          var nx, ny;
          if (kind === 'rotate-right') {
            nx = h - 1 - y3;
            ny = x3;
          } else {
            nx = y3;
            ny = w - 1 - x3;
          }
          next[ny * nw + nx] = cells[y3 * w + x3];
        }
      }
      project.width = nw;
      project.height = nh;
      project.cells = next;
      state.settings.width = nw;
      state.settings.height = nh;
    }
    editor.commitExternal(snap);
    renderOverlay();
    showToast(kind === 'flip-h' ? '已水平翻转' : kind === 'flip-v' ? '已垂直翻转' : kind === 'rotate-right' ? '已右转 90°' : '已左转 90°');
  }

  function applyReplace() {
    var project = getProject();
    var editor = state.editorInstance;
    var settings = state.settings;
    if (!project || !editor || !settings) return;
    var from = indexOfCode[settings.replaceFrom];
    var to = indexOfCode[settings.replaceTo];
    if (from === undefined || to === undefined || from === to) {
      showToast('请选择两个不同的颜色', 'warn');
      return;
    }
    var snap = editor.capture();
    var cells = project.cells;
    var changed = false;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i] === from) { cells[i] = to; changed = true; }
    }
    if (!changed) {
      showToast('画布中没有这个颜色', 'info');
      return;
    }
    editor.commitExternal(snap);
    renderOverlay();
    showToast('已替换 ' + settings.replaceFrom + ' → ' + settings.replaceTo);
  }

  function handleConfirm() {
    var action = state.confirmAction;
    state.confirmAction = null;
    state.confirmReturn = null;
    if (!action) { state.overlay = null; renderOverlay(); return; }
    if (action.type === 'clear') {
      var project = getProject();
      var editor = state.editorInstance;
      if (project && editor) {
        var snap = editor.capture();
        project.cells = new Uint16Array(project.width * project.height);
        project.cells.fill(EMPTY);
        editor.commitExternal(snap);
      }
      state.overlay = null;
      renderOverlay();
      showToast('画布已清空，可撤销恢复');
    } else if (action.type === 'delete-project') {
      state.projects = state.projects.filter(function (p) { return p.id !== action.id; });
      if (state.currentProjectId === action.id) state.currentProjectId = null;
      state.overlay = null;
      state.view = 'home';
      paintView();
      renderOverlay();
      persistDemo();
      showToast('图纸已删除', 'info');
    }
  }

  function cancelConfirm() {
    if (state.confirmReturn) {
      state.overlay = state.confirmReturn;
      state.confirmReturn = null;
      state.confirmAction = null;
      renderOverlay();
    } else {
      state.confirmAction = null;
      closeOverlay();
    }
  }

  /* ---------- 事件 ---------- */

  function handleAction(action, el) {
    switch (action) {
      case 'open-system': go('system'); return true;
      case 'reset-demo': resetDemo(); return true;
      case 'go-home': go('home'); return true;
      case 'open-new': openNewProject(); return true;
      case 'create-project': createNewProject(); return true;
      case 'set-bead':
        captureNewProjectName();
        state.newProject.beadSize = Number(el.dataset.bead);
        if (newPresets().indexOf(state.newProject.width) === -1) {
          state.newProject.width = newPresets()[0];
          state.newProject.height = newPresets()[0];
        }
        state.newProject.custom = false;
        renderOverlay();
        return true;
      case 'new-preset':
        captureNewProjectName();
        state.newProject.width = Number(el.dataset.preset);
        state.newProject.height = Number(el.dataset.preset);
        state.newProject.custom = false;
        renderOverlay();
        return true;
      case 'new-custom':
        captureNewProjectName();
        state.newProject.custom = true;
        renderOverlay();
        return true;
      case 'swap-new-size':
        captureNewProjectName();
        var tmp = state.newProject.width;
        state.newProject.width = state.newProject.height;
        state.newProject.height = tmp;
        state.newProject.custom = true;
        renderOverlay();
        return true;
      case 'open-mypalette-from-new':
        captureNewProjectName();
        openMyPalette(true);
        return true;
      case 'open-wizard': openWizard(el.dataset.entry || 'home'); return true;
      case 'close-wizard': closeWizard(); return true;
      case 'wizard-upload-demo': showToast('原型演示：请选择下方示例图片', 'info'); return true;
      case 'wizard-sample':
        var sample = M.samples.find(function (s) { return s.id === el.dataset.sample; });
        if (sample) {
          state.wizard.sampleId = sample.id;
          if (!state.wizard.nameTouched) state.wizard.name = sample.name + '图纸';
          paintView();
          renderOverlay();
        }
        return true;
      case 'wizard-step':
        var n = Number(el.dataset.step);
        if (n <= state.wizard.step) {
          state.wizard.step = n;
          paintView();
          var wb = $('.wizard__body'); if (wb) wb.scrollTop = 0;
        }
        return true;
      case 'wizard-next':
        if (state.wizard.step < 5) {
          state.wizard.step += 1;
          paintView();
          renderOverlay();
          var wb2 = $('.wizard__body'); if (wb2) wb2.scrollTop = 0;
        }
        return true;
      case 'wizard-back':
        if (state.wizard.step > 1) {
          state.wizard.step -= 1;
          paintView();
          renderOverlay();
          var wb3 = $('.wizard__body'); if (wb3) wb3.scrollTop = 0;
        }
        return true;
      case 'wizard-rotate':
        state.wizard.rotate = (state.wizard.rotate + 90) % 360;
        updateWizardValueLabels();
        drawCropView();
        return true;
      case 'wizard-fit':
        state.wizard.fit = el.dataset.fit;
        $$('[data-action="wizard-fit"]').forEach(function (b) { b.classList.toggle('is-active', b.dataset.fit === state.wizard.fit); });
        drawCropView();
        return true;
      case 'wizard-toggle':
        var key = el.dataset.key;
        state.wizard[key] = !state.wizard[key];
        el.classList.toggle('is-on', state.wizard[key]);
        el.setAttribute('aria-checked', String(!!state.wizard[key]));
        if (key === 'removeBg') {
          var sub = $('.control-sub');
          var tol = $('[data-input="wizard-tolerance"]');
          if (sub) sub.style.opacity = state.wizard.removeBg ? '' : '.45';
          if (tol) tol.disabled = !state.wizard.removeBg;
        }
        scheduleWizardPreview();
        return true;
      case 'wizard-colors-minus':
        state.wizard.maxColors = clamp(state.wizard.maxColors - 1, 4, 48);
        var cv = $('[data-role="wizard-colors-value"]'); if (cv) cv.textContent = state.wizard.maxColors;
        scheduleWizardPreview();
        return true;
      case 'wizard-colors-plus':
        state.wizard.maxColors = clamp(state.wizard.maxColors + 1, 4, 48);
        var cv2 = $('[data-role="wizard-colors-value"]'); if (cv2) cv2.textContent = state.wizard.maxColors;
        scheduleWizardPreview();
        return true;
      case 'wizard-mode':
        state.wizard.applyMode = el.dataset.mode;
        paintView();
        renderOverlay();
        return true;
      case 'wizard-apply': applyWizard(); return true;
      case 'open-project': openProject(el.dataset.project); return true;
      case 'project-more': openProjectMenu(el.dataset.project); return true;
      case 'menu-open-project': state.overlay = null; openProject(el.dataset.project); return true;
      case 'copy-project':
        var original = state.projects.find(function (p) { return p.id === el.dataset.project; });
        if (original) {
          var copy = cloneProject(original);
          copy.id = newProjectId();
          copy.name = original.name + ' 副本';
          copy.updatedLabel = '刚刚';
          state.projects.unshift(copy);
          state.overlay = null;
          paintView();
          renderOverlay();
          persistDemo();
          showToast('已复制图纸');
        }
        return true;
      case 'menu-rename-project': openRename(el.dataset.project); return true;
      case 'menu-delete-project': openConfirm({ type: 'delete-project', id: el.dataset.project }, state.overlay); return true;
      case 'cancel-rename':
        if (state.renameReturn) { state.overlay = state.renameReturn; state.renameReturn = null; renderOverlay(); }
        else closeOverlay();
        return true;
      case 'save-rename':
        var rename = state.projects.find(function (p) { return p.id === state.renameProjectId; });
        if (rename) {
          var name = state.renameValue.trim();
          if (name) rename.name = name;
          rename.updatedLabel = '刚刚';
        }
        state.renameProjectId = null;
        state.renameReturn = null;
        state.overlay = null;
        paintView();
        renderOverlay();
        persistDemo();
        showToast('已重命名');
        return true;
      case 'cancel-confirm': cancelConfirm(); return true;
      case 'confirm-action': handleConfirm(); return true;
      case 'undo':
        if (state.editorInstance) { state.editorInstance.undo(); syncEditorUI(); }
        return true;
      case 'redo':
        if (state.editorInstance) { state.editorInstance.redo(); syncEditorUI(); }
        return true;
      case 'open-palette':
        if (state.layout === 'wide') showToast('从右侧色板选择颜色', 'info');
        else openOverlay('palette');
        return true;
      case 'open-stats': openStats(); return true;
      case 'open-export': openExport(); return true;
      case 'open-export-csv': state.exportFormat = 'csv'; openExport('csv'); return true;
      case 'open-mypalette': openMyPalette(false); return true;
      case 'open-settings': openSettings(); return true;
      case 'close-overlay': closeOverlay(); return true;
      case 'toggle-menu':
        state.menuOpen = !state.menuOpen;
        renderOverlay();
        return true;
      case 'close-menu': state.menuOpen = false; renderOverlay(); return true;
      case 'set-tool': setTool(el.dataset.tool); return true;
      case 'cycle-brush': cycleBrush(); return true;
      case 'cycle-symmetry': cycleSymmetry(); return true;
      case 'zoom-in': if (state.editorInstance) state.editorInstance.zoomIn(); return true;
      case 'zoom-out': if (state.editorInstance) state.editorInstance.zoomOut(); return true;
      case 'zoom-fit': if (state.editorInstance) state.editorInstance.fit(); return true;
      case 'select-color': selectColor(el.dataset.color); return true;
      case 'palette-tab':
        state.paletteTab = el.dataset.tab;
        refreshPaletteTabs();
        refreshSwatchGrid();
        return true;
      case 'series-filter':
        state.seriesFilter = el.dataset.series;
        $$('.series-chip').forEach(function (b) { b.classList.toggle('is-active', b.dataset.series === state.seriesFilter); });
        refreshSwatchGrid();
        return true;
      case 'toggle-codes':
        state.showCodes = !state.showCodes;
        if (state.editorInstance) state.editorInstance.setShowCodes(state.showCodes);
        if (state.menuOpen) renderOverlay();
        return true;
      case 'toggle-grid':
        state.showGrid = !state.showGrid;
        if (state.editorInstance) state.editorInstance.setShowGrid(state.showGrid);
        if (state.menuOpen) renderOverlay();
        return true;
      case 'export-format':
        state.exportFormat = el.dataset.format;
        refreshExport();
        return true;
      case 'export-scale':
        state.exportPngScale = Number(el.dataset.scale);
        refreshExport();
        return true;
      case 'export-pdf-size':
        state.exportPdfSize = el.dataset.size;
        refreshExport();
        return true;
      case 'toggle-export':
        var opt = el.dataset.option;
        var target = state.exportFormat === 'pdf' ? state.exportPdfOptions : state.exportPngOptions;
        target[opt] = !target[opt];
        el.classList.toggle('is-on', target[opt]);
        el.setAttribute('aria-checked', String(!!target[opt]));
        if (state.exportFormat === 'pdf') updatePdfSummary();
        drawExportPreview();
        return true;
      case 'overlap-minus':
        state.exportOverlap = clamp(state.exportOverlap - 1, 0, 3);
        var ov1 = $('[data-role="overlap-value"]');
        if (ov1) ov1.textContent = state.exportOverlap + ' 格';
        updatePdfSummary();
        drawExportPreview();
        return true;
      case 'overlap-plus':
        state.exportOverlap = clamp(state.exportOverlap + 1, 0, 3);
        var ov2 = $('[data-role="overlap-value"]');
        if (ov2) ov2.textContent = state.exportOverlap + ' 格';
        updatePdfSummary();
        drawExportPreview();
        return true;
      case 'do-export': simulateExport(); return true;
      case 'share-export': showToast('分享功能将在开发版接入系统分享', 'info'); return true;
      case 'mypalette-preset':
        var preset = el.dataset.preset;
        state.myPalettePreset = preset;
        if (preset === '221') state.myPaletteDraft = new Set(M.defaultMyPalette);
        else if (preset === '291') state.myPaletteDraft = new Set(palette.map(function (c) { return c.code; }));
        renderOverlay();
        return true;
      case 'mypalette-series':
        var series = el.dataset.series;
        var draft = state.myPaletteDraft;
        var list = palette.filter(function (c) { return series === '其他' ? isOtherSeries(c) : c.series === series; });
        var all = list.length > 0 && list.every(function (c) { return draft.has(c.code); });
        list.forEach(function (c) { if (all) draft.delete(c.code); else draft.add(c.code); });
        state.myPalettePreset = 'custom';
        renderOverlay();
        return true;
      case 'toggle-my-color': toggleMyColor(el.dataset.color); return true;
      case 'parse-mypalette':
        var raw = (state.myPalettePaste || '').split(/[\s,，;；、]+/);
        var found = 0;
        raw.forEach(function (token) {
          var code = token.trim().toUpperCase();
          if (!code) return;
          if (/^[A-Z]+\d$/.test(code)) code = code.replace(/(\d)$/, '0$1');
          if (byCode[code] && !state.myPaletteDraft.has(code)) { state.myPaletteDraft.add(code); found++; }
        });
        state.myPalettePreset = 'custom';
        renderOverlay();
        showToast(found ? '已启用 ' + found + ' 个色号' : '没有识别到新的色号', found ? undefined : 'warn');
        return true;
      case 'save-mypalette': saveMyPalette(); return true;
      case 'set-anchor':
        state.settings.anchor = el.dataset.anchor;
        $$('.anchor-btn').forEach(function (b) { b.classList.toggle('is-active', b.dataset.anchor === state.settings.anchor); });
        return true;
      case 'apply-resize': applyResize(); return true;
      case 'flip-h': applyTransform('flip-h'); return true;
      case 'flip-v': applyTransform('flip-v'); return true;
      case 'rotate-left': applyTransform('rotate-left'); return true;
      case 'rotate-right': applyTransform('rotate-right'); return true;
      case 'set-replace':
        if (el.dataset.which === 'from') state.settings.replaceFrom = el.dataset.color;
        else state.settings.replaceTo = el.dataset.color;
        renderOverlay();
        return true;
      case 'apply-replace': applyReplace(); return true;
      case 'ask-clear': openConfirm({ type: 'clear' }, state.overlay); return true;
      default: return false;
    }
  }

  function updatePdfSummary() {
    var el = $('[data-role="pdf-summary"]');
    if (!el) return;
    var project = getProject();
    if (!project) return;
    var info = pdfPageInfo(project);
    el.innerHTML = icon('grid') + '<span><strong>' + info.pagesX + '×' + info.pagesY + '</strong> 拼版 · 共 <strong>' + info.total + '</strong> 页' + (info.total > info.patternPages ? '（含图例页）' : '') + ' · A4</span>';
  }

  /* ---------- 输入 ---------- */

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.matches('.slider')) paintSlider(t);

    if (t.matches('[data-input="palette-search"]')) {
      state.paletteSearch = t.value;
      refreshSwatchGrid();
      return;
    }
    if (t.matches('[data-input="new-name"]')) {
      if (state.newProject) state.newProject.name = t.value;
      return;
    }
    if (t.matches('[data-input="new-width"]')) {
      if (!state.newProject) return;
      state.newProject.width = clamp(Number(t.value) || 1, 1, 300);
      state.newProject.custom = true;
      updateNewProjectPreview();
      return;
    }
    if (t.matches('[data-input="new-height"]')) {
      if (!state.newProject) return;
      state.newProject.height = clamp(Number(t.value) || 1, 1, 300);
      state.newProject.custom = true;
      updateNewProjectPreview();
      return;
    }
    if (t.matches('[data-input="settings-width"]')) {
      if (state.settings) state.settings.width = Number(t.value) || 0;
      return;
    }
    if (t.matches('[data-input="settings-height"]')) {
      if (state.settings) state.settings.height = Number(t.value) || 0;
      return;
    }
    if (t.matches('[data-input="rename-name"]')) {
      state.renameValue = t.value;
      return;
    }
    if (t.matches('[data-input="mypalette-paste"]')) {
      state.myPalettePaste = t.value;
      return;
    }
    if (t.matches('[data-input="wizard-name"]')) {
      if (!state.wizard) return;
      state.wizard.name = t.value;
      state.wizard.nameTouched = true;
      return;
    }
    if (t.matches('[data-input="wizard-zoom"]')) {
      if (!state.wizard) return;
      state.wizard.zoom = clamp(Number(t.value), 100, 200) / 100;
      updateWizardValueLabels();
      drawCropView();
      return;
    }
    if (t.matches('[data-input="wizard-brightness"]')) {
      state.wizard.brightness = Number(t.value);
      updateWizardValueLabels();
      scheduleWizardPreview();
      return;
    }
    if (t.matches('[data-input="wizard-contrast"]')) {
      state.wizard.contrast = Number(t.value);
      updateWizardValueLabels();
      scheduleWizardPreview();
      return;
    }
    if (t.matches('[data-input="wizard-saturation"]')) {
      state.wizard.saturation = Number(t.value);
      updateWizardValueLabels();
      scheduleWizardPreview();
      return;
    }
    if (t.matches('[data-input="wizard-tolerance"]')) {
      state.wizard.tolerance = Number(t.value);
      updateWizardValueLabels();
      return;
    }
  });

  /* ---------- 点击 ---------- */

  document.addEventListener('click', function (e) {
    var sizeBtn = e.target.closest('[data-size]');
    if (sizeBtn && sizeBtn.classList.contains('review-size')) {
      setReviewSize(sizeBtn.dataset.size);
      return;
    }
    var actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    var handled = handleAction(actionEl.dataset.action, actionEl, e);
    if (handled) e.preventDefault();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (state.overlay) { closeOverlay(); return; }
      if (state.menuOpen) { state.menuOpen = false; renderOverlay(); return; }
      if (state.view === 'wizard') { closeWizard(); return; }
      if (state.view === 'system') { go('home'); return; }
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('project-card')) {
      e.preventDefault();
      openProject(e.target.dataset.project);
      return;
    }
    if (state.view !== 'editor' || state.overlay) return;
    var mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        if (state.editorInstance) { state.editorInstance.redo(); syncEditorUI(); }
      } else {
        if (state.editorInstance) { state.editorInstance.undo(); syncEditorUI(); }
      }
    } else if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      if (state.editorInstance) { state.editorInstance.redo(); syncEditorUI(); }
    }
  });

  /* ---------- 尺寸监听 ---------- */

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var result = applyReviewSize(false);
      if (result.layoutChanged) return;
      if (!result.sizeChanged) return;
      if (state.view === 'home' || state.view === 'system' || state.view === 'wizard') afterViewRender();
      else if (state.view === 'editor') {
        if (state.editorInstance) state.editorInstance.resize();
        syncEditorUI();
      }
      if (state.overlay && state.overlay.type === 'export') drawExportPreview();
    }, 140);
  });

  /* ---------- 初始化 ---------- */

  syncReviewSizeButtons();
  applyReviewSize(true);
  loadStoredDemo();
  state.initialized = true;
  paintView();
  renderOverlay();
})();

