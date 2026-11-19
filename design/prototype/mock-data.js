/* 拼豆工坊 · 设计原型示例数据
 * 完整 MARD 291 色：221 常用 + 70 特殊效果（珠光/温变/果冻/透明白/夜光/光变）
 * 默认启用 221 常用；色值为公开色号表的屏幕参考值，实物以品牌色卡为准。
 */
(function () {
  'use strict';

  var EMPTY = 0xffff;

  if (!window.MARD_COLORS || !window.MARD_COLORS.length) {
    throw new Error('MARD color data missing');
  }
  var colors = window.MARD_COLORS.slice();

  var byCode = {};
  var indexOf = {};
  colors.forEach(function (c, i) {
    byCode[c.code] = c;
    indexOf[c.code] = i;
  });

  function idx(code) {
    var i = indexOf[code];
    if (i === undefined) throw new Error('Unknown color code: ' + code);
    return i;
  }

  function createGrid(w, h) {
    var g = new Uint16Array(w * h);
    g.fill(EMPTY);
    return g;
  }

  function put(g, w, h, x, y, code) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < w && y >= 0 && y < h) g[y * w + x] = idx(code);
  }

  function get(g, w, h, x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return EMPTY;
    return g[y * w + x];
  }

  function fillRect(g, w, h, x, y, rw, rh, code) {
    for (var yy = y; yy < y + rh; yy++) {
      for (var xx = x; xx < x + rw; xx++) put(g, w, h, xx, yy, code);
    }
  }

  function fillEllipse(g, w, h, cx, cy, rx, ry, code) {
    var y0 = Math.max(0, Math.floor(cy - ry));
    var y1 = Math.min(h - 1, Math.ceil(cy + ry));
    var x0 = Math.max(0, Math.floor(cx - rx));
    var x1 = Math.min(w - 1, Math.ceil(cx + rx));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = (x + 0.5 - cx) / rx;
        var dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) put(g, w, h, x, y, code);
      }
    }
  }

  function fillRotatedEllipse(g, w, h, cx, cy, rx, ry, angle, code) {
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    var r = Math.max(rx, ry);
    var y0 = Math.max(0, Math.floor(cy - r));
    var y1 = Math.min(h - 1, Math.ceil(cy + r));
    var x0 = Math.max(0, Math.floor(cx - r));
    var x1 = Math.min(w - 1, Math.ceil(cx + r));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = x + 0.5 - cx;
        var dy = y + 0.5 - cy;
        var lx = dx * cos + dy * sin;
        var ly = -dx * sin + dy * cos;
        if ((lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1) put(g, w, h, x, y, code);
      }
    }
  }

  function pointInPoly(px, py, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1];
      var xj = pts[j][0], yj = pts[j][1];
      if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function fillPolygon(g, w, h, pts, code) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(function (p) {
      minX = Math.min(minX, p[0]);
      minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
    });
    for (var y = Math.max(0, Math.floor(minY)); y <= Math.min(h - 1, Math.ceil(maxY)); y++) {
      for (var x = Math.max(0, Math.floor(minX)); x <= Math.min(w - 1, Math.ceil(maxX)); x++) {
        if (pointInPoly(x + 0.5, y + 0.5, pts)) put(g, w, h, x, y, code);
      }
    }
  }

  function drawLine(g, w, h, x0, y0, x1, y1, thickness, code) {
    var dx = x1 - x0;
    var dy = y1 - y0;
    var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
    if (thickness <= 1) {
      for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        put(g, w, h, x0 + dx * t, y0 + dy * t, code);
      }
    } else {
      var rad = thickness / 2;
      for (var j = 0; j <= steps; j++) {
        var s = j / steps;
        fillEllipse(g, w, h, x0 + dx * s, y0 + dy * s, rad, rad, code);
      }
    }
  }

  /* ---------- 示例图案 ---------- */

  function buildStrawberry() {
    var w = 52, h = 52;
    var g = createGrid(w, h);

    // 叶萼与果柄（在果实后方）
    fillRect(g, w, h, 25, 3, 2, 11, 'B09');
    fillRect(g, w, h, 26, 1, 1, 4, 'B04');
    fillPolygon(g, w, h, [[26, 16], [6, 8], [16, 21]], 'B09');
    fillPolygon(g, w, h, [[26, 16], [46, 8], [36, 21]], 'B08');
    fillPolygon(g, w, h, [[26, 15], [14, 3], [27, 7]], 'B08');
    fillPolygon(g, w, h, [[26, 15], [38, 3], [35, 10]], 'B04');

    // 果身：上宽下尖
    var body = [];
    for (var y = 15; y <= 49; y++) {
      var t = (y - 15) / 34;
      var half;
      if (t < 0.22) half = 12 + 5 * (t / 0.22);
      else half = 17 * Math.pow(1 - (t - 0.22) / 0.78, 0.7);
      var x0 = Math.floor(26 - half - 1);
      var x1 = Math.ceil(26 + half + 1);
      for (var x = x0; x <= x1; x++) {
        var dx = x + 0.5 - 26;
        if (Math.abs(dx) <= half + 1) put(g, w, h, x, y, 'F08');
        if (Math.abs(dx) <= half) {
          put(g, w, h, x, y, 'F04');
          body.push([x, y]);
        }
      }
    }

    // 左上高光
    var ca = Math.cos(-0.35), sa = Math.sin(-0.35);
    body.forEach(function (p) {
      var dx = p[0] + 0.5 - 19;
      var dy = p[1] + 0.5 - 23;
      var lx = dx * ca + dy * sa;
      var ly = -dx * sa + dy * ca;
      if ((lx * lx) / (4.5 * 4.5) + (ly * ly) / (8 * 8) <= 1) put(g, w, h, p[0], p[1], 'F01');
    });

    // 小反光
    body.forEach(function (p) {
      var dx = p[0] + 0.5 - 18.5;
      var dy = p[1] + 0.5 - 19.5;
      if ((dx * dx) / (2 * 2) + (dy * dy) / (3.2 * 3.2) <= 1) put(g, w, h, p[0], p[1], 'H02');
    });

    // 草莓籽
    var red = {};
    red[idx('F04')] = true;
    red[idx('F01')] = true;
    for (var sy = 21; sy <= 46; sy += 5) {
      var off = (Math.floor((sy - 21) / 5) % 2) * 3;
      for (var sx = 14 + off; sx <= 39; sx += 6) {
        if (red[get(g, w, h, sx, sy)]) {
          put(g, w, h, sx, sy, 'A04');
          if (red[get(g, w, h, sx + 1, sy)]) put(g, w, h, sx + 1, sy, 'A04');
        }
      }
    }

    // 覆在果实上缘的萼片
    fillPolygon(g, w, h, [[26, 16], [20, 21], [26, 25], [32, 21]], 'B08');
    fillPolygon(g, w, h, [[26, 17], [23, 22], [26, 24], [29, 22]], 'B04');

    return { width: w, height: h, cells: g };
  }

  function buildCat() {
    var w = 52, h = 52;
    var g = createGrid(w, h);

    // 耳朵
    fillPolygon(g, w, h, [[8, 29], [12, 5], [27, 20]], 'F11');
    fillPolygon(g, w, h, [[44, 29], [40, 5], [25, 20]], 'F11');
    fillPolygon(g, w, h, [[11, 26], [14, 9], [24, 19]], 'A11');
    fillPolygon(g, w, h, [[41, 26], [38, 9], [28, 19]], 'A11');
    fillPolygon(g, w, h, [[13, 24], [15, 13], [21, 19]], 'E02');
    fillPolygon(g, w, h, [[39, 24], [37, 13], [31, 19]], 'E02');

    // 头
    fillEllipse(g, w, h, 26, 30, 18, 16, 'F11');
    fillEllipse(g, w, h, 26, 30, 16.5, 14.5, 'A11');

    // 额头斑纹
    fillRect(g, w, h, 19, 16, 4, 2, 'A10');
    fillRect(g, w, h, 25, 15, 5, 2, 'A10');
    fillRect(g, w, h, 31, 16, 4, 2, 'A10');

    // 口鼻区
    fillEllipse(g, w, h, 26, 37, 7.5, 4.8, 'H02');

    // 眼睛
    fillEllipse(g, w, h, 19, 29, 3.2, 4.3, 'H07');
    fillEllipse(g, w, h, 33, 29, 3.2, 4.3, 'H07');
    put(g, w, h, 18, 27, 'H02');
    put(g, w, h, 19, 27, 'H02');
    put(g, w, h, 32, 27, 'H02');
    put(g, w, h, 33, 27, 'H02');

    // 腮红
    fillEllipse(g, w, h, 13, 36, 3.6, 2.5, 'E02');
    fillEllipse(g, w, h, 39, 36, 3.6, 2.5, 'E02');

    // 鼻子与嘴
    fillPolygon(g, w, h, [[23, 34], [29, 34], [26, 38]], 'E05');
    drawLine(g, w, h, 26, 38, 26, 41, 1, 'F11');
    drawLine(g, w, h, 26, 41, 22, 43, 1, 'F11');
    drawLine(g, w, h, 26, 41, 30, 43, 1, 'F11');

    // 胡须
    drawLine(g, w, h, 9, 33, 1, 31, 1, 'F11');
    drawLine(g, w, h, 9, 36, 0, 36, 1, 'F11');
    drawLine(g, w, h, 9, 39, 1, 41, 1, 'F11');
    drawLine(g, w, h, 43, 33, 51, 31, 1, 'F11');
    drawLine(g, w, h, 43, 36, 52, 36, 1, 'F11');
    drawLine(g, w, h, 43, 39, 51, 41, 1, 'F11');

    return { width: w, height: h, cells: g };
  }

  function buildFlower() {
    var w = 52, h = 52;
    var g = createGrid(w, h);

    // 茎与叶
    drawLine(g, w, h, 26, 30, 24, 51, 2, 'B08');
    fillRotatedEllipse(g, w, h, 16, 39, 8, 3, -0.45, 'B04');
    fillRotatedEllipse(g, w, h, 34, 45, 8, 3, 0.5, 'B08');
    fillRotatedEllipse(g, w, h, 16, 39, 5, 1.4, -0.45, 'B20');

    // 花瓣轮廓
    var i, a, px, py;
    for (i = 0; i < 6; i++) {
      a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      px = 26 + Math.cos(a) * 10.5;
      py = 22 + Math.sin(a) * 10.5;
      fillRotatedEllipse(g, w, h, px, py, 8.6, 5.6, a, 'E05');
    }
    // 花瓣填充
    for (i = 0; i < 6; i++) {
      a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      px = 26 + Math.cos(a) * 10.5;
      py = 22 + Math.sin(a) * 10.5;
      fillRotatedEllipse(g, w, h, px, py, 7.4, 4.6, a, i % 2 ? 'E12' : 'E02');
    }
    // 花心
    fillEllipse(g, w, h, 26, 22, 6.6, 6.6, 'G06');
    fillEllipse(g, w, h, 26, 22, 5.2, 5.2, 'G05');
    fillEllipse(g, w, h, 26, 22, 3.1, 3.1, 'A05');
    put(g, w, h, 25, 20, 'H02');
    put(g, w, h, 27, 24, 'F11');

    // 小亮点
    put(g, w, h, 11, 12, 'H02');
    put(g, w, h, 43, 9, 'H02');
    put(g, w, h, 41, 33, 'A01');

    return { width: w, height: h, cells: g };
  }

  function buildRainbow() {
    var w = 104, h = 104;
    var g = createGrid(w, h);
    var cx = 52, cy = 82;
    var bands = [
      [48, 44, 'D18'],
      [44, 40, 'C04'],
      [40, 36, 'B04'],
      [36, 32, 'A05'],
      [32, 28, 'A10'],
      [28, 24, 'F04']
    ];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var dx = x + 0.5 - cx;
        var dy = y + 0.5 - cy;
        if (dy > 0) continue;
        var r = Math.sqrt(dx * dx + dy * dy);
        for (var i = 0; i < bands.length; i++) {
          if (r <= bands[i][0] && r > bands[i][1]) {
            put(g, w, h, x, y, bands[i][2]);
            break;
          }
        }
      }
    }

    // 小太阳
    fillEllipse(g, w, h, 80, 19, 8.5, 8.5, 'G05');
    fillEllipse(g, w, h, 80, 19, 6.6, 6.6, 'A05');
    fillEllipse(g, w, h, 80, 19, 3.2, 3.2, 'A08');
    for (var ra = 0; ra < 8; ra++) {
      var ang = (Math.PI * 2 * ra) / 8;
      drawLine(g, w, h, 80 + Math.cos(ang) * 10.5, 19 + Math.sin(ang) * 10.5,
        80 + Math.cos(ang) * 13.5, 19 + Math.sin(ang) * 13.5, 1, 'A05');
    }

    // 草地小山
    fillEllipse(g, w, h, 52, 114, 82, 32, 'B20');
    fillEllipse(g, w, h, 24, 108, 34, 18, 'B04');
    fillEllipse(g, w, h, 84, 112, 30, 16, 'B04');
    fillEllipse(g, w, h, 52, 116, 50, 24, 'B08');
    // 草地上的小花
    [[24, 90], [46, 94], [68, 91], [88, 97]].forEach(function (p) {
      put(g, w, h, p[0], p[1], 'H02');
      put(g, w, h, p[0] - 1, p[1], 'E12');
      put(g, w, h, p[0] + 1, p[1], 'E12');
      put(g, w, h, p[0], p[1] - 1, 'E12');
      put(g, w, h, p[0], p[1] + 1, 'E12');
      put(g, w, h, p[0], p[1], 'G05');
    });

    function cloud(ccx, ccy) {
      fillEllipse(g, w, h, ccx, ccy + 2, 12, 5, 'H09');
      fillEllipse(g, w, h, ccx, ccy, 12, 6, 'H02');
      fillEllipse(g, w, h, ccx - 5, ccy - 3, 6, 5, 'H02');
      fillEllipse(g, w, h, ccx + 3, ccy - 5, 7, 6, 'H02');
      fillEllipse(g, w, h, ccx + 9, ccy - 1, 5, 4, 'H02');
    }
    cloud(15, 72);
    cloud(89, 72);

    // 天空点缀
    put(g, w, h, 24, 24, 'C14');
    put(g, w, h, 30, 20, 'C14');
    put(g, w, h, 76, 18, 'C14');
    put(g, w, h, 82, 26, 'C14');

    return { width: w, height: h, cells: g };
  }

  var patterns = {
    strawberry: buildStrawberry(),
    cat: buildCat(),
    flower: buildFlower(),
    rainbow: buildRainbow()
  };

  function makeProject(def) {
    return {
      id: def.id,
      name: def.name,
      width: def.pattern.width,
      height: def.pattern.height,
      boardW: 52,
      boardH: 52,
      beadSizeMm: 2.6,
      cells: def.pattern.cells,
      updatedLabel: def.updatedLabel,
      createdAt: def.createdAt || Date.now()
    };
  }

  var projects = [
    makeProject({ id: 'p-strawberry', name: '草莓甜心', pattern: patterns.strawberry, updatedLabel: '2 小时前' }),
    makeProject({ id: 'p-cat', name: '春日小猫', pattern: patterns.cat, updatedLabel: '昨天 21:40' }),
    makeProject({ id: 'p-rainbow', name: '雨后彩虹', pattern: patterns.rainbow, updatedLabel: '3 天前' }),
    makeProject({ id: 'p-flower', name: '窗边小花', pattern: patterns.flower, updatedLabel: '上周' })
  ];

  var defaultMyPalette = colors.filter(function (c) { return c.common; }).map(function (c) { return c.code; });

  window.MOCK = {
    EMPTY: EMPTY,
    colors: colors,
    byCode: byCode,
    indexOf: indexOf,
    series: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', '其他'],
    patterns: patterns,
    projects: projects,
    samples: [
      { id: 'sample-strawberry', name: '草莓', pattern: patterns.strawberry, hint: '2.6mm · 52×52' },
      { id: 'sample-cat', name: '小猫', pattern: patterns.cat, hint: '2.6mm · 52×52' },
      { id: 'sample-flower', name: '小花', pattern: patterns.flower, hint: '2.6mm · 52×52' }
    ],
    defaultMyPalette: defaultMyPalette,
    createGrid: createGrid
  };
})();
