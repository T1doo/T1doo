-- F9 用量中心：usage_log 明细 + 增量游标 + 价目表（§7.8 / M8）

-- 用量明细：一行 = 一条 assistant 消息（按 message.id 去重，非 JSONL 行 uuid）
CREATE TABLE usage_log (
  message_id TEXT PRIMARY KEY,
  session_id TEXT,
  project_path TEXT,
  model TEXT,
  ts INTEGER,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  stop_reason TEXT,
  -- 'session' | 'subagent' | 'workflow' | 'api-panel' | 'cli-panel'
  source TEXT NOT NULL,
  -- T1doo 内 spawn 的会话可溯源到供应商档案；外部会话为 NULL
  backend_profile_id TEXT
);
CREATE INDEX idx_usage_ts ON usage_log(ts);
CREATE INDEX idx_usage_model ON usage_log(model, ts);

-- 独立增量游标（不与 F1 sessions 游标混用）：mtime 变化才重读，offset 续读半行容错
CREATE TABLE usage_sync (
  file_path TEXT PRIMARY KEY,
  mtime_ms INTEGER NOT NULL DEFAULT 0,
  byte_offset INTEGER NOT NULL DEFAULT 0
);

-- 价目表：单价一律 TEXT 存 Decimal 字符串（避免浮点误差）；
-- 内置行由代码在启动时播种/刷新（is_builtin=1），用户编辑即转为用户项（is_builtin=0）
CREATE TABLE model_pricing (
  model_id TEXT PRIMARY KEY,
  display_name TEXT,
  input_per_m TEXT NOT NULL DEFAULT '0',
  output_per_m TEXT NOT NULL DEFAULT '0',
  cache_read_per_m TEXT NOT NULL DEFAULT '0',
  cache_write_per_m TEXT NOT NULL DEFAULT '0',
  is_builtin INTEGER NOT NULL DEFAULT 0
);
