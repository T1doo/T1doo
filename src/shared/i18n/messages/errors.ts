import type { NsDict } from '../types'

/** 会流向 UI 的错误/提示文案（AI 引擎、API 配置、后端档案、hooks 等）；纯日志不入此表 */
export const errors = {
  // ---------- 全局热键（core/shortcut.ts） ----------
  'err.hotkeyOccupied': {
    zh: '热键 {accelerator} 已被其它程序占用',
    en: 'Hotkey {accelerator} is already in use by another program'
  },
  'err.hotkeyInvalid': {
    zh: '热键格式无效：{message}',
    en: 'Invalid hotkey format: {message}'
  },

  // ---------- 会话中心（ipc/sessions.ts、services/claude/sync.ts） ----------
  'err.sessionNotFound': {
    zh: '会话不存在：{id}',
    en: 'Session not found: {id}'
  },
  'err.sessionNoJsonl': {
    zh: '会话缺少 JSONL 路径：{id}',
    en: 'Session has no JSONL path: {id}'
  },

  // ---------- 启动器（ipc/launcher.ts） ----------
  'err.launcherInvalidItem': {
    zh: '无效条目',
    en: 'Invalid item'
  },

  // ---------- AI 对话（services/ai/*） ----------
  'err.turnInProgress': {
    zh: '该对话已有回合进行中',
    en: 'This conversation already has a turn in progress'
  },
  'err.turnInProgressWait': {
    zh: '该对话已有回合进行中，请先等待或停止',
    en: 'This conversation already has a turn in progress; please wait or stop it first'
  },
  'err.emptyMessage': {
    zh: '消息不能为空',
    en: 'Message cannot be empty'
  },
  'err.apiKeyMissing': {
    zh: '未配置 API Key：请在「设置 → AI 对话」填入 Anthropic API Key',
    en: 'API Key not configured: enter your Anthropic API Key in Settings → AI Chat'
  },
  'err.stopped': {
    zh: '已停止',
    en: 'Stopped'
  },
  'err.claudeStdinWriteFailed': {
    zh: '写入 claude 进程失败：{message}',
    en: 'Failed to write to the claude process: {message}'
  },
  'err.claudeSpawnFailed': {
    zh: 'claude 进程启动失败：{message}',
    en: 'Failed to start the claude process: {message}'
  },
  'err.claudeExitedUnexpected': {
    zh: 'claude 进程意外退出（code={code}）',
    en: 'claude process exited unexpectedly (code={code})'
  },
  'err.claudeReturnedError': {
    zh: 'claude 返回错误：{detail}',
    en: 'claude returned an error: {detail}'
  },
  /** 通用「：详情」后缀（zh/en 冒号不同，单独成键拼接） */
  'err.detailSuffix': {
    zh: '：{detail}',
    en: ': {detail}'
  },

  // ---------- API 引擎（services/ai/engine-api.ts） ----------
  'err.api401': {
    zh: 'API Key 无效或已被吊销（401）：请在设置页检查 Key',
    en: 'API Key is invalid or revoked (401): check the key in Settings'
  },
  'err.api403': {
    zh: '该 API Key 无权访问此模型（403）',
    en: 'This API Key has no access to this model (403)'
  },
  'err.api404': {
    zh: '模型不存在或端点不可用（404）：请检查模型与 baseUrl',
    en: 'Model not found or endpoint unavailable (404): check the model and baseUrl'
  },
  'err.api429': {
    zh: '触发限流（429）：请稍后重试',
    en: 'Rate limited (429): please try again later'
  },
  'err.apiConnection': {
    zh: '网络连接失败：请检查网络、代理或自定义 baseUrl',
    en: 'Network connection failed: check your network, proxy, or custom baseUrl'
  },
  'err.apiGeneric': {
    zh: 'Anthropic API 错误（{status}）：{message}',
    en: 'Anthropic API error ({status}): {message}'
  },
  'err.apiRefusal': {
    zh: '模型出于安全原因拒绝了本次请求',
    en: 'The model refused this request for safety reasons'
  },

  // ---------- 加密存储（services/ai/api-config.ts、services/backend/profiles.ts） ----------
  'err.dpapiApiKey': {
    zh: '系统加密（DPAPI）不可用，拒绝保存明文 API Key',
    en: 'System encryption (DPAPI) unavailable; refusing to store the API Key in plain text'
  },
  'err.dpapiToken': {
    zh: '系统加密（DPAPI）不可用，拒绝保存明文 token',
    en: 'System encryption (DPAPI) unavailable; refusing to store the token in plain text'
  },

  // ---------- 后台任务（services/ai/task-queue.ts） ----------
  'err.taskPromptEmpty': {
    zh: '任务描述不能为空',
    en: 'Task description cannot be empty'
  },
  'err.cwdNotFound': {
    zh: '工作目录不存在：{cwd}',
    en: 'Working directory does not exist: {cwd}'
  },
  'err.taskFailed': {
    zh: '任务执行失败',
    en: 'Task failed'
  },
  'err.processSpawnFailed': {
    zh: '进程启动失败：{message}',
    en: 'Failed to start the process: {message}'
  },
  'err.claudeExited': {
    zh: 'claude 进程退出（code={code}）',
    en: 'claude process exited (code={code})'
  },
  'err.outputTruncated': {
    zh: '…（输出过长，头部已截断）',
    en: '… (output too long, head truncated)'
  },
  'err.taskInterruptedByQuit': {
    zh: '应用退出导致任务中断',
    en: 'Task interrupted because the app exited'
  },

  // ---------- hooks（services/hooks/server.ts） ----------
  'err.hooksSettingsMalformed': {
    zh: 'settings.json 结构异常（非对象），拒绝写入',
    en: 'settings.json is malformed (not an object); refusing to write'
  },
  'err.hooksNotInitialized': {
    zh: 'hooks 端口/token 未初始化',
    en: 'hooks port/token not initialized'
  },

  // ---------- 终端（services/terminal/*） ----------
  'err.terminalNotFound': {
    zh: '终端不存在：{id}',
    en: 'Terminal not found: {id}'
  },
  'err.claudeNotFound': {
    zh: '未找到 claude 命令：请先安装 Claude Code 并确认其在 PATH 中',
    en: 'claude command not found: install Claude Code and make sure it is on PATH'
  }
} as const satisfies NsDict
