import https from 'node:https';
import { v4 as uuidv4 } from 'uuid';
import type { Response as ExpressResponse } from 'express';
import * as db from './db-win7.js';

const TRADING_SESSIONS = [
  { start: 9 * 60 + 30, end: 11 * 60 + 30 },
  { start: 13 * 60, end: 15 * 60 },
];
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const TICK_MS = 30 * 1000;

export interface MonitorStatus {
  enabled: boolean;
  isTradingTime: boolean;
  isTradingDay: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  isRunning: boolean;
  watchCount: number;
  lastRunSummary: string | null;
  source: string;
}

export interface MonitorEvent {
  type: string;
  [key: string]: unknown;
}

function requestOnce(url: string, timeoutMs: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => {
        if ((response.statusCode || 500) >= 200 && (response.statusCode || 500) < 300) resolve(Buffer.concat(chunks));
        else reject(new Error(`HTTP ${response.statusCode || 0}`));
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('请求超时')));
    request.on('error', reject);
  });
}

/** 腾讯行情返回 GBK 编码，Electron 22 内置 Node 16 支持 TextDecoder('gbk')，逐级降级保证 Win7 可用 */
function decodeGbk(buffer: Buffer): string {
  for (const encoding of ['gbk', 'gb18030', 'utf-8']) {
    try { return new TextDecoder(encoding).decode(buffer); } catch { /* 继续尝试下一种编码 */ }
  }
  return buffer.toString('utf8');
}

async function requestText(url: string, timeoutMs = 15000, retries = 2): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try { return await requestOnce(url, timeoutMs); }
    catch (error) { lastError = error; if (attempt + 1 < retries) await new Promise<void>(resolve => setTimeout(resolve, 800)); }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function toMarketCode(code: string): string {
  const c = code.trim().toLowerCase();
  if (/^(sh|sz|bj)/.test(c)) return c;
  if (/^6|^9/.test(c)) return `sh${c}`;
  if (/^4|^8/.test(c)) return `bj${c}`;
  return `sz${c}`;
}

export interface RealtimeQuote {
  name: string;
  price: number;
  changePct: number;
}

export async function fetchRealtimeQuotes(codes: string[]): Promise<Map<string, RealtimeQuote>> {
  const result = new Map<string, RealtimeQuote>();
  if (!codes.length) return result;
  const url = `https://qt.gtimg.cn/q=${codes.join(',')}`;
  const text = decodeGbk(await requestText(url));
  const matches = text.match(/v_(\w+)="([^"]*)"/g) || [];
  for (const match of matches) {
    const parsed = match.match(/^v_(\w+)="([^"]*)"/);
    if (!parsed) continue;
    const fields = parsed[2].split('~');
    if (fields.length < 35) continue;
    // 腾讯字段索引：1=名称 3=当前价 4=昨收 31=涨跌额 32=涨跌幅% 33=最高 34=最低
    const price = parseFloat(fields[3]) || 0;
    const prevClose = parseFloat(fields[4]) || 0;
    const parsedPct = parseFloat(fields[32]);
    const changePct = Number.isFinite(parsedPct)
      ? parsedPct
      : (prevClose > 0 ? Number((((price - prevClose) / prevClose) * 100).toFixed(2)) : 0);
    result.set(parsed[1], {
      name: fields[1],
      price,
      changePct,
    });
  }
  return result;
}

export async function fetchStockNames(codes: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const quotes = await fetchRealtimeQuotes(codes.map(toMarketCode));
  codes.forEach(code => {
    const quote = quotes.get(toMarketCode(code));
    if (quote?.name && !quote.name.includes('�')) result.set(code, quote.name.replace(/\s+/g, ''));
  });
  return result;
}

interface KlineBar { date: string; open: number; close: number; high: number; low: number; volume: number; }

