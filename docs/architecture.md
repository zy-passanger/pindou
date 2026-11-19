# 拼豆工坊 · 技术架构 v0.1

> 阶段：架构设计（阶段 2）  
> 状态：Draft，待架构评审  
> 输入：已批准的交互设计稿 v0.1、设计规范、MARD 221 默认 / 291 全色 / 226 自定义、数据本地保存  
> 约束：**本文档评审通过前不写生产代码**。开发从阶段 3 的 M1 开始。

---

## 0. 结论摘要

| 决策 | 结论 |
|---|---|
| 产品形态 | 纯前端 PWA，无后端、无账号、无云同步；离线可用，数据只在本机 |
| UI 框架 | React 19 + TypeScript + Vite + Tailwind CSS |
| 画布 | Canvas 2D + 命令式 EditorEngine；React 只负责任务界面，不参与逐格渲染 |
| 数据模型 | `Uint16Array` 色卡索引；`0xFFFF` 表示空格；工程文件带完整色卡快照 |
| 色卡 | 内置 MARD 291 色（221 常用 + 70 特殊效果）；「我的色卡」默认启用 221，可切 291 / 自定义 / 粘贴 226 清单 |
| 图片转换 | Web Worker；线性光面积平均；OKLab 最近色匹配；两遍限色；可选 Floyd–Steinberg 抖动 |
| 导出 | PNG 图纸、A4 分页 PDF（光栅页 + jsPDF）、UTF-8 BOM CSV；PDF 默认 200 DPI、1:1 实物、重叠 1 格 |
| 存储 | IndexedDB（工程、网格、色卡快照、设置）+ 自动保存 + `.pindou.json` 工程文件导入/导出 |
| PWA | 离线应用壳、安装、更新提示；所有资源本地打包，无 CDN/外链字体 |
| 触控 | 单指绘制、双指缩放/平移、第二指回滚当前笔画；手写笔优先；手机底栏 7 个工具 + 双指平移 |
| 测试 | Vitest（纯逻辑/属性测试）+ Playwright（三种视口 + 触控 + 导出/离线/数据持久化） |

**开发前必须知道的三个边界**

1. 这是设计稿的产品化，不是把原型 HTML 直接上线；原型只作为视觉/交互基准。
2. 所有用户数据保存在本机；没有后端兜底，必须提供工程文件备份与存储持久化请求。
3. 色值为公开色号表的屏幕参考值，不宣称与实物完全一致；数据文件与版本必须可校准、可迁移。

---

## 1. 背景与约束

### 1.1 产品背景

拼豆玩家需要把图片或灵感变成「能照着拼、能按色号买豆」的图纸。核心闭环：

```
新建/导入图片 → 真实色号图纸 → 逐格编辑 → 用量统计 → PNG / A4 PDF / CSV
```

目标设备为平板与手机；桌面浏览器作为辅助。使用 2.6mm MARD 融合豆为主，默认 52×52 板；也支持 5mm 与自定义尺寸。

### 1.2 已确认的决策

- **MARD 291 色数据**：221 常用（classic，A–H + M）+ 70 特殊效果（珠光/温变/果冻/透明白/夜光/光变）。
- **我的色卡默认 221**：默认启用全部 221 常用；可切 291 全色、逐色调整、粘贴 226 套装清单。
- **数据本地保存**：工程、我的色卡、AI 服务配置与生成历史保存本机；不做云同步；正式版用 IndexedDB，设计原型用 localStorage 演示。
- **AI 生成为可选联网能力**：用户自行配置第三方服务商与 Key，请求从浏览器直连；AI 关闭或离线时不影响其余功能。
- **图纸导出**：PNG、A4 PDF（分页/镜像/1:1/重叠/图例页）、CSV。
- **触控优先**：手机底栏 7 个绘制工具 + 当前色；平移用双指；平板/桌面工具栏含平移工具。

### 1.3 关键技术约束

| 约束 | 影响 |
|---|---|
| 纯前端、无后端 | 计算、存储、导出全部在浏览器；需要 Worker、IndexedDB、PWA |
| iPad Safari 内存有限 | PDF/大图要逐页、逐块处理；默认 200 DPI；限制 300×300 |
| IndexedDB 可能被系统清理 | 请求持久化；提供工程文件导出/导入；提示备份 |
| 核心无外网依赖 | 字体、图标、色卡数据全部本地；PWA 离线；仅可选 AI 生成需要直连第三方 API |
| 中文 PDF | 不嵌入 CJK 字体，改用 Canvas 渲染页面后嵌入 PDF |
| 触控与手势冲突 | 第二指落下时回滚未完成笔画，再进入缩放/平移 |
| 色卡数据非官方 | 数据版本化、界面标注屏幕参考、支持后续校准 |

---

## 2. 目标与非目标

### 2.1 目标

1. 200×200 画布在平板/桌面 60fps 平移缩放；300×300 可用。
2. 图片到 52×52 图纸的转换在 1.5s 内完成，200×200 在 3s 内，UI 不阻塞。
3. 工程、我的色卡、编辑结果本地可靠保存；刷新/重开不丢。
4. PNG/PDF/CSV 与统计一致；PDF 可打印、可拼接、可镜像、1:1。
5. 核心逻辑（色差、量化、分页、历史、统计）可单测，不依赖浏览器。
6. 设计稿的视觉与交互 1:1 落地，不因实现而漂移。

### 2.2 非目标（v1）

- 账号、云同步、多人协作。
- 图层、选区/移动工具、分板拼接图、逐豆完成打卡、参考底图描图、OCR 色卡、库存采购。
- 服务端渲染、在线图库、社区分享。
- 自定义字体/主题、深色模式。
- WASM 加速渲染（保留为后续优化）。

---

## 3. 技术栈

| 层 | 选择 | 版本基线 | 理由 |
|---|---|---|---|
| 构建 | Vite | 7.x | 快速、原生 ESM、PWA 插件生态 |
| UI | React + TypeScript | React 19 / TS 5.9 | 复杂表单/ Sheet / 向导；团队熟悉 |
| 样式 | Tailwind CSS + CSS 变量 | 4.x | 与设计 token 一一映射；复杂画布样式保留少量 CSS |
| UI 状态 | Zustand | 5.x | 轻量、选择器细粒度、不把画布塞进 React state |
| 画布 | Canvas 2D | 浏览器原生 | 40k 格足够；比 SVG/DOM 稳定；比 WebGL 简单 |
| 图标 | 本地 SVG sprite + React `<Icon>` | 设计稿同源 | 离线、视觉一致、无额外包 |
| 色彩科学 | culori | 4.x | OKLab / sRGB 转换可靠，tree-shake |
| 图片 Worker | 原生 Web Worker | — | 不阻塞主线程；Vite 原生 worker 支持 |
| 存储 | idb | 8.x | IndexedDB Promise 封装，体积小 |
| PDF | jsPDF | 3.x | 纯前端、可直接嵌 Canvas 图；动态加载 |
| PWA | vite-plugin-pwa | 1.x | Workbox 预缓存、manifest、更新提示 |
| 测试 | Vitest + Playwright | 3.x / 1.5x | 纯逻辑 + 真实浏览器触控 |
| PDF 测试 | pdf-lib（dev） | 1.x | 解析页数/尺寸做断言 |
| 代码质量 | ESLint + Prettier + tsc | 最新稳定 | 统一风格与类型检查 |

**不引入**

- 不引入 Konva/Fabric/Pixi：它们带额外抽象与包体，当前需求用 Canvas 2D + 自研引擎更可控。
- 不引入大型 UI 组件库：设计稿的组件是定制的；只自研 Button/Sheet/Dialog/Slider 等。
- 不引入后端/BaaS：本地优先，无账号。
- 不使用 CDN 字体/图标：离线与视觉一致性。

**浏览器支持**

- iPadOS Safari 17+（主目标）、Chrome/Edge 120+、Android Chrome 120+。
- 桌面 Safari 17+ 作为辅助。
- 需要 IndexedDB、Service Worker、Pointer Events、Canvas 2D、Web Worker。
- `OffscreenCanvas` / `createImageBitmap` / `roundRect` 做能力检测，提供降级路径。
- 不使用尚未稳定的 File System Access API 作为唯一路径；下载/分享兜底。

**开发环境**

- Node 22 LTS，npm（提交 `package-lock.json`）。
- 无构建时环境变量/密钥；AI Key 由用户运行时输入，按设置存本机 IndexedDB，绝不注入构建产物。
- 命令：`npm run dev / build / preview / test / test:e2e / typecheck / lint`。

