# ADR-0003：Uint16Array 数据模型与工程文件内嵌色卡快照

- 状态：Proposed（架构评审）
- 日期：2026-11-05
- 相关：architecture.md §5、§10

## 背景

图纸是规则网格，单格只需一个色卡索引。需要高效的渲染、统计、撤销和本地保存，同时保证工程文件换设备/换版本后仍能按原色打开。MARD 291 色数据可能随校准/版本更新。

## 决策

- 运行时 cells：`Uint16Array(width * height)`；`0xFFFF` 表示空格；其他值为 `project.palette.colors` 的下标。
- 色卡：`PaletteSnapshot { id, version, colors[] }`；工程通过 `paletteRef` 引用；内置 MARD 从 bundle 解析，自定义/导入快照存 `palettes` store。
- 工程文件 `.pindou.json`：
  - `cellsEncoding: "u16le-base64"`；cells 小端序 base64；
  - 内嵌**完整色卡快照**（291 条约 15–20KB）；
  - `format` + `schemaVersion` + `appVersion`。
- IndexedDB 存储：`projects`（meta+缩略图+统计）、`grids`（cells）、`palettes`（非内置快照）、`settings`；保存一个事务写 projects+grids。
- 导入工程生成新 id；校验尺寸、cells 长度、色卡；色卡版本不同时使用文件快照。
- 迁移：DB upgrade + 工程 schemaVersion 迁移注册表；色卡按 code/快照解析。

## 结果

**正面**

- 内存/渲染/统计高效；200×200 仅 80KB。
- 撤销只存 diff；保存/加载快。
- 工程文件自包含，不依赖某个线上色卡版本。
- 色卡未来可校准/扩展，旧工程仍可正确显示。

**负面**

- 工程文件约 100–150KB（cells+palette），比纯 PNG 大；可接受。
- 色卡索引与顺序绑定；任何色卡变更必须生成新 version，不能原地改顺序。
- 导入需要严格校验，避免损坏数据/内存攻击。

## 备选方案

| 方案 | 不选原因 |
|---|---|
| 二维数组 JSON | 90k 数字，文件大、解析/渲染慢 |
| 每格存 color code 字符串 | 体积巨大，统计/渲染需反复查找 |
| 只存 PNG | 丢失语义、无法统计/编辑/迁移 |
| 工程文件只存 paletteRef | 换版本/换设备可能色号缺失或错位 |
| gzip 压缩文件 | v1 体积可接受；后续可加 CompressionStream |

## 说明

- 色卡数据不可变；校准/扩充 = 新 version + 快照。
- 工程文件是备份/迁移格式，不是内部存储格式；内部用 typed array + IDB。
