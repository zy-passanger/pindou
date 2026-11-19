# ADR-0008：可选的浏览器直连 AI 图片生成

- 状态：Accepted
- 日期：2026-11-19
- 相关：architecture.md §6、§8、§14；README「AI 生成」

## 背景

拼豆工坊原本是纯本地 PWA：没有网络代码、没有后端、工程只存 IndexedDB。用户希望增加「用大模型生成拼豆图片」的能力，并要求兼容多种 API、设置与生成记录本地保存。

这不是把应用改成云端产品：AI 是可选能力，核心编辑、色卡、统计和导出必须继续离线可用。项目也没有服务器可以托管 API Key 或代理请求。

## 决策

- 增加两种生成模式：
  - **文生图**：调用图片模型得到图片，再进入现有 `ImportWizard`（裁剪 → 调色 → 预览 → 应用）。
  - **直接出色号网格**：调用文本模型返回严格 JSON（尺寸、palette、rows），本地校验、渲染成 PNG，再进入调色步骤。第一版上限 52×52。
- 第一版兼容三种 API 格式：
  - OpenAI Images：`POST {baseUrl}/images/generations`，`Authorization: Bearer`，解析 `b64_json` / `url`。
  - OpenAI Chat：`POST {baseUrl}/chat/completions`，解析 `message.images`、content parts、Markdown/data URL 图片，以及纯文本 JSON。
  - Google Gemini：`POST {baseUrl}/models/{model}:generateContent`，`x-goog-api-key` header，解析 `inlineData` 图片和文本 JSON。
- 不实现自定义 JSON 模板、Stability、ComfyUI；不引入后端/代理。服务商必须允许浏览器 CORS；失败时给出可操作提示。
- API Key、provider 配置、生成图片、提示词和直接网格都存本机 IndexedDB v2：
  - `aiSettings`：provider 配置与默认项。
  - `generations`：元数据 + 缩略图 + 可选 grid。
  - `generationImages`：完整图片/网格渲染图 Blob。
  - 默认记住 Key；提供「记住密钥」「清除密钥」；Key 不写入工程、`.pindou.json`、历史记录、toast 或日志。
  - 明确说明 IndexedDB 不是加密保险箱；不做「已加密」承诺。
- DB 从 v1 升级到 v2 时只新增 store，使用 `oldVersion` 分支；既有 projects/grids/palettes/settings 原样保留。增加 `blocked/blocking/terminated` 事件提示，避免多标签页升级卡死。
- 网络边界：
  - `fetch(..., { mode:'cors', credentials:'omit' })`；图片 URL 先 fetch 成 Blob，再交给 Canvas，避免 taint。
  - 图片限定 PNG/JPEG/WebP，嗅探 magic bytes，单张 ≤25MB、最长边 ≤8192；拒绝 SVG。
  - 超时（图片 120s、网格 90s）、AbortController、单请求、不自动重试计费请求。
  - 错误文本截断并脱敏 Key/Bearer/query key；Service Worker 不缓存 API 响应。
- 生成结果进入现有向导：图片模式从裁剪步骤开始并自动取景；网格模式从调色步骤开始，关闭自动取景以保持构图。应用成功后把 `projectId` 回填到生成历史。

## 结果

**正面**

- 保持本地优先：没有工程/色卡上传，AI 是显式可选功能。
- 复用现有量化、自动配色、预览、替换/新建和撤销，避免第二套图纸管线。
- 三种格式覆盖官方接口和常见聚合网关；API 层纯函数可单测。
- 历史/配置本地保存，刷新或重启后可复用，避免重复付费。

**负面**

- 浏览器直连受 CORS 限制；部分服务商必须使用支持 CORS 的网关。
- Key 以明文存在于 IndexedDB；本机浏览器配置或同源脚本可读取。
- 直接网格受模型能力影响，可能错行/漏行；需要严格校验和用户主动修正。
- DB v2 升级、多标签页阻塞、配额不足需要额外处理。
- 提示词会发送给第三方，README/UI 必须明确披露。

## 备选方案

| 方案 | 不选原因 |
|---|---|
| 后端代理并托管 Key | 需要服务器/账号/成本，违背本地优先；本次未选 |
| 只用 OpenAI Images | 无法覆盖 Gemini/OpenRouter 等用户常用服务 |
| 让 LLM 直接生成 104×104 网格 | token 多、错行率高；第一版限制 52×52 |
| 自动重试计费请求 | 可能产生意外费用 |
| 把 Key 放进 `VITE_*` 环境变量 | 会进入构建产物，任何访问者可见 |

## 说明

- 真实 API 调用不在自动化测试中执行；使用 `scripts/mock-imagegen-server.mjs` 验证三种格式和完整流程。
- 生成历史最多保留 20 条，图片最长边压到 1024px；配额不足时淘汰旧记录并提示，不阻断当前预览。
- 直接网格的修复请求由用户点击「让模型修正」触发，属于第二次计费调用。
