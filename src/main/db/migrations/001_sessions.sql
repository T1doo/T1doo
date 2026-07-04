-- F1 会话中心：projects / sessions / messages(+FTS5) / session_files（§6.2）

CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  slug TEXT,
  last_active_at INTEGER
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  title TEXT,
  -- 标题来源优先级：custom > ai > first-user（增量同步时按优先级决定是否覆盖）
  title_source TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  message_count INTEGER NOT NULL DEFAULT 0,
  model_last TEXT,
  git_branch TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  jsonl_path TEXT,
  jsonl_size INTEGER NOT NULL DEFAULT 0,
  jsonl_offset INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  cc_version TEXT
);
CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);

CREATE TABLE messages (
  uuid TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parent_uuid TEXT,
  role TEXT,
  type TEXT,
  ts INTEGER,
  content_text TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  is_sidechain INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_messages_session ON messages(session_id);

-- external content FTS：不会自动同步，由触发器维护（§6.2 注意事项）
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content_text,
  content='messages',
  content_rowid='rowid',
  tokenize='unicode61'
);

CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content_text) VALUES (new.rowid, new.content_text);
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content_text)
  VALUES ('delete', old.rowid, old.content_text);
END;
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content_text)
  VALUES ('delete', old.rowid, old.content_text);
  INSERT INTO messages_fts(rowid, content_text) VALUES (new.rowid, new.content_text);
END;

-- 会话-文件联动（F4 核心数据，M1 起采集）
CREATE TABLE session_files (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  op TEXT NOT NULL,
  message_uuid TEXT,
  ts INTEGER
);
CREATE INDEX idx_session_files_path ON session_files(path);
CREATE INDEX idx_session_files_session ON session_files(session_id);