---

## 4. 系统架构

### 4.1 分层

```
┌─────────────────────────────────────────────────────────────┐
│ React App Shell                                             │
│ Home · Editor chrome · Import Wizard · Sheets · Settings     │
│ 只负责界面、表单、路由、无障碍；不直接画格子                  │
└───────────────▲───────────────────────────┬─────────────────┘
                │ UI state / commands        │ document events
┌───────────────┴───────────────────────────▼─────────────────┐
│ EditorEngine（命令式）                                       │
│ Canvas · Viewport · Gestures · Tools · History · Counts      │
└───────────────▲───────────────────────────┬─────────────────┘
                │ project cells              │ changes
┌───────────────┴───────────────────────────▼─────────────────┐
│ Domain Core（框架无关 TS）                                    │
│ model · palette · color · quantize · geometry · stats ·      │
│ history primitives · pagination · project file · validation  │
└───────────────▲───────────────────────────┬─────────────────┘
                │                           │
     ┌──────────┴──────────┐     ┌──────────▼──────────┐
     │ Quantize Worker     │     │ Storage / PWA        │
     │ 图片解码/采样/匹配  │     │ IndexedDB · Autosave │
     └─────────────────────┘     │ SW · Manifest        │
                                 └─────────────────────┘
                │
     ┌──────────▼──────────┐
     │ Export Renderer      │
     │ PNG · A4 PDF · CSV   │
     └─────────────────────┘
```

### 4.2 依赖规则

1. `core/` 不依赖 React、DOM、Canvas、IndexedDB；可被 Node/Vitest 直接测试。
2. `editor/` 依赖 `core/` 与浏览器 Canvas API；不依赖具体 React 组件。
3. `features/` 依赖 `core/`、`editor/`、`ui/`；features 之间不互相 import 内部文件。
4. `workers/` 只依赖 `core/` 的纯函数与类型；不消费 React/store。
5. `storage/` 依赖 `core/` 的 schema 与验证；不依赖 UI。
6. `ui/` 只依赖 React 与设计 token，不依赖业务数据。
7. 禁止循环依赖；用 ESLint `import/no-cycle` 或依赖图检查。

### 4.3 目录结构（规划）

```
src/
  app/
    App.tsx
    routes.tsx                 # home / editor / import / settings（轻量路由）
    providers.tsx
  ui/
    tokens.css                 # 设计 token（与 design-spec 第 6 节一致）
    Icon.tsx                   # 本地 SVG sprite 的 React 封装
    Button.tsx  Sheet.tsx  Dialog.tsx  Slider.tsx  Switch.tsx
    Segmented.tsx  Stepper.tsx  Toast.tsx  EmptyState.tsx
  features/
    home/                      # 工程列表、工程菜单、导入工程
    editor/                    # 编辑器 UI 壳、工具栏、状态栏、手机坞
    palette/                   # ColorPanel、MyPaletteSheet、色卡筛选
    import/                    # ImportWizard 5 步、裁剪、对比、参数
    ai/                        # AiGenerateSheet、provider 配置、生成预览与历史
    stats/                     # StatsSheet
    export/                    # ExportSheet、进度、分享
    settings/                  # 画布设置、变换、替换颜色
  editor/                      # 引擎（非 React）
    EditorEngine.ts
    Viewport.ts
    Renderer.ts
    patterns.ts                # 网格/标尺/色号绘制
    GestureController.ts
    tools/                     # pencil/eraser/fill/shapes/eyedropper/pan
    History.ts
    counts.ts
  core/
    model.ts                   # Project / Palette / EMPTY
    palette.ts                 # MARD 数据访问、我的色卡
    color.ts                   # OKLab、色差、sRGB/线性光
    quantize.ts                # 重采样、背景、限色、抖动（纯函数）
    resample.ts                # 4×4 面积平均 + 线稿/高光/高彩度细节保留
    imagegen/                  # AI 请求构建、响应解析、网格提示词与校验（纯函数）
    geometry.ts                # 线/矩形/椭圆/旋转/翻转/尺寸
    stats.ts                   # 用量统计、板数、CSV 行
    pagination.ts              # A4 分页纯函数
    projectFile.ts             # .pindou.json 编解码/校验
    validation.ts
    ids.ts
  workers/
    quantize.worker.ts         # 协议入口
  services/
    imagegen/                  # fetch 客户端、超时/脱敏、图片解码、网格渲染
  storage/
    db.ts                      # idb schema / migrations（v2）
    projectRepository.ts
    aiRepository.ts            # AI 配置、生成历史、缩略图/图片 Blob
    settingsRepository.ts
    thumbnails.ts
    autosave.ts
  export/
    patternRenderer.ts         # PNG/PDF 共用的 Canvas 排版
    png.ts
    pdf.ts
    csv.ts
    share.ts
  data/
    palettes/mard.v1.json      # 291 色；221 common
    palettes/mard.schema.json
  pwa/
    manifest / service worker 由 vite-plugin-pwa 生成
  styles/
    globals.css
  tests/
    unit/ e2e/ fixtures/
docs/
  architecture.md
  adr/
design/                        # 已批准的设计稿，只作参考，不参与构建
```

### 4.4 运行时视图

- 应用启动：加载 bundle → 初始化 DB → 读取 settings（我的色卡，默认 221）→ 首页读取工程摘要；不加载全部网格。
- 打开工程：读 project meta + grid cells + palette（内置或自定义）→ 创建 EditorEngine → 首帧 fit。
- 编辑：Engine 修改 `Uint16Array` 与计数 → 通知 React chrome（缩放/颗数/撤销状态）→ 800ms 防抖自动保存。
- 图片：主线程解码/裁剪 → Worker 量化 → 返回 cells → 应用为可撤销操作。
- 导出：当前 document + palette → 渲染 → 下载/分享。
- 离线：Service Worker 返回缓存的 app shell 与数据；所有操作仍可执行。

---

## 5. 数据模型与工程文件

### 5.1 核心类型

```ts
export const EMPTY = 0xFFFF; // 空格；色卡索引 0..290

export type BeadSizeMm = 2.6 | 5;

export type BeadColor = {
  code: string;      // A01 / F04 / P01
  name: string;      // 浅黄
  hex: string;       // #FAF4C8
  series: string;    // A..Z（第一个字母）
  common: boolean;   // 属于 221 常用套装
};

export type PaletteSnapshot = {
  id: string;        // 'mard'
  version: string;   // '2026.11'
  colors: BeadColor[]; // 291
};

export type PaletteRef = { id: string; version: string };

export type ProjectMeta = {
  schemaVersion: 1;
  id: string;
  name: string;
  width: number;      // 1..300
  height: number;     // 1..300
  beadSizeMm: BeadSizeMm;
  boardW: number;     // 板边界强调，默认 52 / 29
  boardH: number;
  paletteRef: PaletteRef;
  createdAt: number;
  updatedAt: number;
};

export type Project = ProjectMeta & {
  palette: PaletteSnapshot; // 运行时解析
  cells: Uint16Array;       // width * height，EMPTY 或色卡索引
};
```

**约定**

- 所有 cells 索引指向 `project.palette.colors`；色卡顺序是工程文件的一部分。
- `EMPTY = 0xFFFF`；色卡数量上限 65534（当前 291）。
- `boardW/H` 用于板边界强调与板数估算，不参与 cells 存储。
- 工程尺寸上限 300×300（90,000 格）；导入文件同样校验。
- 色卡数据不可变；任何校准/版本升级生成新的 `version`。

### 5.2 调色板数据

- 生产数据文件：`src/data/palettes/mard.v1.json`。
- 内容：291 色，其中 221 色 `common: true`，70 色特殊效果 `common: false`。
- 字段：`code / name / hex / series / common`。
- 构建时校验（Vitest）：
  - 291 条，code 唯一，hex 合法，series 一致；
  - `common` 数量为 221；
  - 默认「我的色卡」= 全部 common 的 code。
- 原型里的 `design/prototype/mard-colors.js` 是设计与数据来源的参考实现；生产 JSON 由同一数据生成，**不运行时抓取网页**。
- 数据版本：`2026.11`（示例）。若更新色值或增减色号，版本递增；工程文件带快照，旧工程仍可正确渲染。

### 5.3 「我的色卡」

