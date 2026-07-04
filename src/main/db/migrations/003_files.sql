-- F4 文件中枢：watched_dirs / files(+FTS5) / file_meta（§6.2 / §7.4）

CREATE TABLE watched_dirs (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  added_at INTEGER
);

CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  dir_id INTEGER NOT NULL REFERENCES watched_dirs(id) ON DELETE CASCADE,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  ext TEXT,
  size INTEGER,
  mtime INTEGER,
  -- 扫描代标记：全量重扫后据此清掉本轮未见到的旧行
  seen_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_files_dir ON files(dir_id);
CREATE INDEX idx_files_mtime ON files(mtime DESC);

-- 收藏/标签/打开记录与索引生命周期解耦：重扫、退订不丢用户数据，索引外路径（会话流/Everything）也可收藏
CREATE TABLE file_meta (
  path TEXT PRIMARY KEY,
  pinned INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  open_count INTEGER NOT NULL DEFAULT 0,
  last_opened_at INTEGER
);

-- 文件名 FTS：只索引 name（路径中缀检索由 LIKE 分支覆盖）——把 path 也入 FTS 会让
-- 10 万文件的索引体积逼近 50MB 预算、且写入时触发器成本翻倍拖垮主线程（M4 压测实证）。
-- 入索引经 seg_cjk（主进程注册的一元切分函数，与 messages_fts 同一套 R9 方案）
CREATE VIRTUAL TABLE files_fts USING fts5(
  name,
  content='files',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER files_ai AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, name) VALUES (new.id, seg_cjk(new.name));
END;
CREATE TRIGGER files_ad AFTER DELETE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, name) VALUES ('delete', old.id, seg_cjk(old.name));
END;
-- 只在 name 变化时刷 FTS：rescan 只更新 size/mtime/seen_at，不产生 FTS churn
CREATE TRIGGER files_au AFTER UPDATE OF name ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, name) VALUES ('delete', old.id, seg_cjk(old.name));
  INSERT INTO files_fts(rowid, name) VALUES (new.id, seg_cjk(new.name));
END;

-- session_files 反查按 Windows 习惯不分大小写匹配
CREATE INDEX idx_session_files_path_nocase ON session_files(path COLLATE NOCASE);
