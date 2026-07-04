-- F3 启动器：apps（开始菜单扫描缓存）/ launch_history（frecency 记账）（§6.2）

CREATE TABLE apps (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                -- 'win32' | 'uwp'
  -- win32 = .lnk 绝对路径（启动 .lnk 本体，保留快捷方式的参数/工作目录）；uwp = AppUserModelID
  target TEXT NOT NULL UNIQUE,
  -- .lnk 解析出的 exe 路径（图标提取与去重用；uwp 为 NULL）
  exe_path TEXT,
  -- app.getFileIcon 提取的 data:image/png URL（uwp 无图标为 NULL）
  icon TEXT,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX idx_apps_name ON apps(name);

-- 所有启动器执行动作的流水（frecency 打分依据；定期裁剪）
CREATE TABLE launch_history (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL,                 -- LauncherItem.key（kind:target）
  ts INTEGER NOT NULL
);
CREATE INDEX idx_launch_history_key ON launch_history(key);
CREATE INDEX idx_launch_history_ts ON launch_history(ts);