- 全局设置，不是每个工程独立（v1；后续可加 per-project override）。
- 默认值：`colors.filter(c => c.common).map(c => c.code)` → 221 个。
- 可选：
  - 221 常用（重置为默认）；
  - 291 全色（所有 code）；
  - 自定义勾选；
  - 粘贴/导入色号清单（兼容 A1 → A01；支持逗号/空格/换行/CSV 首列）。
- 保存到 settings：
  ```ts
  type AppSettings = {
    schemaVersion: 1;
    myPaletteCodes: string[];
    lastProjectId?: string;
    editorPrefs?: {
      showGrid: boolean;
      showCodes: boolean;
      stylusOnlyDraw: boolean;
      pdfDpi: 200 | 300;
      pdfOverlap: 0|1|2|3;
    };
  };
  ```
- 校验：未知 code 丢弃；为空时 UI 阻止「只用我的色卡」的转换，提示先启用颜色；编辑器仍可查看所有色号。
- 226 套装：用户粘贴 226 个 code 后形成自定义清单；后续可在设置里保存为命名预设（v1 先不做命名预设）。

### 5.4 工程文件 `.pindou.json`

```json
{
  "format": "pindou",
  "schemaVersion": 1,
  "appVersion": "0.1.0",
  "project": {
    "id": "…",
    "name": "草莓图纸",
    "width": 52,
    "height": 52,
    "beadSizeMm": 2.6,
    "boardW": 52,
    "boardH": 52,
    "createdAt": 0,
    "updatedAt": 0,
    "cellsEncoding": "u16le-base64",
    "cellsBase64": "…"
  },
  "palette": {
    "id": "mard",
    "version": "2026.11",
    "colors": [ { "code": "A01", "name": "浅黄", "hex": "#FAF4C8", "series": "A", "common": true } ]
  }
}
```

- cells 编码：`Uint16Array` 小端序 → base64；长度必须等于 `width * height * 2` 字节。
- 文件内嵌**完整色卡快照**（291 条约 15–20KB），保证换版本/换设备仍能按原色渲染。
- 导入时：
  - 校验 format / schemaVersion / 尺寸 / cells 长度 / 色卡；
  - 生成新 id（避免覆盖）；
  - 如果色卡快照与内置版本一致，使用内置；否则把快照写入 `palettes` store，工程引用该快照；
  - 导入后作为新工程打开，不覆盖现有工程。
- 导出入口：首页「更多」→ 导出工程文件；工程卡片菜单也提供导出。**这是设计稿之外的唯一新增菜单项**，沿用现有 menu-item 组件，不新增屏幕。
- 文件命名：`{工程名}.pindou.json`；非法字符替换。
- 不引入 gzip：base64 体积可接受（200×200 约 110KB）；后续可加 CompressionStream。

### 5.5 存储记录

```ts
// IndexedDB: pindou, version 1
type ProjectSummaryRecord = ProjectMeta & {
  thumbnail: Blob | null; // WebP/PNG, 320×240
  totalBeads: number;      // 首页展示，保存时更新
  colorCount: number;
};

type GridRecord = {
  projectId: string;
  cells: Uint16Array;
  updatedAt: number;
};

type PaletteRecord = {
  key: string;             // `${id}@${version}`
  snapshot: PaletteSnapshot;
  source: 'builtin' | 'imported';
};

type SettingRecord = { key: string; value: unknown };
```

- `projects` store：`keyPath: 'id'`，index `updatedAt`；只存 meta + 缩略图 + 统计，不含 cells（首页快速加载）。
- `grids` store：`keyPath: 'projectId'`；存 cells。
- `palettes` store：自定义/导入色卡；内置 MARD 从 bundle 解析，不必重复存。
- `settings` store：`keyPath: 'key'`；我的色卡、编辑器偏好。
- 保存工程用**一个事务同时写 projects + grids**；缩略图/统计可同事务或稍后更新。
- `totalBeads / colorCount` 在保存时根据 counts 写入，避免首页重算 40k 格。

### 5.6 迁移

- DB 版本由 idb upgrade 管理；`schemaVersion` 存在工程 meta。
- 迁移函数注册表：`migrations[fromVersion] -> ProjectMeta/ProjectFile`。
- 色卡版本迁移：按 code 映射；工程文件自带快照，优先使用快照，无需远程数据。
- 迁移失败不删除原记录；保留旧记录并提示用户导出备份。
- 迁移测试使用固定 fixture（v1 工程文件 + 旧 DB 记录）。

---

## 6. 色卡与色彩科学

### 6.1 默认与可选

- 默认工程色卡：MARD 291；`common` 221。
- 默认我的色卡：221 常用。
- 图片转换只使用「我的色卡 ∩ 工程色卡」的 code；编辑/导出可以使用工程色卡全部颜色。
- 如果我的色卡为空：转换前提示「请至少启用一个颜色」；不使用全部颜色静默兜底。
- 226 套装：粘贴 code 清单 → 自定义；不影响工程色卡数据。

### 6.2 色彩空间与匹配

- sRGB ↔ OKLab：用 culori 转换；预计算 `Float32Array` 的 L/a/b。
- 最近色：OKLab 欧氏距离平方（与 CIEDE2000 接近、速度快）；291 色 × 90k 格可接受。
- 缓存：色卡 OKLab 数组在 worker/palette 解析时构建一次；色卡变化才失效。
- 最近色查找优化：
  - 291 色直接线性扫描；200×200 = 11.6M 次，Worker 内 <200ms 量级。
  - 如后续色卡更大，再引入 kd-tree/3D LUT；v1 不做。
- 屏幕色值免责声明：色卡面板/我的色卡/导出说明持续提示；数据可被后续校准替换。

### 6.3 图片量化算法

输入：裁剪后的源像素、目标网格、调整参数、我的色卡、最多色数、抖动。

1. **重采样**：按目标格把源图分块（锐利模式 4×4），保留 alpha。  
   - 低对比区域：面积平均，避免普通 sRGB 平均导致发灰/偏暗。
   - 高对比区域（亮度跨度 > 90）：按优先级保留高彩度像素（紫色眼睛、红色衣纹、金色饰件）、最深像素（线稿/眼线）、最浅像素（眼睛高光/白衣亮部）。
   - 高彩度保留要求同一格至少 2 个子像素命中，避免照片噪点变成孤立彩点；低对比格子不触发，保持照片柔和。
   - 纯函数位于 `core/resample.ts`，单测覆盖线稿、彩点、高光、alpha 与非法尺寸。
2. **颜色调整**：亮度/对比度/饱和度（sRGB 或线性空间统一）；按格计算。
3. **背景移除**：
   - 源 alpha < 阈值 → EMPTY；
   - 与背景色的 OKLab 距离 < 容差 → EMPTY；
   - 背景色默认取四角众数，可拾色/指定。
4. **自动配色（默认开启）**：从当前图自身提取 N 个主色，再映射到「我的色卡」。
   - 有效格聚成唯一 RGB bin，在 OKLab 空间做按格数加权的 k-means；
   - 种子固定包含最深、最浅、最高彩度，再用加权最远点补足 K；
   - 每次导入都重新统计，不跨图复用色号；换图得到新的色号组合；
   - 最深/最浅/最高彩度的聚类优先分配色号，避免黑眼睛、白发高光、粉色/金色点缀被大面积主色挤掉；
   - 分配时排除已占用色号，保证 K 个聚类得到 K 个不同豆色；
   - 关闭自动配色时退回旧逻辑：先匹配全部色卡，再按用量保留 N 色。
5. **限色（最多 N 色）**：自动配色路径下最终 distinct 色数 ≤ N；旧路径用两遍法：
   - 第一遍统计已匹配颜色的用量；
   - 保留用量前 N 的颜色，并强制保留最深/最浅色；
   - 其余格重新匹配到保留色中的最近色。
6. **抖动（可选）**：Floyd–Steinberg 误差扩散，sRGB 空间；下一条格使用相邻已处理格的误差；输出仍限制在允许色卡内。
   - 默认关闭；照片类可选。
7. **输出**：`Uint16Array` cells（索引指向工程色卡）+ 统计（各色颗数、总颗数、色数、耗时）。

**边界**

- 目标尺寸 1..300；源图上限 24MP；超过提示先缩小。
- 无 alpha 的图片背景色容差按 OKLab；线稿/白底商品图效果最好。
- 抖动 + 限色的顺序：先限色集合，再抖动；避免抖动后色数膨胀。
- 自动配色与参考图纸无关：参考图纸只用于事后评估，不参与色号选择。
- 结果确定性：相同输入/参数/色卡 → 相同输出（便于测试）。

