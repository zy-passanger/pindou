# ADR-0006：图片解码/采样/匹配放 Worker

- 状态：Proposed（架构评审）
- 日期：2026-11-05
- 相关：architecture.md §8、§11

## 背景

图片可能达到 24MP；重采样、逐格调整、色卡匹配、限色、抖动是 CPU 密集操作。放在主线程会卡住触控和渲染，尤其在 iPad 上。

## 决策

- 主线程：文件选择、`createImageBitmap`（EXIF 方向）、裁剪预览、进度/取消 UI。
- Worker：重采样（线性光面积平均）、颜色调整、背景移除、OKLab 匹配、限色、抖动、统计。
- 传输：`ImageBitmap`/`ArrayBuffer` 使用 transferable；结果 `Uint16Array` + counts 转移回主线程。
- 协议：`jobId` + `progress` + `cancel`；同一时间一个 job，参数变化取消旧 job，过期结果丢弃。
- 能力降级：
  - `OffscreenCanvas` 可用：Worker 内绘制 + `getImageData`；
  - 不可用：主线程绘制到隐藏 Canvas，把 `ImageData` 传给 Worker 做 CPU 计算。
- 裁剪/旋转在源矩形上表达；Worker 只处理像素与网格，不访问 DOM。
- Worker 构建用 Vite 原生 `new Worker(new URL(...), { type: 'module' })`。

## 结果

**正面**

- UI 保持响应；量化可显示进度/取消。
- Worker 可独立测试纯函数（在 Node 里测 quantize 核心）。
- transferable 避免大数组复制，内存峰值低。

**负面**

- 需要维护主/Worker 两套解码路径（Safari 能力差异）。
- Worker 协议/取消/竞态需要测试。
- 不能直接使用 DOM/Canvas 字体等；只做像素运算。

## 备选方案

| 方案 | 不选原因 |
|---|---|
| 主线程同步处理 | 大图卡顿/掉帧，移动端体验差 |
| 服务端处理 | 无后端/离线不可用/隐私 |
| WASM | 收益有限，增加构建/兼容复杂度；保留后续 |
| 每个请求新建 Worker | 启动开销；v1 单 Worker + 取消 |

## 说明

- 图片解码本身仍可能占用主线程；先限制源图尺寸/降采样，再 transfer。
- Worker 崩溃/超时：终止并提示重试；不影响已保存工程。