export async function fetchDailyKline(marketCode: string, days = 70): Promise<KlineBar[]> {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${marketCode},day,,,${days},qfq`;
  const json = JSON.parse((await requestText(url)).toString('utf8')) as any;
  const raw: any[] = json?.data?.[marketCode]?.qfqday || json?.data?.[marketCode]?.day || [];
  return raw.map(row => ({
    date: String(row[0]), open: parseFloat(row[1]), close: parseFloat(row[2]),
    high: parseFloat(row[3]), low: parseFloat(row[4]), volume: parseFloat(row[5]) || 0,
  }));
}

function calcMA(closes: number[], period: number, index: number): number | null {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i += 1) sum += closes[i];
  return sum / period;
}

function detectBuySignals(bars: KlineBar[]): Array<{ type: string; reason: string }> {
  if (bars.length < 25) return [];
  const closes = bars.map(bar => bar.close);
  const lows = bars.map(bar => bar.low);
  const highs = bars.map(bar => bar.high);
  const volumes = bars.map(bar => bar.volume);
  const i = closes.length - 1;
  const ma5 = calcMA(closes, 5, i);
  const ma10 = calcMA(closes, 10, i);
  const ma20 = calcMA(closes, 20, i);
  const ma60 = calcMA(closes, 60, i);
  const volAvg5 = (index: number) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, index - 5); j < index; j += 1) { sum += volumes[j]; count += 1; }
    return count ? sum / count : 0;
  };
  const volBase = volAvg5(i);
  const volRatio = volBase > 0 ? volumes[i] / volBase : 1;
  const dropPct = i > 0 ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;
  const price = closes[i];
  const fmt = (value: number) => `¥${value.toFixed(2)}`;
  const signals: Array<{ type: string; reason: string }> = [];

  if (ma10 !== null && i >= 2) {
    let prevShrinkDown = false;
    for (let j = Math.max(1, i - 3); j < i; j += 1) {
      const base = volAvg5(j);
      if (closes[j] < closes[j - 1] && base > 0 && volumes[j] / base < 0.8) { prevShrinkDown = true; break; }
    }
    if (closes[i] > ma10 && prevShrinkDown && volRatio >= 1.5 && closes[i] > closes[i - 1]) {
      signals.push({ type: '短线十五法/买点1', reason: `参考均线:MA10 最新价:${fmt(price)} 10日均线上方缩量下跌后爆量买（量比${volRatio.toFixed(2)}）` });
    }
  }

  if (ma5 !== null) {
    let prevExplode = false;
    for (let j = Math.max(0, i - 5); j < i; j += 1) {
      const base = volAvg5(j);
      if (base > 0 && volumes[j] / base >= 1.5) { prevExplode = true; break; }
    }
    if (closes[i] > ma5 && prevExplode && volRatio < 0.8 && dropPct > -0.02) {
      signals.push({ type: '短线十五法/买点2', reason: `参考均线:MA5 最新价:${fmt(price)} 5日均线上方爆量之后缩量买（量比${volRatio.toFixed(2)}）` });
    }
  }

  if (ma10 !== null) {
    const riseStart = Math.max(0, i - 20);
    const risePct = closes[i] / closes[riseStart] - 1;
    const lowNear = Math.abs(lows[i] - ma10) / ma10 < 0.03;
    const recover = lows[i] < ma10 && closes[i] >= ma10;
    if (closes[i] >= ma10 && (lowNear || recover) && risePct >= 0.15) {
      signals.push({ type: '短线十五法/买点3', reason: `参考均线:MA10 最新价:${fmt(price)} 主升之后回踩MA10买（20日涨幅${(risePct * 100).toFixed(1)}%）` });
    }
  }

  const checkMidBuy1 = (ma: number | null, name: string, period: number) => {
    if (ma === null) return;
    let broke = false;
    for (let j = Math.max(0, i - 5); j < i; j += 1) {
      const maJ = calcMA(closes, period, j);
      if (maJ !== null && closes[j] < maJ) { broke = true; break; }
    }
    const lowNear = Math.abs(lows[i] - ma) / ma < 0.03;
    const recover = lows[i] < ma && closes[i] >= ma;
    if (closes[i] >= ma && (lowNear || recover) && !broke) {
      signals.push({ type: '中线六二法/买点1', reason: `参考均线:${name} 最新价:${fmt(price)} 首次回踩${name}(5日内未破)` });
    }
  };
  checkMidBuy1(ma20, 'MA20', 20);
  checkMidBuy1(ma60, 'MA60', 60);

  const checkMidBuy2 = (ma: number | null, name: string) => {
    if (ma === null || i < 5) return;
    let maxPrice = 0;
    let minPrice = Infinity;
    for (let j = i - 5; j < i; j += 1) { maxPrice = Math.max(maxPrice, highs[j]); minPrice = Math.min(minPrice, lows[j]); }
    const amplitude = minPrice > 0 ? (maxPrice - minPrice) / minPrice : 1;
    const nearMA = Math.abs(closes[i] - ma) / ma < 0.04;
    if (amplitude < 0.06 && volRatio >= 1.5 && closes[i] > closes[i - 1] && nearMA) {
      signals.push({ type: '中线六二法/买点2', reason: `参考均线:${name} 最新价:${fmt(price)} ${name}附近震荡整理后爆量买（量比${volRatio.toFixed(2)}）` });
    }
  };
  checkMidBuy2(ma20, 'MA20');
  checkMidBuy2(ma60, 'MA60');
  return signals;
}

class MonitorService {
  private enabled = true;
  private timer: NodeJS.Timeout | null = null;
  private lastRunAt: number | null = null;
  private running = false;
  private clients = new Set<ExpressResponse>();
  private source = 'builtin';

  isTradingDay(date: Date): boolean { const day = date.getDay(); return day >= 1 && day <= 5; }
  isTradingTime(date: Date): boolean {
    if (!this.isTradingDay(date)) return false;
    const minutes = date.getHours() * 60 + date.getMinutes();
    return TRADING_SESSIONS.some(session => minutes >= session.start && minutes <= session.end);
  }
  start(): void { if (this.timer) return; this.timer = setInterval(() => this.tick(), TICK_MS); this.tick(); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  setEnabled(enabled: boolean): void { this.enabled = enabled; this.broadcast('monitor_toggle', { enabled }); }
  isEnabled(): boolean { return this.enabled; }
  addClient(res: ExpressResponse): void {
    res.write('retry: 10000\n\n');
    this.clients.add(res);
    const heartbeat = setInterval(() => { if (this.clients.has(res)) res.write(': ping\n\n'); else clearInterval(heartbeat); }, 15000);
    res.on('close', () => { clearInterval(heartbeat); this.clients.delete(res); });
  }
  private broadcast(type: string, data: Record<string, unknown> = {}): void {
    const event: MonitorEvent = { type, ...data, timestamp: new Date().toISOString() };
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) { try { client.write(payload); } catch { this.clients.delete(client); } }
  }
  private async tick(): Promise<void> {
    if (!this.enabled || this.running) return;
    const now = new Date();
    if (this.isTradingTime(now) && (!this.lastRunAt || now.getTime() - this.lastRunAt >= CHECK_INTERVAL_MS)) await this.runCheck('schedule');
  }
  getStatus(): MonitorStatus {
    const latest = db.getRecentRuns(1);
    return { enabled: this.enabled, isTradingTime: this.isTradingTime(new Date()), isTradingDay: this.isTradingDay(new Date()), lastRunAt: this.lastRunAt ? new Date(this.lastRunAt).toISOString() : null, nextRunAt: this.lastRunAt ? new Date(this.lastRunAt + CHECK_INTERVAL_MS).toISOString() : null, isRunning: this.running, watchCount: db.getWatchlist().length, lastRunSummary: latest[0]?.summary || null, source: this.source };
  }
  async runCheck(trigger: 'schedule' | 'manual' | 'startup'): Promise<{ runId: string; signals: db.BuySignal[]; summary: string }> {
    if (this.running) return { runId: '', signals: [], summary: '已有巡检正在进行' };
    this.running = true;
    const items = db.getWatchlist();
    const runId = uuidv4();
    db.createMonitorRun({ id: runId, trigger, status: 'running', started_at: new Date().toISOString(), finished_at: null, summary: null, signals_json: null });
    this.broadcast('monitor_run_start', { runId, trigger, watchCount: items.length });
    const signals: db.BuySignal[] = [];
    try {
      const quotes = await fetchRealtimeQuotes(items.map(item => toMarketCode(item.code)));
      const priority: Record<string, number> = { '中线六二法/买点1': 1, '短线十五法/买点1': 2, '短线十五法/买点2': 3, '短线十五法/买点3': 4, '中线六二法/买点2': 5 };
      const best = new Map<string, db.BuySignal>();
      for (const item of items) {
        try {
          const marketCode = toMarketCode(item.code);
          const quote = quotes.get(marketCode);
          const bars = await fetchDailyKline(marketCode);
          for (const signal of detectBuySignals(bars)) {
            const candidate: db.BuySignal = { id: uuidv4(), run_id: runId, code: item.code, name: quote?.name && !quote.name.includes('�') ? quote.name : item.name, price: quote?.price ?? null, signal_type: signal.type, reason: signal.reason, source: 'builtin', created_at: new Date().toISOString() };
            const old = best.get(item.code);
            if (!old || (priority[candidate.signal_type] || 99) < (priority[old.signal_type] || 99)) best.set(item.code, candidate);
          }
        } catch (error) { console.error(`[Win7 Monitor] 获取 ${item.code} 失败:`, error); }
      }
      signals.push(...Array.from(best.values()));
    } finally {
      this.running = false;
      this.lastRunAt = Date.now();
    }
    for (const signal of signals) db.createBuySignal(signal);
    const summary = signals.length ? `发现 ${signals.length} 个买点：${signals.map(s => `${s.name}(${s.code})`).join('、')}` : '未发现买点';
    db.updateMonitorRun(runId, { status: 'finished', finished_at: new Date().toISOString(), summary, signals_json: JSON.stringify(signals) });
    this.broadcast('monitor_run_finished', { runId, summary, signalCount: signals.length, source: 'builtin' });
    signals.forEach(signal => this.broadcast('buy_signal', { signal }));
    return { runId, signals, summary };
  }
}

export const monitor = new MonitorService();