### 6.4 用量统计

- counts：保存时根据 cells 全量统计；编辑时增量维护（见编辑器章节）。
- 统计列表：按用量降序；颗数、占比、色号、名称、HEX。
- 板数估算：`ceil(width / boardW) * ceil(height / boardH)`。
- CSV 行与统计共用同一个 `buildUsageRows(project, counts)` 纯函数，避免导出与 UI 不一致。

---

## 7. 编辑器引擎

### 7.1 设计目标

- 200×200（40,000 格）平移缩放 60fps；300×300（90,000 格）可用（≥30fps）。
- 笔画到落格的延迟 <16ms；不在 React 中逐格 setState。
- 撤销/重做稳定、内存有上限。
- 触控手势不误画、不丢笔。

### 7.2 职责划分

| 对象 | 职责 | 不负责 |
|---|---|---|
| `ProjectDocument` | cells、尺寸、色卡、版本号；事务与 diff | Canvas、React |
| `EditorEngine` | Canvas 生命周期、视口、输入、工具、渲染 | 页面导航、表单 |
| `History` | 撤销/重做栈、diff/快照、内存预算 | UI 按钮状态（通过订阅） |
| `Renderer` | 画布/网格/标尺/色号/预览绘制 | 业务规则 |
| `GestureController` | Pointer 状态机、缩放/平移/回滚 | 具体工具落格 |
| React Store | 当前工具/颜色/面板/Sheet/Toast | 每格数据 |

### 7.3 文档与事务

```ts
class ProjectDocument {
  readonly palette: PaletteSnapshot;
  width: number;
  height: number;
  cells: Uint16Array;
  version: number;

  beginTransaction(label: string): CellTransaction;
  replaceAll(cells: Uint16Array, width: number, height: number): void;
  subscribe(listener: () => void): () => void;
}

class CellTransaction {
  set(x: number, y: number, colorIndex: number): void;
  commit(): void;   // 生成 diff，压入 History，更新计数，通知
  cancel(): void;   // 回滚未提交的改动
}
```

- 单笔笔画一个事务；形状/填充一次一个事务。
- 事务记录 `{indices: Uint32Array, before: Uint16Array, after: Uint16Array}` 或变更列表；<1000 格用紧凑 diff，批量操作用网格快照。
- 事务提交后更新 `version` 与 counts；React 通过订阅拿到「统计/撤销状态」快照，而不是 cells。

### 7.4 渲染管线

每帧：

1. 清空并绘制舞台背景。
2. 计算视口：`cellPx = baseCell * scale`；板居中；pan 偏移；标尺贴着 artboard。
3. 绘制板底/阴影/边框。
4. 绘制豆子：
   - 低缩放（cellPx < 4）：使用离屏 1px/格 位图缓存，缩放到视口；`imageSmoothingEnabled = false`。
   - 高缩放：按可见范围逐格 `fillRect`；视口裁剪。
5. 绘制网格与板边界：每格/每 5 格/每 10 格分级透明度；每 boardW/boardH 画粗线。
6. 绘制空格钉点（高缩放，可关）。
7. 绘制格内色号（cellPx ≥ 20，开关打开；按亮度选深/浅文字）。
8. 绘制形状预览/悬停格。
9. 绘制标尺：上/左贴板，角落豆标记；标签间隔随 cellPx 在 5/10 间切换。
10. HTML 浮层（缩放药丸/状态浮标/空画布引导）由 React 渲染，不画进 Canvas。

**性能技术**

- rAF 合帧；只在 viewport/document/options 变化时重绘。
- 缓存：1px/格 的 pattern offscreen；编辑后失效；色卡变化失效。
- 可见范围裁剪；不在屏幕内的格子不画。
- 文字只在缩放到可读时绘制；避免 40k 次 `fillText`。
- DPR 上限 2（iPad 足够；避免 3x 内存）。
- 不使用 `shadowBlur` 逐格；阴影只用于板整体一次。

### 7.5 视口

- `scale=1` 为「适应屏幕」；范围 0.25–10（与设计稿一致）。
- 缩放锚点：滚轮/双指/双击；以指针/中点为锚。
- pan 限制：保持至少一部分板可见，避免完全丢失。
- 打开工程默认 fit；旋转/翻转后重新 fit？保持当前 scale/pan，clamp；与设计稿一致。
- 标尺与板边界跟随 viewport；手机/平板/桌面同一套逻辑。

### 7.6 手势状态机

状态：`idle → pending → draw | shape | pan | pinch`。

- Pointer Events + `touch-action: none` + pointer capture。
- 第一指按下：按当前工具进入 draw/shape/pan。
- 第二指按下：
  1. 取消当前笔画事务（回滚已落的豆子）；
  2. 进入 pinch，记录两指距离/中点/锚点格；
  3. 双指移动 = 缩放 + 平移（中点平移）；
  4. 抬起一指回到 idle（不自动续画，避免误触）。
- 手写笔模式（设置开关）：
  - `pointerType === 'pen'` 绘制；手指只平移/缩放；
  - 默认关闭（手指也可绘制），但平板用户可开启防误触。
- 长按吸管：v1 不做（会与落笔冲突）；吸管作为独立工具。设计稿已按工具实现。
- 滚轮缩放；双击 1.6×；Esc 取消形状/关闭面板由 React 处理。
- 坐标换算：使用 `getBoundingClientRect` 与布局宽高比，兼容 CSS 缩放（评审框/浏览器缩放）。

### 7.7 工具

| 工具 | 行为 | 事务 |
|---|---|---|
| 画笔 | 1/2/3 笔刷；Bresenham 插值；对称 | 一笔一个 |
| 橡皮 | 同画笔，写 EMPTY | 一笔一个 |
| 填充 | 4 连通扫描线；只填同色区域 | 一次一个 |
| 吸管 | 读取格色，切换画笔；不改文档 | 无 |
| 直线 | 预览；抬起提交 | 一次一个 |
| 矩形 | 填充矩形；预览 | 一次一个 |
| 椭圆 | 填充椭圆；预览 | 一次一个 |
| 平移 | 只改视口，不改文档 | 无 |

- 对称：水平/垂直/四向；在落格时镜像；填充不应用对称。
- 工具切换取消未完成预览；不产生历史。
- 工具激活/禁用状态由 React store 控制，Engine 提供 `setTool`。

### 7.8 撤销/重做

- 栈：undo/redo；事务提交产生一条。
- 类型：
  - `CellDiff`：笔画/填充/形状/替换颜色；
  - `GridSnapshot`：图片导入、尺寸调整、旋转/翻转、清空。
- 内存预算：30MB；最多 80 条；超出丢最旧。
- 计数增量：diff 应用时更新 `Uint32Array(291)`；快照恢复时全量重算。
- 替换画布/导入图片作为单条历史；撤销恢复旧尺寸与 cells。
- UI：撤销/重做按钮订阅 `canUndo/canRedo`；快捷键 Ctrl/Cmd+Z、Shift+Z、Ctrl+Y。

### 7.9 工程操作

- 调整尺寸：九宫格锚点；新 cells 复制/裁剪；一次快照历史；上限 300。
- 旋转/翻转：一次性生成新网格；更新宽高（90° 时交换）；历史快照。
- 替换颜色：把工程色卡中的某个 code 替换为另一个；遍历 cells；一次 diff/快照；同色禁用。
- 清空：全部 EMPTY；快照历史；二次确认。
- 板边界：随 boardW/H；不改变 cells。

### 7.10 React 集成

- `CanvasStage` 用 `ref` 挂载；`useEffect` 创建 `EditorEngine`，卸载 destroy。
- UI store（Zustand）保存 tool/color/brush/symmetry/sheets/zoom 显示；Engine 订阅或接收命令。
- 文档变化通过 `onDocumentChange`（节流到 rAF/100ms）更新：
  - 统计（总颗数/色数/当前色用量）；
  - undo/redo 可用性；
  - 空画布引导显隐；
  - 自动保存调度。
- 颜色选择/工具切换直接调用 Engine，不走 React 重渲染整页。
- 主题/布局由 CSS 容器查询或 `data-layout`；与设计稿三档一致。

---

## 8. 图片导入管线

### 8.1 流程

