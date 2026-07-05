-- F5 AI 能力：对话面板落库（可全文搜索）+ 后台任务队列（§6.2 / §7.5）

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  engine TEXT NOT NULL,              -- 'cli' | 'api'
  model TEXT,
  backend_profile_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_conversations_updated ON conversations(updated_at);

CREATE TABLE conv_messages (
  id INTEGER PRIMARY KEY,
  conv_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                -- 'user' | 'assistant'
  content TEXT NOT NULL,             -- 原文（渲染用，不做 CJK 切分）
  input_tokens INTEGER,
  output_tokens INTEGER,
  ts INTEGER NOT NULL,
  error TEXT                         -- 回合出错中断时的错误信息
);
CREATE INDEX idx_conv_messages_conv ON conv_messages(conv_id);

-- 独立 FTS（非 external-content）：rowid = conv_messages.id，存 CJK 一元切分形态。
-- 规避 messages_fts 踩过的两个坑（external-content 手动同步、FK 级联删除不触发触发器）：
-- 增删都由 AiDao 显式维护，删除对话时先按 rowid 清 FTS 再删主表。
CREATE VIRTUAL TABLE conv_fts USING fts5(content_text, tokenize='unicode61');

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  cwd TEXT NOT NULL,
  status TEXT NOT NULL,              -- queued | running | done | failed | cancelled
  model TEXT,
  backend_profile_id TEXT,
  permission_mode TEXT,
  max_budget_usd REAL,
  session_id TEXT,                   -- 预生成 --session-id（产物会话进 F1 会话中心）
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  result_summary TEXT,               -- result 事件的 result 文本
  total_cost_usd REAL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  num_turns INTEGER,
  duration_ms INTEGER,
  error TEXT,
  output TEXT                        -- 完成后落盘的流式输出全文（运行中走内存缓冲）
);
CREATE INDEX idx_tasks_created ON tasks(created_at);
