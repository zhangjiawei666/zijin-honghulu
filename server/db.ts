import { DatabaseSync } from 'node:sqlite';
import path from 'path';
// 兼容 CJS（esbuild 打包）与 ESM（tsx 开发）的目录获取。
// 手机版必须设置 STOCK_MONITOR_DATA_DIR；开发模式才会落到当前工作目录。
declare const __dirname: string;
const _dirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// 数据库文件路径（桌面打包版通过 STOCK_MONITOR_DATA_DIR 环境变量指定可写目录）
const dbPath = process.env.STOCK_MONITOR_DATA_DIR
  ? path.join(process.env.STOCK_MONITOR_DATA_DIR, 'chat.db')
  : path.join(_dirname, '..', 'data', 'chat.db');

// 确保 data 目录存在
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接（Node 22 内置 SQLite，无需原生编译）
const db = new DatabaseSync(dbPath);

// 启用 WAL 模式以提高性能
db.exec('PRAGMA journal_mode = WAL');

// 初始化数据库表
db.exec(`
  -- 会话表
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    sdk_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 消息表
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL,
    tool_calls TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- 为会话 ID 创建索引
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

  -- 自选股表（行情监控）
  CREATE TABLE IF NOT EXISTS watchlist (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- 监控运行记录表
  CREATE TABLE IF NOT EXISTS monitor_runs (
    id TEXT PRIMARY KEY,
    trigger TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    summary TEXT,
    signals_json TEXT
  );

  -- 买点信号表
  CREATE TABLE IF NOT EXISTS buy_signals (
    id TEXT PRIMARY KEY,
    run_id TEXT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    price REAL,
    signal_type TEXT,
    reason TEXT,
    source TEXT,
    created_at TEXT NOT NULL
  );

  -- 索引
  CREATE INDEX IF NOT EXISTS idx_monitor_runs_started ON monitor_runs(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_buy_signals_created ON buy_signals(created_at DESC);

  -- 板块效应每日数据表（矩阵格式历史存储，含休市日，保证日期轴完整）
  CREATE TABLE IF NOT EXISTS sector_effect_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,           -- YYYYMMDD 日期（含休市日）
    day_type TEXT NOT NULL DEFAULT 'trading',  -- trading 交易日 / weekend 周末休市 / holiday 法定节假日休市
    sectors_json TEXT NOT NULL,          -- JSON: [{name:"机器人", count:7}, ...] 按count降序；休市日为 []
    total_limit_up INTEGER DEFAULT 0,    -- 当日涨停总数
    source TEXT,                         -- 数据来源说明
    substituted_date TEXT,               -- 实际数据日期（非交易日回溯时不同于date）
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sector_effect_date ON sector_effect_daily(date DESC);

  -- 应用元信息（key-value）。用于记录内置历史基线的同步版本，
  -- 使新版基线发布后能自动重新导入，而不用用户手工点「强制导入」。
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// ============= 应用元信息（key-value）=============

/** 读取元信息，不存在返回 null */
export function getMeta(key: string): string | null {
  const stmt = db.prepare('SELECT value FROM app_meta WHERE key = ?');
  const row = stmt.get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

/** 写入元信息（UPSERT） */
export function setMeta(key: string, value: string): void {
  const stmt = db.prepare(`
    INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
  `);
  const now = new Date().toISOString();
  stmt.run(key, value, now, value, now);
}

// 迁移：为早期版本创建的表补上 day_type 列
try {
  const secTableInfo = db.prepare("PRAGMA table_info(sector_effect_daily)").all() as Array<{ name: string }>;
  if (secTableInfo.length > 0 && !secTableInfo.some(col => col.name === 'day_type')) {
    db.exec("ALTER TABLE sector_effect_daily ADD COLUMN day_type TEXT NOT NULL DEFAULT 'trading'");
    console.log("[DB] Added day_type column to sector_effect_daily table");
  }
} catch (e) {
  // 忽略错误（列可能已存在或表尚未创建）
}

// 数据库迁移：添加 sdk_session_id 列（如果不存在）
try {
  const tableInfo = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  const hasColumn = tableInfo.some(col => col.name === 'sdk_session_id');
  if (!hasColumn) {
    db.exec("ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT");
    console.log("[DB] Added sdk_session_id column to sessions table");
  }
} catch (e) {
  // 忽略错误（列可能已存在）
}

// 类型定义
export interface DbSession {
  id: string;
  title: string;
  model: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  created_at: string;
  tool_calls: string | null;
}

// ============= 会话操作 =============

// 获取所有会话
export function getAllSessions(): DbSession[] {
  const stmt = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC');
  return stmt.all() as unknown as DbSession[];
}

// 获取单个会话
export function getSession(id: string): DbSession | undefined {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  return stmt.get(id) as DbSession | undefined;
}

// 创建会话
export function createSession(session: DbSession): DbSession {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, title, model, sdk_session_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(session.id, session.title, session.model, session.sdk_session_id, session.created_at, session.updated_at);
  return session;
}

// 更新会话
export function updateSession(id: string, updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.model !== undefined) {
    fields.push('model = ?');
    values.push(updates.model);
  }
  if (updates.sdk_session_id !== undefined) {
    fields.push('sdk_session_id = ?');
    values.push(updates.sdk_session_id);
  }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  
  const stmt = db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

// 删除会话
export function deleteSession(id: string): boolean {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============= 消息操作 =============

// 获取会话的所有消息
export function getMessagesBySession(sessionId: string): DbMessage[] {
  const stmt = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC');
  return stmt.all(sessionId) as unknown as DbMessage[];
}

// 创建消息
export function createMessage(message: DbMessage): DbMessage {
  const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    message.id,
    message.session_id,
    message.role,
    message.content,
    message.model,
    message.created_at,
    message.tool_calls
  );
  
  // 更新会话的 updated_at
  const updateStmt = db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?');
  updateStmt.run(new Date().toISOString(), message.session_id);
  
  return message;
}

// 更新消息内容
export function updateMessage(id: string, updates: Partial<Pick<DbMessage, 'content' | 'tool_calls'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.tool_calls !== undefined) {
    fields.push('tool_calls = ?');
    values.push(updates.tool_calls);
  }
  
  if (fields.length === 0) return false;
  
  values.push(id);
  
  const stmt = db.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

// 删除消息
export function deleteMessage(id: string): boolean {
  const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// 批量创建消息（用于保存对话）
export function createMessages(messages: DbMessage[]): void {
  const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const msg of messages) {
      stmt.run(msg.id, msg.session_id, msg.role, msg.content, msg.model, msg.created_at, msg.tool_calls);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// 清空所有数据
export function clearAllData(): void {
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM sessions');
}

// ============= 自选股操作（行情监控） =============

export interface WatchItem {
  id: string;
  code: string;
  name: string;
  created_at: string;
}

export interface MonitorRun {
  id: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  summary: string | null;
  signals_json: string | null;
}

export interface BuySignal {
  id: string;
  run_id: string | null;
  code: string;
  name: string;
  price: number | null;
  signal_type: string;
  reason: string;
  source: string;
  created_at: string;
}

// 获取全部自选股
export function getWatchlist(): WatchItem[] {
  const stmt = db.prepare('SELECT * FROM watchlist ORDER BY created_at ASC');
  return stmt.all() as unknown as WatchItem[];
}

// 添加自选股
export function addWatchItem(item: WatchItem): WatchItem {
  const stmt = db.prepare(`
    INSERT INTO watchlist (id, code, name, created_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(item.id, item.code, item.name, item.created_at);
  return item;
}

// 批量添加自选股（事务，返回成功插入的条数）
export function addWatchItemsBulk(items: WatchItem[]): number {
  if (items.length === 0) return 0;
  const stmt = db.prepare(`
    INSERT INTO watchlist (id, code, name, created_at)
    VALUES (?, ?, ?, ?)
  `);
  db.exec('BEGIN');
  try {
    for (const item of items) {
      stmt.run(item.id, item.code, item.name, item.created_at);
    }
    db.exec('COMMIT');
    return items.length;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// 删除自选股
export function deleteWatchItem(id: string): boolean {
  const stmt = db.prepare('DELETE FROM watchlist WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// 清空自选股
export function clearWatchlist(): void {
  db.exec('DELETE FROM watchlist');
}

// 创建监控运行记录
export function createMonitorRun(run: MonitorRun): MonitorRun {
  const stmt = db.prepare(`
    INSERT INTO monitor_runs (id, trigger, status, started_at, finished_at, summary, signals_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(run.id, run.trigger, run.status, run.started_at, run.finished_at, run.summary, run.signals_json);
  return run;
}

// 更新监控运行记录
export function updateMonitorRun(id: string, updates: Partial<Pick<MonitorRun, 'status' | 'finished_at' | 'summary' | 'signals_json'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.finished_at !== undefined) { fields.push('finished_at = ?'); values.push(updates.finished_at); }
  if (updates.summary !== undefined) { fields.push('summary = ?'); values.push(updates.summary); }
  if (updates.signals_json !== undefined) { fields.push('signals_json = ?'); values.push(updates.signals_json); }

  if (fields.length === 0) return false;
  values.push(id);
  const stmt = db.prepare(`UPDATE monitor_runs SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

// 获取最近运行记录
export function getRecentRuns(limit = 20): MonitorRun[] {
  const stmt = db.prepare('SELECT * FROM monitor_runs ORDER BY started_at DESC LIMIT ?');
  return stmt.all(limit) as unknown as MonitorRun[];
}

// 创建买点信号
export function createBuySignal(signal: BuySignal): BuySignal {
  const stmt = db.prepare(`
    INSERT INTO buy_signals (id, run_id, code, name, price, signal_type, reason, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(signal.id, signal.run_id, signal.code, signal.name, signal.price, signal.signal_type, signal.reason, signal.source, signal.created_at);
  return signal;
}

// 获取最近买点信号
export function getRecentSignals(limit = 50): BuySignal[] {
  const stmt = db.prepare('SELECT * FROM buy_signals ORDER BY created_at DESC LIMIT ?');
  return stmt.all(limit) as unknown as BuySignal[];
}

// 获取某次运行的信号
export function getSignalsByRun(runId: string): BuySignal[] {
  const stmt = db.prepare('SELECT * FROM buy_signals WHERE run_id = ? ORDER BY created_at ASC');
  return stmt.all(runId) as unknown as BuySignal[];
}

// ============= 板块效应每日数据操作 =============

export interface SectorEffectDaily {
  id?: number;
  date: string;            // YYYYMMDD
  day_type: 'trading' | 'weekend' | 'holiday';  // 交易日 / 周末休市 / 法定节假日休市
  sectors_json: string;    // JSON array of {name, count}
  total_limit_up: number;
  source: string | null;
  substituted_date: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 获取板块效应历史记录（**按日期正序**，最早的在前）。
 *
 * 注意：这里先用子查询按 DESC 取最近 limit 天、再整体 ASC 反转，
 * 才能在保证「始终保留最新数据」的前提下实现正序输出。
 * 若直接 ORDER BY date ASC LIMIT n，数据超过 limit 时会把最新日期截掉。
 */
export function getSectorEffectAll(limit = 400): SectorEffectDaily[] {
  const stmt = db.prepare(
    'SELECT * FROM (SELECT * FROM sector_effect_daily ORDER BY date DESC LIMIT ?) ORDER BY date ASC'
  );
  return stmt.all(limit) as unknown as SectorEffectDaily[];
}

/** 根据日期获取单条记录 */
export function getSectorEffectByDate(date: string): SectorEffectDaily | undefined {
  const stmt = db.prepare('SELECT * FROM sector_effect_daily WHERE date = ?');
  return stmt.get(date) as SectorEffectDaily | undefined;
}

/** 新增或更新某日的板块效应数据（UPSERT） */
export function upsertSectorEffect(data: SectorEffectDaily): void {
  const existing = getSectorEffectByDate(data.date);
  const now = new Date().toISOString();
  const dayType = data.day_type || 'trading';
  if (existing) {
    const stmt = db.prepare(`
      UPDATE sector_effect_daily
      SET day_type = ?, sectors_json = ?, total_limit_up = ?, source = ?, substituted_date = ?, updated_at = ?
      WHERE date = ?
    `);
    stmt.run(dayType, data.sectors_json, data.total_limit_up, data.source, data.substituted_date, now, data.date);
  } else {
    const stmt = db.prepare(`
      INSERT INTO sector_effect_daily (date, day_type, sectors_json, total_limit_up, source, substituted_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(data.date, dayType, data.sectors_json, data.total_limit_up, data.source, data.substituted_date, now, now);
  }
}

/** 删除某日的板块效应记录 */
export function deleteSectorEffect(date: string): boolean {
  const stmt = db.prepare('DELETE FROM sector_effect_daily WHERE date = ?');
  const result = stmt.run(date);
  return result.changes > 0;
}

export default db;