```
选择文件 → 解码（主线程）→ 自动取景/裁剪/旋转/缩放 → Worker：
  重采样 → 调整 → 背景移除 → 自动配色 → 色卡匹配 → 抖动
→ 返回 cells + stats → 预览 → 应用（替换/新工程）
```

### 8.2 解码与裁剪

- `createImageBitmap(file, { imageOrientation: 'from-image' })` 处理 EXIF 方向。
- 源图上限 24MP；超过提示先缩小，或按最长边 6000 缩放解码。
- 裁剪框比例 = 目标宽/高；目标尺寸：
  - 替换当前画布时，默认 = 当前工程尺寸；
  - 新建时默认 52×52（2.6mm），可在向导选择板型/自定义；复用新建工程的 preset 组件。
- 裁剪输出：源图像素矩形 + 旋转 0/90/180/270 + fit（fill/contain）。
- 自动取景：选项图片加载后缩到 ≤640px，检测主体边界（透明图用 alpha；不透明图用边缘主色 + OKLab 容差做连通背景剔除），换算为裁剪的 zoom/offset；四周保留约 3.5% 安全边，用户仍可拖动或点「自动取景」重算。只裁留白，不改变目标比例。
- 预览裁剪在 Canvas 上实现（平移/缩放/旋转），不依赖第三方裁剪库。

### 8.3 Worker 协议

```ts
type QuantizeRequest = {
  jobId: number;
  bitmap?: ImageBitmap;        // 可转移
  imageData?: ImageData;       // OffscreenCanvas 不可用时的兜底
  crop: { x: number; y: number; width: number; height: number };
  target: { width: number; height: number };
  rotate: 0 | 90 | 180 | 270;
  fit: 'fill' | 'contain';
  adjust: { brightness: number; contrast: number; saturation: number };
  background: { enabled: boolean; colorHex?: string; tolerance: number; alphaThreshold: number };
  palette: { code: string; hex: string; oklab: [number, number, number] }[];
  allowedIndices: Uint16Array; // 我的色卡 ∩ 工程色卡
  maxColors: number;           // 0 = 不限制
  dither: boolean;
};

type QuantizeProgress = { jobId: number; phase: 'sample'|'match'|'dither'|'stats'; progress: number };
type QuantizeResult = {
  jobId: number;
  cells: Uint16Array;
  counts: Uint32Array;
  total: number;
  colorCount: number;
  durationMs: number;
};
```

- 主线程负责 UI 与裁剪预览；Worker 负责 CPU 量化。
- `OffscreenCanvas` 可用：Worker 内 `drawImage(bitmap)` + `getImageData`；不可用：主线程读 ImageData 后 transfer。
- Worker 内分块处理并按行发送 progress；`cancel` 消息置位，尽快停止。
- 同一时间只保留一个 job；参数变化取消上一个；用 jobId 丢弃过期结果。
- 传输使用 transferable（ImageBitmap / ArrayBuffer），避免复制。

### 8.4 采样与调整

- 面积平均（box filter）在**线性光**下计算，再转 sRGB；alpha 加权。
- 每个目标格对应源矩形；目标格小于源像素时为多对一平均，避免锯齿。
- 调整在采样后按格应用；参数范围与设计稿一致（亮度 50–150、对比度 50–150、饱和度 0–200）。
- 背景色：默认四角众数；容差用 OKLab 距离；alpha 阈值。
- 限色两遍 + 抖动；结果索引必须指向工程色卡。
- 输出统计与 UI 预览一致。

### 8.5 预览与性能

- 参数变化 120ms 防抖；取消旧 job；显示「处理中」。
- 预览直接绘制返回的 cells（与最终应用一致）。
- 预算：12MP → 52×52 <1.5s；200×200 <3s；300×300 <5s（Worker）。
- 内存：解码后释放 ImageBitmap/ImageData；不保留源图到工程。
- 应用：
  - 新建工程：`ProjectDocument` 新 cells + 目标尺寸 + 当前色卡；
  - 替换当前：历史快照 + 尺寸/ cells 替换；可撤销；
  - 切换选中色为结果中用量最高的颜色。

### 8.6 降级与错误

- `createImageBitmap` 不可用：用 `<img>` + `decode()` + Canvas 读取。
- `OffscreenCanvas` 不可用：主线程解码/绘制，传输 ImageData。
- HEIC/不支持格式：提示转换为 JPG/PNG。
- 透明 PNG：保留 alpha → EMPTY。
- 源图过大/内存不足：提示缩小或降低目标尺寸。

---

### 8.7 AI 生成（可选联网）

```
提示词 → provider 请求 → 图片/网格 → 校验/解码 → pendingImport
→ ImportWizard（图片走裁剪，网格走调色）→ 现有量化/预览/应用
```

- Provider：OpenAI Images（`/images/generations`）、OpenAI Chat（`/chat/completions`）、Gemini（`:generateContent`）。
- 文生图：返回 `b64_json`/`url`/`inlineData`/Markdown 图片；URL 先 fetch 成 Blob，避免 Canvas taint。
- 直接网格：要求模型返回 `{width,height,palette,rows}`；本地严格校验尺寸、行宽、字符、HEX、色数；失败可让模型修正（第二次计费调用）。
- 网格渲染为纯色 PNG（每格 12px，`imageSmoothingEnabled=false`），通过 `pendingImport` 进入向导；关闭自动取景，保持构图。
- 图片模式从裁剪步骤开始；网格模式从调色步骤开始，复用 `resampleArea`/自动配色/替换或新建。
- 本地存储：`aiSettings`、`generations`、`generationImages`（DB v2）；历史最近 20 条，图片最长边 1024px；Key 默认本地保存，可关闭「记住密钥」。
- 网络：浏览器直连，`mode:'cors'`，超时/AbortController/单请求/不自动重试；错误脱敏，不记录 Key/提示词/响应体。
- 离线：AI 请求不可用；其余功能不受影响。Service Worker 不缓存 API 响应。
- 测试：`core/imagegen` 纯解析/校验单测；`services/imagegen` fetch mock；`scripts/mock-imagegen-server.mjs` 做浏览器端到端。

## 9. 导出管线

### 9.1 共用排版器

`export/patternRenderer.ts` 负责：

- 标题/尺寸/豆径/日期；
- 网格、行列坐标、板边界；
- 格内色号（字号自适应、对比色）；
- 图例与用量；
- 镜像（仅渲染时，不改数据）；
- 页眉/页脚/页码。

PNG 与 PDF 共用绘制函数，保证图纸风格一致；编辑器 Canvas 另有自己的视口渲染器，避免把视口逻辑耦合进导出。

### 9.2 PNG

- 选项：每格 8/16/24/32px；色号/坐标/图例/仅图案。
- 尺寸保护：单边 ≤ 16384px；超过自动降级每格像素或提示改用 PDF。
- 渲染：完整图纸 + 可选图例页尾；用 canvas `toBlob('image/png')`。
- 分享：Web Share（支持 File）→ 下载兜底。
- 文件：`{工程名}_图纸.png`。

### 9.3 A4 PDF

**页面**

- A4 纵向 210×297mm；页边距 10mm；可打印区 190×277mm。
- 页眉、页脚、页码、全局行列号；图案页+图例页。

**分页纯函数**

```ts
type PdfMode = 'fit' | 'actual' | 'custom';

type PdfOptions = {
  mode: PdfMode;
  cellMm?: number;       // custom
  overlap: 0|1|2|3;
  mirror: boolean;
  codes: boolean;
  legendPage: boolean;
  renderDpi?: 200 | 300; // 默认 200；v1 不在导出面板暴露
};

type PdfTile = {
  pageIndex: number;
  colStart: number; colEnd: number;
  rowStart: number; rowEnd: number;
  cols: number; rows: number;
  pagesX: number; pagesY: number;
};
```

- `fit`：整图缩放到一页；不拼版；色号默认关（格子可能很小）。
- `actual`：`cellMm = beadSizeMm`（2.6 或 5）；列容量 `floor(190 / cellMm)`，行容量 `floor(277 / cellMm)`（减去页眉页脚后再算）。
- `custom`：用户固定每格 mm；同样分页。
- 重叠：`step = capacity - overlap`；页 tile 覆盖 `0..W-1`、`0..H-1`；最后一页 clamp；**任何行列都必须至少被一页覆盖**。
- 图例页：多页时单独一页；单页 fit 可并入同页/末尾。
- 页码与全局坐标：每页标注 `列 x–y / 行 a–b`，便于拼接。

