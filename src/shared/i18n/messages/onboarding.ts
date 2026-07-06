import type { NsDict } from '../types'

/** 首启引导四步向导（M6 §8） */
export const onboarding = {
  'onboarding.skip': { zh: '跳过引导', en: 'Skip' },
  'onboarding.next': { zh: '下一步', en: 'Next' },
  'onboarding.back': { zh: '上一步', en: 'Back' },
  'onboarding.finish': { zh: '开始使用', en: 'Get started' },
  'onboarding.stepOf': { zh: '第 {n} / {total} 步', en: 'Step {n} of {total}' },

  // ① 欢迎 + 语言
  'onboarding.welcome.title': { zh: '欢迎使用 T1doo', en: 'Welcome to T1doo' },
  'onboarding.welcome.desc': {
    zh: 'Windows 桌面上的 Claude Code 编排与观测层：会话中心、多终端托管、全局启动器、AI 对话与后台任务。',
    en: 'An orchestration and observability layer for Claude Code on Windows: session center, managed terminals, global launcher, AI chat and background tasks.'
  },
  'onboarding.welcome.language': { zh: '选择界面语言', en: 'Choose interface language' },

  // ② 检测 Claude Code + 首次索引
  'onboarding.detect.title': { zh: '检测 Claude Code', en: 'Detect Claude Code' },
  'onboarding.detect.probing': { zh: '正在检测 claude 命令…', en: 'Probing the claude command…' },
  'onboarding.detect.found': { zh: '已找到：{version}', en: 'Found: {version}' },
  'onboarding.detect.notFound': {
    zh: '未找到 claude 命令。请先安装 Claude Code（npm install -g @anthropic-ai/claude-code），T1doo 的会话中心与终端功能依赖它；装好后可在此重试。',
    en: 'The claude command was not found. Install Claude Code first (npm install -g @anthropic-ai/claude-code) — the session center and terminals depend on it. Retry here once installed.'
  },
  'onboarding.detect.indexing': {
    zh: '正在索引历史会话… {done}/{total}',
    en: 'Indexing session history… {done}/{total}'
  },
  'onboarding.detect.indexDone': {
    zh: '历史会话索引完成',
    en: 'Session history indexed'
  },

  // ③ hooks 状态感知
  'onboarding.hooks.title': { zh: '实时状态感知（可选）', en: 'Real-time status awareness (optional)' },
  'onboarding.hooks.desc': {
    zh: '开启后向 ~/.claude/settings.json 注册 6 个 hook（仅上报到本机回环地址，Bearer 校验），终端与 Dashboard 可实时显示 working / waiting / idle，并在会话等待输入时通知你。写入前自动备份（.bak-t1doo），关闭时精确移除、既有配置原样保留。不开启则回退为文件轮询推断（延迟较高，无法识别等待状态）。',
    en: 'When enabled, registers 6 hooks in ~/.claude/settings.json (loopback-only reporting with Bearer verification) so terminals and the Dashboard show working / waiting / idle in real time and notify you when a session waits for input. A backup (.bak-t1doo) is made before writing; disabling removes only these hooks and keeps your existing config intact. If left off, T1doo falls back to file-polling inference (higher latency, cannot detect the waiting state).'
  },
  'onboarding.hooks.enable': { zh: '开启状态感知', en: 'Enable status awareness' },
  'onboarding.hooks.enabled': { zh: '已开启', en: 'Enabled' },
  'onboarding.hooks.failed': { zh: '开启失败：{error}', en: 'Failed to enable: {error}' },
  'onboarding.hooks.later': { zh: '稍后可在设置页随时开启或关闭。', en: 'You can toggle this anytime in Settings.' },

  // ④ 后端档案 + 完成
  'onboarding.backend.title': { zh: '后端档案（可选）', en: 'Backend profiles (optional)' },
  'onboarding.backend.desc': {
    zh: '已登录 Claude Code 订阅（含 Max）即开箱可用，无需任何配置。如需第三方 Anthropic 兼容后端（自定义 baseURL + token），可稍后在「设置 → 后端档案」添加，作用于终端、任务与 CLI 引擎对话。',
    en: 'If you are logged into a Claude Code subscription (including Max), everything works out of the box — no setup needed. To use a third-party Anthropic-compatible backend (custom baseURL + token), add it later in Settings → Backend profiles; it applies to terminals, tasks and CLI-engine chats.'
  },
  'onboarding.backend.hotkeyHint': {
    zh: '小提示：随时按 {hotkey} 唤起全局启动器，秒跳项目 / 会话 / 终端，或输入「@ 问题」直接提问。',
    en: 'Tip: press {hotkey} anytime to summon the global launcher — jump to projects / sessions / terminals instantly, or type "@ question" to ask the AI.'
  },
  'onboarding.backend.goSettings': { zh: '去设置页配置', en: 'Open Settings' }
} as const satisfies NsDict
