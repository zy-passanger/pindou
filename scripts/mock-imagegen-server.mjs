/**
 * 本地 AI 图片/网格 mock 服务，仅用于开发验证，不调用任何真实模型。
 * 启动：node scripts/mock-imagegen-server.mjs
 * OpenAI Base URL: http://127.0.0.1:8787/v1
 * Gemini Base URL: http://127.0.0.1:8787/v1beta
 */
import http from 'node:http';
import zlib from 'node:zlib';

const PORT = Number(process.env.MOCK_IMAGEGEN_PORT || 8787);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makePng(width = 256, height = 256) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const put = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = y * (width * 4 + 1) + 1 + x * 4;
    raw[offset] = r;
    raw[offset + 1] = g;
    raw[offset + 2] = b;
    raw[offset + 3] = a;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - width / 2) / (width / 2);
      const dy = (y - height / 2) / (height / 2);
      const inside = dx * dx + dy * dy < 0.82;
      put(x, y, inside ? 248 : 246, inside ? 190 : 241, inside ? 198 : 231);
    }
  }
  // 耳朵
  for (let y = 40; y < 130; y += 1) {
    for (let x = 45; x < 110; x += 1) {
      if (x - y < 10 && x > 55) put(x, y, 255, 173, 181);
    }
  }
  // 眼睛
  for (let y = 105; y < 155; y += 1) {
    for (let x = 80; x < 125; x += 1) {
      const d = (x - 102) ** 2 + (y - 130) ** 2;
      if (d < 330) put(x, y, 29, 20, 20);
      if (d < 70) put(x, y, 255, 255, 255);
    }
  }
  for (let y = 105; y < 155; y += 1) {
    for (let x = 140; x < 185; x += 1) {
      const d = (x - 162) ** 2 + (y - 130) ** 2;
      if (d < 330) put(x, y, 29, 20, 20);
      if (d < 70) put(x, y, 255, 255, 255);
    }
  }
  // 嘴
  for (let x = 105; x <= 155; x += 1) {
    const y = 195 + Math.round(Math.sin(((x - 105) / 50) * Math.PI) * 12);
    for (let t = 0; t < 4; t += 1) put(x, y + t, 80, 33, 45);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const IMAGE_BASE64 = makePng().toString('base64');

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-goog-api-key',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function gridFor(width, height) {
  const palette = { a: '#F8C7C9', b: '#FFA9AD', c: '#F6EFE2', d: '#1D1414', e: '#A45EC7' };
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    let row = '';
    for (let x = 0; x < width; x += 1) {
      const cx = Math.abs(x - width / 2) / (width / 2);
      const cy = Math.abs(y - height / 2) / (height / 2);
      let key = 'a';
      if (cx > 0.82 && cy > 0.55) key = 'b';
      if (cx < 0.08 || cy < 0.08) key = 'd';
      if (cx + cy < 0.55) key = 'c';
      if (cx < 0.24 && cy < 0.3) key = 'e';
      row += key;
    }
    rows.push(row);
  }
  return { width, height, palette, rows };
}

function parseGridSize(text) {
  const match = /严格\s*(\d+)\s*[×x]\s*(\d+)/.exec(text) || /(\d+)\s*[×x]\s*(\d+)\s*格/.exec(text);
  if (!match) return { width: 16, height: 16 };
  return {
    width: Math.max(1, Math.min(52, Number(match[1]))),
    height: Math.max(1, Math.min(52, Number(match[2]))),
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-goog-api-key',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Max-Age': '600',
    });
    res.end();
    return;
  }
  try {
    if (req.method === 'POST' && req.url === '/v1/images/generations') {
      json(res, 200, { created: Date.now(), data: [{ b64_json: IMAGE_BASE64 }] });
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      const body = await readBody(req);
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const userText = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
      const wantsGrid = /只输出以下 JSON|palette|rows/.test(userText);
      if (wantsGrid) {
        const { width, height } = parseGridSize(userText);
        const grid = gridFor(width, height);
        if (/INVALID_GRID/.test(userText) && !/上一次输出/.test(userText)) {
          grid.rows[0] = grid.rows[0].slice(0, Math.max(1, width - 2));
        }
        json(res, 200, { choices: [{ message: { content: JSON.stringify(grid) } }] });
        return;
      }
      json(res, 200, {
        choices: [{ message: { content: `![mock](data:image/png;base64,${IMAGE_BASE64})` } }],
      });
      return;
    }
    if (req.method === 'POST' && req.url?.includes(':generateContent')) {
      const body = await readBody(req);
      const text = JSON.stringify(body);
      if (/responseMimeType/.test(text)) {
        const { width, height } = parseGridSize(text);
        const grid = gridFor(width, height);
        json(res, 200, {
          candidates: [{ content: { parts: [{ text: JSON.stringify(grid) }] } }],
        });
        return;
      }
      json(res, 200, {
        candidates: [{
          content: {
            parts: [
              { text: 'mock image' },
              { inlineData: { mimeType: 'image/png', data: IMAGE_BASE64 } },
            ],
          },
        }],
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, { ok: true });
      return;
    }
    json(res, 404, { error: { message: 'not found' } });
  } catch (error) {
    json(res, 500, { error: { message: error instanceof Error ? error.message : 'mock error' } });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`Mock imagegen server: http://127.0.0.1:${PORT}\n`);
});