**渲染**

- 每页用 Canvas 以 DPI 渲染（A4 200 DPI ≈ 1654×2339；300 DPI ≈ 2480×3508）。
- 只创建一页 Canvas，渲染 → `toDataURL('image/png')` → jsPDF `addImage` → 释放，再下一页。
- 中文与色号由浏览器 Canvas 渲染，无需嵌入字体。
- 镜像：绘制时水平翻转；不影响工程数据。
- 进度：`正在生成 3/5 页`；禁止重复点击；可取消（释放当前页）。
- 内存：默认 200 DPI；300 作为后续高级项；>20 页提示/限制；iOS 上逐页 await rAF。
- 文件：`{工程名}_A4.pdf`。

**覆盖性测试**

- 属性测试：随机 W/H/overlap/mode，断言所有行列被至少一页覆盖，且页数 = pagesX × pagesY（+图例页）。
- 1:1 尺寸测试：已知 52×52 / 2.6mm → 单页；104×104 → 2×2 + 图例页；检查页数与 mm 换算。
- 镜像：翻转后的像素/坐标符合预期。
- PDF 页数用 pdf-lib 解析校验。

### 9.4 CSV

- UTF-8 BOM；`\r\n`；逗号分隔；字段含逗号/引号时转义。
- 列：`色号,颜色名,HEX,颗数,占比`。
- 文件：`{工程名}_用量.csv`。
- 与统计共享 `buildUsageRows`。

### 9.5 分享与文件命名

- `navigator.canShare({ files })` 支持时走系统分享；否则创建 `<a download>`。
- 文件名清洗：移除 `\ / : * ? " < > |`；空名用「未命名图纸」。
- 导出成功后 Toast；失败保留面板并提示（配额/内存/浏览器权限）。
- 导出期间禁止再次导出；jsPDF 动态 import，减少初始 bundle。

---

## 10. 存储、自动保存与 PWA

### 10.1 存储策略

| 数据 | 位置 | 说明 |
|---|---|---|
| 工程列表/摘要 | IndexedDB `projects` | meta + 缩略图 + 总颗数/色数，首页快速加载 |
| 网格 cells | IndexedDB `grids` | `Uint16Array`，按 projectId |
| 内置 MARD 色卡 | bundle `src/data/palettes/mard.v1.json` | 不写 DB；版本固定 |
| 导入/自定义色卡快照 | IndexedDB `palettes` | 与内置版本不同才存 |
| 我的色卡/偏好 | IndexedDB `settings` | myPaletteCodes 默认 221 |
| AI 服务配置 | IndexedDB `aiSettings` | provider、Base URL、模型、可选 Key |
| AI 生成历史 | IndexedDB `generations` + `generationImages` | 元数据/缩略图 + 图片 Blob；最近 20 条 |
| 自动保存 | 防抖写 projects + grids | 800ms；visibilitychange/pagehide 尽力 flush |
| 备份 | `.pindou.json` | 手动导出/导入；不含 AI Key/历史 |

- 不使用 localStorage 存工程（容量小、同步阻塞）；生产只用 IndexedDB。
- 原型 localStorage 仅用于设计演示，开发时删除该路径。
- 数据库名 `pindou`；当前 IndexedDB 版本 2。v1→v2 只新增 `aiSettings` / `generations` / `generationImages`，用 `oldVersion` 分支保留既有工程；`blocked/blocking` 事件提示多标签页升级。
- 写入失败（配额/隐私模式）：保留内存中的 dirty 状态，Toast 提示；提供「导出工程文件」作为逃生通道。

### 10.2 自动保存状态机

```
dirty --(800ms debounce)--> saving --(ok)--> saved
  ↑                            └--(error)--> dirty + toast
  └--(new change)--------------┘
```

- 每个工程一个 `dirty` 标记；保存队列串行，避免同一工程并发写。
- 保存内容：meta（名称/尺寸/豆径/板型/paletteRef/updatedAt/totalBeads/colorCount）+ cells。
- 缩略图：320×240 WebP（不支持则 PNG）；首次保存/每 2s 最多一次/离开编辑器时生成，避免每笔都画。
- 页面隐藏：`visibilitychange` 立刻 flush；`pagehide` 尽力 flush（IndexedDB 异步，不能保证完成，所以不能只依赖它）。
- 切换工程/返回首页：先 flush 当前工程。
- 崩溃恢复：打开工程时以 DB 中的最后一次保存为准；未保存的 800ms 内改动可能丢失（可接受，UI 有「已保存」状态）。
- 多标签页：v1 约定单标签编辑；保存时比较 `updatedAt`，若 DB 已被其他标签更新，提示「另一个标签更新了此工程」，让用户选择覆盖/重新加载。不做 CRDT。

### 10.3 缩略图

- 复用 `PatternRenderer` 的简化模式（无网格/无坐标/无图例），填满 320×240，保持比例留白。
- canvas → `toBlob('image/webp', 0.85)`；Safari 不支持时 PNG。
- 生成在 idle 时进行；不阻塞笔画；失败不影响保存。
- 首页卡片直接读 Blob URL；组件卸载时 revoke。

### 10.4 PWA

- `vite-plugin-pwa` + Workbox：
  - 预缓存 app shell、JS/CSS、图标、MARD 数据；无 CDN。
  - `navigateFallback: index.html`；离线可用。
  - `registerType: 'prompt'`；新版本提示「有新版本，保存后更新」；用户确认后再 `skipWaiting`，避免编辑中刷新丢改动。
  - 缓存版本随构建哈希；旧缓存清理。
- Manifest：`拼豆工坊` / `拼豆工坊`，`display: standalone`，`orientation: any`，`theme_color/background_color: #F6F1E7`，192/512 图标 + maskable。
- 安装：Android/Chromium `beforeinstallprompt`；iOS 在设置里显示「添加到主屏幕」说明。
- 安全区：手机底部工具坞/Sheet 使用 `env(safe-area-inset-bottom)`。
- 离线限制：首次加载需网络；之后编辑/图片导入/导出/打印都可离线。AI 生成是唯一需要联网的可选功能，离线时禁用并提示。
- 可选 File Handling API：注册 `.pindou.json` 打开方式（Chromium）；不支持时用文件选择器。
- 无 analytics、无远程日志；错误只在本地 UI 呈现，避免隐私与离线依赖。

### 10.5 备份与存储持久化

- 首次保存时调用 `navigator.storage.persist()`（静默）；设置页显示当前是否已持久化、`estimate()` 用量。
- 界面明确提示：「本地存储可能被系统清理，重要图纸请导出工程文件备份」。
- 工程文件导出/导入是 v1 的必备逃生通道；入口在首页工程菜单/编辑器更多菜单（小 UI 增量，沿用现有菜单样式）。
- 不做自动云备份（用户未要求，且需要后端/账号）。

### 10.6 数据安全与隐私

- 工程、色卡、AI 配置与生成历史在本机；无账号、无本项目服务器。唯一外发是用户主动触发的 AI 生成：提示词和请求直接发往用户配置的第三方服务商；Key 本地保存且不进入工程文件/导出/日志。IndexedDB 不是加密存储，UI 明确提示风险。
- 导入的 `.pindou.json` 视为不可信：
  - 限制文件大小（如 20MB）、尺寸（≤300×300）、色卡数量（≤500）、base64 长度、hex 正则；
  - 不执行文件里的任何脚本/HTML；
  - 名称/颜色名只作为文本渲染（React 文本节点/Canvas fillText）。
- CSP（生产，若启用）：`default-src 'self'; connect-src 'self' https:; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:;`（AI 自定义 Base URL 需要 https；按 Vite 产物调整）。
- Service Worker 只缓存同源资源；不缓存用户工程文件。

---

## 11. 性能预算与测量

| 场景 | 预算 | 验收方式 |
|---|---|---|
| 画布平移/缩放 200×200 | 60fps（每帧 <16.7ms） | Playwright/手动帧率；Chrome Performance |
| 画布 300×300 | ≥30fps，可编辑 | 同上；压测工程 |
| 单笔落格延迟 | <16ms | performance mark；手动体感 |
| 首页加载（20 工程） | <1s | Lighthouse/Playwright |
| 打开 200×200 工程 | <300ms | performance mark |
| 图片 12MP→52×52 | <1.5s | Worker 计时 |
| 图片→200×200 | <3s | Worker 计时 |
| PNG 导出 200×200 | <3s | 手动/导出计时 |
| PDF 52×52 单页 | <2s | 导出计时 |
| PDF 200×200（含图例） | <10s | 导出计时；逐页进度 |
| 自动保存 200×200 | <50ms/次 | IndexedDB 写入计时 |
| 初始 JS（gzip） | <250KB；jsPDF 懒加载 | build 报告 |
| 内存 | 编辑 200×200 <150MB；PDF 页峰值 <300MB | DevTools/iPad 实测 |

