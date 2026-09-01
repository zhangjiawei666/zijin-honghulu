/**
 * 行情监控服务
 * 
 * 功能：
 * 1. 交易时段（周一至周五 9:30-11:30 / 13:00-15:00）内每 30 分钟自动巡检一次
 * 2. 桌面完整版可调用 Agent 通道对预取行情做辅助研判
 * 3. 内置腾讯行情接口（实时价 + 日 K）按既定规则识别买点
 * 4. 发现买点后通过 SSE 广播到前端，触发弹窗提醒
 */
import { query } from "@tencent-ai/agent-sdk";
import { v4 as uuidv4 } from "uuid";
import type { Response as ExpressResponse } from "express";
import * as db from "./db.js";

// ============= 常量 =============

/** A 股交易时段（分钟数，从 0:00 起） */
const TRADING_SESSIONS = [
  { start: 9 * 60 + 30, end: 11 * 60 + 30 },  // 上午 9:30-11:30
  { start: 13 * 60, end: 15 * 60 },            // 下午 13:00-15:00
];

/** 巡检间隔：30 分钟 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** 调度器 tick 间隔：30 秒 */
const TICK_MS = 30 * 1000;
/** Agent 检查超时时间：5 分钟 */
const AGENT_TIMEOUT_MS = 5 * 60 * 1000;

/** 买入点判断规则（供 Agent 提示词使用，源自「短线十五法 + 中线六二法」，仅 5 个标准买点） */
const BUY_RULES = `
买入点判断规则（用于 A 股日 K 线，均线 MA5/MA10/MA20/MA60）：

【重要计算定义】
- 量比 = 今日成交量 / 前5日平均成交量
- "接近均线" = |当日最低价 - 均线| / 均线 ≤ 3%（必须用数值计算核对，不能凭感觉判断）
- "回踩均线" = 满足以下任一条件：(1) 最低价接近均线（±3% 以内）；(2) 盘中曾跌破均线后收回（最低价 < 均线 且 收盘价 ≥ 均线）
- "近5日未跌破" = 前5个交易日（不含今日）的收盘价都 ≥ 均线

【短线十五法】
1. 买点1：股价位于10日均线上方，前1-3日缩量下跌（量比<0.8），今日爆量（量比≥1.5）且收阳线 → 买入信号；
2. 买点2：股价位于5日均线上方，前1-5日出现明显爆量（量比≥1.5），今日缩量（量比<0.8）且跌幅较小（<2%）→ 买入信号；
3. 买点3：此前10-20日存在明显主升段（累计涨幅≥15%），当前回踩10日均线（满足"回踩均线"定义：最低价接近MA10±3% 或 盘中跌破MA10后收回，且收盘价≥MA10）→ 买入信号；

【中线六二法】
4. 买点1：股价位于20日或60日均线上方，近5日内未跌破过该均线，当前首次回踩该均线（满足上述"回踩均线"定义：最低价接近均线±3% 或 盘中跌破后收回，收盘价必须在均线上方）→ 买入信号；
5. 买点2：股价在20日或60日均线附近横盘整理（近5日振幅<6%），随后出现爆量（量比≥1.5）上涨 → 买入信号。

注意：
- 只允许报告以上 5 个标准买点，严禁报告任何其他均线买点、自定义信号或关注信号；
- 只报告「买入点」信号，不报告卖出信号；
- 对每只股票都必须逐一分析，不要遗漏；
- 判定"回踩均线"时，必须用最低价与均线的实际数值计算差距百分比（|最低价-均线|/均线），严禁凭感觉判断"接近"；例如最低价16.88、MA20=16.06，差距5.12%，且最低价未跌破均线，则不构成回踩；
- signal_type 必须严格使用格式：「短线十五法/买点1」「短线十五法/买点2」「短线十五法/买点3」「中线六二法/买点1」「中线六二法/买点2」（参考 MA20 还是 MA60 写在 reason 的"参考均线"中）；
- reason 必须按固定格式输出：「参考均线:MA20 最新价:¥18.25 首次回踩MA20(5日内未破)」，即：参考均线 + 最新价(¥两位小数) + 触发说明。
`;

// ============= 类型 =============

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

// ============= 内置行情与买点检测 =============

/** 生成带超时的 AbortSignal */
function timeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

