# T1doo — 电脑 AI 统一调度中心 · 开发计划

> **文档状态**：v1.6（2026-07-07：**Q8 裁决通过 + hooks 退役**——全局切换（写 `~/.claude/settings.json` env 键）转正为 CLI 通道主切换机制（§7.7.5）；hooks 状态感知整体退役，替代为 JSONL 事件驱动状态机 + OTEL 评估（§7.9，新增 M9）；v1.1 周期 M7-M9 共 5 周。此前同日 v1.5：v1.1 规划立项（F8 模型中心 §7.7 / F9 用量中心 §7.8，参照 cc-switch v3.16.5 源码调研）；v1.4：M6 打磨发布代码交付；v1.3：F4 彻底废弃；v1.2：F4 裁撤出 v1、工期 14→12 周；v1.1：CLI 关键行为 / JSONL 格式 / hooks / 后端环境变量逐项实测验证，详见 §14.2 与附录 A.6）
> **创建日期**：2026-07-03 · **升级 v1.0**：2026-07-03 · **升级 v1.1**：2026-07-04
> **目标平台**：Windows 10 1809+ / Windows 11（开发机：Windows 11 Home，已验证）
> **本文档用法**：这是一份"活文档"。每个里程碑完成后回来勾选验收项、修订偏差；技术决策变更时在 §14 决策日志中追加记录，不要直接删除历史结论。

---

## 目录