**优化手段**

- 视口裁剪 + 1px/格 pattern 缓存；高缩放才画格线/色号。
- 40k 格用 typed arrays；不在渲染循环分配对象。
- 图片/色卡匹配在 Worker；主线程只做 UI 与预览。
- PDF 逐页渲染并释放；jsPDF 动态 import；图例页只在多页时生成。
- 缩略图 idle 生成、限频。
- 首页摘要与 cells 分表存储，避免加载全部网格。
- 只让 React 订阅「统计/工具/面板」等低频状态；不订阅 cells。

**测量计划**

- 开发期：`performance.mark/measure` 包住打开工程、量化、导出、保存；仅在 dev 输出。
- Playwright：记录关键流程耗时；对 200×200 工程跑 smoke；用 CDP/`requestAnimationFrame` 采样帧间隔。
- 真机：iPad Safari（主目标）与一台 Android 平板；检查手势、内存、PWA 安装。
- 不做过度优化；先满足预算，再考虑 OffscreenCanvas 导出、WASM 等。

---

## 12. 测试策略

### 12.1 分层

| 层 | 工具 | 重点 |
|---|---|---|
| 纯逻辑 | Vitest | 色差/量化/限色/抖动、统计、分页、历史、几何、schema、CSV |
| 属性测试 | Vitest + fast-check（可选） | 分页覆盖、旋转/翻转可逆、统计守恒 |
| 组件 | Vitest + Testing Library（少量） | Sheet/Dialog、表单、我的色卡解析 |
| 端到端 | Playwright | 三种视口、触控、导入、导出、持久化、离线 |
| 视觉 | Playwright screenshot + visual-judge（交付时） | 首页/编辑器/导出预览 |
| 无障碍 | axe-core（可选） | 关键页面无严重问题 |
| 性能 | Playwright trace + 手动真机 | 预算表 |

### 12.2 必测核心用例

**色卡/色彩**

- 291 色数据校验：唯一 code、221 common、hex 合法。
- OKLab 最近色：给定颜色返回预期 code（少量 fixture）。
- 我的色卡：默认 221；291 全选；A1→A01 归一化；未知 code 过滤；空集合保护。
- 量化：合成 2×2 图 → 目标 1×1 平均色正确；透明/背景移除；限色 distinct ≤ N；抖动确定性。

**编辑器**

- 画笔/橡皮/填充/形状/吸管；对称四向；笔刷 1/2/3。
- 撤销/重做：diff 与快照；替换画布后撤销恢复尺寸；内存上限。
- 尺寸调整锚点 9 种；旋转/翻转；替换颜色；清空。
- 计数：每次编辑后的颗数/色数 = 全量统计。
- 手势：两指落下回滚笔画；pinch 锚点；pan 限制（用 PointerEvent 模拟）。

**导入**

- 裁剪比例；EXIF 方向；fit/contain；旋转；背景移除；参数变化取消旧 job。
- 替换/新建应用；撤销；颜色数/总颗数。
- Worker 降级路径（无 OffscreenCanvas）。

**导出**

- PNG 尺寸/每格像素/图例；文件名。
- PDF 分页覆盖（随机尺寸/重叠/模式）；页数；1:1 mm；镜像；图例页；中文可读（视觉）。
- CSV BOM、列、行数、百分比、转义。

**存储**

- 保存/读取工程；刷新恢复；我的色卡持久化；缩略图；配额失败提示。
- 工程文件导出→导入（新 id、cells/尺寸/色卡一致）；旧 schema 迁移。
- 重置/删除清理。

**PWA**

- 构建产物离线二次打开；更新提示；manifest/图标。
- 安装流程（Android/iOS 手动）。

### 12.3 端到端设备矩阵

| 视口 | 用途 |
|---|---|
| 1024×768 | 平板横屏主场景 |
| 768×1024 | 平板竖屏（工具栏+状态栏、右侧 Sheet） |
| 390×844 | 手机（工具坞、底部 Sheet、双指平移） |
| 1280×900 | 桌面（辅助） |

- Playwright 使用 `hasTouch: true` 的 context；PointerEvent 模拟；必要时用 CDP 触摸。
- 每个视口至少一条全流程：首页→新建/打开→编辑→统计→导出→刷新恢复。
- 导出下载用 `waitForEvent('download')`；PDF 用 pdf-lib 读取页数；CSV 校验 BOM/行。
- PWA 离线：build + preview，注册 SW 后切换 offline，reload 验证应用壳/色卡/工程可用。

### 12.4 Fixtures

- 合成测试图（纯色块/渐变/透明/带背景）由代码生成，避免版权/大文件。
- 小型工程 fixture（4×4/8×8）用于单元与迁移。
- 200×200 压测工程由脚本生成，不入库。
- PDF 分页属性测试输入组合：W/H 1–300、overlap 0–3、fit/actual/custom。

### 12.5 CI

- `npm run typecheck && npm run lint && npm run test && npm run build`
- E2E 在 Chromium 上跑；iPad Safari 的手势/内存/PWA 安装做人工验收。
- 视觉基线只作为提醒，不阻塞（设计稿已冻结）；导出 PDF/PNG 的视觉抽检在 M5/M6 做。
- 不在 CI 里生成大 PDF 的对比图；用页数/尺寸/CSV 断言 + 人工抽检。

---

## 13. 构建、发布与版本

### 13.1 构建

- `npm run build` → 静态 `dist/`。
- `base: './'` 以外部署到子路径时按需配置；PWA 需 HTTPS（localhost 例外）。
- 资源全部本地：字体系统栈、图标 sprite、MARD 数据；无外链。
- jsPDF 动态 import；`export/pdf` 单独 chunk；初始包不包含导出库。
- Source map 仅开发/内部；生产可关。

### 13.2 发布

- 静态托管：Cloudflare Pages / Netlify / GitHub Pages 任一；无后端。
- 版本号：`appVersion`（semver）+ `paletteVersion`；工程文件带两者。
- Service Worker 更新：构建哈希变化 → 提示；用户确认后刷新；不强制。
- 回滚：重新部署上一版本；旧工程文件仍可打开（schema/色卡快照兼容）。
- 不使用远程配置/功能开关；发版即功能。

### 13.3 部署前检查

- 真机 iPad：安装、离线、手势、内存、PDF 打印。
- Android 平板/手机：安装、分享、文件导入。
- Lighthouse PWA/性能；无 console error；CSP 无阻塞。
- 备份提示可见；存储持久化请求；空状态/错误态。

---

## 14. 开发里程碑与验收

> 开发在架构评审通过后开始。每个里程碑都必须通过设计稿对照 + 测试。

### M1 外壳与工程

**交付**：Vite/React/TS/Tailwind/PWA 脚手架；设计 token/UI 基础组件；首页；新建工程；IndexedDB 仓储；自动保存；工程文件导入/导出（菜单）。

**验收**

- 三种视口首页/新建与设计稿一致；触控目标 ≥44px。
- 新建 52/104 工程；刷新后仍在；缩略图/统计正确。
- 导出工程文件→导入为新工程；cells/尺寸/色卡一致。
- `typecheck/lint/unit/build` 通过。

### M2 编辑器核心

**交付**：EditorEngine、视口、Canvas 渲染、手势、画笔/橡皮/填充/吸管/形状/平移、撤销/重做、色板面板、状态栏、手机坞。

**验收**

- 52×52 绘制/擦除/填充/形状/撤销；200×200 平移缩放流畅。
- 两指缩放不误画；第二指回滚；手机工具坞 7 工具 + 当前色。
- 色板 291/我的 221 正确；对称/笔刷；空画布引导。
- **演示检查点**：暂停确认交互与性能。

### M3 工程与色卡

**交付**：工程 CRUD、缩略图、我的色卡（221/291/自定义/粘贴）、画布尺寸/翻转/旋转/替换颜色/清空、板边界。

**验收**

- 我的色卡默认 221；保存后持久化；291/自定义切换正确。
- 调整尺寸 9 锚点、旋转、替换颜色、清空均可撤销。
- 工程复制/重命名/删除；数据本地保存。

