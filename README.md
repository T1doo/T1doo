# T1doo

**Windows 桌面上的 Claude Code 编排与观测层** —— 会话中心、多终端托管、全局启动器、AI 对话与后台任务队列，一个常驻托盘的轻量工作台。

> 前置依赖：[Claude Code](https://docs.anthropic.com/claude-code)（`npm install -g @anthropic-ai/claude-code`）。T1doo 对 `~/.claude` 坚持只读（唯一例外是显式授权的 hooks 注册，写前备份、一键还原）。

## 功能

| 模块 | 说明 |
|------|------|
| **指挥台** | 活跃终端状态、今日/近 7 天 token 用量曲线、最近会话，默认首页 |
| **会话中心** | 自动索引 `~/.claude/projects` 全部历史会话；全文搜索（FTS5，中文一元切分）；详情回放（Markdown/工具调用/思考过程）；一键在内置或外部终端恢复续聊；导出 md/json |
| **内置终端** | node-pty + xterm 多标签/分屏；Claude 会话终端自动绑定 sessionId；hooks 实时状态（working / waiting / idle）+ 等待输入系统通知 |
| **全局启动器** | `Alt+Space` 唤起（可改绑）；秒跳项目/会话/终端/最近提示词；应用启动、URL/路径/搜索路由；`@ 问题` 直接向 AI 提问 |
| **AI 对话** | 双引擎——CLI（复用 Claude Code 登录态，零配置）/ API（直连 Anthropic，Key 走 DPAPI 加密）；流式渲染；历史落库可搜 |
| **任务队列** | 提交任务描述 → 无头 `claude -p` 后台执行（并发上限 2，`--max-budget-usd` 成本闸）→ 完成/失败通知，产物会话进会话中心 |
| **后端档案** | 订阅登录态开箱即用；自定义 Anthropic 兼容后端（baseURL + token）统一作用于终端/任务/CLI 引擎 |

界面 中文 / English 可切换；暗色 / 亮色主题。

## 安装

从 [Releases](https://github.com/T1doo/T1doo/releases) 下载：

- `T1doo-Setup-<version>.exe` —— NSIS 安装包（每用户安装，免管理员；支持自动更新，"提示后安装"不强更）
- `T1doo-<version>-win-x64-portable.zip` —— 免安装版（不含自动更新，手动替换升级）

> **SmartScreen 提示**：当前版本未做代码签名，首次运行如被 Windows SmartScreen 拦截，点「更多信息 → 仍要运行」。校验和见 Release 附带的 `SHA256SUMS.txt`。

首次启动有四步引导：语言选择 → 检测 Claude Code 并索引历史会话 → （可选）开启 hooks 实时状态感知 → 后端档案说明。

## 数据存储位置

应用数据集中在 `%APPDATA%\t1doo\`（安装版与 portable 版相同）：

| 文件 | 内容 |
|------|------|
| `t1doo.db`（+ `-wal` / `-shm`） | 唯一 SQLite 库：会话索引（含 FTS 全文索引）、AI 对话历史、后台任务记录、启动器 frecency 与应用索引（含图标缓存） |
| `t1doo.db.bak-v*` | 数据库迁移前的自动备份 |
| `settings.json` | 应用设置（主题 / 语言 / 热键 / 首启标记等） |
| `backend-profiles.json` | 后端档案（token 为 DPAPI 密文） |
| `ai-api.json` | API 引擎配置（Key 仅存 DPAPI 密文 `apiKeyEnc`） |
| `hooks.json` | hooks 开关状态与本机上报端口 / token |
| `Cache` / `GPUCache` 等目录 | Electron/Chromium 运行时缓存，非业务数据 |

会话原文（`~/.claude/projects/**/*.jsonl`）与提示词历史（`~/.claude/history.jsonl`）属于 Claude Code 本体，T1doo **只读取索引、从不修改**；唯一外部写入点是显式开启 hooks 时写 `~/.claude/settings.json`（写前备份 `settings.json.bak-t1doo`，关闭精确还原）。

- **完全重置**：删除 `%APPDATA%\t1doo` 整个目录，下次启动重新索引并重走首启引导；`~/.claude` 不受影响。
- **卸载行为**：NSIS 卸载**保留**该数据目录（重装续用历史）；如需彻底清除，卸载后手动删除即可。

## 安全与隐私

- 渲染进程 `contextIsolation` + `sandbox`，IPC 白名单
- API Key / 后端 token 经 Windows DPAPI 加密落盘，UI 仅显示尾 4 位，明文不出主进程
- `~/.claude` 只读；hooks 注册显式授权 + 写前备份（`.bak-t1doo`）+ 关闭精确还原；`.credentials.json` 硬编码黑名单绝不读取
- 命令一律 `spawn` 参数数组，不经 shell 拼接
- 零遥测、零上报

## 开发

```bash
pnpm install        # postinstall 自动 rebuild 原生模块（node-pty / better-sqlite3）
pnpm dev            # electron-vite dev + HMR
pnpm test           # vitest 单测
pnpm typecheck
pnpm lint
pnpm build:win      # NSIS + portable zip → dist/
```

E2E（playwright-core `_electron`，隔离 userData/DB/projects，假 claude 注入零额度）：

```bash
node scripts/e2e-smoke.cjs        # 启动→会话页→抽查渲染→搜索
node scripts/e2e-incremental.cjs  # 增量同步延迟
node scripts/e2e-terminal.cjs     # 多终端并发/hooks 状态流转/退出无孤儿
node scripts/e2e-launcher.cjs     # 启动器查询/执行
node scripts/e2e-ai.cjs           # AI 对话流式/任务队列闭环
node scripts/perf-audit.cjs       # §10.3 性能审计（需先 pnpm build:win）
```

技术栈：Electron 39 + electron-vite + React 19 + TypeScript strict + Tailwind 4 + better-sqlite3（FTS5）+ node-pty + xterm。架构与决策全记录见 [plan.md](plan.md)。

## License

私有项目，暂未开源发布。