/** 带超时与重试的 fetch（内置行情通道，提高稳定性） */
async function fetchWithRetry(url: string, timeoutMs = 15000, retries = 2): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: timeoutSignal(timeoutMs) });
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      lastErr = err;
      if (err?.name === "AbortError") {
        console.warn(`[Monitor] 行情请求超时(第${attempt}次): ${url.slice(0, 80)}...`);
      }
    }
    if (attempt < retries) await new Promise(r => setTimeout(r, 800));
  }
  if (lastErr && (lastErr as any)?.name === "AbortError") {
    throw new Error("腾讯行情接口请求超时（已重试，请检查网络）");
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** 将股票代码规范为带市场前缀（600519 -> sh600519 / 000001 -> sz000001） */
function toMarketCode(code: string): string {
  const c = code.trim().toLowerCase();
  if (c.startsWith("sh") || c.startsWith("sz") || c.startsWith("bj")) return c;
  if (/^6/.test(c) || /^9/.test(c)) return "sh" + c;   // 沪市 60/68/9
  if (/^4/.test(c) || /^8/.test(c)) return "bj" + c;   // 北交所 43/83/87/92
  return "sz" + c;                                      // 深市 00/30
}

/** 批量查询股票名称（用于批量导入自动补全），入参为 6 位数字代码，返回 Map<6位代码, 名称> */
export async function fetchStockNames(codes: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (codes.length === 0) return result;
  const marketCodes = codes.map(c => toMarketCode(c));
  const quotes = await fetchRealtimeQuotes(marketCodes);
  for (const c of codes) {
    const q = quotes.get(toMarketCode(c));
    if (q?.name) result.set(c.replace(/^(sh|sz|bj)/i, ""), q.name.replace(/\s+/g, ""));
  }
  return result;
}

/** 获取实时行情（腾讯接口），返回 Map<marketCode, {name, price, changePct}> */
export interface RealtimeQuote {
  code: string;
  name: string;
  price: number;
  changePct: number;
}

export async function fetchRealtimeQuotes(codes: string[]): Promise<Map<string, { name: string; price: number; changePct: number }>> {
  const result = new Map();
  if (codes.length === 0) return result;

  // 分批请求（每批最多 50 只）
  const batchSize = 50;
  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize);
    const url = "https://qt.gtimg.cn/q=" + batch.join(",");
    const res = await fetchWithRetry(url);
    const buf = await res.arrayBuffer();
    // 腾讯返回 GBK 编码，用 TextDecoder 正确解码股票名称
    let decoded: string;
    try {
      decoded = new TextDecoder("gbk").decode(buf);
    } catch {
      decoded = new TextDecoder("utf-8").decode(buf);
    }
    const matches = decoded.matchAll(/v_(\w+)="([^"]*)"/g);
    for (const m of matches) {
      const fields = m[2].split("~");
      if (fields.length < 5) continue;
      const marketCode = m[1];
      // 腾讯字段索引：1=名称 3=当前价 4=昨收 31=涨跌额 32=涨跌幅% 33=最高 34=最低
      const price = parseFloat(fields[3]) || 0;
      const prevClose = parseFloat(fields[4]) || 0;
      const parsedPct = parseFloat(fields[32]);
      const changePct = Number.isFinite(parsedPct)
        ? parsedPct
        : (prevClose > 0 ? Number((((price - prevClose) / prevClose) * 100).toFixed(2)) : 0);
      result.set(marketCode, {
        name: fields[1],
        price,
        changePct,
      });
    }
  }
  return result;
}

/** 获取日 K 线（前复权），返回 [{date, open, close, high, low, volume}] */
interface KlineBar { date: string; open: number; close: number; high: number; low: number; volume: number; }