### M4 图片转图纸

**交付**：ImportWizard 5 步、裁剪、Worker 量化、限色/抖动/背景、预览对比、应用替换/新建。

**验收**

- 52×52 转换 <1.5s；200×200 <3s；UI 不卡。
- 透明 PNG/白底图片/背景移除；我的色卡限制生效。
- 替换当前画布后可撤销；新建工程正确。
- Worker 取消/错误/降级路径。

### M5 统计与导出

**交付**：StatsSheet、PNG、A4 PDF（分页/镜像/1:1/重叠/图例）、CSV、分享、进度。

**验收**

- 统计与 cells 一致；CSV 行/颗数/占比正确。
- PDF 页数/覆盖/1:1 尺寸/镜像/中文可打印；52×52 单页、104×104 多页。
- PNG 每格像素/色号/坐标/图例；文件名/下载/分享。
- **功能闭环检查点**：暂停演示。

### M6 打磨与验收

**交付**：PWA 离线/安装/更新；响应式细节；错误/空/加载状态；无障碍；性能；完整测试；真机验收。

**验收**

- 离线二次打开可用；可安装；更新提示不丢数据。
- 三种视口与设计稿一致；无横向溢出/遮挡；44px。
- 预算表达标；单元/端到端通过；无 P0/P1 缺陷。
- 设计稿与架构文档的偏差有记录并已确认。

---

## 15. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| iOS PDF/大图内存 | 导出崩溃 | 默认 200 DPI；逐页渲染/释放；300 作为后续高级项；页数上限提示；真机压测 |
| IndexedDB 被清理 | 数据丢失 | `persist()`；备份提示；工程文件导出；保存失败提示 |
| Safari API 差异（OffscreenCanvas/WebP/Share） | 功能不可用 | 特性检测 + 降级；主线程 ImageData；PNG 缩略图；下载兜底 |
| 双指/笔画冲突 | 误画/丢笔 | 第二指回滚 + 状态机；手写笔模式；真机测试 |
| 200/300 画布性能 | 卡顿 | 视口裁剪/位图缓存/字号 LOD；压测；上限 300 |
| 色卡屏幕值与实物差异 | 用户不满 | 明确声明；数据版本化；支持后续校准/自定义色卡 |
| PDF 文件过大 | 分享/打印困难 | 200 DPI 默认；逐页 PNG；大图提示；必要时 JPEG 兜底（后续） |
| 多标签页覆盖 | 数据丢失 | updatedAt 冲突检测 + 提示；v1 单标签约定 |
| 工程文件格式变化 | 旧文件打不开 | schemaVersion + 迁移；文件内嵌色卡快照 |
| PWA 更新中断编辑 | 丢改动 | 更新提示 + 保存后刷新；不自动 skipWaiting |
| 颜色数据版权/准确性 | 合规/信任 | 公开资料整理；标注参考；不宣称官方；可替换数据 |
| 范围膨胀 | 延期 | 严格按非目标清单；设计/架构变更走评审 |

---

## 16. 设计 → 架构追踪

| 设计稿 | 架构落地 |
|---|---|
| 首页工程卡片/菜单 | `features/home` + `ProjectRepository` 摘要/缩略图 |
| 新建工程 Sheet | `features/home/NewProjectSheet` + presets |
| 编辑器三档布局 | `features/editor` + `data-layout`/容器查询 |
| 画布/标尺/板边界/色号 | `editor/Renderer` + `patterns` |
| 工具栏/手机坞 | `features/editor/ToolRail`、`MobileDock` + `GestureController` |
| 色板 291/我的 221 | `features/palette` + `core/palette` + settings |
| 我的色卡 | `features/palette/MyPaletteSheet` + `core/palette` |
| 图片 5 步 | `features/import` + `workers/quantize` + `core/quantize` |
| 用量统计 | `features/stats` + `core/stats` |
| 导出 PNG/PDF/CSV | `features/export` + `export/*` + `core/pagination` |
| 画布设置/变换 | `features/settings` + `core/geometry` |
| 设计 token/组件 | `ui/tokens.css` + `ui/*`；与 design-spec 第 6/7 节一致 |
| 本地保存 | `storage/*` + `ProjectFile` |

**设计稿之外的最小增量（需在开发时执行，不新增屏幕）**

1. 首页工程菜单增加「导入工程 / 导出工程文件」两项，沿用现有 menu-item 样式。
2. 图片向导的「52×52」标签改为动态目标尺寸：替换时用当前工程尺寸；新建时用所选板型（默认 52×52）。
3. 设置页增加「存储状态 / 备份提示」一小块，沿用现有 settings-section 样式。
4. 长按吸管不做；吸管工具保留（与设计稿的工具一致）。
5. 手机端仍为 7 工具 + 双指平移；平板/桌面保留平移工具。
6. 我的色卡为空时，图片转换阻止并提示先启用颜色；设计原型会回退到全部颜色，产品化采用更安全的阻止策略。

---

## 17. 范围外、待确认与决策记录

### 17.1 范围外（v1）

账号/云同步、多人协作、图层、选区/移动、分板拼接图、逐豆打卡、参考底图、OCR 色卡、库存采购、深色模式、自定义主题、插件市场。

### 17.2 已在架构中确定

- 我的色卡：**全局设置**（v1）；工程文件内嵌色卡快照，未来可做 per-project override。
- PDF：默认 **1:1 实物 + 重叠 1 格 + 图例页 + 200 DPI**；300 DPI 作为后续高级项。
- 手机：**7 工具 + 双指平移**；不单设平移工具。
- 图片目标尺寸：替换时用当前工程尺寸；新建默认 52×52，可选板型。
- 长按吸管：v1 不做，吸管作为独立工具。
- 工程文件：作为本地数据备份的必备能力；增加菜单入口。
- 我的色卡为空：图片转换阻止并提示；不静默回退到全部颜色。

### 17.3 仍待你确认

1. **226 色套装清单**：提供 code 列表后可做成一键预设；当前可通过粘贴建立自定义色卡。
2. **部署目标**：是否有指定的静态托管/域名（架构不依赖具体平台）。
3. **PDF 默认 DPI**：200 是否足够；如果主要用 300 DPI 打印，可把默认调高。
4. **多标签页策略**：v1 采用「检测冲突 + 提示」，不做实时协作；是否接受。
5. **色值校准**：是否需要后续支持按实物色卡修改 HEX（v1 不做编辑，仅数据文件可替换）。

---

## 18. ADR 索引

| ADR | 决策 |
|---|---|
| [ADR-0001](adr/0001-canvas2d-imperative-engine.md) | Canvas 2D + 命令式引擎，React 只做界面 |
| [ADR-0002](adr/0002-local-first-pwa.md) | 纯前端 PWA、本地优先、无后端 |
| [ADR-0003](adr/0003-data-model-and-project-file.md) | Uint16Array 数据模型 + 工程文件内嵌色卡快照 |
| [ADR-0004](adr/0004-raster-pdf-export.md) | A4 PDF 用 Canvas 光栅页 + jsPDF，逐页渲染 |
| [ADR-0005](adr/0005-oklab-quantization.md) | OKLab 匹配 + 两遍限色 + 可选 Floyd–Steinberg |
| [ADR-0006](adr/0006-worker-image-pipeline.md) | 图片解码/采样/匹配放 Worker，typed arrays 传输 |
| [ADR-0007](adr/0007-touch-gesture-state-machine.md) | 第二指回滚 + 手势状态机，手机 7 工具 + 双指平移 |

---

## 19. 架构评审清单

- [ ] 技术栈与依赖版本是否接受。
- [ ] 数据模型（Uint16Array、EMPTY、palette 快照）是否接受。
- [ ] 我的色卡全局设置 + 221 默认是否接受。
- [ ] IndexedDB 分表 + 自动保存 + 工程文件备份是否接受。
- [ ] PDF 默认 1:1 / 重叠 1 / 图例页 / 200 DPI 是否接受。
- [ ] 图片 Worker 管线与目标尺寸规则是否接受。
- [ ] 手机 7 工具 + 双指平移是否接受。
- [ ] 性能预算/测试策略/里程碑是否接受。
- [ ] 第 17.3 节待确认项是否可以按默认推进。

> 评审通过后，从 M1 开始开发；M2 与 M5 设演示检查点。架构变更走 ADR 更新，不直接改实现。

