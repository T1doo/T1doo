# Changelog

按里程碑维护（SemVer；里程碑 tag `v0.1.0-m1` …，正式版 `v1.0.0` 起）。

## [Unreleased] — v1.0.0 候选（M6 打磨发布）

- **i18n**：全部 UI 文案 i18n 化，中文（默认）/ English 即时切换（含托盘、通知、启动器条目、导出模板与错误提示）
- **首启引导**：四步向导——语言 → 检测 Claude Code + 首次索引进度 → hooks 状态感知 opt-in → 后端档案说明
- **自动更新**：electron-updater + GitHub Releases，"提示后安装"不强更；设置页「关于与更新」
- **发布流水线**：tag push → 构建/测试 → NSIS + portable zip + SHA256SUMS + latest.yml → 草稿 Release
- **性能审计（§10.3 全达标)**：冷启动 0.83–1.18s（<3s）、常驻内存 259MB（<350MB）、CPU 空闲全机 0.03–0.05%（<1%）、搜索 0.1–0.4ms/21.8k 消息（<200ms@10 万）、安装包 98.6MB（<150MB）
- 文档：README 使用/开发指南、CHANGELOG

## v0.1.0-m5 — 2026-07-05（M5 AI 能力）

- AI 对话面板：流式 Markdown 渲染、双引擎（CLI 默认零配置 / API 直连，Key 走 DPAPI）、历史落库 FTS 可搜
- 任务队列最小闭环：无头 `claude -p` 后台执行、并发 2、成本闸、完成/失败通知、产物会话进会话中心
- 启动器 `@ 提问` 接通对话页
- F4 文件中枢彻底废弃（导航与占位页移除；`session_files` 联动数据保留）

## v0.1.0-m3 — 2026-07-04（M3 启动器）

- 全局热键唤起（预创建窗，`Alt+Space` 可改绑）；CC 对象秒跳（项目/会话/终端/最近提示词）
- 应用扫描（.lnk + UWP，169 应用实测 1.5s）+ 图标缓存；URL/路径/搜索/内部命令路由；frecency 排序

## v0.1.0-m2 — 2026-07-04（M2 内置终端）

- node-pty + xterm 多标签/分屏；Claude/PowerShell Profile；`--session-id` 预生成绑定
- 后端档案（订阅态 + 自定义 baseURL/token，DPAPI 加密）
- hooks 状态感知：注册/还原（写前备份、深合并保留用户配置）、working/waiting/idle 角标 + 等待输入通知

## v0.1.0-m1 — 2026-07-04（M1 会话中心）

- JSONL 白名单容错解析（worker 线程）；全量 + 增量同步（防抖 300ms，实测感知 323ms）
- SQLite + FTS5（中文一元切分，命中率追平 LIKE、零原生依赖）；271 会话/19k 消息实测入库
- 会话列表/搜索/详情回放/外部终端恢复/导出 md·json；`session_files` 文件联动采集

## v0.1.0-m0 — 2026-07-04（M0 工程奠基）

- electron-vite + React 19 + TS strict 脚手架；主窗/托盘/单实例/暗色主题；electron-store 设置
- ESLint/Prettier/CI（lint + typecheck + test + 打包）；electron-builder NSIS + zip 产物