1. [项目愿景与定位](#1-项目愿景与定位)
2. [目标用户与核心场景](#2-目标用户与核心场景)
3. [功能地图与优先级](#3-功能地图与优先级)
4. [技术选型](#4-技术选型)
5. [系统架构](#5-系统架构)
6. [数据设计](#6-数据设计)
7. [核心功能技术方案](#7-核心功能技术方案)
8. [UI/UX 设计](#8-uiux-设计)
9. [里程碑与迭代计划](#9-里程碑与迭代计划)
10. [工程规范与质量保障](#10-工程规范与质量保障)
11. [安全与隐私](#11-安全与隐私)
12. [风险登记表](#12-风险登记表)
13. [打包与发布](#13-打包与发布)
14. [开放问题与决策日志](#14-开放问题与决策日志)
15. [附录 A：Claude Code 集成参考（本机实测）](#附录-aclaude-code-集成参考本机实测)
16. [附录 B：常用命令速查](#附录-b常用命令速查)

---

## 1. 项目愿景与定位

### 1.1 一句话定位

**T1doo 是 Windows 桌面上的"AI 工作调度中心"：把散落在各个终端窗口里的 Claude Code 会话、本机文件、应用与 AI 对话能力聚合到一个统一的指挥台。**

### 1.2 要解决的真实问题

| # | 现状痛点 | T1doo 的解法 |
|---|---------|-------------|
| P1 | Claude Code 的历史对话以 JSONL 埋在 `~/.claude/projects/` 里，跨项目回看、全文搜索、导出分享都很困难 | 会话中心：自动索引全部历史会话，全文搜索、可视化回放、一键恢复/导出 |
| P2 | 多个项目同时跑 Claude Code 要开一堆终端窗口，哪个在干活、哪个在等确认、哪个卡住了完全靠肉眼轮询 | 内置多终端管理器 + 实时状态感知（工作中 / 等待输入 / 空闲），聚合到一个 Dashboard |
| P3 | 打开文件、启动应用、访问网页、问 AI 一句话——每件事都要切换不同入口 | 全局热键唤起的统一启动器（Launcher），一个输入框分发所有意图 |
| P4 | 常用文件散落各处，"上周 Claude 改过的那个文件在哪"无从查起 | ~~文件中枢~~ **2026-07-05 彻底废弃（不再实现，§7.4 / §14.2）**：通用文件搜索交给 Everything 本体；"最近被会话修改的文件"由 Dashboard 消费 `session_files` 联动数据（仍随 M1 采集） |
| P5 | 想快速问 AI 一个问题还要打开浏览器或新开终端 | 内置 AI 对话面板，复用 Claude Code 登录态或 API Key，即开即问 |

### 1.3 核心价值主张

- **不替代，而是编排**：T1doo 不 fork、不魔改 Claude Code，它是站在 Claude Code 之上的**编排与观测层**。Claude Code 升级，T1doo 跟着受益。
- **本地优先**：所有数据（索引、会话缓存、配置）留在本机 SQLite/文件中，无云端依赖、默认零遥测。
- **键盘优先**：全局热键 + 命令面板贯穿所有功能，鼠标是可选项。

### 1.4 非目标（v1.0 明确不做）

> 划定边界是"可行严谨"的前提。以下内容 v1.0 **不做**，避免范围失控：

- ❌ 不做 macOS / Linux 版本（技术栈保留可能性，但不投入适配与测试）
- ❌ 不自研"全盘 Everything 级"文件索引引擎（~~用"目录订阅 + Everything 集成"替代~~，见 §7.4）
- ❌ **不做文件中枢（F4 整体彻底废弃，2026-07-04 裁撤出 v1 → 2026-07-05 从 backlog 移除、不再实现）**：自建重索引与轻量常驻工具的定位冲突（M4 验收压测中开发机整机卡顿、风扇满载实证），通用文件搜索彻底交给 Everything 本体；「会话-文件联动」数据（`session_files`）继续随 M1 零成本采集，服务 Dashboard 与会话中心（§7.4 / §14.2）
- ❌ 不与 Raycast / PowerToys Run / Everything / Listary 拼"通用启动器 / 文件管理器"——**F3 启动器定位为"Claude Code 工作流的入口"**：秒跳项目/会话/终端/提示词为核心；通用应用启动只做"够用"层（见 §7.3）
- ❌ 不做云同步、多设备、账号体系
- ❌ 不做插件市场（内部预留扩展点即可）
- ❌ 不做通用 Agent 框架 / 多智能体编排平台（M5 只做"任务派发给无头 Claude Code"的最小闭环）
- ❌ 不修改、不删除 `~/.claude` 下的任何既有数据——对 Claude Code 数据目录**永远只读**（唯一例外 v1.0：经用户显式授权后向 `settings.json` 注册 hooks，见 §7.2.4——**已随 v1.1 hooks 退役取消**；**v1.1 起唯一例外：模型中心全局切换写 `settings.json` 的 env 键**，首次授权 + 备份 + 深合并 + 管理键记账 + 一键还原，见 §7.7.5 / Q8 裁决）

---

## 2. 目标用户与核心场景

### 2.1 用户画像

**首要用户就是开发者本人**（重度 Claude Code 用户，Windows 主力机，多项目并行）。次要用户：与你相似的"AI 驱动型" Windows 个人用户/独立开发者。v1.0 按单用户单机打磨，不为分发做妥协。

### 2.2 核心用户故事（验收时逐条走查）

| ID | 用户故事 | 归属功能 |
|----|---------|---------|
| U1 | 作为用户，我能在一个列表里看到**所有项目的所有历史会话**（标题、项目、时间、消息数、token 用量），并按关键词全文搜索到某次对话里的一句话 | F1 |
| U2 | 我能点开任意历史会话，像聊天记录一样阅读（区分用户/助手/工具调用），并一键"在终端中恢复此会话"继续聊 | F1+F2 |
| U3 | 我能在 T1doo 内同时开多个 Claude Code 终端（不同项目、不同模型/权限配置），像浏览器标签页一样切换 | F2 |
| U4 | 任何一个会话进入"等待我确认/输入"状态时，我能（hooks 开启时 3 秒内）通过角标和系统通知知道，不用逐个窗口翻 | F2+F6 |
| U5 | 我在任何应用里按下 `Alt+Space`，输入几个字母就能启动应用、打开最近文件、打开网址、或直接问 AI 一个问题 | F3 |
| U6 | ~~我能订阅几个常用目录（项目区、下载区、文档区），按文件名秒搜，并看到"最近打开/最近被会话修改"的文件流~~（2026-07-04 裁撤 → 2026-07-05 彻底废弃，不再实现） | ~~F4~~ |
| U7 | 我能在侧边栏随时发起一段 AI 对话（走我的 Claude 订阅或 API Key），对话记录保存在本地可搜索 | F5 |
| U8 | 我能把一个写好的任务描述丢进队列，T1doo 派发给无头 Claude Code 在后台执行，完成后通知我并展示结果 | F5 |
| U9 | 我打开 T1doo 首页，一眼看到：活跃会话及状态、今日 token 消耗、最近文件、待办任务 | F6 |
| U10 | 我能维护多套"后端档案"（Max 订阅 / 我的第三方模型 API / 网关），新建终端或派发任务时选一套，同一个 `claude` 就指向对应后端 | F2+F5 |

---

## 3. 功能地图与优先级

采用 MoSCoW 分级。**每个里程碑交付后应用都处于"日常可用"状态**，而不是攒到最后一次性集成。

| 模块 | 功能 | 优先级 | 里程碑 |
|------|------|--------|--------|
| **F1 会话中心** | 全项目会话发现/索引/增量同步 | Must | M1 |
| | 全文搜索（FTS5）、按项目/时间/模型筛选 | Must | M1 |
| | 会话详情回放（Markdown 渲染、工具调用折叠、分支树） | Must | M1 |
| | 恢复会话（外部 Windows Terminal → 内置终端） | Must | M1→M2 |
| | 导出（Markdown / JSON）、收藏、备注 | Should | M1 |
| | Token 用量与成本统计（按会话/项目/日聚合） | Should | M1/M6 |
| **F2 终端管理** | 内置多终端（标签页 + 左右分屏） | Must | M2 |
| | 会话档案（预设目录/模型/权限模式启动） | Must | M2 |
| | **后端档案：订阅态 + 自定义后端（baseURL/token/模型）注入切换** | Must | M2 |
| | 终端 ↔ 历史会话双向关联跳转 | Must | M2 |
| | 实时状态感知（hooks）+ 系统通知；**v1.1/M9：hooks 退役 → JSONL 事件驱动状态机（§7.9）** | Must | M2 → M9 重构 |
| | 普通 shell 终端（非 Claude）支持 | Could | M2 |
| **F3 启动器（CC 工作流入口）** | 全局热键 + 命令面板窗口 | Must | M3 |
| | **秒跳:项目 / 会话 / 运行中终端 / 最近提示词** | Must | M3 |
| | 应用启动（.lnk+UWP,"够用"层不追平 Raycast）、文件/URL 打开 | Must | M3 |
| | 快捷 AI 提问（结果落入 F5 对话） | Should | M3/M5 |
| | frecency 排序、自定义关键词别名 | Should | M3 |
| **F4 文件中枢** 🛑 已彻底废弃 | 全部子项（联动 UI / 目录订阅索引 / 文件秒搜 / Everything 集成）不再实现（2026-07-04 裁撤出 v1 → 2026-07-05 从 backlog 移除，§14.2）；`session_files` 联动数据仍随 M1 采集，服务 F6 Dashboard 与 F1 | Won't | — |
| **F5 AI 能力** | 内置对话面板（流式、Markdown、代码高亮） | Must | M5 |
| | 双引擎：`claude` CLI 无头模式（复用登录态/后端档案）/ Anthropic API 直连（v1 仅 Claude） | Must | M5 |
| | 本地对话历史存储与搜索 | Must | M5 |
| | 后台任务队列（派发无头 Claude Code + 结果查看） | Should | M5 |
| | 多供应商适配（OpenAI 兼容端点等） | Could | v1.2+（v1.1=M7/M8 不含，见 §7.7.6） |
| **F6 指挥台** | Dashboard 首页（活跃会话/用量/最近文件/任务） | Must | M2 起逐步充实 |
| | 系统托盘、开机自启（可选）、单实例 | Must | M0 |
| **F7 设置 / 首启** | 首启引导；设置页（hooks 开关、后端档案、~~订阅目录~~、热键、API Key、主题、语言）；**2026-07-07 v1.1 规划：后端档案与 API 模型配置迁出至 F8 模型中心，设置页留跳转入口** | Must | M0 起逐步充实 |
| **F8 模型中心（v1.1）** | 独立「模型」一级板块（迁出设置页）：供应商档案卡片墙 + 一键切换（作用于所有 `claude` 通道） | Must | M7 |
| | 供应商预设模板（官方/国内直连/聚合网关，含领 Key 引导链接）+ 连通性测试 + 模型列表在线拉取 | Must | M7 |
| | API 直连通道升级：模型自由输入（第三方网关模型名）+ 网关模型下拉 | Must | M7 |
| | **全局切换=主切换语义**（写 `~/.claude/settings.json` env 键：首次授权/备份/深合并/冲突提示/一键还原） | Must（Q8 ✅ 2026-07-07） | M7 |
| | 托盘菜单快速切换供应商；API 档案化（多套 API 配置） | Could | M7 |
| **F9 用量中心（v1.1）** | 独立「用量」一级板块：自定义时间范围（今天/7 天/30 天/本月/今年/任意日期区间） | Must | M8 |
| | 用量采集管道 v2：覆盖 subagents/wf_*、按 message.id 去重、cache 读/写四维 token | Must | M8 |
| | 趋势图 + 分模型/分项目分布 + 缓存命中率（Recharts） | Must | M8 |
| | 本地价目表（可编辑）+ 名义成本估算开关（§7.6 口径不变） | Should | M8 |
| | 日聚合 rollup 控库体积 | Could | v1.2+ |

---

## 4. 技术选型

### 4.1 应用框架决策

三个候选按本项目**实际技术难点**逐项对比（难点 = 终端托管、Claude Code 数据处理、AI SDK、系统集成）：

| 评估维度 | Electron | Tauri 2 (Rust) | WPF / WinUI 3 (C#) |
|----------|:--:|:--:|:--:|
| 内嵌终端（ConPTY 托管） | ★★★ `node-pty` + `xterm.js`，VS Code / Tabby 同款验证 | ★★ `portable-pty` 可行但桥接代码多 | ★ 无成熟嵌入方案，基本要自研 |
| JSONL 解析 / 文件监听 | ★★★ Node 原生 + `chokidar` | ★★ Rust 生态可用，开发速度慢 | ★★ FileSystemWatcher 可用 |
| SQLite + FTS5 | ★★★ `better-sqlite3`（同步 API，极快） | ★★★ `rusqlite` | ★★ |
| Anthropic SDK / Claude Agent SDK | ★★★ 官方 TS SDK 一等公民 | ★ 需子进程或 HTTP 桥 | ★★ 官方 C# SDK 有，Agent SDK 无 |
| 全局热键 / 托盘 / 通知 | ★★★ 内置 API | ★★★ 官方插件 | ★★★ |
| 包体积 / 内存占用 | ★（~100MB 包 / 200-400MB 内存） | ★★★ | ★★★ |
| 同类产品先例 | VS Code、Tabby、Hyper、Raycast(部分) | 少 | 少 |
| 你的迭代速度（TS 单语言全栈） | ★★★ | ★（需同时写 Rust+TS） | ★★ |

**决策：Electron + TypeScript。**

理由：本项目 80% 的技术风险集中在"终端托管 + Claude Code 生态集成"，这两块在 Node/TS 生态有工业级现成方案；内存代价对一个常驻工具应用可接受（并有 §10.3 预算约束）。Tauri 的优势（体积/内存）不足以抵消双语言开发成本与终端生态的缺口。**架构上通过 §5 的服务分层保持业务逻辑与 Electron API 隔离**，为将来可能的 Tauri 迁移保留退路。

### 4.2 技术栈清单

| 层 | 选择 | 版本策略 | 说明 |
|----|------|---------|------|
| 运行时 | Electron | 最新稳定版（36+） | Node 24 本机已装，仅作开发工具链 |
| 语言 | TypeScript（strict） | 5.x | 主进程/渲染/共享类型统一 |
| 构建 | electron-vite | 最新 | main/preload/renderer 三端一体构建，HMR |
| 前端框架 | React 18 | — | 生态最广；组件方案见下 |
| UI 组件 | Tailwind CSS 4 + shadcn/ui 风格自建组件 | — | 桌面暗色优先；避免重型组件库 |
| 状态管理 | zustand（UI 态）+ TanStack Query（IPC 数据） | — | 轻量、可测试 |
| 终端 | `@xterm/xterm` + `addon-webgl` + `addon-fit` + `addon-search` | — | WebGL 渲染保证多终端流畅 |
| PTY | `node-pty` | 锁定与 Electron ABI 匹配版本 | Windows 走 ConPTY |
| 数据库 | `better-sqlite3`（WAL 模式）+ FTS5 | 锁版本 | 单文件 `%APPDATA%/T1doo/t1doo.db` |
| 文件监听 | `chokidar` v4 | — | 监听 `~/.claude/projects` 与订阅目录 |
| 校验 | `zod` | — | JSONL 行与 IPC payload 宽松校验（§6.3） |
| AI SDK | `@anthropic-ai/sdk`（直连）；`claude` CLI 子进程（复用登录态） | — | 见 §7.5 双引擎设计 |
| 包管理 | pnpm | 本机 11.x 已装 | |
| 打包 | electron-builder（NSIS + portable）+ electron-updater | — | 见 §13 |
| 测试 | Vitest（单元）+ Playwright for Electron（冒烟 E2E） | — | 见 §10.2 |
| 规范 | ESLint + Prettier + conventional commits | — | |

---

## 5. 系统架构

### 5.1 进程与模块拓扑

```
┌─────────────────────────── Electron Main（Node.js，唯一特权进程） ───────────────────────────┐
│                                                                                              │
│  AppCore：单实例锁 / WindowManager（主窗+启动器窗）/ Tray / GlobalShortcut / 自启动           │
│                                                                                              │
│  ┌────────────────────┐  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐   │
│  │ ClaudeDataService  │  │ TerminalService │  │ IndexerService   │  │ AiService          │   │
│  │ · 项目/会话发现     │  │ · node-pty 池   │  │ · 订阅目录扫描    │  │ · engine: cli      │   │
│  │ · JSONL 容错解析    │  │ · 生命周期管理  │  │ · chokidar 增量   │  │   (claude -p)      │   │
│  │ · 增量同步→SQLite  │  │ · 会话绑定      │  │ · Everything 桥   │  │ · engine: api      │   │
│  │ · HookServer       │  │ · 缓冲区回放    │  │ （Worker 线程内）  │  │   (@anthropic/sdk) │   │
│  │  (127.0.0.1+token) │  └─────────────────┘  └──────────────────┘  │ · TaskQueue        │   │
│  └────────────────────┘                                             └────────────────────┘   │
│  ┌────────────────────┐  ┌──────────────────────────────────────────────────────────────┐   │
│  │ LauncherService    │  │ Storage：better-sqlite3（WAL）+ FTS5 + migrations             │   │
│  │ · .lnk/UWP 扫描    │  │ Settings：electron-store（JSON）· Secrets：safeStorage(DPAPI) │   │
│  │ · frecency 排序    │  └──────────────────────────────────────────────────────────────┘   │
│  └────────────────────┘                                                                      │
└───────────────────────────────┬──────────────────────────────────────────────────────────────┘
                                │ typed IPC（contextBridge + invoke/事件流，契约见 §5.2）
        ┌───────────────────────┴────────────────────────┐
        │                                                │
┌───────▼──────────── 主窗口 Renderer（React） ──────┐  ┌─▼──────────────────────────┐
│ Dashboard │ 会话中心 │ 终端 │ 文件 │ 对话 │ 设置    │  │ 启动器窗口（frameless、    │
│ （xterm.js 实例只活在终端页，懒加载）               │  │  置顶、失焦即隐、<100ms）   │
└────────────────────────────────────────────────────┘  └────────────────────────────┘
```

> ⚠️ 图中 **IndexerService**（订阅目录扫描 / chokidar 增量 / Everything 桥）已随 F4 彻底废弃（2026-07-04 裁撤 → 2026-07-05 不再实现，§14.2）；会话-文件联动数据由 ClaudeDataService 解析 JSONL 时顺带采集，与文件系统扫描无关。

架构原则：

1. **所有系统能力只在主进程**。渲染进程 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，只能通过 preload 暴露的白名单 API 通信。
2. **服务与框架解耦**：`src/main/services/*` 不 import Electron API（窗口/托盘等由 AppCore 注入回调），保证服务可被 Vitest 直接单测。
3. **重活出主线程，写库归主线程**：文件索引、JSONL 大文件解析放 `worker_threads`；但 `better-sqlite3` 是同步单连接，**worker 只解析并批量回传结果，由主线程独占写库**，杜绝双写者 `SQLITE_BUSY`（IPC 回传成瓶颈再评估 worker 独立 WAL 连接）。
4. **单向数据流**：Renderer 永不直接读磁盘/数据库；查询走 `invoke`，实时更新走主进程推送的事件流。

### 5.2 IPC 契约（`src/shared/ipc.ts` 单一事实源）

```ts
// 请求-响应（ipcRenderer.invoke）——按域命名
'sessions:list'        (filter: SessionFilter) => SessionSummary[]
'sessions:get'         (id: string) => SessionDetail          // 惰性解析全文
'sessions:search'      (q: string, scope?) => SearchHit[]
'sessions:export'      (id: string, fmt: 'md'|'json') => string  // 返回落盘路径
'terminals:create'     (profile: TerminalProfile) => TerminalId
'terminals:write'      (id, data: string) => void
'terminals:resize'     (id, cols, rows) => void
'terminals:dispose'    (id) => void
'launcher:query'       (q: string) => LauncherItem[]
'launcher:execute'     (item: LauncherItem) => void
'ai:chat:send'         (convId, msg, engine) => void          // 结果走事件流
'sessions:files'       (path: string) => SessionRef[]        // 联动反查（F4 已废弃；数据在采，供 §7.6 最近文件）
'tasks:enqueue'        (spec: TaskSpec) => TaskId
'backend:profiles'     (op: 'list'|'save'|'remove'|'test', p?) => BackendProfile[] | TestResult
'settings:get/set'     ...

// 主进程 → 渲染进程事件（on）
'evt:sessions:updated'    (delta)          // 增量同步完成
'evt:session:status'      (sessionId, status: 'working'|'waiting'|'idle'|'ended')
'evt:terminal:data'       (id, chunk)
'evt:ai:delta'            (convId, textDelta | toolEvent)
'evt:task:update'         (taskId, state)
'evt:index:progress'      (percent)
```

所有 payload 类型集中在 `src/shared/types.ts`，主/渲染两端共享编译，杜绝字符串通道漂移。

### 5.3 目录结构

```
T1doo/
├── Plan.md                     # 本文档
├── package.json / pnpm-lock.yaml
├── electron.vite.config.ts
├── electron-builder.yml
├── src/
│   ├── main/
│   │   ├── index.ts            # 入口：单实例、生命周期
│   │   ├── core/               # WindowManager / Tray / Shortcut / AutoLaunch
│   │   ├── services/
│   │   │   ├── claude/         # discovery.ts / parser.ts / sync.ts / hooks-server.ts / resume.ts
│   │   │   ├── terminal/       # pty-manager.ts / profiles.ts / session-binding.ts
│   │   │   ├── launcher/       # apps-scan.ts / frecency.ts / actions.ts
│   │   │   └── ai/             # engine-cli.ts / engine-api.ts / conversations.ts / task-queue.ts
│   │   ├── db/                 # schema.sql / migrations/ / dao/
│   │   └── ipc/                # 按域注册 handler，绑定服务
│   ├── preload/index.ts        # contextBridge 白名单
│   ├── renderer/src/
│   │   ├── app/                # 路由、布局、主题
│   │   ├── pages/              # dashboard/ sessions/ terminals/ chat/ tasks/ settings/
│   │   ├── components/
│   │   └── stores/             # zustand + query hooks
│   └── shared/                 # ipc.ts / types.ts / constants.ts
├── resources/                  # 图标、NSIS 资源
├── tests/
│   ├── fixtures/claude-jsonl/  # 真实脱敏 JSONL 样本（回归护栏，见 §10.2）
│   └── e2e/
└── .github/workflows/ci.yml
```

---

## 6. 数据设计

### 6.1 数据源：`~/.claude`（本机 2.1.196 实测）

| 路径 | 内容 | T1doo 用法 |
|------|------|-----------|
| `projects/<slug>/<sessionId>.jsonl` | **主会话全文记录**（追加写、一行一事件） | F1 核心数据源，只读 + 增量解析 |
| `projects/<slug>/<sessionId>/subagents/agent-*.jsonl`、`.../wf_*/**.jsonl` | **子代理 / workflow 转录**（2026-07-04 实测：占本机总数据量 ~43%） | v1 不入索引，详情页展开侧链时按需解析（见 §6.3 第 0 条） |
| `history.jsonl` | 全局输入历史 `{display, project, sessionId, timestamp}` | 启动器"最近提示词"、会话补充索引 |
| `settings.json` / `settings.local.json` | 全局设置与 hooks | 只在用户授权后写入 hooks（§7.2.4） |
| `todos/`、`tasks/`、`plans/`、`file-history/`、`shell-snapshots/` | 会话伴生数据 | v1 只读展示 |
| `.credentials.json` | **登录凭据** | **绝不读取、绝不展示、绝不遥测** |

**slug 规则（实测）**：项目绝对路径中 `:` `\` `.` 空格等字符替换为 `-`，如 `E:\T1doo` → `E--T1doo`、`C:\Users\Li Junhui\...` → `C--Users-Li-Junhui-...`（含空格路径已实测确认）。注意 slug 有歧义可能（不同路径映射同名），因此**以 JSONL 行内的 `cwd` 字段为项目路径的权威来源**，slug 仅用于目录定位。

**JSONL 行类型（2026-07-04 全量扫描本机 270 个主会话 / 29,667 行实测）**：`assistant`(12225)、`user`(6613)、`ai-title`(2445)、`last-prompt`(2217)、`attachment`(2021)、`queue-operation`(2019)、`system`(751)、`file-history-snapshot`(681)、`mode`(439)、`permission-mode`(190)、`agent-name`(51)、`custom-title`(11)、`bridge-session`(3)；另有 1 行无法 JSON 解析（印证容错设计的必要性）。⚠️ **未观测到早期资料中的 `summary` 类型**——标题提取优先级改为 `custom-title`（用户命名）> `ai-title`（AI 生成，取最新一条）> 首条 user 消息截断。解析器必须**按类型白名单处理、未知类型静默跳过**（格式是 Claude Code 内部实现，无兼容性承诺——本项目第一大风险，见 §12-R1）。关键字段见附录 A。

**本机数据规模基线（2026-07-04 实测）**：28 个项目目录；主会话 JSONL 270 个 / 291 MB；嵌套子代理与 workflow 转录 1,495 个 / 222 MB（合计约 513 MB）——M1 性能目标以此为真实基准。

### 6.2 SQLite Schema（v1 草案）

```sql
-- 会话与消息（来自 JSONL 同步）
CREATE TABLE projects (
  id INTEGER PRIMARY KEY, path TEXT UNIQUE, slug TEXT, last_active_at INTEGER
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,              -- sessionId (uuid)
  project_id INTEGER REFERENCES projects(id),
  title TEXT,                       -- custom-title > ai-title > 首条用户消息截断（2.1.196 实测已无 summary 行）
  created_at INTEGER, updated_at INTEGER,
  message_count INTEGER, model_last TEXT, git_branch TEXT,
  input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER,
  jsonl_path TEXT, jsonl_size INTEGER, jsonl_offset INTEGER,  -- 增量同步游标
  pinned INTEGER DEFAULT 0, note TEXT,
  cc_version TEXT                   -- 记录写入该会话的 Claude Code 版本，便于格式漂移排查
);
CREATE TABLE messages (
  uuid TEXT PRIMARY KEY, session_id TEXT REFERENCES sessions(id),
  parent_uuid TEXT, role TEXT, type TEXT, ts INTEGER,
  content_text TEXT,                -- 提取后的纯文本（供 FTS）
  model TEXT, input_tokens INTEGER, output_tokens INTEGER,
  is_sidechain INTEGER DEFAULT 0
);
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content_text, content='messages', content_rowid='rowid',
  tokenize='unicode61'              -- ⚠️ M1 实测修正：unicode61 把连续 CJK 当单一 token（并非按字切分）。已落地方案：入索引前 CJK 一元切分（插空格），查询侧同样切分并整体短语化，snippet 输出拼回（见 §14.2 2026-07-04 R9 裁决）
);
-- ⚠️ external content（content='messages'）不会自动同步：同步逻辑须手动 INSERT INTO messages_fts(rowid, content_text)，或建 AFTER INSERT/UPDATE/DELETE 触发器

-- 会话-文件联动（随 F1 解析 JSONL 中的 tool_use 顺带采集，M1 起；供 Dashboard 最近文件与会话反查）
CREATE TABLE session_files (
  id INTEGER PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  path TEXT, op TEXT,               -- edit | write | read
  message_uuid TEXT, ts INTEGER
);
CREATE INDEX idx_session_files_path ON session_files(path);
CREATE INDEX idx_session_files_session ON session_files(session_id);

-- （原 F4 文件索引表 watched_dirs/files/files_fts 已随 F4 彻底废弃删除，2026-07-05，§14.2）

-- 启动器（F3）
CREATE TABLE apps (
  id INTEGER PRIMARY KEY, name TEXT, kind TEXT,      -- 'win32' | 'uwp'
  target TEXT,                                       -- exe路径 或 AppUserModelID
  icon_path TEXT, launch_count INTEGER DEFAULT 0, last_launch_at INTEGER
);
CREATE TABLE launch_history (id INTEGER PRIMARY KEY, kind TEXT, target TEXT, ts INTEGER);

-- AI 对话与任务（F5）
CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT, engine TEXT, model TEXT, created_at INTEGER);
CREATE TABLE conv_messages (id INTEGER PRIMARY KEY, conv_id TEXT, role TEXT, content TEXT,
  input_tokens INTEGER, output_tokens INTEGER, ts INTEGER);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, prompt TEXT, cwd TEXT, status TEXT,  -- queued|running|done|failed|cancelled
  session_id TEXT, created_at INTEGER, finished_at INTEGER, result_summary TEXT
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);        -- schema_version 等
```

迁移策略：`db/migrations/NNN_*.sql` 顺序执行，启动时比对 `meta.schema_version`；**升级前自动备份 db 文件**。

### 6.3 会话同步机制（F1 的心脏）

0. **范围界定（2026-07-04 实测新增）**：只发现/监听**顶层** `projects/<slug>/*.jsonl`（主会话）。`<slug>/<sessionId>/` 子目录下的 `subagents/agent-*.jsonl` 与 `wf_*/` workflow 转录（本机占总量 ~43%）**不入库、不进 FTS**，仅在详情页展开侧链/子代理时按需流式解析——否则索引体积与全量同步耗时近乎翻倍，而这些内容极少被全文检索。
1. **首次全量**：扫描顶层 `projects/*/*.jsonl`，Worker 内逐文件流式解析入库，记录 `jsonl_offset = 文件字节长`。
2. **增量**：chokidar 监听该目录（`depth: 1`，忽略会话子目录）。JSONL 是**追加写**——文件变更时从上次 `jsonl_offset` 继续读新行，只解析增量（一次会话交互通常仅几 KB）。**注意半行**：写入可能被读到一半，故**只把 `jsonl_offset` 推进到最后一个完整 `\n`，尾部残行不入库、留待下次补齐**，避免错位读坏整条会话。
3. **防抖与校验**：变更事件 300ms 防抖合并；若 `文件长度 < offset`（文件被重写/截断，罕见），回退全量重解析该文件。
4. **解析容错**：单行 JSON.parse 失败 → 记录警告并跳过，绝不让一行脏数据中断整个会话；每行必须过 zod schema 宽松校验。
5. **性能目标**：见 §9 M1 验收（约 1GB 历史数据冷启动全量 < 60s，日常增量 < 100ms 感知）。

---

## 7. 核心功能技术方案

### 7.1 F1 · 会话中心

- **列表页**：虚拟滚动（`@tanstack/react-virtual`），按项目分组/平铺两种视图；筛选：项目、时间范围、模型、有无收藏。
- **搜索**：FTS5 `MATCH` + snippet 高亮；范围可选"全部/当前项目"；目标 10 万条消息 < 200ms。
- **详情回放**：
  - 消息按 `parentUuid` 构建树，主干线性展示；侧链（`isSidechain=true`，子代理轨迹）折叠为可展开的嵌套块。子代理/workflow 完整转录存于 `<sessionId>/subagents/`、`<sessionId>/wf_*/` 子目录（不入索引，见 §6.3 第 0 条），展开时按需解析对应文件。
  - 用户/助手消息 Markdown 渲染（`react-markdown` + `shiki` 代码高亮）；工具调用（tool_use/tool_result）渲染为可折叠卡片，diff 类结果用 diff 视图。
  - 长会话惰性渲染：详情打开时才解析全文（列表阶段只用 DB 摘要字段）。
- **恢复会话**：
  - M1（无内置终端时）：调用 `wt -d "<cwd>" claude --resume <sessionId>` 打开 Windows Terminal；`wt` 不存在则回退 `start powershell`。
  - M2 起：默认在内置终端恢复，并自动建立绑定（§7.2.3）；恢复时可选后端档案（§7.2.6），默认沿用订阅态。
- **导出**：Markdown（对话体裁，工具调用可选包含）与原始 JSON 两种；导出文件写入用户选择目录。

### 7.2 F2 · 终端管理（技术难点最高，方案最细）

#### 7.2.1 PTY 托管

- `node-pty` 以 ConPTY 后端 spawn；默认 shell 为 PowerShell，Claude 会话则直接 spawn `claude`（含 profile 参数）。
- 每个终端一个环形缓冲区（默认保留 10k 行 / 上限 5MB），用于标签切换后回放；`xterm.js` 侧 `scrollback` 同步限制，控制内存。
- 数据通路：pty.onData → 主进程节流合并（16ms 批量）→ `evt:terminal:data` → xterm.write。写入方向反之。
- 应用退出策略：默认询问（存在 running 会话时警告）；支持"最小化到托盘继续跑"。**重启后 pty 进程无法保活**——v1 从零开终端，"上次布局/项目记忆一键重开"进 backlog。

#### 7.2.2 会话档案（Profile）

```ts
interface TerminalProfile {
  cwd: string;
  kind: 'claude' | 'shell';
  claude?: {
    backendProfileId?: string;    // 引用 §7.2.6 后端档案；缺省 = 订阅态
    model?: string;               // 透传 --model（覆盖后端档案的默认模型）
    permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'dontAsk' | 'auto' | 'bypassPermissions';  // 2.1.196 --help 实测全集（较早期资料多 dontAsk/auto 两种）
    resumeSessionId?: string;     // --resume
    name?: string;                // 透传 -n <name>：会话显示名，终端标签名与之同步
    extraArgs?: string[];
  };
}
```

`bypassPermissions`（对应 `--dangerously-skip-permissions`）在 UI 上强提示风险并默认关闭。

#### 7.2.3 终端 ↔ 会话绑定（关键设计）

目标：知道"这个终端标签页里跑的是哪个 sessionId"，从而打通状态、历史、跳转。

- **首选（新建）**：spawn 时预生成 UUID 传 `claude --session-id <uuid>`，绑定即刻确定。
- **恢复也用已知 id**：resume 的就是目标 `sessionId`，直接绑定，**不走启发式**。
- **启发式仅限边角**（用户在 shell 终端里自己敲 `claude`）：监听该 slug 目录 JSONL 的创建/写入，将"spawn 时间之后最新活跃的 jsonl"临时关联，**待 hooks 的 `SessionStart`（带 `session_id`+`cwd`）到达后以其为权威校正**。
- 绑定关系入库，会话中心与终端页互相跳转依赖它。
- ✅ **已实测（2026-07-04，v2.1.196，无头模式）**：`claude -p --session-id <新uuid>` 成功以指定 id 新建会话（result 事件回传同一 id，JSONL 落盘为 `projects/<slug>/<uuid>.jsonl`）；`claude -p --resume <uuid>` **追加写入同一文件、保持同 id**（要另起新 id 须显式传 `--fork-session`，官方文档确认）。两条主路径成立，R8 主要不确定性消解。残余风险：`--session-id` 仅见于 CLI `--help`、未收录进官方文档——保留 hooks `SessionStart` 权威校正作为兜底。

#### 7.2.4 实时状态感知（hooks 方案）

> 🛑 **v1.1 退役（2026-07-07 用户裁决）**：hooks 方案整体退役，替代方案见 **§7.9**（JSONL 事件驱动状态机 + OTEL 评估），升级清理见 §7.9.4 / M9。本节保留为 v1.0 历史实现记录，不再维护。

**方案**：T1doo 主进程启动 `HookServer`（`127.0.0.1` 随机端口，Bearer token 校验，仅回环地址）。经用户在设置页**显式开启**后，向 `~/.claude/settings.json` 注册 hooks（JSON 深合并写入——不仅保留用户已有 hooks，还须原样保留 `permissions`/`enabledPlugins`/`env` 等全部既有键，本机实测该文件已包含这些配置；可一键移除并还原备份）：

| Hook 事件 | 上报后的状态推断 |
|-----------|----------------|
| `UserPromptSubmit` | → `working`（开始干活） |
| `PermissionRequest` | → `waiting`（等待权限确认）+ 系统通知（2026-07-04 官方文档确认收录，作为 waiting 主信号） |
| `Notification` | → `waiting`（等待输入类提醒）；⚠️ 当前官方文档已不收录该事件，作为补充注册、收不到不报错（语义可能漂移，M2 实测校准） |
| `Stop` | → `idle`（回合结束） |
| `SessionStart` / `SessionEnd` | 会话开启/关闭登记 |

Hook 命令模板（Windows，始终以 0 退出、2 秒超时、静默失败，绝不阻塞 Claude Code）：

```
cmd /c "curl.exe -s -m 2 -X POST http://127.0.0.1:<port>/hook -H "Authorization: Bearer <token>" --data-binary @- 2>NUL & exit /b 0"
```

hook stdin 自带 `session_id`、`hook_event_name`、`cwd`、`transcript_path`、`permission_mode`、`prompt_id` 等 JSON 字段（2026-07-04 官方文档核实），直接转发即可。（`curl.exe` 自 Win10 1809 起随系统预装，与目标平台一致；缺失时降级到 PowerShell `Invoke-RestMethod`。）

**降级路径**（用户不开 hooks）：轮询各活跃 JSONL 的 mtime + 尾行类型推断状态（精度降为"最近 N 秒有无输出"），功能可用但延迟高。端口固定化问题：注册进 settings.json 的端口需稳定 → 首次启用时随机选定后**持久化到配置**，此后固定占用；被占用时启动失败提示用户重新生成（会自动改写 hooks）。

#### 7.2.5 UI

标签栏（项目名+状态点）、`Ctrl+T` 新建、`Ctrl+W` 关闭、拖拽换序、左右分屏（v1 最多 2 列）；`addon-search` 提供终端内 `Ctrl+F`。

#### 7.2.6 后端档案（Backend Profile）—— 模型/后端配置切换

**动机**：用户既有 Claude Max 订阅，也有其它模型的 API（可经 OpenAI 兼容网关接入 Claude Code）。需求是"用同一个本机 `claude`，一键切换它连到哪个后端"。这与 §7.5「F5 内置对话面板 API 引擎 v1 仅 Claude」不冲突——两者是不同通道：

- **Claude Code 通道**（内置终端 / 无头任务 / 对话面板 cli 引擎）：spawn `claude` 时注入不同环境即可指向任意兼容后端。**后端档案作用于此，Must@M2。**
- **原生 API 引擎**（F5 `@anthropic-ai/sdk` 直连）：v1 仅 Claude（Q4）。

**数据结构**（存 electron-store；token 走 safeStorage 加密，不入库明文）：

```ts
interface BackendProfile {
  id: string;
  name: string;                     // "Max 订阅" / "DeepSeek" / "公司网关"
  auth: 'subscription' | 'custom';
  baseUrl?: string;                 // → ANTHROPIC_BASE_URL（custom）
  authTokenEnc?: string;            // safeStorage 密文；注入前解密为 ANTHROPIC_AUTH_TOKEN
  model?: string;                   // 默认模型（ANTHROPIC_MODEL 或 --model）
  smallFastModel?: string;          // 后台小模型（可选）
  extraEnv?: Record<string, string>;// 其它兼容变量（如 ANTHROPIC_CUSTOM_HEADERS）
  isDefault?: boolean;
}
```

**注入机制**（spawn 时构造子进程 env，不经 shell 字符串拼接）：

- `subscription`：不覆盖任何 `ANTHROPIC_*`，走 Claude Code 登录态；可选"清除继承到的 `ANTHROPIC_*` 覆盖"以强制订阅态。
- `custom`：设置 `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`（临时解密）+（可选）`ANTHROPIC_MODEL` + `extraEnv`。
- token 仅注入到该 `claude` 子进程环境，**不写入 shell 历史 / 应用日志**；日志与导出中全局脱敏。

**生效范围**：内置终端（F2）、后台任务队列（F5）、对话面板 cli 引擎（F5）—— 所有走 `claude` 的地方共用同一套档案。UI 上在"新建终端 / 派发任务"对话框直接下拉选择，档案管理在设置页。

**与既有设计的关系**：`--session-id` 绑定（§7.2.3）与 JSONL 同步（F1）不受影响（`claude` 仍在本地写会话）；成本显示见 §7.6（自定义/第三方后端不套用 Anthropic 定价）。

> ✅ **已核实（2026-07-04，官方文档 model-config / env-vars 页）**：`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL` 均为文档化变量；优先级 `ANTHROPIC_AUTH_TOKEN` > `ANTHROPIC_API_KEY`（两者同设会冲突——注入时只设其一）。`ANTHROPIC_SMALL_FAST_MODEL` **已弃用**，替代为 `ANTHROPIC_DEFAULT_HAIKU_MODEL`（同族另有 `ANTHROPIC_DEFAULT_OPUS/SONNET/FABLE_MODEL`）——`smallFastModel` 字段落地时映射到新变量名。备选注入通道：`claude --settings '<json>'` 支持内联 `env` 块，可不改子进程环境（M2 实现时二选一，默认仍用 env 注入，路径最短）。

### 7.3 F3 · 启动器（Claude Code 工作流入口）

> **定位收敛**（2026-07-03）：F3 不做"又一个通用启动器"去和 Raycast / PowerToys Run 竞争。差异化 = **秒跳到 CC 工作流对象**（项目 / 会话 / 运行中终端 / 最近提示词）；通用应用启动、文件、URL 是"够用"的便利层，投入适度、不追平专用工具。

- **窗口**：独立 frameless BrowserWindow，常驻隐藏（show/hide 而非重建，保证 <100ms 唤起）；置顶、失焦自动隐藏、ESC 隐藏。热键默认 `Alt+Space`，可配置并检测冲突（`globalShortcut.register` 失败即提示）。
- **数据源与意图路由**（按输入解析，**CC 对象优先**）：

| 输入形态 | 路由 | 实现 |
|---------|------|------|
| 普通词 | **项目 → 会话标题 → 运行中终端 → 最近提示词** → 应用 → ~~文件~~ 混排（文件源随 F4 裁撤，v1 仅绝对路径直开） | CC 源优先，各源 top-N 按 frecency 归并 |
| `> 指令` | T1doo 内部命令（新建终端/恢复会话/打开设置…） | 命令注册表 |
| `@ 问题` | 快捷 AI 提问 | 转 F5 对话（M5 接通） |
| `http(s)://` 或域名形态 | 打开浏览器 | `shell.openExternal` |
| `? 关键词` | 默认搜索引擎搜索 | 可配置引擎模板 |
| 绝对路径 | 直接打开/定位 | `shell.openPath / showItemInFolder` |

> CC 对象的默认动作：**项目** → 新建/聚焦该 cwd 终端；**会话** → 恢复或打开详情；**终端** → 切到该标签；**提示词** → 填入输入框可再次发送。

- **应用扫描**：
  - Win32：遍历两处开始菜单（`%ProgramData%\Microsoft\Windows\Start Menu\Programs`、`%AppData%\...\Programs`）解析 `.lnk`（PowerShell COM `WScript.Shell` 批量解析，启动时后台执行并缓存入库）。
  - UWP：`powershell Get-StartApps` 获取 `Name + AppID`，以 `explorer.exe shell:AppsFolder\<AppID>` 启动。
  - 图标：`app.getFileIcon(exePath)` 缓存为 png 文件。
  - 刷新策略：启动后台刷新 + 每 24h + 手动。
- **匹配与排序**：前缀/子串/首字母（拼音首字母 Could 级）匹配 + frecency 得分（`score = Σ 权重(操作) × 时间衰减`，参考 zoxide 算法）。

### 7.4 F4 · 文件中枢（已彻底废弃）

> **🛑 彻底废弃（2026-07-04 裁撤出 v1 → 2026-07-05 用户裁决从 backlog 移除，不再实现，详见 §14.2 决策日志）**。裁撤动因：M4 当日完整实现并通过全部量化验收后，验收压测暴露"自建重索引"与 T1doo **轻量常驻工具**定位的根本冲突（开发机整机卡顿、风扇满载）；通用文件名搜索 Everything 本体已是天花板。彻底废弃后：主窗「文件」导航与占位页已删除；原方案全文不再保留（完整实现与方案见存档分支 `feat/m4-files`，仅作历史参考，不合并）。**唯一保留物**：`session_files` 会话-文件联动数据继续随 M1 会话同步零成本采集（解析 JSONL 顺带提取，不碰文件系统），供 F6 Dashboard「最近文件」与会话反查使用。

### 7.5 F5 · AI 对话与任务

#### 7.5.1 双引擎抽象（关键决策）

很多 Claude Code 用户走**订阅**（无 API Key）。因此对话引擎抽象为统一接口，两个实现：

| | Engine A：`cli`（默认） | Engine B：`api` |
|---|---|---|
| 通道 | 子进程 `claude -p --output-format stream-json --include-partial-messages`；多轮对话用 `--input-format stream-json` 保持**单进程长连**（免每条消息重启进程、重付启动开销；2.1.196 实测支持） | `@anthropic-ai/sdk` `messages.stream()` |
| 鉴权 | 后端档案（§7.2.6）：订阅态**零配置** / 自定义后端注入 env | 用户填 API Key（safeStorage 加密存储）；可配自定义 `baseURL` 指向 Anthropic 兼容网关（v1 仅 Claude 模型） |
| 计费 | 计入订阅额度 | 按 token 计费 |
| 能力 | 默认纯问答：`--tools ""` 禁全部工具；可选 `--no-session-persistence` 使快捷问答不写入 `~/.claude` 会话历史（否则会涌入 F1 会话中心） | 纯模型对话，参数可控 |
| 适用 | 个人日常快速问答 | 需要指定模型/系统提示词/无 CLI 环境 |

模型选项（API 引擎，价格 2026-07-04 对照官方资料复核无误，UI 中展示供选择）：

| 模型 | ID | 定位 |
|------|----|------|
| Claude Opus 4.8（默认） | `claude-opus-4-8` | 最强 Opus，$5/$25 每百万 token |
| Claude Sonnet 5 | `claude-sonnet-5` | 性价比，$3/$15（限时 $2/$10，至 2026-08-31） |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 快速便宜，$1/$5 |
| Claude Fable 5（可选，暂缓） | `claude-fable-5` | 最强模型，$10/$50；但约束特殊：thinking 恒开（须完全省略 thinking 参数）、可能返回 `stop_reason:"refusal"` 需 UI 兜底、要求组织 30 天数据保留——处理成本高，**默认不列入 v1 下拉，进 v1.1 backlog** |

实现要点：流式渲染（delta 事件 → `evt:ai:delta`）；新模型**不提供 temperature 等采样参数 UI**（2026-07-04 复核：Opus 4.8/4.7、Sonnet 5、Fable 5 均已移除 temperature/top_p/top_k，传参 400）；thinking 采用 `{type:"adaptive"}`；长输出走流式避免超时。cli 引擎与任务队列均接受 `backendProfileId`（§7.2.6），据此注入后端环境。

#### 7.5.2 后台任务队列（M5 的 Should 项，最小闭环）

```
用户提交 TaskSpec{prompt, cwd, backendProfileId?, model?, permissionMode}
  → 入 tasks 表（queued）
  → 调度器（并发上限默认 2）spawn:
      claude -p "<prompt>" --output-format stream-json [--permission-mode ...]
        [--max-budget-usd <n>]  # API 计费后端的成本闸（仅 -p 可用，2.1.196 实测存在）
        [--json-schema <schema>]  # 需要结构化产物时
        [--include-hook-events]   # 任务进度直接出现在事件流，无需依赖 HookServer
  → 流式事件落盘 + 解析 result 事件 → done/failed
      # result 事件实测含 session_id / total_cost_usd / usage(含 cache tokens) /
      # modelUsage(分模型成本) / num_turns / duration_ms / permission_denials
      # —— 任务卡片与 F6 成本统计直接取用，无需另行聚合
  → 系统通知 + Dashboard 展示，可跳转查看完整输出；产生的 sessionId 自动进入 F1 会话中心
```

默认权限模式保守（`default`，工具调用将失败即止）；用户可对信任目录选择 `acceptEdits`。`bypassPermissions` 双重确认。后续演进方向：改用 `@anthropic-ai/claude-agent-sdk`（包名 2026-07-04 已核实）获得结构化控制（M5 期间评估，不承诺）。另注：Claude Code 2.1.x 已内置 `--bg` 后台代理与 `claude agents` 管理命令，与 F5 队列定位部分重叠——v1 仍自建队列（需要 UI 级控制、通知与落库），M5 时评估是否改为封装原生后台代理。

### 7.6 F6 · 指挥台 Dashboard

聚合只读视图（数据全部来自既有表，无新采集）：活跃终端/会话状态卡片、今日/本周 token 消耗曲线（按 assistant 消息 usage 聚合）、等待确认的会话置顶提醒、最近文件（口径=最近被会话修改，取自 `session_files`，与已裁撤的文件索引无关）、运行中任务。作为默认首页。

**成本口径**：token 数始终展示；**折算美元金额仅对"API 引擎 + 已知 Anthropic 定价的模型"显示**。订阅态会话（含 Max）与自定义/第三方后端不套用 Anthropic 单价，只显示 token 数并标注"订阅内 / 自定义后端"，避免误导。补充（2026-07-04 实测）：`claude -p` 的 result 事件自带 `total_cost_usd` 与分模型 `modelUsage`——API Key 计费的 cli 任务可直接采信该值；订阅态下该数字仅为名义值，仍按上述口径只展示 token。

### 7.7 F8 · 模型中心（独立「模型」板块，v1.1 · M7）

> **动机**（2026-07-07 用户提出）：① API 对话通道模型是写死的三选一下拉（`src/shared/ai.ts` API_MODELS），无法填第三方模型名；② 后端档案只有一个朴素表单（无预设模板、无连通性测试——§5.2 契约里的 `test` op 从未实现、无一键切换入口）；③ 模型切换是日常高频操作，却埋在设置页里。→ 独立成一级板块「模型」。设计参照 **cc-switch v3.16.5**（Tauri 2 + React，2026-07-07 源码调研，中间产物见调研存档）：其供应商管理 = 「预设模板 + 一键切换 + 主界面/托盘双入口」。

#### 7.7.1 信息架构

「模型」板块统一管理两条既有通道（§7.2.6 / §7.5.1 的通道划分与鉴权机制**不变**，只动配置界面与切换入口）：

| 通道 | 现状 | v1.1 升级 |
|------|------|----------|
| **Claude Code 通道**（终端 / 任务 / cli 引擎） | 后端档案，设置页表单增删改 | 供应商档案卡片墙 + 当前档案高亮 + 一键切换 + 预设模板 + 连通性测试，整体迁出设置页 |
| **API 直连通道**（对话面板 api 引擎） | API Key + baseUrl + 固定三模型下拉，设置页区块 | 迁入模型板块；模型改「预设 + 自由输入」组合框，第三方网关可在线拉取模型列表 |

设置页原 `AiSection` / `BackendProfilesSection` 两区块移除、留跳转入口；左导航新增「模型」（§8 布局与快捷键随之更新）。

#### 7.7.2 供应商档案升级（BackendProfile v2）

在 §7.2.6 结构上扩展（存储与加密机制不变：electron-store + safeStorage，token 明文不出主进程）：

```ts
interface BackendProfile {
  // —— 既有字段全部保留（id/name/auth/baseUrl/authTokenEnc/model/smallFastModel/extraEnv/clearInheritedEnv/isDefault）——
  presetId?: string;            // 来源预设（§7.7.3）；自由编辑后仅作溯源展示
  category?: 'official' | 'cn_official' | 'aggregator' | 'third_party' | 'custom';
  websiteUrl?: string;          // 控制台 / 领取 Key 页（预设自带）
  notes?: string;
  defaultSonnetModel?: string;  // → ANTHROPIC_DEFAULT_SONNET_MODEL
  defaultOpusModel?: string;    // → ANTHROPIC_DEFAULT_OPUS_MODEL
  //（smallFastModel 继续 → ANTHROPIC_DEFAULT_HAIKU_MODEL，附录 A.4；三个 DEFAULT_*_MODEL 补齐 cc-switch 同款模型映射）
  modelCache?: string[];        // /v1/models 拉取缓存（仅辅助下拉展示，不参与注入）
}
```

> 数据模型对照：cc-switch 把供应商存成「原样写入 live 配置的 JSON 片段（settingsConfig）+ meta 增值字段」两段式；T1doo 保持**结构化字段 + extraEnv 兜底**——按终端覆盖通道不需要 live 片段；全局切换（§7.7.5，Q8 ✅）写入时由结构化字段**生成** env 块，两者殊途同归，且结构化字段可校验、可做 UI。

#### 7.7.3 供应商预设模板

`src/shared/backend-presets.ts` 内置静态预设表（**只做表单预填与引导，不锁定任何字段**）：官方订阅 / Anthropic API 直连 / DeepSeek / Kimi (Moonshot) / 智谱 GLM / 自定义空白，共 6 家（**2026-07-07 用户裁决精简**：国产仅留 DeepSeek/GLM/Kimi，百炼/MiniMax/火山/硅基/魔搭等暂缓，需要时从"自定义"手建）。每条含：`name / baseUrl / apiKeyUrl（领 Key 引导链接）/ category / 建议模型映射（model + DEFAULT_{HAIKU,SONNET,OPUS}，取各家当前旗舰）/ 备注`。预设随版本静态更新，不做在线预设市场与商业合作位（cc-switch 有 50+ 预设与 partner 机制，超出个人工具需要）。

#### 7.7.4 连通性测试与模型列表拉取（新增 IPC：`backend:test` / `backend:models`）

- **`backend:test`**（custom 档案）：主进程按档案组装最小探测 `GET {baseUrl}/v1/models`（回退 `/models`，5s 超时，带档案 token），返回 `{ok, latencyMs, error?}`；错误映射复用 M5 `describeApiError` 中文提示（401/403/404/超时/断网）。**不发计费请求**（不 POST messages），网关不支持 models 端点时如实提示「无法自动测试，请发起一次对话验证」。subscription 档案不做 HTTP 探测（登录态归 CLI 管），仅探测 `claude --version` 存在性。
- **`backend:models`**：同端点拉取，兼容解析 OpenAI 形态（`{data:[{id}]}`）与 Anthropic 形态（`{data:[{id,display_name}]}`）→ 写入 `modelCache` 填充模型名下拉；失败静默降级为自由输入（R10 口径）。
- **E2E 零额度**：测试/拉取一律打本地 mock HTTP server（fixtures 覆盖 200/401/404/超时分支），沿用既有 E2E 隔离体系。

#### 7.7.5 切换机制（✅ Q8 已裁决：全局切换转正为主机制）

> **Q8 裁决（2026-07-07，用户）**：「修改 CLI 模型就是改全局 `~/.claude` 里的配置文件，可以接受。」全局切换即模型中心的**主切换语义**（cc-switch 同款），不作实验性降级。`~/.claude` 唯一写入例外由 hooks（已退役，§7.9）变更为本机制（§1.4/§11 同步修订）。

- **主机制 · 全局切换**：卡片墙「设为当前」→ 由档案结构化字段生成 env 块（`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL` + extraEnv）写入 `~/.claude/settings.json` 的 `env` 键 → **所有** `claude` 进程（含外部手开终端）随之生效。安全机制：
  - 首次使用一次性授权说明（此后切换不再打扰）+ 写前备份 `settings.json.t1doo.bak` + JSON 深合并（其余键分毫不动）+ 原子写（temp+rename，cc-switch atomic_write 同款）+ 一键还原；
  - **管理键记账**：T1doo 写入的 env 键名单独持久化（electron-store），切换/还原按名单精确增删，不误伤用户自己的 env 项；
  - **冲突检测**：切换前重读 live 文件，与上次写入不一致（用户手改 / 其它工具写入）→ 提示三选（覆盖 / 导入差异为新档案 / 取消），不静默覆盖（cc-switch「回填」机制的简化版）；
  - **订阅态档案** = 按记账名单精确移除 T1doo 管理的 env 键，回到登录态；
  - token 注：settings.json 的 `ANTHROPIC_AUTH_TOKEN` 为**明文**（该文件格式如此，cc-switch 亦然），UI 明示；T1doo 侧存储仍为 safeStorage 密文，日志/导出照旧脱敏（§11）。
- **覆盖机制 · 按终端注入**（保留）：新建终端/任务对话框仍可临时选任一档案（默认「跟随全局」），仅对该子进程生效、不动全局；已运行终端不受全局切换影响（env 为启动时快照，卡片提示「重开生效」）。✅ **M7 实测定案**（2026-07-07，本机 2.1.196 四项实验，双 mock 端点法零消耗）：settings.json env 块生效（`CLAUDE_CONFIG_DIR` 隔离验证）；**子进程环境变量 > settings.json env**；`--settings` 内联 env 同样更高；**空字符串环境变量 = 未设置**（claude 回落登录态）。故按终端覆盖**无需 --settings**：显式档案覆盖时把全部核心键置空中和全局块、再按档案填值——订阅态档案由此获得"强制登录态"（`buildClaudeEnv`，env.ts）。
- 一键切换交互：卡片墙点击即切（当前档案高亮 + 「当前」角标 + 切换 toast）；托盘菜单「切换后端」子菜单（Could）。

#### 7.7.6 API 直连通道升级

- 模型选择改**组合框**：内置 `API_MODELS` 预设分组 + 历史用过的模型 + **自由输入任意模型 id**（第三方 Anthropic 兼容网关的模型名直填即用）；baseUrl 非官方端点时自动经 `backend:models` 拉取网关模型列表填充下拉。
- 仍走 `@anthropic-ai/sdk`（Anthropic 协议），**不改变 Q4 边界**——OpenAI 协议适配仍为 v1.2+ Could；自由模型名在具体网关上的兼容性风险归 R10 口径（失败时错误明确提示，不猜测）。
- （Should）**API 档案化**：`{name, baseUrl, keyEnc, model}` 保存多套并一键切换，与供应商卡片同页并列展示——UI 结构与 CLI 通道对齐，实现共用卡片组件。

#### 7.7.7 测试与迁移

- 单测：档案 v2 序列化兼容（旧档案无新字段可加载）、env 块生成（§7.7.5 全局切换）、models 响应双形态解析。
- E2E：从预设建档 → 一键切换 → 假 claude（`T1DOO_CLAUDE_CMD`）回显 env 断言注入正确（零额度）；全局切换 settings.json 写入→切换→还原与原文件深度相等 + 备份存在 + 冲突提示分支（深合并/精确移除模块复用自 hooks 注册器，其单测口径保留）；设置页迁移后旧入口跳转正确。
- 数据迁移：electron-store 中既有档案原样兼容（新字段全可选），无迁移脚本。

### 7.8 F9 · 用量中心（独立「用量」板块，v1.1 · M8）

> **动机**（2026-07-07 用户提出）：Dashboard 现有用量卡片只有近 14 天 div 柱条 + 今日/本周合计——无自定义时间范围、无分模型/分项目维度、无 cache token、图表简陋。→ 独立成一级板块「用量」，用正经图表展示用量与变化。采集与聚合方法参照 cc-switch `session_usage.rs` / `usage_stats.rs`（2026-07-07 源码调研）。

#### 7.8.1 现状缺口（为什么不能直接用 messages 表出数）

| 缺口 | 说明 |
|------|------|
| 漏子代理/工作流 | F1 裁决 subagents/wf_* 不入索引（§6.3-0，占本机数据 ~43%）——但其 token 消耗真实发生，用量必须计入（cc-switch 同样扫描 subagents 子目录） |
| 缺 cache 维度 | messages 只存 input/output；cache_read 仅会话级合计、cache_creation 完全未采集——Claude Code 重缓存负载下 cache 常是大头，缓存命中率是关键指标 |
| 流式快照重复计数 | 同一 assistant `message.id` 会落多条增量快照行（messages 按行 uuid 存储），直接 SUM 系统性偏高——现状 `usageDaily` 即带此偏差 |
| 无成本/模型/项目聚合维度 | 无价目表；分模型/分项目查询无预设口径 |

**结论：新建独立的 `usage_log` 明细表 + 轻量采集管道**，不动 F1 索引边界（subagents 仍不入 FTS/messages）。

#### 7.8.2 数据管道（cc-switch 口径，含其踩坑修正）

```sql
CREATE TABLE usage_log (
  message_id TEXT PRIMARY KEY,          -- assistant message.id（去重键，非 JSONL 行 uuid）
  session_id TEXT, project_path TEXT,
  model TEXT, ts INTEGER,
  input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0, cache_creation_tokens INTEGER DEFAULT 0,
  stop_reason TEXT,
  source TEXT,                          -- 'session' | 'subagent' | 'workflow' | 'api-panel' | 'cli-panel'
  backend_profile_id TEXT               -- T1doo 内 spawn 的会话经绑定可溯源到供应商档案；外部会话 NULL
);
CREATE INDEX idx_usage_ts ON usage_log(ts);
CREATE INDEX idx_usage_model ON usage_log(model, ts);
CREATE TABLE usage_sync (file_path TEXT PRIMARY KEY, mtime_ms INTEGER, byte_offset INTEGER);
CREATE TABLE model_pricing (
  model_id TEXT PRIMARY KEY, display_name TEXT,
  input_per_m TEXT, output_per_m TEXT,          -- 单价一律 TEXT 存 Decimal 字符串（避免浮点误差，cc-switch 同款）
  cache_read_per_m TEXT, cache_write_per_m TEXT,
  is_builtin INTEGER DEFAULT 0
);
```

采集规则（关键细节均为 cc-switch 源码实证结论）：

1. **扫描范围**：顶层主会话 JSONL（复用 F1 worker 流水线顺带产出，parser 补采 `cache_creation_input_tokens`——现仅采 read，§6.1）+ `<sessionId>/subagents/*.jsonl`、`wf_*/**.jsonl` 走**独立轻量扫描器**：worker 内只匹配 `type=="assistant"` 行提取 `message.id / model / usage 四元组 / stop_reason / timestamp`，不建 FTS、不存正文、不进 messages 表——与 F1「不入索引」裁决不冲突。
2. **按 message.id 去重**：同 id 多条快照 → 优先保留 `stop_reason` 非空者，其次 `output_tokens` 更大者（写库时按此裁决 REPLACE）。
3. **计入门槛**：任一计费维度 > 0 即计入。⚠️ 不得按「stop_reason 非空 && output>0」过滤——cc-switch 源码注释实证该口径**系统性低估 ~4.1%**（并行子代理常只留 message_start 快照）。
4. **面板来源并入**：F5 api 引擎回合（SDK usage 回传，主键 `api:<messageId>`）与 cli 引擎面板回合（`--no-session-persistence` 不落 JSONL，从 stream-json result 事件补记，主键 `cli:<sessionId>:<turn>`）实时写入，source 区分——全局一张表出数。**任务队列不单独采集**：其会话正常落盘 JSONL，已被 session 来源覆盖，重复采集会双算（cc-switch 需跨源去重正因代理与转录双通道，T1doo 主动避免双源）。
5. **增量**：usage_sync 记 `(mtime_ms, byte_offset)` 续读 + 半行容错（§6.3 同款）；chokidar 监听放宽到会话子目录（仅用量扫描器消费该 depth 的事件，F1 仍只看顶层）。

#### 7.8.3 聚合与成本

- 聚合查询（DAO 单发 SQL GROUP BY，避免 N+1）：`summary(range)`（四类 token / 请求数 / **缓存命中率 = cache_read ÷ (input + cache_creation + cache_read)**）、`trend(range)`、`byModel(range)`、`byProject(range)`、`bySource(range)`；新增 IPC `usage:query` 一个入口带 kind 参数。
- **分桶**：范围 ≤ 48h 按小时桶；≤ 92 天按本地日（沿用 dao.ts dayKey 本地时区切日口径）；更长按月。
- **成本估算**：内置种子价目（Opus 4.8 = 5/25、Sonnet 5 = 3/15、Haiku 4.5 = 1/5 美元/百万 token，cache 读/写单价按官方价表落准）+ 模型名归一匹配（剥 `anthropic/` 类前缀、`.`→`-`、日期后缀走前缀 LIKE——应对第三方网关的模型名变体，cc-switch 同款）+ 板块内可编辑价目（改内置项即复制为用户项）。**§7.6 成本口径不变**：订阅态/自定义后端默认只显 token；新增「显示名义成本估算」开关（默认关，开启后金额恒带「估算」标注与口径说明）。
- **rollup 缓行**：本机现量（~2.2 万 assistant 行 + 子代理）明细直聚合为毫秒级，`usage_daily_rollups` 不建；明细超 100 万行或聚合超 100ms 时再引入（Could，v1.2+）。

#### 7.8.4 UI（「用量」板块）

- **筛选栏**：时间预设 `今天 / 7 天 / 30 天 / 本月 / 今年 / 自定义`（自定义=双日历日期区间选择器）＋ 项目 / 模型 / 来源下拉；cc-switch 另有 0-60s 自动刷新档位，T1doo 走事件推送（增量同步完成即失效查询），不做轮询。
- **Hero 指标卡**：总 token（in / out / cache 分列）、请求数、缓存命中率、估算成本（开关开启时）。
- **趋势图**：堆叠柱状/面积双模式（input / output / cache_read / cache_creation 四序列可开关），小时/日/月桶自适应；tooltip 展示完整数值。
- **分布区**：分模型条形图 + 明细表（token / 请求数 / 单请求均值 / 估算成本）；分项目 Top-N 条形；来源占比（终端 / 面板 / 任务·子代理）。
- **图表库裁决**：**Recharts**（cc-switch 同款 AreaChart 体系；React 组件式、按需 tree-shaking、颜色走 CSS 变量适配暗/亮主题）。打包增量预估 gzip ~100KB，§10.3 安装包预算（<150MB，现 98.6MB）无压力；若实测超预算再降级自绘 SVG。
- Dashboard 现有用量卡片精简保留（今日/7 天 + 迷你趋势），点击跳转本板块。

#### 7.8.5 性能预算（M8 并入 §10.3 审计，perf-audit 脚本扩项）

| 指标 | 预算 |
|------|------|
| 用量首扫（含 subagents/wf_*，本机基线 ~1,700 文件 / 513MB） | < 30s 后台完成，期间 UI 无卡顿（worker 解析 + 主线程批量写库，§5.1 原则 3） |
| 日常增量（单会话一轮交互） | < 300ms 反映到板块（含防抖） |
| 聚合查询（任意时间范围/维度） | < 100ms |
| usage_log 增量库体积 | < 30MB（本机基线） |

### 7.9 F2 · 状态感知 v2：hooks 退役（v1.1 · M9）

> **裁决**（2026-07-07，用户）：hooks 方案（§7.2.4）整体退役——机制不讨喜（向 settings.json 注册全局 hooks、所有会话的每个事件都 spawn 一条 `cmd`+`curl`），且经官方文档核实**并非必要**。§7.2.4 保留为 v1.0 历史实现记录。

#### 7.9.1 替代通道核实结论（2026-07-07，claude-code-guide 官方文档核对）

| 通道 | 结论 |
|------|------|
| `--settings` 内联 per-session hooks | ❌ 文档不支持（hooks 键为覆盖语义、无会话级隔离）——此路不通 |
| 终端铃声（BEL）等待信号 | ❌「等待批准时响铃」仍是 feature request（anthropics/claude-code#36850），未实现，不可依赖 |
| JSONL 事件驱动推断 | ✅ **主方案**：与 F1 同数据源，working/idle 确定性推断，waiting 走启发式（见 7.9.2） |
| OTEL 遥测 | ⚠️ traces 有 `claude_code.tool.blocked_on_user` 跨度（语义=正在等用户批准）；OTLP 端点纯 env 配置——可只注入 T1doo 拉起的进程、零文件写入。但需 `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`，且该文档归于 Agent SDK 章节，**交互式 CLI 是否发出未证实 → M9 实测 spike（7.9.3）** |

#### 7.9.2 JSONL 事件驱动状态机（默认且唯一路径）

复用 F1 增量同步管道（chokidar + 追加解析，M1 实测增量感知 ~323ms），在解析回调上挂状态机，**不新增任何 I/O 与配置**：

| 观测到 | 推断状态 |
|--------|---------|
| 新 user 行（非 tool_result 载荷） | → `working`（开始处理） |
| 新 assistant 行含 `tool_use`，其后 **T 秒**（默认 2s，可调）无后续行 | → `waiting`（等待权限确认）+ 系统通知 |
| tool_result（user 行）到达 | → `working`（确认已给出 / 工具完成） |
| assistant 末行无悬挂 tool_use 且无新行 | → `idle`（回合结束） |
| 长时间无写入 / 绑定进程退出 | → `idle` / `ended` |

- **精度增强**：JSONL 行自带 `permissionMode`——`bypassPermissions` / `acceptEdits` 会话对相应工具类别抑制 waiting 判定，降低误报；`isSidechain=true` 行不参与主状态。
- **如实展示局限**：无法区分「等确认」与「工具执行慢」，waiting 为**推断值**——UI 用与 v1.0 hooks 确定值不同的样式（空心角标）标注；通知延迟 ~0.5–3s，U4 的 3 秒承诺仍守住。
- **覆盖范围优于 hooks 默认态**：内置终端与外部手开会话一视同仁（同一数据源），无需任何注册动作。

#### 7.9.3 OTEL spike（M9 内 0.5 天，采信须实测）

内置终端 spawn 时注入 `CLAUDE_CODE_ENABLE_TELEMETRY=1` + `OTEL_TRACES_EXPORTER=otlp` + `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:<port>` + `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`，T1doo 起本地最小 OTLP/HTTP 接收端，实测交互式会话是否发出 `claude_code.tool.blocked_on_user` 跨度及其延迟。**成立** → v1.2 为内置终端接入确定性 waiting 信号（外部会话仍走 JSONL 推断）；**不成立** → JSONL 推断即最终方案。结论记 §14.2，不阻塞 M9 交付。

#### 7.9.4 退役与迁移

- **删除**：HookServer（127.0.0.1 HTTP 服务）、hooks 注册/还原模块（深合并/精确移除工具函数**保留**——移交 §7.7.5 全局切换复用）、设置页 HooksSection、首启引导 hooks 步（改为状态感知说明页，无授权动作）。
- **升级清理**：v1.1 首次启动检测 `~/.claude/settings.json` 中带 `/t1doo-hook` 标记的条目 → 自动精确移除（沿用既有移除逻辑与「深度相等」测试口径），其余键分毫不动；清理完成后 UI 一次性告知。
- **不受影响**：任务队列 `--include-hook-events`（stream-json 内联事件，与 HookServer 无关，§7.5.2）；`--session-id` 主绑定路径（§7.2.3，R8 已实测）。SessionStart 权威校正随 hooks 退役取消——仅影响「shell 终端里手敲 claude」边角场景的绑定精度（启发式关联仍在）。
- **原则修订**：`~/.claude` 唯一写入例外由「hooks 注册」变更为「模型中心全局切换 env 键」（§1.4 / §11 已同步）。

---

## 8. UI/UX 设计

- **布局**：左侧图标导航栏（Dashboard / 会话 / 终端 / 对话 / 任务 / 设置，「文件」已随 F4 废弃移除；**v1.1 起新增「模型」「用量」两项，插在任务与设置之间**，见 §7.7/§7.8）+ 内容区；全局顶部无标题栏（自绘窗口控制按钮），拖拽区约定。
- **主题**：暗色默认，亮色可切；强调色单一（品牌色待定），大量留白 + 等宽字体用于代码/终端（默认 Cascadia Code，可配）。
- **键盘体系**：`Alt+Space` 全局启动器；应用内 `Ctrl+K` 命令面板（复用启动器组件）；`Ctrl+1..7` 切页（v1.1 导航增至 8 项后扩展为 `Ctrl+1..8`）；终端快捷键见 §7.2.5。所有快捷键集中在设置页可改。
- **语言**：UI 文案走 i18n 资源（`zh-CN` 默认，`en` 骨架），M6 补全。
- **通知策略**：仅两类默认开启——"会话等待你的输入"、"后台任务完成/失败"。其余一律不打扰。
- **首启引导**：四步——① 检测 Claude Code 并首次索引历史会话（进度条）；② 建议订阅目录；③（可选）开启 hooks 状态感知，说明写入 settings.json 的内容与还原方式（**v1.1/M9 hooks 退役：此步改为状态感知说明页，无授权动作**，§7.9.4）；④（可选）配置后端档案（订阅态开箱即用，可加自定义后端）。

---

## 9. 里程碑与迭代计划

> 工期假设：单人开发 + AI 辅助，每周有效投入 ≈ 20h。总计 ~~14 周（约 3.5 个月）~~ **12 周（约 3 个月）到 v1.0**（2026-07-04 起：M4 文件中枢裁撤，M5/M6 前移两周）。每个里程碑结束时产出可运行、可日常使用的版本（打 tag）。
> **v1.1 周期（2026-07-07 规划立项，同日 Q8 裁决通过 + hooks 退役决定）**：M7 模型中心 + M8 用量中心 + M9 状态感知 v2·hooks 退役，共 5 周（第 13-17 周），交付后发布 **v1.1.0**；方案见 §7.7–§7.9。

| 里程碑 | 周期 | 交付内容 | 验收标准（可测量） |
|--------|------|---------|-------------------|
| **M0 工程奠基** ✅ 2026-07-04（PR #1） | 第 1 周 | electron-vite + React + TS strict 脚手架；主窗/托盘/单实例/主题；settings 存储；ESLint/Prettier/CI（lint+build）；electron-builder 能出安装包 | ① ✅ 打包版实测（单实例锁生效、退出零残留、~344MB）；② ✅ PR #1 CI 绿；③ ✅ HMR 实测即时推送。NSIS 安装→卸载全流程留手动复核 |
| **M1 会话中心** ✅ 2026-07-04 | 第 2-3 周 | JSONL 发现/容错解析/全量+增量同步；SQLite+FTS5；**解析时顺带采集 tool_use 文件路径 → session_files（供 F4 联动）**；会话列表/搜索/详情回放；外部终端恢复；导出 md/json；fixtures 回归测试 | ① ✅ 271 会话/19k 消息/2993 条文件联动入库，E2E 抽查 10 个会话渲染零报错；② ✅ 冷同步 291MB/271 文件 = 4.6s，增量感知 323ms（含 300ms 防抖，半行容错实测）；③ ✅ 19k 消息搜索 <3ms（10 万级余量充足）；④ 恢复按钮按 A.4 实测命令实现，**拉起 wt 续聊留手动点验**（自动测试会真实消耗额度）；⑤ ✅ fixtures 15 项单测全绿（坏行/未知类型/半行/CJK 切分） |
| **M2 内置终端** ✅ 2026-07-04 | 第 4-6 周 | node-pty+xterm 多标签/分屏；Profile 启动；**后端档案（订阅态 + 自定义后端 baseURL/token/模型 注入，token 走 safeStorage）**；`--session-id` 绑定 + 兜底关联；hooks 状态感知（含设置页开关、注册/还原）；状态角标+系统通知；Dashboard 初版 | ① ✅ E2E 同开 6 终端并发回显全通过（`scripts/e2e-terminal.cjs`）；② ✅ E2E 状态流转断言 400ms 内通过（hooks 链路含 401 拒绝/SessionStart 绑定校正）；③ ✅ hooks 开→关 settings.json 与原文件深度相等（含用户既有 hooks/permissions 保留，单测+E2E 双覆盖）；④ 恢复默认走内置终端并绑定（--resume 直绑，单测覆盖），**真实拉起 claude 续聊留手动点验**（同 M1 口径，避免耗额度）；⑤ ✅ E2E 退出后 tasklist 验证 pty 进程消亡（taskkill /T 兜底）；⑥ token DPAPI 密文落盘 + 明文不出主进程 ✅ E2E；**真实第三方后端连通留手动点验** |
| **M3 启动器（CC 入口）** ✅ 2026-07-04 | 第 7-8 周 | 全局热键唤起窗；**CC 对象秒跳（项目/会话/终端/最近提示词，优先级最高）**；应用扫描（.lnk+UWP,够用层）+ 图标缓存；文件/URL/内部命令路由；frecency 排序 | ① ✅ 窗口预创建 + show/hide 复用（E2E `scripts/e2e-launcher.cjs`），**真实热键唤起体感留手动点验**；② ✅ E2E 实测查询 IPC 往返 0.6ms（<50ms 余量充足）；③ ✅ E2E 项目/会话/提示词条目命中 + 「> 设置」执行跳转主窗，**真实拉起 claude 新建/恢复留手动点验**（同 M1/M2 口径，避免耗额度）；④ ✅ 本机实测扫描 169 应用（116 win32 + 53 UWP，1.5s，中文名正常），**抽查 20 个启动留手动点验**；⑤ ✅ 注册失败状态暴露 + 设置页热键录制改绑（真实冲突场景留手动）。另：5 个单测文件（路由/匹配/frecency/扫描解析/提示词解析）+ M1/M2 E2E 回归全绿 |
| **M4 文件中枢** 🛑 已裁撤（2026-07-04），F4 于 2026-07-05 彻底废弃 | ~~第 9-10 周~~ | 当日已完整实现（订阅目录索引 Worker+chokidar+FTS5 / 联动 UI / Everything 桥 / 文件页与设置区块 / 15 项单测 / E2E 全绿）并通过验收①-⑤ 后整体裁撤：量化数据与动因见 §14.2；代码单提交存档于 `feat/m4-files` 分支（不合并、不删除，仅历史参考） | —（会话-文件联动数据继续随 M1 采集；F4 不再实现） |
| **M5 AI 能力** ✅ 2026-07-05 | 第 9-10 周（原 11-12） | 对话面板（流式/Markdown/高亮/历史落库可搜）；双引擎（cli 默认 + api 可配，Key 走 safeStorage）；启动器 `@` 提问接通；任务队列最小闭环 | ① ✅ cli 引擎流式对话 E2E 全通（`scripts/e2e-ai.cjs`：delta 中间态/Markdown 渲染/多轮长连；假 claude 经 `T1DOO_CLAUDE_CMD` 注入，零额度）；api 引擎无 Key → 明确中文提示 E2E 实测，401/403/404/429/断网各错误码映射为明确提示（`describeApiError`），**真实 API 流式与自定义网关留手动点验**（避免耗费）；② ✅ E2E 读盘断言：`ai-api.json` 仅存 DPAPI 密文（`apiKeyEnc`）、明文 Key 不出现在磁盘、UI 仅显示尾 4 位；③ ✅ 提交 → 并发调度（上限 2）→ result 事件采集（session_id/total_cost_usd/usage/num_turns）→ done → 输出查看 +「查看会话」跳转会话中心，E2E 全程走通；完成/失败系统通知与 M2 同链路（**真实弹窗体感留手动点验**）；④ ✅ 对话历史 FTS 搜索命中 + snippet 高亮（CJK 一元切分与 F1 同口径）。启动器 `@` 提问 → 主窗对话页自动聚焦新对话并流式作答 E2E 通过。另：3 个单测文件 20 项（stream-json 白名单容错/半行、双引擎与任务参数构造、任务状态机含并发/取消/竞争）+ M1-M3 E2E 回归全绿；主窗「文件」板块随 2026-07-05 F4 彻底废弃一并移除（原 M6 占位页降级项就此了结） |
| **M6 打磨发布** 🔨 2026-07-07 代码交付 | 第 11-12 周（原 13-14） | 性能与内存审计（§10.3 预算达标）；i18n 补全；首启引导；NSIS+portable 打包；electron-updater（GitHub Releases）；README/使用文档；~~主窗「文件」占位页降级处理~~（已随 2026-07-05 F4 彻底废弃提前移除） | ① ✅ 冷启动实测 0.83–1.18s < 3s（§10.3 六项全达标，`scripts/perf-audit.cjs` 可复跑）；② ✅ 常驻内存 259MB（私有工作集）< 350MB；③ 安装→使用→自动更新→卸载全流程**留干净虚拟机手动验证**（更新链路代码就绪：publish 配置 + latest.yml + 设置页入口，E2E 覆盖 UI 态）；④ v1.0.0 tag + Release **留 PR 合并后执行**（release.yml 流水线就绪）。另：i18n ~300 key 全量抽取 + en 补全（切换往返 E2E 实测）；首启四步向导 E2E 走查通过；89 单测全绿 |
| **M7 模型中心（F8，v1.1）** ✅ 2026-07-07 代码交付 | 第 13-14 周 | 「模型」一级板块；供应商档案 v2（预设模板 6 家·用户裁决精简 / 卡片墙一键切换 / 连通性测试 / 模型列表在线拉取·支持未保存即填即拉 / DEFAULT_{SONNET,OPUS} 映射补全）；API 通道模型自由输入 + 网关模型下拉；设置页两区块迁出留跳转；**全局切换主机制**（首次一次性授权 / 备份 / 深合并 / 冲突三选 / 一键还原 / 管理键记账，Q8 ✅）；托盘快速切换与 API 档案化（Could，未做 → v1.2 backlog） | ① ✅ 预设 6 家（初版 10 家，2026-07-07 用户裁决精简）、从预设建档一键预填 + 未保存即填即拉（E2E `scripts/e2e-models.cjs` ①）；② ✅ 全局切换 env 键写入以文件断言覆盖（E2E ④）；按终端覆盖以假 claude 回显 env 断言（E2E ⑤，含显式档案注入与订阅态空串中和——语义经四项实测定案，§7.7.5）——零额度；③ ✅ 本地 mock 网关 200/401/404/超时四分支中文提示（E2E ②）；④ ✅ `/v1/models` 拉取填充 + modelCache 持久化 + 失败降级自由输入（E2E ③）；⑤ ✅ API 通道任意模型名读盘断言生效 + 明文 Key 不落盘（E2E ⑧，M5 同口径）；⑥ ✅ settings.json 写入→切换→还原与原文件深度相等 + 备份存在 + 外部手改触发冲突三选不静默覆盖（单测 + E2E ④⑥⑦）；⑦ ✅ 旧档案 v1→v2 兼容单测 + 导航/设置页跳转 E2E（⑨）+ M1-M5 回归全绿（另修 e2e-launcher「全局热键」exact 断言的环境脆断，见 §14.2）；单测 89→109 项；**真实第三方网关连通留手动点验**（M2 同口径） |
| **M8 用量中心（F9，v1.1）** | 第 15-16 周 | 「用量」一级板块；usage_log 独立采集管道（subagents/wf_* 全覆盖、message.id 去重、cache 四维、api/cli 面板来源并入、任务不双采）；六档时间范围（含自定义日期区间）；Recharts 趋势/分布图 + Hero 指标卡 + 缓存命中率；价目表可编辑 + 名义成本开关；Dashboard 卡片精简接跳转 | ① 首扫含 subagents（本机基线 ~1,700 文件 / 513MB）后台 < 30s、期间 UI 可交互（E2E 量测）；② message.id 去重（stop_reason 优先/output 最大）+「任一 token>0 计入」口径 fixtures 单测；与 ccusage 对拍误差 < 1%（脚本或手动）；③ 六档时间范围聚合正确性单测（本地时区切日、跨月、小时/日/月分桶边界）；④ §7.8.5 四项预算全达标并纳入 perf-audit 复跑；⑤ 图表以 fixtures 数据注入 E2E 断言渲染（暗/亮主题）；⑥ 定价归一匹配单测（前缀/日期后缀/`.`变体）+ 成本开关默认关、开启恒带「估算」标注（E2E）；⑦ M1-M7 E2E 回归全绿 |
| **M9 状态感知 v2 · hooks 退役（F2，v1.1）** | 第 17 周 | JSONL 事件驱动状态机成为默认且唯一路径（复用 F1 增量管道：user 行→working、回合终止→idle、尾部 tool_use 悬挂超阈值→waiting+通知，§7.9.2）；OTEL 通道实测 spike（验证交互式 CLI 是否发 `claude_code.tool.blocked_on_user` 跨度，§7.9.3）；hooks 全面退役：HookServer / 注册还原模块 / 设置页 HooksSection / 首启引导 hooks 步删除，升级时自动清理既有注册 | ① 状态机 fixtures 单测（working/waiting/idle 全流转 + 悬挂 tool_use 阈值边界 + permissionMode 抑制分支）；② E2E：假 claude 追加写 JSONL → 状态角标与 waiting 通知 ≤3s（U4 承诺保持，零额度）；③ 升级清理：预置带 `/t1doo-hook` 注册的 settings.json → 启动后精确移除且其余键深度相等（复用既有单测口径 + E2E）；④ OTEL spike 结论记入 §14.2（成立→内置终端接入排 v1.2；不成立→JSONL 推断即最终方案）；⑤ M1-M8 E2E 回归全绿（涉 hooks 的断言改写为状态机口径） |

**里程碑间的机动**：每个里程碑预留 15% 时间做上一里程碑的缺陷修复；若 M2 hooks 方案遇阻（Claude Code 行为变更），降级方案（mtime 轮询）保底交付，不阻塞后续里程碑。

---

## 10. 工程规范与质量保障

### 10.1 开发规范

- TypeScript `strict: true`；`src/shared` 禁止依赖 Node/DOM 任一侧特有 API。
- Git：main 保护 + feature 分支；conventional commits（`feat/fix/refactor/docs/chore`）；每里程碑打 tag（`v0.1.0-m1` …）。
- 版本号：SemVer；CHANGELOG.md 按里程碑维护。
- 依赖纪律：原生模块（node-pty / better-sqlite3）锁精确版本，升级 Electron 时同步验证 rebuild。

### 10.2 测试策略（按投入产出排序）

1. **解析器单测（最高优先）**：`tests/fixtures/claude-jsonl/` 收集真实脱敏样本（正常会话/含子代理/含 queue-operation/被截断行/**写到一半的尾行**/未来新增未知类型模拟；并覆盖 **tool_use 文件路径抽取 → session_files**）。Claude Code 每次大版本升级后，把新样本补进 fixtures 跑回归——这是对抗 R1 风险的核心护栏。
2. **服务层单测**：sync 增量逻辑、frecency 计算、意图路由、任务状态机（Vitest，服务不依赖 Electron 可直接测）。
3. **E2E 冒烟（Playwright for Electron）**：启动 → 各页面可达 → 新建终端 echo 回显 → 搜索返回结果。CI 每次跑。
4. **手动清单**：每里程碑验收标准逐条走查，记录在 PR 描述。

### 10.3 性能与资源预算（M6 审计基线）

> M6 实测（2026-07-07，打包版 dist/win-unpacked + 真实 ~/.claude 数据 262 会话/21,850 消息；`scripts/perf-audit.cjs` 可复跑，量测前把进程树优先级拉回 Normal 避开 EcoQoS）：**六项全部达标** ✅

| 指标 | 预算 | M6 实测 |
|------|------|---------|
| 冷启动（到 Dashboard 可交互） | < 3s | 0.83–1.18s ✅ |
| 常驻内存（空闲，1 终端） | < 350MB | 259MB（私有工作集，任务管理器口径；WorkingSet 合计 686MB 含共享页重复计数仅参考） ✅ |
| 启动器唤起 | < 100ms | 复用 M3 实测：窗口预创建 show/hide + 查询 IPC 0.6ms（真实热键体感留手动） ✅ |
| 搜索（消息 10 万） | < 200ms（~~文件 10 万 < 100ms~~ 随 F4 裁撤移除） | 21.8k 消息 0.1–0.4ms（与 M1 口径一致，10 万级余量充足） ✅ |
| 安装包体积 | < 150MB | Setup 98.6MB / portable zip 137.5MB ✅ |
| CPU 空闲占用 | < 1%（无监听风暴） | 全机 0.03–0.05%（单核口径 0.9–1.7%） ✅ |

---

## 11. 安全与隐私

| 主题 | 策略 |
|------|------|
| 渲染进程隔离 | `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、CSP 严格、禁用 `remote` |
| API Key / 后端档案 token 存储 | `safeStorage`（Windows DPAPI）加密后存本地；UI 仅显示尾 4 位；日志/导出中全局脱敏；后端 token 仅在 spawn 时解密注入目标 `claude` 子进程 env，不写 shell 历史 |
| Claude 数据目录 | 只读原则；唯一写入点 v1.0=hooks 注册 → **v1.1=模型中心全局切换 env 键**（首次授权 + 写前备份 + 深合并 + 管理键记账精确增删 + 一键还原，§7.7.5/§7.9.4）；`.credentials.json` 列入硬编码黑名单绝不读取 |
| HookServer | 仅绑定 `127.0.0.1`；随机高位端口 + Bearer token；仅接受 POST /hook；请求体大小限制 |
| 命令执行面 | 启动器/任务队列拼接命令一律走 `spawn` 参数数组（不经 shell 字符串拼接），杜绝注入 |
| 危险选项 | `--dangerously-skip-permissions` 类选项默认关闭 + 二次确认 + 醒目标识 |
| 遥测 | 默认零遥测、零上报；崩溃日志仅本地留存 |
| 更新安全 | electron-updater 校验签名/哈希；仅从固定 GitHub Releases 源拉取 |

---

## 12. 风险登记表

| # | 风险 | 概率 | 影响 | 应对 |
|---|------|:--:|:--:|------|
| R1 | **Claude Code JSONL/目录结构是内部格式，版本升级可能破坏解析**（最大风险） | 高 | 高 | 白名单容错解析（未知即跳过不崩）；fixtures 回归；`cc_version` 落库便于定位漂移；核心功能（终端/启动器/文件）不依赖解析成功。**2026-07-04 已现实证**：全量扫描发现 1 行坏行、`summary` 类型已被 `ai-title`/`custom-title` 取代、新增 `subagents`/`wf_*` 嵌套目录——白名单+实测优先的策略被验证正确 |
| R2 | hooks 配置结构或事件语义随 Claude Code 变更 | 中 | 中 | hooks 为增强而非依赖；mtime 轮询降级路径始终保留；注册前探测版本。**2026-07-07 关闭**：v1.1 hooks 整体退役（§7.9），状态感知改 JSONL 推断，格式漂移风险并入 R1 |
| R3 | node-pty/better-sqlite3 与 Electron ABI 不匹配导致构建失败 | 中 | 中 | electron-rebuild 进 postinstall；锁版本；CI 在干净 Windows runner 上验证打包产物 |
| R4 | 多终端 + 索引导致内存/CPU 失控 | 中 | 中 | §10.3 预算硬指标；环形缓冲上限；Worker 隔离；chokidar 排除大目录默认规则 |
| R5 | 全局热键与系统/其它软件冲突（Alt+Space 是 PowerToys Run 默认键） | 高 | 低 | 注册失败即提示改绑；首启引导中确认 |
| R6 | 无代码签名证书 → SmartScreen 拦截 | 高 | 低 | v1 文档说明"更多信息→仍要运行"；后续评估 Azure Trusted Signing（成本低于 EV） |
| R7 | 单人项目范围蔓延 | 高 | 高 | §1.4 非目标清单 + MoSCoW + 每里程碑可用原则；新想法一律进 backlog 不插队 |
| R8 | `claude -p` 无头模式行为/参数随版本变化 | 低（原"中"，2026-07-04 降级） | 中 | ✅ 2026-07-04 已实测：`--session-id` 新建 / `--resume` 同 id 追加 / `stream-json` 全部可用；`--session-id` 未进官方文档故保留 hooks 校正兜底。引擎抽象隔离；启动前 `claude --version` 探测并留兼容分支；Agent SDK 作为后备通道 |
| R9 | 中文全文搜索效果不佳（unicode61 按字切分：裸词匹配噪声大） | 中 | 中 | **M1 即评估 `simple` 分词器（中文分词+拼音）**；短语查询语法兜底；注意其为原生扩展、打包需加载 DLL（与 R3 同类） |
| R10 | 第三方/自定义后端与 Claude Code 兼容性参差（工具调用、`stream-json` 格式、`--session-id` 支持差异） | 中 | 中 | 后端档案标注能力；订阅态为默认与保底；异常时明确提示"该后端不支持 X"；解析层对缺字段容错 |
| R11 | 开发机未安装 Everything（2026-07-04 实测 `es.exe` 不在 PATH），第二层集成缺乏日常真实验证 | 高 | 低 | ~~M4 开工时先安装 Everything 实测；若验证成本超预期，降级为"仅检测+引导安装"，不做结果合并~~ **2026-07-04 关闭**：已经 winget 装机（`voidtools.Everything` + `voidtools.Everything.Cli`）并实测 es.exe 桥接可行（`-export-txt` UTF-8 中转避 GBK 乱码、`file:` 限定、按修改时间排序，E2E 合并/来源标注全通过）；随后 F4 整体裁撤出 v1（§14.2），本风险失效。开发机保留 Everything 供日常使用 |
| R12 | **全局切换写 `~/.claude/settings.json`**（v1.1，Q8 已裁决转正）：与 Claude Code 自身写该文件竞态，用户手改可能被覆盖 | 中 | 中 | 首次使用一次性授权；写前重读最新文件深合并 + 原子写 + 备份 + 一键还原 + 管理键记账精确增删；检测 live 漂移提示冲突三选、不静默覆盖；按终端 `--settings` 覆盖通道始终可用（§7.7.5） |
| R13 | 本地价目表随官方调价过期，成本估算失真误导（v1.1） | 中 | 低 | 默认只显 token（§7.6 口径不变）；金额恒标「估算」；价目表板块内可编辑；（Could）提供「对照 models.dev 校验」辅助入口 |

---

## 13. 打包与发布

- **产物**：NSIS 安装包（每用户安装，免管理员）+ Portable zip；x64 优先（arm64 进 backlog）。
- **更新**：electron-updater + GitHub Releases（私有仓库亦可用 token 方案，或先手动下载更新）；更新策略"提示后安装"，不强更。
- **发布流水线**：GitHub Actions：tag push → windows-latest 构建 → 单测/E2E → electron-builder 产物 → 附 SHA256 → 草稿 Release 人工发布。
- **命名**：`T1doo-Setup-<version>.exe` / `T1doo-<version>-win-x64-portable.zip`。

---

## 14. 开放问题与决策日志

### 14.1 开放问题裁决（2026-07-03 Q1-Q7 已全部拍板 → 升级 v1.0；2026-07-07 Q8 提出并于同日裁决通过）

| # | 问题 | 裁决 | 影响 |
|---|------|------|------|
| Q1 | 前端 React 还是 Vue？ | ✅ **React 18**（锁定） | §4.2 |
| Q2 | 订阅 / API Key？ | ✅ **Max 订阅 + 自定义后端 API**；新增**后端档案**（§7.2.6）统一切换，作用于所有 `claude` 通道，Must@M2；`cli` 为默认引擎 | §7.2.6 / §7.5 |
| Q3 | 文件搜索范围？ | ✅ **订阅目录够用**，Everything 保持可选（Should） | §7.4 |
| Q4 | v1 接非 Claude 模型？ | ✅ **F5 原生 API 引擎 v1 仅 Claude**（非 Claude 模型经后端档案走 Claude Code 通道，见 Q2） | §7.5 |
| Q5 | 默认语言 zh-CN？ | ✅ 是（`en` 骨架，M6 补全） | §8 |
| Q6 | 开源 / 私有？ | ✅ 先私有仓开发 | §13 |
| Q7 | 全局热键默认键？ | ✅ `Alt+Space`，与 PowerToys Run 冲突时首启引导改绑 | §7.3 / R5 |
| Q8 | **v1.1 全局切换**：是否允许把供应商档案 env 块写入 `~/.claude/settings.json`（cc-switch 核心机制）？ | ✅ **裁决通过（2026-07-07 同日用户裁决）**：「修改 CLI 模型就是改全局 `~/.claude` 配置文件，可以接受」——全局切换**转正为模型中心主切换机制**（非实验性），安全机制全套保留（首次授权/备份/深合并/原子写/冲突三选/管理键记账/一键还原，§7.7.5）；按终端 env 注入降级为覆盖机制。同时裁决 **hooks 整体退役**（§7.9），`~/.claude` 唯一写入例外由 hooks 换为本机制 | §7.7.5 / §7.9 / R12 |

### 14.2 决策日志

| 日期 | 决策 | 理由摘要 |
|------|------|---------|
| 2026-07-03 | 应用框架选 Electron + TS | 终端托管与 Claude 生态集成的成熟度压倒体积劣势（§4.1） |
| 2026-07-03 | 对 `~/.claude` 坚持只读 + hooks 唯一例外 | 数据安全与升级兼容（§1.4/§11） |
| 2026-07-03 | 文件索引走"订阅目录 + Everything 集成"而非自研全盘 | 投入产出比（§7.4） |
| 2026-07-03 | AI 对话双引擎、`cli` 优先 | 覆盖订阅用户零配置场景（§7.5） |
| 2026-07-03 | 前端锁定 React 18；F5 原生 API 引擎 v1 仅 Claude | Q1/Q4 裁决；生态成熟度与范围控制（§4.2/§7.5） |
| 2026-07-03 | 新增**后端档案**（Backend Profile）：env 注入切换 Claude Code 后端，覆盖终端/任务/cli 引擎，Must@M2 | Q2 裁决：用户 Max 订阅 + 第三方模型 API 需统一切换（§7.2.6） |
| 2026-07-04 | M3 落地细节三则：① 裸域名 URL 路由走 **TLD 白名单**（避免 `dao.ts` 等文件名误判）；② **提示词秒跳动作**＝有在跑终端时括号粘贴直写输入框，否则恢复会话/新建项目终端＋剪贴板兜底（不自动提交，防误发）；③ 启动器为**独立渲染入口**（launcher.html），不背主应用 bundle，窗口预创建 show/hide 复用 | 路由误判实测于文件名输入；直写 pty 需防多行误提交；唤起 <100ms 靠预创建而非加载优化（§7.3） |
| 2026-07-03 | Dashboard 成本口径：$ 仅对 API 引擎 + 已知 Anthropic 定价显示 | 订阅/第三方后端套用 Anthropic 单价会误导（§7.6） |
| ~~待 M2~~ 2026-07-04 已完成 | 核实后端注入的环境变量名：`ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_MODEL` 文档化确认；`ANTHROPIC_SMALL_FAST_MODEL` 弃用改 `ANTHROPIC_DEFAULT_HAIKU_MODEL` | 官方文档核实（§7.2.6 / 附录 A.4） |
| 2026-07-03 | F3 启动器 / F4 文件中枢**收敛为"Claude Code 工作流入口"**：F3 核心=秒跳项目/会话/终端/提示词，F4 核心=会话-文件联动；通用启动/全盘搜索做"够用"层，不与 Raycast/Everything 竞争 | 护城河在 CC 编排，避免 M3/M4 去重造轮子；联动数据在 M1 顺带采集（§1.4/§7.3/§7.4/§6.2） |
| 2026-07-03 | 评审加固（Pass 2/3）：R9 中文搜索升"中"并 M1 评估 `simple` 分词器；§6.3 增量补"半行"处理；FTS external-content 手动填充；worker 只解析、主线程独占写库；§7.2.3 绑定改"新建/恢复均用已知 id + hooks 权威校正"；补 F7 设置线 | 消除写代码时才暴露的正确性/体验雷（§4.2/§5/§6/§7） |
| 2026-07-04 | **实测补强（v1.1）**：① `--session-id` 新建 + `--resume` 同 id 追加实测成立，R8 降"低"（§7.2.3）；② 后端环境变量经官方文档核实，`ANTHROPIC_SMALL_FAST_MODEL` 弃用（§7.2.6）；③ hooks 事件表更新——`PermissionRequest` 为 waiting 主信号、`Notification` 降为补充（§7.2.4）；④ 行类型白名单按全量扫描重写，标题源改 `custom-title`/`ai-title`（§6.1）；⑤ 发现 `<sessionId>/subagents`、`wf_*` 嵌套转录占本机数据 ~43%，裁决 v1 不入索引、详情页按需解析（§6.1/§6.3）；⑥ 模型表补 Fable 5（暂缓）并复核定价（§7.5.1） | 本机 2.1.196 无头实测 + 官方文档核对，全记录见附录 A.6 |
| 2026-07-04 | F5 cli 引擎多轮对话采用 `--input-format stream-json` 单进程长连；快捷问答默认 `--tools ""` + 可选 `--no-session-persistence`；任务队列加 `--max-budget-usd` 成本闸并直接采集 result 事件成本字段 | CLI 能力实测确认，减少子进程开销与会话污染（§7.5） |
| 2026-07-04 | **M0 交付偏差**：① React 19 替代计划中的 18（脚手架当前版，生态兼容）；② electron-store 锁 v8——electron-vite 会外部化 dependencies，而 v10+ 纯 ESM 与 CJS 主进程不兼容，主进程迁 ESM 前不升级；③ 主题实现收敛为"主进程 nativeTheme.themeSource + 渲染层 prefers-color-scheme"，零 JS 换肤逻辑；④ pnpm 11 依赖构建脚本审批迁至 pnpm-workspace.yaml `allowBuilds` 键 | M0 实装结论（§4.2/§8） |
| 2026-07-04 | **R9 裁决（M1 实测）**：unicode61 实为"连续 CJK 单 token"，中文命中率仅 LIKE 基线 ~1/5（"性能" 9 vs 48）→ 落地"CJK 一元切分入索引 + 查询短语化 + snippet 拼回"，命中率追平 LIKE 基线、零原生依赖；`simple` 分词器转 backlog。另修正：FK 级联删除不触发 FTS 触发器，replace 须先显式 DELETE messages | M1 实测数据（§6.2 注释已修正） |
| 2026-07-04 | **M1 架构落地**：全部 JSONL 解析走 worker_threads（electron-vite `?modulePath`），主线程唯一写库；详情回放按需 worker 解析全文（列表只用 DB 摘要）；messages.content_text 仅服务 FTS（存 CJK 切分形态）；E2E 冒烟用 playwright-core `_electron`（含增量延迟量测脚本 scripts/e2e-*.cjs） | §5.1 原则 3 落实；性能数据见 §9 M1 验收 |
| 2026-07-05 | **F4 文件中枢彻底废弃（用户裁决，M5 验收通过后）**：从 v1.1+ backlog 中移除，**以后也不实现**——2026-07-04 的裁撤已证明该方向与产品定位不可调和，backlog 挂着徒增心智负担。处置：① §7.4 原方案全文删除（完整方案与实现仅存 `feat/m4-files` 分支作历史参考）；② 主窗「文件」导航项与占位页从应用中删除（PlaceholderPage 组件一并移除）；③ §6.2 草案中 watched_dirs/files/files_fts 表定义删除；④ **保留** `session_files` 联动数据采集（服务 F6 Dashboard「最近文件」与 F1 会话反查，与文件系统扫描无关）；⑤ Everything 保留为开发机个人工具，与产品无关 | 用户裁决（§1.4/§3/§7.4） |
| 2026-07-05 | **M5 落地细节**：① `evt:ai:delta` 发送**累计全文**而非增量（渲染层整包替换、天然幂等，切页/慢订阅不丢字；40ms 节流合并降 IPC 压力）；② cli 引擎默认 `--tools ""` 纯问答 + `--no-session-persistence`（面板对话不涌入 F1 会话中心）；进程按对话长连（§7.5.1 裁决落地），意外退出时下一回合重拉新进程（上下文丢失属边角，接受）；③ `conv_fts` 用**独立 FTS5 表**（非 external-content）由 AiDao 显式增删——绕开 M1 在 messages_fts 踩过的手动同步与 FK 级联不触发触发器两个坑；conv_messages.content 存原文供渲染、FTS 存 CJK 切分形态；④ 新增 `T1DOO_CLAUDE_CMD` 测试注入（E2E 假 claude `scripts/fake-claude.cjs` 按 stream-json 协议回放，零额度消耗）——加入 E2E 隔离环境体系；必须用它而非 PATH 前置：resolveClaudeCommand 优先 .exe 会命中真实 claude；⑤ 任务队列 spawn 可注入供单测（状态机 6 项）；result 与 close 事件竞争以先落终态者为准，重复不落库；应用启动时残留 running/queued 任务统一标记失败 | M5 实装结论（§7.5） |
| 2026-07-07 | **M6 落地细节**：① i18n 自研轻量方案（零依赖）——`src/shared/i18n` 命名空间字典每条 `{zh,en}` 相邻存放，`keyof` 派生 key 联合类型、**en 完整性由 tsc 强制**；渲染层 I18nProvider 订阅 settings 即时切换，主进程模块单例 t()（托盘菜单语言变更时重建）；主进程侧在字符串**生成时**翻译（启动器条目/通知/错误），语言切换后下次生成即生效；日志与注释保持中文不入字典；② 首启引导四步中原「订阅目录」步骤随 F4 废弃删除，替换为语言选择步；`onboardingDone` 落 settings，五个 E2E 脚本预置 userData/settings.json 跳过向导覆盖层；③ 更新策略落地：autoDownload 后台下载 + 用户点「重启并安装」才 quitAndInstall（autoInstallOnAppQuit 兜底）；portable zip 不支持自动更新（NSIS-only），README 注明手动替换；④ 审计口径：常驻内存用**私有工作集**（任务管理器同口径）——WorkingSet64 对 8 进程 Chromium 树重复计共享页（686MB vs 259MB 实测差 2.6 倍）；开发机 %APPDATA% 常驻实例的 WAL 库外部只读打开会报 malformed schema（readonly 无法做 WAL recovery），量测走"隔离索引→干净退出→再读"路径 | M6 实装结论（§8/§10.3/§13） |
| 2026-07-07 | **v1.1 规划立项：F8 模型中心 + F9 用量中心（M7/M8，用户三点优化诉求 + cc-switch v3.16.5 源码调研）**。① 用户诉求：API 通道不能填第三方模型名、后端档案表单简陋、模型切换与用量都应从设置/Dashboard 独立成一级板块、用量要自定义时间范围与精美图表；② F8 方案（§7.7）：供应商档案 v2（预设模板/卡片墙一键切换/连通性测试 `backend:test`/模型列表拉取 `backend:models`/DEFAULT_{SONNET,OPUS} 映射补全），API 通道模型改组合框自由输入（Q4 边界不变，仍 Anthropic 协议）；全局切换（写 settings.json env 块）列 **Q8 待裁决**；③ F9 方案（§7.8）：新建 usage_log 独立采集管道——覆盖 subagents/wf_*（本机 ~43% 存量，F1 不入索引裁决不变）、按 message.id 去重（stop_reason 优先/output 最大）、「任一 token>0 计入」（cc-switch 实证旧口径低估 ~4.1%）、补采 cache_creation、面板来源并入且任务不双采；六档时间范围 + 小时/日/月自适应分桶；价目 Decimal 字符串存储 + 归一匹配 + 可编辑；成本口径沿 §7.6 不变（名义成本开关默认关）；④ 图表库裁决：Recharts（cc-switch 同款，gzip ~100KB 不威胁包体积预算）；⑤ 借鉴但明确不抄的部分：本地代理接管/格式转换（Anthropic↔OpenAI↔Gemini）、多应用管理（Codex/Gemini CLI）、云同步、在线预设市场——均超出 T1doo 定位（§1.4 非目标兼容） | 用户 2026-07-07 提出三点优化；cc-switch 调研报告（§7.7/§7.8/§9 M7-M8/R12-R13/Q8） |
| 2026-07-07 | **Q8 裁决通过 + hooks 退役（用户裁决，同日追加，plan 升 v1.6）**：① 全局切换转正——模型中心「一键切换」即写 `~/.claude/settings.json` env 键（cc-switch 同语义）；T1doo 管理键记账精确增删、冲突三选不静默覆盖、订阅态=移除管理键；按终端覆盖改走 `--settings` 内联 env（子进程 env vs settings env 优先级未见文档，M7 实测定案）；② **hooks 状态感知整体退役**（用户不喜欢该机制 + 经官方文档核实非必要）：替代=JSONL 事件驱动状态机（复用 F1 增量管道，尾部 tool_use 悬挂→waiting 启发式，permissionMode 抑制误报）+ OTEL spike（`claude_code.tool.blocked_on_user` 跨度存在但交互式 CLI 是否发出未证实）；HookServer/注册还原/设置开关/首启 hooks 步删除，升级自动清理既有 `/t1doo-hook` 注册；深合并/精确移除工具函数移交全局切换复用；③ 核实排除的替代路：`--settings` per-session hooks（文档不支持）、BEL 等待铃声（仍是 feature request #36850）；④ 「~/.claude 只读」唯一写入例外由 hooks 换为全局切换 env 键（§1.4/§11 修订）；⑤ 新增 M9（1 周），v1.1 周期 4→5 周（第 13-17 周）；⑥ 修复 §9 里程碑表 M7/M8 行与主表断开（多余空行） | 用户裁决 + claude-code-guide 官方文档核对（§7.7.5/§7.9/§9 M9/R2 关闭/R12/Q8） |
| 2026-07-07 | **M7 装包实测反馈迭代（用户三则）**：① 编辑器"拉取模型"对未保存档案无反应（原设计按 id 查已存 token）→ `backend:models` 改支持 ad-hoc `{baseUrl,token}` **即填即拉**，token 留空回落档案密文；② 预设精简 10→6 家（用户裁决：国产仅 DeepSeek/GLM/Kimi，聚合平台与其余国产暂缓）；预设模型升各家当前旗舰（DeepSeek deepseek-v4-pro / haiku 映射 v4-flash，对齐 cc-switch v3.16.5）；③ NSIS 一键安装不能选目录 → 改向导式（oneClick:false + allowToChangeInstallationDirectory）。另修 API 直连拉取 DeepSeek 失败的根因：厂商把 Anthropic 兼容层挂 `/anthropic` 类子路径而模型列表在根路径——probe 候选 URL 剥离兼容子路径追加根变体（cc-switch 同款），401/403 记录后继续试余下候选（归因 auth>http>notfound）；ai:models 失败报具体原因 | 用户装包实测反馈（§7.7.3/§7.7.4/§13） |
| 2026-07-07 | **M7 交付 + 落地实测四则**：① env 优先级实测（本机 2.1.196，双 mock 端点法零消耗）——settings.json env 块生效（CLAUDE_CONFIG_DIR 隔离验证）/ 子进程 env 更高 / `--settings` 更高 / **空串=未设置**（回落登录态）→ 按终端覆盖无需 --settings，显式覆盖时核心键置空中和全局块即可（§7.7.5 定案；`CORE_ENV_KEYS` 名单=BASE_URL/AUTH_TOKEN/API_KEY/MODEL/DEFAULT_{HAIKU,SONNET,OPUS}_MODEL）；② 全局切换落地 GlobalSwitchService + settings-env 纯函数：管理键记账 / 漂移检测（对比"由上次应用档案重新生成的期望值"，自家存储不落 token 明文）/ 原子写 temp+rename / 一键还原=按记账精确移除而非文件回滚（与 hooks 移除同口径）；编辑当前档案自动重写 live、当前生效档案禁删；save() 改 undefined=保留语义（顺带修 v1.0 setDefault 会清空 custom 档案字段的隐患）；③ 预设 10 家 URL 取自 cc-switch v3.16.5 实况（剥推广参数）；④ E2E 环境脆断档案：常驻安装版 T1doo 占用 Alt+Space → dev E2E 实例热键注册失败 → 「全局热键」标签追加红色错误提示 → getByText exact 断言超时——**E2E 文本断言须与环境相关状态解耦**（改前缀匹配 .first()）；安装版托盘实例无需退出（userData 隔离仍成立） | M7 实装结论（§7.7/§9 M7 行） |
| 2026-07-04 | **F4 文件中枢整体裁撤出 v1.0，M4 取消，总工期 14→12 周（用户裁决）**。① 处置：M4 当日已完整实现（订阅目录索引 worker+chokidar+FTS5 / 会话-文件联动 UI / Everything es.exe 桥 / 文件页与设置区块 / 15 项单测 / E2E 全绿），量化验收①-⑤全部达标——10 万文件全量索引 19-21s（<60s）、索引 DB 33MB（<50MB，FTS 只索引文件名不索引路径后从 43MB 降下来）、搜索 0.9-53ms（<100ms）、新建/改名 420ms 可搜（<2s）、主线程单批写库峰值 61ms；代码以单提交存档于 `feat/m4-files` 分支，**不合并、不删除**。② 裁撤动因：验收压测（10 万合成文件生成+索引，叠加 Everything 实时索引跟进）令开发机整机卡顿、风扇满载——"自建重索引"与轻量常驻工具定位的冲突有了体感证据；通用文件名搜索 Everything 本体已是天花板，自建订阅索引的边际价值不敌其资源/维护成本（§1.4"不与 Everything 竞争"这次彻底让位）。③ 保留：`session_files` 联动数据继续随 M1 会话同步零成本采集（解析 JSONL 顺带提取，不碰文件系统）；F4 移入 v1.1+ backlog，复活时从存档分支起步；主窗「文件」导航占位页 M6 打磨时降级处理。④ 开发机变更：Everything + es.exe 已 winget 装机，保留供日常使用（`winget uninstall voidtools.Everything voidtools.Everything.Cli` 可移除）。⑤ 压测坑档案（对 M5/M6 直接有用）：Win11 会把后台 shell 启动的进程树打入效率模式（EcoQoS），Electron 主进程的 setTimeout/setImmediate/worker 消息唤醒全部退化到秒级——主进程设计不可依赖定时器/消息往返做节流，压测须先把进程优先级拉回 Normal 再量测；Playwright `waitForFunction` 传 async 谓词会把 pending Promise 当 truthy 直接通过（假阳性），等待条件必须在 Node 侧显式轮询 | 开发机体感 + 定位复盘（§7.4 横幅 / §9 M4 行） |

---

## 附录 A：Claude Code 集成参考（本机实测）

> 实测环境：Claude Code **2.1.196**，Windows 11；2026-07-03 首测，2026-07-04 复测扩充（含无头实测与官方文档核对，记录见 A.6）。内部格式无兼容承诺，升级后以 fixtures 回归为准。

### A.1 `~/.claude` 目录（实测节选）

```
%USERPROFILE%\.claude\
├── projects\<slug>\<sessionId>.jsonl   # 主会话全文（核心数据源）
├── projects\<slug>\<sessionId>\         # 会话伴生目录（2026-07-04 实测；v1 不入索引）
│   ├── subagents\agent-*.jsonl          #   子代理转录
│   └── wf_*\...jsonl                    #   workflow 运行转录
├── history.jsonl                        # 全局输入历史
├── settings.json / settings.local.json # 设置与 hooks
├── todos\ tasks\ plans\ file-history\ shell-snapshots\ sessions\ ...
└── .credentials.json                    # 凭据（T1doo 硬性禁读）
```

### A.2 会话 JSONL 行结构（实测样例，已简化）

```jsonc
// type: "user" —— 用户消息行
{
  "type": "user",
  "uuid": "73cb6f4f-...",           // 消息唯一 ID
  "parentUuid": null,               // 父消息（树状结构/分支的依据）
  "sessionId": "91170f98-...",
  "timestamp": "2026-07-02T17:19:26.614Z",
  "cwd": "E:\\T1doo",               // 项目路径权威来源
  "gitBranch": "...",
  "version": "2.1.x",               // 写入方 Claude Code 版本
  "isSidechain": false,             // true = 子代理侧链
  "permissionMode": "auto",
  "message": { "role": "user", "content": "..." }   // content 可为 string 或块数组
}

// type: "assistant" —— 助手消息行：message 为 API 形态
// （content 块数组含 text/tool_use 等；含 model、usage.input_tokens/output_tokens —— token 统计来源）

// type: "queue-operation" —— 消息队列事件（enqueue/dequeue），非对话内容
// type: "ai-title" / "custom-title" —— 会话标题（AI 生成 / 用户命名）；2.1.196 全量扫描已无 "summary" 行
// type: "last-prompt" / "attachment" / "mode" / "permission-mode" / "agent-name" / "bridge-session"
//   —— 2026-07-04 新观测类型（分布见 §6.1），v1 白名单外跳过（attachment 留待评估）
// 其他类型（system / file-history-snapshot ...）：白名单外一律跳过
```

### A.3 `history.jsonl` 行结构（实测）

```json
{"display":"<用户输入>","pastedContents":{},"timestamp":1772120198320,"project":"C:\\Users\\Li Junhui","sessionId":"c9683bbd-..."}
```

### A.4 CLI 关键参数速查（v2.x）

| 用途 | 命令 |
|------|------|
| 恢复指定会话 | `claude --resume <sessionId>`（✅ 实测：同 id 追加原 JSONL；配合 `-d <cwd>` 的 wt 使用；`--fork-session` 才会另起新 id） |
| 继续最近会话 | `claude --continue` |
| 指定会话 ID 启动 | `claude --session-id <uuid>`（✅ 实测可用，T1doo 绑定用；注意仅见于 `--help`，官方文档未收录） |
| 无头执行 | `claude -p "<prompt>" --output-format stream-json --include-partial-messages` |
| 无头多轮（长连） | `claude -p --input-format stream-json --output-format stream-json`（F5 对话面板单进程复用） |
| 模型/权限 | `--model <id或别名>` / `--permission-mode default / acceptEdits / plan / dontAsk / auto / bypassPermissions` / `--dangerously-skip-permissions`（慎用） |
| 任务安全阀 | `--max-budget-usd <n>`（仅 -p）/ `--fallback-model <id>`（仅 -p，主模型过载自动降级） |
| 纯问答附加项 | `--tools ""`（禁全部工具）/ `--no-session-persistence`（不写会话历史，仅 -p）/ `--json-schema '<schema>'`（结构化输出） |
| 会话命名 | `-n, --name <name>`（显示名，出现在 /resume 列表与终端标题） |
| 任务进度事件 | `--include-hook-events`（hooks 生命周期事件并入 stream-json 输出） |
| 版本探测 | `claude --version`（实测输出 `2.1.196 (Claude Code)`） |
| 切换后端（✅ 已核实） | env 注入 `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`（优先于 `ANTHROPIC_API_KEY`，勿同设）+ `ANTHROPIC_MODEL`；小模型用 `ANTHROPIC_DEFAULT_HAIKU_MODEL`（`ANTHROPIC_SMALL_FAST_MODEL` 已弃用）；亦可 `--settings '<json>'` 内联 `env` 块（见 §7.2.6） |

### A.5 Hooks 配置骨架（settings.json）

```jsonc
{
  "hooks": {
    "UserPromptSubmit":  [ { "hooks": [ { "type": "command", "command": "<§7.2.4 上报命令>" } ] } ],
    "Stop":              [ { "hooks": [ { "type": "command", "command": "..." } ] } ],
    "PermissionRequest": [ { "hooks": [ { "type": "command", "command": "..." } ] } ],
    "Notification":      [ { "hooks": [ { "type": "command", "command": "..." } ] } ],
    "SessionStart":     [ { "hooks": [ { "type": "command", "command": "..." } ] } ],
    "SessionEnd":       [ { "hooks": [ { "type": "command", "command": "..." } ] } ]
  }
}
```

> 注册实现要求：JSON 深合并（不覆盖用户既有 hooks 及 `permissions`/`enabledPlugins`/`env` 等其它键）→ 写前备份 `settings.json.t1doo.bak` → 卸载/关闭功能时精确移除自己的条目。

### A.6 v1.1 实测记录（2026-07-04）

| 验证项 | 方法 | 结论 |
|--------|------|------|
| `--session-id` 新建会话 | 无头 `claude -p "..." --session-id <新uuid> --model haiku --output-format json` | ✅ result 事件 `session_id` 即指定 uuid；JSONL 落盘 `projects/<slug>/<uuid>.jsonl` |
| `--resume` 保持同 id | 同目录 `claude -p --resume <uuid> "..."` 后检查文件系统 | ✅ 追加写入同一文件、无新文件产生（`--fork-session` 才另起新 id） |
| result 事件字段 | 观察 `--output-format json` 输出 | 含 `session_id` / `total_cost_usd` / `usage`（含 cache_read/creation tokens）/ `modelUsage`（分模型成本）/ `num_turns` / `duration_ms` / `permission_denials` / `terminal_reason` |
| 行类型分布 | Node 流式全量扫描 270 个主会话 29,667 行（耗时 2.6s） | 分布见 §6.1；1 行坏行；无 `summary` 类型 |
| 数据规模 | 递归统计 `~/.claude/projects` | 28 项目；主会话 270 个 / 291MB；嵌套 `subagents`/`wf_*` 1,495 个 / 222MB |
| 环境依赖 | `Get-Command` 逐项探测 | node 24.13.1 ✅ / pnpm 11.1.3 ✅ / wt ✅ / curl.exe ✅ / Everything ❌ 未装（→ R11） |
| settings.json 现状 | 直接读取 | 无 hooks；含 `permissions`/`enabledPlugins`/`env`/`theme` 等键——深合并必须原样保留 |
| 后端环境变量 | 官方文档 model-config / env-vars 页核对 | 见 §7.2.6 ✅ 核实块（AUTH_TOKEN 优先级、SMALL_FAST_MODEL 弃用） |
| hooks 事件清单 | 官方文档 hooks 页核对 | `PermissionRequest`/`PostToolUseFailure`/`Setup` 已收录；`Notification` 未见于当前文档（→ §7.2.4 调整） |
| 模型与定价 | 官方参考资料复核 | §7.5.1 表无误；`claude-fable-5` $10/$50 存在（暂缓接入）；Opus 4.8/Sonnet 5/Fable 5 均无 temperature 参数 |

## 附录 B：常用命令速查

```powershell
# 初始化（M0 第一步）
git init ; pnpm create @quick-start/electron t1doo-app   # electron-vite 脚手架（以官方最新模板为准）
pnpm i ; pnpm dev

# 原生模块 rebuild（Electron 升级后必跑）
pnpm exec electron-rebuild -f -w node-pty,better-sqlite3

# 打包
pnpm build && pnpm exec electron-builder --win nsis portable

# 数据源快速自检
Get-ChildItem "$env:USERPROFILE\.claude\projects" | Sort LastWriteTime -Desc | Select -First 5
claude --version
```

---

*Plan.md v1.5 · 起草于 2026-07-03，同日据 §14.1 Q1–Q7 裁决升级 v1.0；2026-07-04 经本机无头实测 + 官方文档核对补强为 v1.1；同日 M0-M3 全部交付后，F4 文件中枢裁撤出 v1 升级 v1.2（Claude Fable 5）；2026-07-05 M5 AI 能力交付 + F4 彻底废弃（不再实现）升级 v1.3；2026-07-07 M6 打磨发布代码交付（i18n/首启引导/自动更新/发布流水线/§10.3 审计全达标）升级 v1.4；同日 v1.1 周期规划立项（F8 模型中心 + F9 用量中心 → M7/M8，参照 cc-switch 源码调研，§7.7/§7.8）升级 v1.5；同日 Q8 裁决通过（全局切换转正）+ hooks 退役决定（§7.9，新增 M9，v1.1 共 5 周）升级 v1.6。剩余：干净虚拟机全流程手动验证（v1.0 验收③）→ v1.0.0 tag + Release（验收④）→ M7 开工。*
