import fs from 'node:fs';
import path from 'node:path';

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

interface Store {
  watchlist: WatchItem[];
  monitor_runs: MonitorRun[];
  buy_signals: BuySignal[];
}

const dataDir = process.env.STOCK_MONITOR_DATA_DIR || path.join(process.cwd(), 'data');
const storePath = path.join(dataDir, 'monitor-data.json');
fs.mkdirSync(dataDir, { recursive: true });

function loadStore(): Store {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8')) as Partial<Store>;
    return {
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
      monitor_runs: Array.isArray(parsed.monitor_runs) ? parsed.monitor_runs : [],
      buy_signals: Array.isArray(parsed.buy_signals) ? parsed.buy_signals : [],
    };
  } catch {
    return { watchlist: [], monitor_runs: [], buy_signals: [] };
  }
}

let store = loadStore();
let writeTimer: NodeJS.Timeout | null = null;

function persist(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const tempPath = `${storePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf8');
    try { fs.renameSync(tempPath, storePath); } catch { fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8'); }
    writeTimer = null;
  }, 20);
}

export function getWatchlist(): WatchItem[] {
  return store.watchlist.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function addWatchItem(item: WatchItem): WatchItem {
  store.watchlist.push(item);
  persist();
  return item;
}

export function addWatchItemsBulk(items: WatchItem[]): number {
  store.watchlist.push(...items);
  persist();
  return items.length;
}

export function deleteWatchItem(id: string): boolean {
  const before = store.watchlist.length;
  store.watchlist = store.watchlist.filter(item => item.id !== id);
  if (store.watchlist.length !== before) persist();
  return store.watchlist.length !== before;
}

export function clearWatchlist(): void {
  store.watchlist = [];
  persist();
}

export function createMonitorRun(run: MonitorRun): MonitorRun {
  store.monitor_runs.push(run);
  persist();
  return run;
}

export function updateMonitorRun(id: string, updates: Partial<Pick<MonitorRun, 'status' | 'finished_at' | 'summary' | 'signals_json'>>): boolean {
  const run = store.monitor_runs.find(item => item.id === id);
  if (!run) return false;
  Object.assign(run, updates);
  persist();
  return true;
}

export function getRecentRuns(limit = 20): MonitorRun[] {
  return store.monitor_runs.slice().sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, limit);
}

export function createBuySignal(signal: BuySignal): BuySignal {
  store.buy_signals.push(signal);
  persist();
  return signal;
}

export function getRecentSignals(limit = 50): BuySignal[] {
  return store.buy_signals.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

export function getSignalsByRun(runId: string): BuySignal[] {
  return store.buy_signals.filter(signal => signal.run_id === runId);
}