async function fetchDailyKline(marketCode: string, days = 70): Promise<KlineBar[]> {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${marketCode},day,,,${days},qfq`;
  const res = await fetchWithRetry(url);
  const json: any = await res.json();
  const data = json?.data?.[marketCode];
  const raw: unknown[] = data?.qfqday || data?.day || [];
  return raw.map((r: any) => ({
    date: String(r[0]),
    open: parseFloat(r[1]),
    close: parseFloat(r[2]),
    high: parseFloat(r[3]),
    low: parseFloat(r[4]),
    volume: parseFloat(r[5]) || 0,
  }));
}

/** 均线计算 */
function calcMA(closes: number[], n: number, idx: number): number | null {
  if (idx + 1 < n) return null;
  let sum = 0;
  for (let i = idx - n + 1; i <= idx; i++) sum += closes[i];
  return sum / n;
}

/** 内置买点检测（「短线十五法 + 中线六二法」）
 *  仅包含 5 个标准买点（短线买点1/2/3 + 中线买点1/2），严禁其他均线买点
 */
function detectBuySignals(bars: KlineBar[]): { type: string; reason: string }[] {
  const signals: { type: string; reason: string }[] = [];
  if (bars.length < 25) return signals;

  const closes = bars.map(b => b.close);
  const lows = bars.map(b => b.low);
  const highs = bars.map(b => b.high);
  const volumes = bars.map(b => b.volume);
  const i = closes.length - 1;

  const ma5 = calcMA(closes, 5, i);
  const ma10 = calcMA(closes, 10, i);
  const ma20 = calcMA(closes, 20, i);
  const ma60 = calcMA(closes, 60, i);

  const volAvg5 = (idx: number) => {
    let s = 0, cnt = 0;
    for (let j = Math.max(0, idx - 5); j < idx; j++) { s += volumes[j]; cnt++; }
    return cnt > 0 ? s / cnt : 0;
  };
  const volToday = volumes[i];
  const volBase = volAvg5(i);
  const volRatio = volBase > 0 ? volToday / volBase : 1;

  const dropPct = i > 0 ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;
  const price = closes[i];
  const fmt = (v: number) => `¥${v.toFixed(2)}`;

  // ========== 短线十五法 ==========

  // 买点1：10日均线上方，缩量下跌爆量买
  // 条件：收盘>MA10；前1-3日缩量下跌（量比<0.8）；今日爆量（量比≥1.5）且收阳线
  if (ma10 !== null && i >= 2) {
    let prevShrinkDown = false;
    for (let j = Math.max(1, i - 3); j < i; j++) {
      const base = volAvg5(j);
      const ratio = base > 0 ? volumes[j] / base : 1;
      if (closes[j] < closes[j - 1] && ratio < 0.8) {
        prevShrinkDown = true;
        break;
      }
    }
    if (closes[i] > ma10 && prevShrinkDown && volRatio >= 1.5 && closes[i] > closes[i - 1]) {
      signals.push({ type: "短线十五法/买点1", reason: `参考均线:MA10 最新价:${fmt(price)} 10日均线上方缩量下跌后爆量买（量比${volRatio.toFixed(2)}）` });
    }
  }

  // 买点2：5日均线上方，爆量之后缩量买
  // 条件：收盘>MA5；前1-5日出现明显爆量（量比≥1.5）；今日缩量（量比<0.8）且跌幅<2%
  if (ma5 !== null) {
    let prevExplode = false;
    for (let j = Math.max(0, i - 5); j < i; j++) {
      const base = volAvg5(j);
      if (base > 0 && volumes[j] / base >= 1.5) { prevExplode = true; break; }
    }
    if (closes[i] > ma5 && prevExplode && volRatio < 0.8 && dropPct > -0.02) {
      signals.push({ type: "短线十五法/买点2", reason: `参考均线:MA5 最新价:${fmt(price)} 5日均线上方爆量之后缩量买（量比${volRatio.toFixed(2)}）` });
    }
  }

  // 买点3：主升之后，10日均线回踩买
  // 条件：此前10-20日存在明显主升段（累计涨幅≥15%）；当前回踩MA10（满足用户定义：最低价接近MA10±3% 或 盘中跌破MA10后收回）
  if (ma10 !== null) {
    const riseStart = Math.max(0, i - 20);
    const risePct = closes[i] / closes[riseStart] - 1;
    const lowNearMA10 = Math.abs(lows[i] - ma10) / ma10 < 0.03;      // 回踩A：最低价接近MA10(±3%)
    const touchRecoverMA10 = lows[i] < ma10 && closes[i] >= ma10;    // 回踩B：盘中跌破MA10后收回
    if (closes[i] >= ma10 && (lowNearMA10 || touchRecoverMA10) && risePct >= 0.15) {
      signals.push({ type: "短线十五法/买点3", reason: `参考均线:MA10 最新价:${fmt(price)} 主升之后回踩MA10买（20日涨幅${(risePct * 100).toFixed(1)}%）` });
    }
  }

  // ========== 中线六二法 ==========

  // 买点1：首次回踩20日或60日均线买（近5日内未跌破该均线）
  // 「回踩」判定（满足其一即可）：
  //   A. 最低价接近均线（|最低价-均线|/均线 < 3%）
  //   B. 盘中曾跌破均线后收回（最低价 < 均线 且 收盘价 ≥ 均线）
  const checkLTB1 = (ma: number | null, maName: string, period: number) => {
    if (ma === null) return;
    let broke = false;
    for (let j = Math.max(0, i - 5); j < i; j++) {
      const maJ = calcMA(closes, period, j); // 用当日滚动均线判断，更贴合"5日内未破"
      if (maJ !== null && closes[j] < maJ) { broke = true; break; }
    }
    const lowNear = Math.abs(lows[i] - ma) / ma < 0.03;            // A. 最低价接近均线(±3%)
    const touchAndRecover = lows[i] < ma && closes[i] >= ma;       // B. 盘中跌破均线后收回
    if (closes[i] >= ma && (lowNear || touchAndRecover) && !broke) {
      signals.push({ type: "中线六二法/买点1", reason: `参考均线:${maName} 最新价:${fmt(price)} 首次回踩${maName}(5日内未破)` });
    }
  };
  checkLTB1(ma20, "MA20", 20);
  checkLTB1(ma60, "MA60", 60);

  // 买点2：爆量上涨买，20日或60日均线附近震荡整理，爆量买
  // 条件：近5日围绕均线横盘整理（振幅<6%）；今日爆量（量比≥1.5）上涨；股价接近均线
  const checkLTB2 = (ma: number | null, maName: string) => {
    if (ma === null || i < 5) return;
    let maxP = 0, minP = Infinity;
    for (let j = i - 5; j < i; j++) {
      if (highs[j] > maxP) maxP = highs[j];
      if (lows[j] < minP) minP = lows[j];
    }
    const amplitude = minP > 0 ? (maxP - minP) / minP : 1;
    const nearMA = Math.abs(closes[i] - ma) / ma < 0.04;
    if (amplitude < 0.06 && volRatio >= 1.5 && closes[i] > closes[i - 1] && nearMA) {
      signals.push({ type: "中线六二法/买点2", reason: `参考均线:${maName} 最新价:${fmt(price)} ${maName}附近震荡整理后爆量买（量比${volRatio.toFixed(2)}）` });
    }
  };
  checkLTB2(ma20, "MA20");
  checkLTB2(ma60, "MA60");

  return signals;
}

// ============= 监控服务 =============

class MonitorService {
  private enabled = true;
  private tickTimer: NodeJS.Timeout | null = null;
  private lastRunAt: number | null = null;
  private running = false;
  private sseClients = new Set<ExpressResponse>();
  private source: string = "agent";
  // 默认 auto（CLI 自动选择当前账号可用模型）；可通过 CODEBUDDY_MODEL 环境变量指定
  private model: string = process.env.CODEBUDDY_MODEL || "auto";

  // ---- 交易时间判断 ----

  isTradingDay(d: Date): boolean {
    const day = d.getDay();
    return day >= 1 && day <= 5; // 周一至周五（节假日由用户在页面手动跳过）
  }

  isTradingTime(d: Date): boolean {
    if (!this.isTradingDay(d)) return false;
    const mins = d.getHours() * 60 + d.getMinutes();
    return TRADING_SESSIONS.some(s => mins >= s.start && mins <= s.end);
  }

  // ---- SSE 客户端管理 ----

  addClient(res: ExpressResponse): void {
    res.write("retry: 10000\n\n");
    this.sseClients.add(res);
    // 心跳保活（15 秒），防止代理/中间层断开空闲连接
    const heartbeat = setInterval(() => {
      if (this.sseClients.has(res)) {
        res.write(": ping\n\n");
      } else {
        clearInterval(heartbeat);
      }
    }, 15000);
    res.on("close", () => {
      clearInterval(heartbeat);
      this.sseClients.delete(res);
    });
  }

  broadcast(type: string, data: Record<string, unknown> = {}): void {
    const event: MonitorEvent = { type, ...data, timestamp: new Date().toISOString() };
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try { client.write(payload); } catch { this.sseClients.delete(client); }
    }
  }

  // ---- 生命周期 ----

  start(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    console.log("[Monitor] 行情监控已启动：交易时段每 30 分钟巡检一次");
  }

  stop(): void {
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    console.log("[Monitor] 行情监控已停止");
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.broadcast("monitor_toggle", { enabled });
    console.log(`[Monitor] 监控${enabled ? "开启" : "关闭"}`);
  }

  isEnabled(): boolean { return this.enabled; }

  // ---- 调度 ----

  private async tick(): Promise<void> {
    if (this.running || !this.enabled) return;
    const now = new Date();
    if (!this.isTradingTime(now)) return;
    if (this.lastRunAt && now.getTime() - this.lastRunAt < CHECK_INTERVAL_MS) return;
    await this.runCheck("schedule", { builtinOnly: process.env.STOCK_MONITOR_BUILTIN_ONLY === '1' });
  }

  getStatus(): MonitorStatus {
    const now = new Date();
    const runs = db.getRecentRuns(1);
    return {
      enabled: this.enabled,
      isTradingTime: this.isTradingTime(now),
      isTradingDay: this.isTradingDay(now),
      lastRunAt: this.lastRunAt ? new Date(this.lastRunAt).toISOString() : null,
      nextRunAt: this.lastRunAt ? new Date(this.lastRunAt + CHECK_INTERVAL_MS).toISOString() : null,
      isRunning: this.running,
      watchCount: db.getWatchlist().length,
      lastRunSummary: runs.length > 0 ? runs[0].summary : null,
      source: this.source,
    };
  }

  // ---- 巡检主流程 ----

  async runCheck(trigger: "schedule" | "manual" | "startup", options: { builtinOnly?: boolean } = {}): Promise<{ runId: string; signals: db.BuySignal[]; summary: string }> {
    if (this.running) {
      return { runId: "", signals: [], summary: "已有巡检正在进行" };
    }
    this.running = true;

    const items = db.getWatchlist();
    const runId = uuidv4();
    const startedAt = new Date().toISOString();
    db.createMonitorRun({
      id: runId, trigger, status: "running", started_at: startedAt,
      finished_at: null, summary: null, signals_json: null,
    });
    this.broadcast("monitor_run_start", { runId, trigger, startedAt, watchCount: items.length });
    console.log(`[Monitor] 开始巡检 (${trigger})，自选股 ${items.length} 只`);

    let signals: db.BuySignal[] = [];
    let sourceUsed = "none";
    const channelErrors: string[] = [];

    try {
      if (items.length === 0) {
        console.log("[Monitor] 自选股为空，跳过本次巡检");
      } else {
        // 双通道并行/串行运行，取并集（Agent优先，内置通道补充漏检）
        let agentSignals: db.BuySignal[] = [];
        let builtinSignals: db.BuySignal[] = [];

        // 桌面完整版保留 Agent 复核；手机版仅使用内置行情与固定买点规则，避免登录依赖。
        if (!options.builtinOnly) {
          try {
            agentSignals = await this.checkWithAgent(items);
            if (agentSignals.length > 0) {
              console.log(`[Monitor] Agent 通道发现 ${agentSignals.length} 个买点`);
            }
          } catch (err: any) {
            channelErrors.push(`Agent通道: ${err?.message || err}`);
            console.error("[Monitor] Agent 通道失败：", err?.message || err);
          }
        }

        // 内置通道始终执行，以固定的5个买点规则判定。
        try {
          builtinSignals = await this.checkWithBuiltin(items);
          if (builtinSignals.length > 0) {
            console.log(`[Monitor] 内置通道发现 ${builtinSignals.length} 个买点`);
          }
        } catch (err: any) {
          channelErrors.push(`内置行情: ${err?.message || err}`);
          console.error("[Monitor] 内置通道失败：", err?.message || err);
        }

        // 合并：以 code 为 key；同一股票出现多条信号时，按信号优先级保留最高优先级的一条
        // 优先级：中线六二法/买点1 > 短线十五法/买点1 > 短线十五法/买点2 > 短线十五法/买点3 > 中线六二法/买点2
        const SIGNAL_PRIORITY: Record<string, number> = {
          "中线六二法/买点1": 1,
          "短线十五法/买点1": 2,
          "短线十五法/买点2": 3,
          "短线十五法/买点3": 4,
          "中线六二法/买点2": 5,
        };
        const priorityOf = (t: string) => SIGNAL_PRIORITY[t] ?? 99;
        const merged = new Map<string, db.BuySignal>();
        for (const s of [...agentSignals, ...builtinSignals]) {
          const exist = merged.get(s.code);
          if (!exist || priorityOf(s.signal_type) < priorityOf(exist.signal_type)) {
            merged.set(s.code, s);
          }
        }
        signals = Array.from(merged.values());
        sourceUsed = agentSignals.length > 0 && builtinSignals.length > 0
          ? "agent+builtin"
          : agentSignals.length > 0
            ? "agent"
            : builtinSignals.length > 0
              ? "builtin"
              : "none";
      }
    } finally {
      this.running = false;
      this.lastRunAt = Date.now();
    }

    // 保存信号（就地回填 run_id，保证接口返回与 runs.signals_json 快照中的关联一致）
    for (const sig of signals) {
      sig.run_id = runId;
      db.createBuySignal(sig);
    }

    const summary = signals.length > 0
      ? `发现 ${signals.length} 个买点：${signals.map(s => `${s.name}(${s.code})`).join("、")}`
      : channelErrors.length > 0
        ? `未发现买点（${channelErrors.join("；")}）`
        : "未发现买点";
    const finishedAt = new Date().toISOString();
    db.updateMonitorRun(runId, {
      status: "finished", finished_at: finishedAt, summary,
      signals_json: JSON.stringify(signals),
    });
    this.source = sourceUsed;

    // 广播结果
    this.broadcast("monitor_run_finished", { runId, summary, signalCount: signals.length, source: sourceUsed });
    for (const sig of signals) {
      this.broadcast("buy_signal", { signal: sig });
    }
    console.log(`[Monitor] 巡检完成：${summary}`);

    return { runId, signals, summary };
  }

  // ---- 主通道：Agent 检查 ----

  /** 执行一次 Agent 查询，返回完整文本 */
  private async runAgentQuery(prompt: string, systemPrompt: string): Promise<string> {
    let fullText = "";
    let done = false;
    const timer = setTimeout(() => { done = true; }, AGENT_TIMEOUT_MS);
    try {
      const stream = query({
        prompt,
        options: {
          cwd: process.cwd(),
          model: this.model,
          maxTurns: 5,
          systemPrompt,
          permissionMode: "default",
          canUseTool: async (toolName) => {
            // 数据已由内置通道提供，Agent 仅做规则推理，禁止调用任何工具
            return { behavior: "deny", message: "行情数据已提供，请直接基于数据推理，不要调用工具" };
          },
        },
      });

      for await (const msg of stream) {
        if (done) break;
        if (msg.type === "assistant") {
          const content = (msg as any).message?.content;
          if (typeof content === "string") {
            fullText += content;
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block?.type === "text") fullText += block.text;
            }
          }
        }
        if (msg.type === "result") {
          const resMsg = msg as any;
          if (resMsg.error) throw new Error(String(resMsg.error));
        }
      }
    } finally {
      clearTimeout(timer);
    }
    return fullText;
  }

  /** 从 Agent 文本中提取信号 JSON 数组（兼容 ```json 代码块与前后杂文） */
  private extractSignalArray(fullText: string): any[] | null {
    if (!fullText || !fullText.trim()) return null;
    const fenced = fullText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : fullText;
    const jsonMatch = candidate.match(/\[\s*\{[\s\S]*\}\s*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : candidate.trim();
    try {
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private async checkWithAgent(items: db.WatchItem[]): Promise<db.BuySignal[]> {
    // 1. 复用内置通道取数（实时行情 + 日K + 均线 + 量比），确保 Agent 基于真实数据判断
    const marketCodes = items.map(it => toMarketCode(it.code));
    const quotes = await fetchRealtimeQuotes(marketCodes);

    const dataBlocks: string[] = [];
    for (const item of items) {
      const mc = toMarketCode(item.code);
      const quote = quotes.get(mc);
      try {
        const bars = await fetchDailyKline(mc, 70);
        if (bars.length < 25) continue;
        const closes = bars.map(b => b.close);
        const lows = bars.map(b => b.low);
        const highs = bars.map(b => b.high);
        const volumes = bars.map(b => b.volume);
        const last = bars.length - 1;
        const ma5 = calcMA(closes, 5, last);
        const ma10 = calcMA(closes, 10, last);
        const ma20 = calcMA(closes, 20, last);
        const ma60 = calcMA(closes, 60, last);
        // 今日量比 = 今日成交量 / 前5日均量
        let volSum = 0, volCnt = 0;
        for (let j = Math.max(0, last - 5); j < last; j++) { volSum += volumes[j]; volCnt++; }
        const volBase = volCnt > 0 ? volSum / volCnt : 0;
        const volRatio = volBase > 0 ? volumes[last] / volBase : 1;
        const recent = bars.slice(-10).map(b =>
          `${b.date} 开${b.open} 高${b.high} 低${b.low} 收${b.close} 量${Math.round(b.volume)}`
        ).join("\n");
        dataBlocks.push(`【${quote?.name || item.name}(${item.code})】
最新价: ${quote?.price ?? "--"}  涨跌幅: ${quote?.changePct != null ? quote.changePct + "%" : "--"}
今日最低价: ${lows[last]}  今日收盘: ${closes[last]}
MA5=${ma5?.toFixed(2) ?? "--"}  MA10=${ma10?.toFixed(2) ?? "--"}  MA20=${ma20?.toFixed(2) ?? "--"}  MA60=${ma60?.toFixed(2) ?? "--"}
今日量比(今日量/前5日均量): ${volRatio.toFixed(2)}
最近10个交易日（日期 开 高 低 收 量）:
${recent}`);
      } catch (err: any) {
        console.error(`[Monitor] Agent通道取数失败 ${item.code}:`, err?.message || err);
      }
    }
    if (dataBlocks.length === 0) {
      throw new Error("无法获取行情数据（内置取数失败）");
    }

    // 2. 构造提示词：数据已提供，禁止 Agent 再调用工具/联网，只做规则推理
    const prompt = `以下是从实时行情接口获取的自选股最新行情数据（当前 A 股交易时段），共 ${dataBlocks.length} 只股票：

${dataBlocks.join("\n\n")}

请严格按照以下规则判断每只股票当前是否出现「买入点」：

${BUY_RULES}

【逐只分析要求】
- 你必须对上面列出的每只股票都进行分析，不能遗漏任何一只；
- 分析时重点关注：收盘价与均线位置关系、量比大小、近几日成交量变化、涨跌幅；
- 判定中线六二法/买点1 的"回踩"时，必须用该股最近10日K线里的最低价与提供的 MA20/MA60 实际数值计算差距（|最低价-均线|/均线），差距 ≤3% 或 盘中跌破均线后收回（最低价<均线 且 收盘≥均线）才算回踩；严禁凭感觉判断"接近"；
- 如果某只股票出现买点，纳入 JSON 结果；如果没有出现任何买点，不纳入结果即可；
- 信号类型必须严格使用标准格式：「短线十五法/买点1」「短线十五法/买点2」「短线十五法/买点3」「中线六二法/买点1」「中线六二法/买点2」；
- reason 必须按固定格式输出：「参考均线:MA20 最新价:¥18.25 首次回踩MA20(5日内未破)」，控制在 60 字以内；
- 只允许输出 BUY_RULES 中列出的 5 个标准买点，严禁输出其他任何信号类型。

【输出格式】
1. 不要调用任何工具、不要联网搜索，直接基于我提供的上述数据分析；
2. 最终回答只输出一个 JSON 数组，不要输出任何其他文字、markdown 代码块标记或解释；
3. JSON 结构示例：[{"code":"601872","name":"招商轮船","price":18.25,"signal_type":"中线六二法/买点1","reason":"参考均线:MA20 最新价:¥18.25 首次回踩MA20(5日内未破)"}]
4. 没有任何股票出现买点则输出 []。`;

    const systemPrompt = "你是一名专业的A股行情分析助手，严格依据「短线十五法 + 中线六二法」的 5 个标准买点判断买入信号。\n关键要求：\n1. 必须对输入的每只股票都进行分析，不得遗漏；\n2. 只允许报告 5 个标准买点（短线十五法/买点1/2/3，中线六二法/买点1/2），严禁输出其他任何信号；\n3. signal_type 使用「短线十五法/买点N」「中线六二法/买点N」格式；\n4. reason 按「参考均线:MA20 最新价:¥18.25 首次回踩MA20(5日内未破)」格式输出；\n5. 最终回答只输出 JSON 数组，不得输出任何其他文字。";

    // 3. 最多尝试 2 次（第一次失败后追加纠正性追问）
    for (let attempt = 1; attempt <= 2; attempt++) {
      const p = attempt === 1
        ? prompt
        : `你上一次的输出不符合要求（没有给出 JSON 数组）。请重新基于上述行情数据分析，只输出 JSON 数组作为最终答案，不要输出任何其他文字、解释或 markdown 标记。\n\n原始要求：\n${prompt}`;
      const fullText = await this.runAgentQuery(p, systemPrompt);

      const parsed = this.extractSignalArray(fullText);
      if (parsed) {
        // ---- 后置校验：过滤掉「价格已跌破参考均线」的无效 Agent 信号 ----
        // Agent（AI 推理）有时会在 reason 中自行标注"不符/不达标/跌破"但仍返回信号，
        // 必须用实际 K 线数据复核价格与均线位置关系，不合格的直接丢弃。
        const rawSignals: db.BuySignal[] = parsed
          .filter((s: any) => s && s.code && s.signal_type)
          .map((s: any) => ({
            id: uuidv4(),
            run_id: null,
            code: String(s.code),
            name: String(s.name || s.code),
            price: typeof s.price === "number" ? s.price : null,
            signal_type: String(s.signal_type),
            reason: String(s.reason || ""),
            source: "agent",
            created_at: new Date().toISOString(),
          }));

        // 用已取到的 K 线数据构建 code→均线 映射（checkWithAgent 内部已 fetch 过日K）
        const maMap = new Map<string, { close: number; ma5: number | null; ma10: number | null; ma20: number | null; ma60: number | null }>();
        for (const item of items) {
          try {
            const mc = toMarketCode(item.code);
            const bars = await fetchDailyKline(mc, 70);
            if (bars.length < 25) continue;
            const closes = bars.map(b => b.close);
            const last = closes.length - 1;
            maMap.set(item.code, {
              close: closes[last],
              ma5: calcMA(closes, 5, last),
              ma10: calcMA(closes, 10, last),
              ma20: calcMA(closes, 20, last),
              ma60: calcMA(closes, 60, last),
            });
          } catch { /* 取数失败的股票跳过校验（保留原信号） */ }
        }

        // 信号类型 → 所需参考均线 + 价格条件
        const SIGNAL_MA_RULES: Record<string, { maKey: keyof Pick<typeof maMap extends Map<string, infer V> ? V : never, "ma5" | "ma10" | "ma20" | "ma60">; requireAbove: boolean }> = {
          "短线十五法/买点1": { maKey: "ma10", requireAbove: true },   // 收盘 > MA10
          "短线十五法/买点2": { maKey: "ma5", requireAbove: true },     // 收盘 > MA5
          "短线十五法/买点3": { maKey: "ma10", requireAbove: false },   // 收盘 >= MA10（回踩可触及）
          "中线六二法/买点1": { maKey: "ma20", requireAbove: false },   // 收盘 >= MA20/MA60（回踩）
          "中线六二法/买点2": { maKey: "ma20", requireAbove: false },   // 均线附近（±4%）
        };

        const validated = rawSignals.filter((sig) => {
          // 规则 1：reason 中含「不符」「不达标」「跌破…不符」等否定词 → 直接排除
          if (/不符|不达标|未达标准|跌破.*不符|不满足/.test(sig.reason)) {
            console.log(`[Monitor] Agent信号后置校验淘汰(reason含否定词): ${sig.code} ${sig.signal_type} reason="${sig.reason}"`);
            return false;
          }

          // 规则 2：用实际 K 线数据验证价格是否在参考均线上方/附近
          const rule = SIGNAL_MA_RULES[sig.signal_type];
          if (!rule) return true; // 未知信号类型放行（不应出现）

          const maData = maMap.get(sig.code);
          if (!maData) return true; // 无 K 线数据则跳过数值校验

          // 中线买点的参考均线可能写在 reason 里（如 MA60），优先从 reason 提取
          let refMA: number | null = null;
          const maMatch = sig.reason.match(/参考均线:(MA\d+)/);
          if (maMatch) {
            const key = maMatch[1].toLowerCase() as "ma5" | "ma10" | "ma20" | "ma60";
            refMA = maData[key] ?? null;
          } else {
            refMA = maData[rule.maKey];
          }
          if (refMA === null) return true;

          const close = sig.price ?? maData.close;

          if (rule.requireAbove) {
            // 短线买点1/2：必须严格在均线上方（close > MA）
            if (close <= refMA) {
              console.log(`[Monitor] Agent信号后置校验淘汰(价≤均线): ${sig.code} ${sig.signal_type} close=${close} refMA=${refMA}`);
              return false;
            }
          } else {
            // 中线买点1/2、短线买点3：允许接近或回踩（close >= MA * 0.96，即跌幅不超过4%）
            if (close < refMA * 0.96) {
              console.log(`[Monitor] Agent信号后置校验淘汰(价远离均线): ${sig.code} ${sig.signal_type} close=${close} refMA=${refMA}`);
              return false;
            }
          }

          return true;
        });

        if (validated.length !== rawSignals.length) {
          console.log(`[Monitor] Agent信号后置校验: ${rawSignals.length} → ${validated.length}（淘汰 ${rawSignals.length - validated.length} 个无效信号）`);
        }

        return validated;
      }
      console.warn(`[Monitor] Agent 第 ${attempt} 次输出不是有效 JSON，重试...`);
    }
    throw new Error("Agent 输出无法解析为有效 JSON（已重试）");
  }

  // ---- 兜底通道：内置腾讯行情检查 ----

  private async checkWithBuiltin(items: db.WatchItem[]): Promise<db.BuySignal[]> {
    const marketCodes = items.map(it => toMarketCode(it.code));
    const quotes = await fetchRealtimeQuotes(marketCodes);
    const signals: db.BuySignal[] = [];

    for (const item of items) {
      const mc = toMarketCode(item.code);
      const quote = quotes.get(mc);
      try {
        const bars = await fetchDailyKline(mc, 70);
        const detected = detectBuySignals(bars);
        for (const sig of detected) {
          signals.push({
            id: uuidv4(),
            run_id: null,
            code: item.code,
            name: quote?.name || item.name,
            price: quote?.price ?? null,
            signal_type: sig.type,
            reason: sig.reason,
            source: "builtin",
            created_at: new Date().toISOString(),
          });
        }
      } catch (err: any) {
        console.error(`[Monitor] 获取 ${item.code} 日K失败：`, err?.message || err);
      }
    }
    return signals;
  }
}

export const monitor = new MonitorService();
