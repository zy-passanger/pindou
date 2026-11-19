# ADR-0001：Canvas 2D + 命令式 EditorEngine

- 状态：Proposed（架构评审）
- 日期：2026-11-05
- 相关：architecture.md §4、§7

## 背景

编辑器需要在平板/手机上绘制 52×52 到 300×300（最多 90,000 格）的图纸，支持逐格落豆、网格/标尺/板边界/色号、平移缩放、形状预览和撤销。React 不适合对每格状态做 setState；DOM/SVG 在 40k 节点时滚动/缩放会明显卡顿。

## 决策

- 画布使用 **Canvas 2D**，由命令式 `EditorEngine` 管理。
- 文档数据使用 `Uint16Array`；引擎直接读写 typed array，不在 React state 里存 cells。
- React 只渲染编辑器外壳（顶栏、工具栏、色板、Sheet、状态栏），通过订阅「统计/撤销状态/工具」更新。
- 渲染使用视口裁剪、低缩放的 1px/格 位图缓存、高缩放逐格绘制、网格/色号 LOD。
- 导出 PNG/PDF 使用独立的 `PatternRenderer`，不与编辑器视口耦合。

## 结果

**正面**

- 40k 格可稳定达到 60fps；300×300 可用。
- 工具/撤销/渲染逻辑可独立于 React 单测。
- 不受 DOM/SVG 节点数量限制。
- 导出与编辑器共用绘制原语，风格一致。

**负面**

- 需要自研视口、手势、渲染与无障碍文本替代。
- Canvas 内容对屏幕阅读器不可见；必须提供统计列表/aria-label/文本说明。
- 需要处理 DPR、CSS 缩放、Safari Canvas 差异。

## 备选方案

| 方案 | 不选原因 |
|---|---|
| DOM/SVG 网格 | 40k 节点缩放/重绘卡顿，移动端内存高 |
| Konva/Fabric | 额外抽象与包体，定制渲染/手势受制 |
| WebGL/Pixi | 复杂度高，2D 格点不需要；Safari 兼容/调试成本高 |
| 每次落格 setState | React 重渲染不可行 |

## 说明

- 无障碍替代：Canvas 有 `role="application"`/操作说明；统计面板以文本列出各色用量；关键操作有键盘快捷键。
- 后续如 300×300 仍不足，评估 OffscreenCanvas 缓存或 WebGL，但保持 EditorEngine 接口不变。
