import express from "express";
import https from "node:https";
import * as db from "./db.js";
import { SECTOR_EFFECT_HISTORY, type SectorDayType } from "./sectorEffectHistory.js";

/**
 * 板块效应：按交易日统计 A 股涨停股，归集到行业板块，以矩阵表格展示。
 *
 * 口径说明（严格遵循板块统计规范）：
 * 1. 只统计 A 股普通股票，排除 ETF、可转债、指数、北交所、港股、美股；
 * 2. 默认采用行业板块纵向汇总，不把概念板块与行业板块混在一个统计里；
 * 3. 涨停判定使用数据源自带的涨停板状态（涨停池），不用涨跌幅阈值臆断；
 * 4. 板块名来自数据源行业字段，不做臆测；数据源字段为 4 字截断时按已知行业名补全；
 * 5. 指定日期非交易日或尚未收盘时，向前回溯最近有数据的交易日，并给出日期替代说明；
 * 6. 不把涨停家数直接当作板块强度或买卖建议。
 *
 * 数据保留：每次手动/自动更新都会 UPSERT 到 SQLite，历史行不丢失。
 * 自动更新：每个交易日 08:00 自动抓取最近交易日的涨停数据并入库。
 */

const EM_UT = "7eea3edcaed734bea9cbfc24409ed989";
const SOURCE = "东方财富涨停板行情（涨停池）";

/** 矩阵每行展示的板块列数上限，与用户腾讯文档模板「板块1~板块17」的列数对齐 */
const MAX_SECTOR_COLS = 17;

interface LimitUpStock {
  code: string;
  name: string;
  price: number;
  changePct: number;
  limitUpDays: number;
  sector: string;
}

interface SectorStat {
  name: string;
  count: number;
  maxLimitUpDays: number;
  stocks: LimitUpStock[];
}

/** 矩阵行：一个日期 + 该日各板块的 {name, count} 数组 */
interface MatrixRow {
  date: string;              // 显示日期 YYYY/M/D
  dateToken: string;         // YYYYMMDD
  sectors: Array<{ name: string; count: number }>;  // 按count降序
  totalLimitUp: number;
  substitutedDate: string | null;
  source: string | null;     // 数据来源，用于区分模板历史与实时抓取
  dayType: DisplayDayType;   // 最终展示类型，已把"今日待更新"合并进来
  isToday: boolean;          // 是否为今天（前端用于自动滚动定位）
  cells?: (SectorCell | null)[];
}

interface SectorCell {
  name: string;
  count: number;
}

/** 展示用的日期类型：在存储的三种类型之外，额外表达"今天尚未收盘" */
type DisplayDayType = SectorDayType | "today";

// ============= 东财数据源工具函数 =============

function requestJson(url: string, timeoutMs = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" } },
      response => {
        const chunks: Buffer[] = [];
        response.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode || 500) >= 200 && (response.statusCode || 500) < 300) {
            try { resolve(JSON.parse(text)); }
            catch { reject(new Error("数据源返回内容无法解析")); }
          } else {
            reject(new Error(`数据源返回 HTTP ${response.statusCode || 0}`));
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error("请求数据源超时")));
    req.on("error", reject);
  });
}

/** 东财涨停池的行业字段按 4 字截断，这里补全为完整行业名；未知则保留来源原值 */
const SECTOR_NAME_FIX: Record<string, string> = {
  房地产开: "房地产开发",
  房地产服: "房地产服务",
  汽车零部: "汽车零部件",
  计算机设: "计算机设备",
  其他电源: "其他电源设备",
  金属新材: "金属新材料",
  互联网服: "互联网服务",
  电子化学: "电子化学品",
  自动化设: "自动化设备",
  非金属材: "非金属材料",
  光学光电: "光学光电子",
  家电零部: "家电零部件",
  调味发酵: "调味发酵品",
  农产品加: "农产品加工",
  航空机场: "航空机场",
  轨交设备: "轨交设备",
  环保设备: "环保设备",
  动物保健: "动物保健",
  油气开采: "油气开采",
  其他电子: "其他电子",
  电子元件: "电子元件",
};

function normalizeSector(raw: string): string {
  const base = String(raw || "").replace(/[ⅠⅡⅢ]/g, "").trim();
  if (!base) return "未标注行业";
  return SECTOR_NAME_FIX[base] || base;
}

/** 只保留沪深主板、创业板、科创板的普通股票 */
function isAStock(code: string): boolean {
  return /^(60|68|00|30)\d{4}$/.test(code);
}

function toDateToken(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}${m}${day}`;
}

function shiftDays(token: string, delta: number): string {
  const y = Number(token.slice(0, 4));
  const m = Number(token.slice(4, 6));
  const d = Number(token.slice(6, 8));
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return toDateToken(date);
}

/** 格式化日期令牌为显示格式 YYYY/M/D */
function fmtDateDisplay(token: string): string {
  if (!token || token.length !== 8) return token || '--';
  const y = token.slice(0, 4);
  const m = Number(token.slice(4, 6));
  const d = Number(token.slice(6, 8));
  return `${y}/${m}/${d}`;
}

async function fetchLimitUpPool(dateToken: string): Promise<{ date: string; stocks: LimitUpStock[] }> {
  const url = `https://push2ex.eastmoney.com/getTopicZTPool?ut=${EM_UT}&dpt=wz.ztzt`
    + `&Pageindex=0&pagesize=300&sort=fbt%3Aasc&date=${dateToken}&_=1`;
  const json = await requestJson(url);
  const pool: any[] = json?.data?.pool || [];
  const stocks: LimitUpStock[] = [];
  for (const item of pool) {
    const code = String(item?.c || "").trim();
    if (!isAStock(code)) continue;
    stocks.push({
      code,
      name: String(item?.n || "").replace(/\s+/g, ""),
      price: typeof item?.p === "number" ? Number((item.p / 1000).toFixed(2)) : 0,
      changePct: typeof item?.zdp === "number" ? Number(item.zdp.toFixed(2)) : 0,
      limitUpDays: Number(item?.lbc || 1),
      sector: normalizeSector(String(item?.hybk || "")),
    });
  }
  return { date: String(json?.data?.qdate || dateToken), stocks };
}

function aggregate(stocks: LimitUpStock[]): Array<{ name: string; count: number }> {
  const map = new Map<string, number>();
  for (const s of stocks) {
    map.set(s.sector, (map.get(s.sector) || 0) + 1);
  }
  const list = [...map.entries()].map(([name, count]) => ({ name, count }));
  list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN"));
  return list;
}

// ============= 列对齐：让同一板块尽量落在同一列 =============

/**
 * 从所有历史行中计算每个板块最常出现的列索引，
 * 返回列位映射表。
 */
function buildColumnMapping(rows: MatrixRow[]): Map<string, number> {
  // 统计每个板块在各列位置的出现次数
  const colFreq = new Map<string, Map<number, number>>();
  for (const row of rows) {
    row.sectors.forEach((sec, idx) => {
      if (!colFreq.has(sec.name)) colFreq.set(sec.name, new Map());
      colFreq.get(sec.name)!.set(idx, (colFreq.get(sec.name)!.get(idx) || 0) + 1);
    });
  }

  // 已分配的列位
  const assignedCols = new Set<number>();
  const mapping = new Map<string, number>();

  // 按总出现次数降序排列板块，优先分配高频板块
  const sectorTotalFreq = new Map<string, number>();
  for (const [sec, freqs] of colFreq) {
    let total = 0;
    for (const c of freqs.values()) total += c;
    sectorTotalFreq.set(sec, total);
  }
  const sortedSectors = [...sectorTotalFreq.entries()].sort((a, b) => b[1] - a[1]);

  for (const [secName] of sortedSectors) {
    const freqs = colFreq.get(secName)!;
    // 找该板块出现最多的列位，优先选未占用的
    let bestCol = -1;
    let bestFreq = -1;
    for (const [col, freq] of freqs) {
      if (!assignedCols.has(col) && freq > bestFreq) {
        bestCol = col;
        bestFreq = freq;
      }
    }
    // 如果所有常用列都被占了，选频率最高的那个（允许复用）
    if (bestCol === -1) {
      for (const [col, freq] of freqs) {
        if (freq > bestFreq) {
          bestCol = col;
          bestFreq = freq;
        }
      }
    }
    mapping.set(secName, bestCol);
    assignedCols.add(bestCol);
  }

  return mapping;
}

/** 根据列映射对单行数据进行重排，返回固定长度的数组（空位填 null） */
function alignRow(
  sectors: Array<{ name: string; count: number }>,
  mapping: Map<string, number>,
  maxCols: number
): ({ name: string; count: number } | null)[] {
  const row: ({ name: string; count: number } | null)[] = new Array(maxCols).fill(null);
  for (const sec of sectors) {
    const targetCol = mapping.get(sec.name);
    if (targetCol !== undefined && targetCol < maxCols) {
      // 如果目标列已被占用（同日同板块合并计数的情况），追加到该位置
      if (row[targetCol] !== null) {
        // 合并：同名板块不应出现两次，但以防万一做计数叠加
        // 正常情况不会走到这里
        continue;
      }
      row[targetCol] = sec;
    } else {
      // 找不到映射或超出范围，放入第一个空列
      for (let i = 0; i < maxCols; i++) {
        if (row[i] === null) {
          row[i] = sec;
          break;
        }
      }
    }
  }
  return row;
}

// ============= 核心：获取并存储某日数据 =============

/**
 * 抓取指定日期的涨停数据，聚合为板块统计，写入数据库（UPSERT）。
 * 返回聚合后的板块列表和元信息。
 */
async function fetchAndStore(dateToken: string, opts?: { force?: boolean }): Promise<{
  date: string;
  requestedDate: string;
  substitutedDate: string | null;
  sectors: Array<{ name: string; count: number }>;
  totalLimitUp: number;
  /** 因保护模板历史数据而跳过写入 */
  skipped?: boolean;
}> {
  let result = await fetchLimitUpPool(dateToken);
  let substitutedDate: string | null = null;

  // 非交易日或尚未收盘：向前回溯
  if (result.stocks.length === 0) {
    for (let i = 1; i <= 7; i += 1) {
      const candidate = shiftDays(dateToken, -i);
      const probe = await fetchLimitUpPool(candidate);
      if (probe.stocks.length > 0) {
        result = probe;
        substitutedDate = probe.date;
        break;
      }
    }
  }

  if (!substitutedDate && result.date !== dateToken) substitutedDate = result.date;

  const sectors = aggregate(result.stocks);

  /**
   * 关键防护：抓取结果为空时绝不写库。
   *
   * 东财涨停池不支持历史日期查询——传入任意历史日期，数据源都会把 qdate 回写成
   * 「最近交易日」并返回空池。若照常 UPSERT，就会用空数据覆盖掉该最近交易日已有的
   * 有效记录（实测：查询 20260315 后，20260831 的真实数据被清空）。
   */
  if (sectors.length === 0) {
    console.warn(
      `[SectorEffect] 请求 ${dateToken} 未取到有效涨停数据（数据源回写 qdate=${result.date}），跳过写入以避免覆盖已有记录`,
    );
    return {
      date: result.date,
      requestedDate: dateToken,
      substitutedDate,
      sectors,
      totalLimitUp: 0,
    };
  }

  /**
   * 保护模板历史数据。
   *
   * 模板基线的板块归类是用户在腾讯文档里手工整理的概念口径（商业航天、脑机接口…），
   * 而实时抓取是东财行业口径（通用设备、汽车零部件…），两者归类逻辑不同。
   * 若允许实时抓取直接覆盖，用户手工整理的记录会被口径不一致的自动数据顶掉。
   * 因此：目标日期已有模板数据时默认跳过写入，仅对新日期生效；需要替换时显式传 force。
   */
  if (!opts?.force) {
    const existing = db.getSectorEffectByDate(result.date);
    if (existing && String(existing.source || "").includes("腾讯文档")) {
      console.log(
        `[SectorEffect] ${result.date} 已有模板历史数据，保护跳过写入（需替换请显式传 force）`,
      );
      return {
        date: result.date,
        requestedDate: dateToken,
        substitutedDate,
        sectors: JSON.parse(existing.sectors_json) as Array<{ name: string; count: number }>,
        totalLimitUp: existing.total_limit_up,
        skipped: true,
      };
    }
  }

  // 写入数据库（UPSERT）
  // day_type 固定为 trading：能抓到涨停池数据说明当天确实开市。
  // 若模板里该日被标成休市但实际有交易，这里会把它纠正为交易日。
  db.upsertSectorEffect({
    date: result.date,
    day_type: "trading",
    sectors_json: JSON.stringify(sectors),
    total_limit_up: result.stocks.length,
    source: SOURCE,
    substituted_date: substitutedDate,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log(`[SectorEffect] 存储 ${result.date} 完成: ${result.stocks.length}只涨停, ${sectors.length}个板块`);

  return {
    date: result.date,
    requestedDate: dateToken,
    substitutedDate,
    sectors,
    totalLimitUp: result.stocks.length,
  };
}

// ============= 内置历史数据导入 =============

const HISTORY_SOURCE = "腾讯文档模板·2026板块效应（概念板块口径）";

/**
 * 导入内置历史数据（2026 年腾讯文档模板）。
 *
 * 背景：东财涨停池接口不支持历史日期查询——传入任意历史日期都会被数据源强制替换为
 * 最近交易日，更早的日期返回空池，因此历史数据无法实时回填，只能以内置文件作为基线。
 *
 * 策略：
 *   - 默认只补齐本地缺失的日期，不覆盖已有记录（保留用户后续抓取/修正的数据）；
 *   - force=true 时用模板数据覆盖同日期记录。
 *
 * @returns 本次新增条数、覆盖条数、跳过的无效行数
 */
function importBuiltinHistory(force = false): { added: number; updated: number; total: number } {
  let added = 0;
  let updated = 0;

  for (const row of SECTOR_EFFECT_HISTORY) {
    const dateToken = String(row.date || "").trim();
    if (!/^\d{8}$/.test(dateToken)) continue;
    const sectors = Array.isArray(row.sectors) ? row.sectors : [];

    // 关键：休市日（周末/法定节假日）同样入库，不再跳过，
    // 这样表格才能保留完整连续的日期轴。
    const dayType: SectorDayType =
      row.day_type || (sectors.length > 0 ? "trading" : "holiday");

    const existing = db.getSectorEffectByDate(dateToken);

    // 休市日（周末/法定节假日）：历史文件是唯一真相源，每次启动都强制修正
    // day_type 并清空板块数据。防止旧版误把周末标为 trading 并写入脏数据
    // （如照搬腾讯文档列号 "1/2/3"、备注"低吸"等），也避免已入库旧脏数据残留。
    // 依据 sector-limitup-daily skill：周末/节假日不写入当日虚构数据。
    if (dayType !== "trading") {
      db.upsertSectorEffect({
        date: dateToken,
        day_type: dayType,
        sectors_json: "[]",
        total_limit_up: 0,
        source: HISTORY_SOURCE,
        substituted_date: null,
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (existing) updated += 1; else added += 1;
      continue;
    }

    // 非强制模式下，已存在的交易日保留现有数据（可能是实时抓取更新的）
    if (existing && !force) continue;

    db.upsertSectorEffect({
      date: dateToken,
      day_type: dayType,
      sectors_json: JSON.stringify(sectors),
      total_limit_up: typeof row.total === "number" ? row.total : sectors.reduce((s, x) => s + x.count, 0),
      source: HISTORY_SOURCE,
      substituted_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (existing) updated += 1;
    else added += 1;
  }

  return { added, updated, total: SECTOR_EFFECT_HISTORY.length };
}

/** 首次启动时自动补齐内置历史（含周末/节假日完整日期轴）。
 *
 * 关键变更：每次启动都执行补齐（而非"有数据就跳过"）。
 * 原因：v1.1.04 只导入了 167 个交易日，v1.1.06 新增了 240 天完整轴
 * （含 ~62 个周末 + ~10 个法定节假日），若检测到旧数据就跳过，
 * 则新增的休市日行永远无法入库。
 *
 * 安全性：importBuiltinHistory(false) 内部对已存在的日期执行 continue（不覆盖），
 * 因此重复调用只会补齐缺失的周末/节假日行，不会影响已有交易日数据。
 */
/** 清理已入库板块效应数据中的"照搬腾讯文档"脏单元格：
 * 纯数字名（列号 1/2/3）或已知备注（低吸/按兵/长期/直接看/备注）等。
 * 仅删除垃圾单元格、保留真实板块数据；对老版本已入库的旧脏数据做一次性纠正。
 * 依据 sector-limitup-daily skill：不把列号/备注臆造成板块名。 */
function cleanupGarbageSectors(): number {
  let cleaned = 0;
  const isGarbage = (nm: string) => {
    const t = (nm || '').trim();
    return /^\d+$/.test(t) || ['低吸', '按兵', '长期', '直接看', '备注', '长期，直接看ETF'].includes(t);
  };
  const rows = db.getSectorEffectAll(100000);
  for (const r of rows) {
    let secs: Array<{ name: string; count: number }> = [];
    try { secs = JSON.parse(r.sectors_json); } catch { continue; }
    if (!Array.isArray(secs) || secs.length === 0) continue;
    const filtered = secs.filter(s => !isGarbage(s.name));
    if (filtered.length !== secs.length) {
      db.upsertSectorEffect({
        date: r.date, day_type: r.day_type, sectors_json: JSON.stringify(filtered),
        total_limit_up: filtered.reduce((s, x) => s + (x.count || 0), 0),
        source: r.source, substituted_date: r.substituted_date,
        created_at: r.created_at, updated_at: new Date().toISOString(),
      });
      cleaned++;
    }
  }
  return cleaned;
}

function ensureHistorySeeded(): void {
  try {
    const gc = cleanupGarbageSectors();
    if (gc > 0) console.log(`[SectorEffect] 启动清理：剔除 ${gc} 行照搬脏单元格`);
    const r = importBuiltinHistory(false);
    if (r.added > 0) {
      const trading = SECTOR_EFFECT_HISTORY.filter(x => x.day_type === 'trading').length;
      const resting = SECTOR_EFFECT_HISTORY.length - trading;
      console.log(
        `[SectorEffect] 补齐内置历史基线：新增 ${r.added} 天`
        + `（模板共 ${r.total} 行：交易日 ${trading} 天、休市日 ${resting} 天）`
      );
    } else {
      console.log("[SectorEffect] 内置历史基线已完整，无需补齐");
    }
  } catch (err: any) {
    console.error("[SectorEffect] 导入历史基线失败:", err?.message || err);
  }
}

// ============= 交易日 8:00 自动更新调度器 =============

let autoUpdateTimer: ReturnType<typeof setInterval> | null = null;
let lastAutoUpdateDate: string = '';  // 避免同一天重复更新

/** 判断是否为工作日（简单判断：周一到周五） */
function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

/** 启动自动更新定时器：每个交易日 08:00 触发 */
export function startAutoUpdateScheduler(): void {
  if (autoUpdateTimer) return;  // 已启动

  // 每分钟检查一次是否到了 08:00 且是工作日
  autoUpdateTimer = setInterval(async () => {
    try {
      const now = new Date();
      const todayToken = toDateToken(now);

      // 跳过：非工作日 / 非 08:xx / 当天已更新过
      if (!isWeekday(now)) return;
      if (now.getHours() !== 8) return;
      if (lastAutoUpdateDate === todayToken) return;

      console.log(`[SectorEffect] 自动更新触发: ${todayToken}`);
      lastAutoUpdateDate = todayToken;

      await fetchAndStore(todayToken);
    } catch (err: any) {
      console.error('[SectorEffect] 自动更新失败:', err?.message || err);
    }
  }, 60000);  // 每分钟检查一次

  console.log('[SectorEffect] 自动更新调度器已启动（交易日 08:00）');
}

// ============= 路由注册 =============

export function registerSectorEffectRoutes(app: express.Express): void {

  /**
   * GET /api/sector-effect
   * 返回矩阵格式的板块效应历史数据（所有已存储日期）
   * 查询参数:
   *   - limit?: 返回最近 N 天（默认 30）
   *   - date?: 指定单日查询 YYYYMMDD（若该日无数据则尝试实时抓取）
   */
  app.get("/api/sector-effect", async (req, res) => {
    try {
      const rawDate = String(req.query.date || "").replace(/-/g, "").trim();
      // 历史基线覆盖一整年（167 个交易日），默认上限放宽到 400 以便完整展示
      const limit = Math.min(parseInt(String(req.query.limit || "400"), 10) || 400, 500);

      // 单日查询模式
      if (/^\d{8}$/.test(rawDate)) {
        // 先查本地缓存
        let cached = db.getSectorEffectByDate(rawDate);
        if (cached) {
          const sectors = JSON.parse(cached.sectors_json) as Array<{ name: string; count: number }>;
          return res.json({
            mode: 'single',
            requestedDate: rawDate,
            date: cached.date,
            substitutedDate: cached.substituted_date,
            totalLimitUp: cached.total_limit_up,
            sectors,
            source: cached.source,
            generatedAt: cached.updated_at,
            note: '数据来自本地缓存',
          });
        }

        // 本地无数据且是历史日期：数据源不支持历史查询，直接返回说明，
        // 既不发无效请求，也不会把空结果写库覆盖掉最近交易日的记录。
        const todayToken = toDateToken(new Date());
        if (rawDate < todayToken) {
          return res.json({
            mode: 'single',
            requestedDate: rawDate,
            date: rawDate,
            substitutedDate: null,
            totalLimitUp: 0,
            sectors: [],
            source: SOURCE,
            generatedAt: new Date().toISOString(),
            note:
              '本地无该日期数据。东财涨停池接口不支持历史日期查询，历史数据来自内置模板基线'
              + '（2026/1/5 起）；可点击「导入历史」补齐，或「手动更新」获取最近交易日数据。',
          });
        }

        // 今天或未来日期：尝试实时抓取
        const result = await fetchAndStore(rawDate);
        return res.json({
          mode: 'single',
          requestedDate: result.requestedDate,
          date: result.date,
          substitutedDate: result.substitutedDate,
          totalLimitUp: result.totalLimitUp,
          sectors: result.sectors,
          source: SOURCE,
          generatedAt: new Date().toISOString(),
          note: result.sectors.length > 0
            ? '实时获取并已缓存'
            : '该日期暂无有效涨停数据（可能尚未收盘或非交易日）',
        });
      }

      // 矩阵模式：返回所有历史数据
      const allRows = db.getSectorEffectAll(limit);

      if (allRows.length === 0) {
        return res.json({
          mode: 'matrix',
          rows: [],
          columns: [],
          maxCols: 0,
          totalDates: 0,
          source: SOURCE,
          note: '暂无数据，请点击"更新"按钮获取最新数据',
        });
      }

      // 构建矩阵行。
      // 每行只取涨停数最多的前 MAX_SECTOR_COLS 个板块：历史基线是概念口径（模板 17 列），
      // 实时抓取是东财行业口径（单日可达 40+ 板块），若不截断会让表格列数被单日行业数据撑爆，
      // 导致其余百余行几乎全空。截断后两种口径在同一张表里都能保持可读。
      const todayToken = toDateToken(new Date());
      const matrixRows: MatrixRow[] = allRows.map(r => {
        const sectors = (JSON.parse(r.sectors_json) as Array<{ name: string; count: number }>)
          .slice(0, MAX_SECTOR_COLS);
        const storedType = (r.day_type as SectorDayType) || "trading";
        const isToday = r.date === todayToken;
        /**
         * 「今日待更新」只在今天**是交易日但还没有数据**时成立：
         * 今天若是周末/法定节假日，仍应显示对应的休市文案，不能被今天这个条件覆盖。
         */
        const dayType: DisplayDayType =
          (isToday && sectors.length === 0 && storedType === "trading") ? "today" : storedType;
        return {
          date: fmtDateDisplay(r.date),
          dateToken: r.date,
          sectors,
          totalLimitUp: r.total_limit_up,
          substitutedDate: r.substituted_date,
          source: r.source ?? null,
          dayType,
          isToday,
        };
      });

      // 列对齐：基于全部历史数据计算最优列映射
      const mapping = buildColumnMapping(matrixRows);

      // 确定最大列数（取所有行中的最大板块数，至少 11 列，至多 MAX_SECTOR_COLS 列）
      const maxSectorCount = Math.max(...matrixRows.map(r => r.sectors.length), 11);
      const maxCols = Math.min(maxSectorCount, MAX_SECTOR_COLS);

      // 对齐每行数据
      const alignedRows = matrixRows.map(row => ({
        ...row,
        cells: alignRow(row.sectors, mapping, maxCols),
      }));

      // 生成列标题（板块1~板块N）
      const columns = Array.from({ length: maxCols }, (_, i) => `板块${i + 1}`);

      res.json({
        mode: 'matrix',
        rows: alignedRows,
        columns,
        maxCols,
        totalDates: alignedRows.length,
        stats: {
          trading: matrixRows.filter(r => r.dayType === 'trading').length,
          weekend: matrixRows.filter(r => r.dayType === 'weekend').length,
          holiday: matrixRows.filter(r => r.dayType === 'holiday').length,
          today: matrixRows.filter(r => r.dayType === 'today').length,
        },
        source: SOURCE,
        generatedAt: new Date().toISOString(),
        note:
          '日期轴完整保留，休市日（周末、法定节假日）逐行显示并标注，不省略；'
          + '按行业板块纵向汇总；仅统计沪深主板、创业板、科创板 A 股普通股；'
          + '涨停状态来自数据源涨停池；历史数据保留在本地；'
          + '涨停家数不代表板块强度或买卖建议。',
      });
    } catch (error: any) {
      res.status(502).json({
        error: error?.message || "获取板块效应数据失败",
        source: SOURCE,
      });
    }
  });

  /**
   * POST /api/sector-effect/refresh
   * 手动刷新：抓取最新交易日数据并存入数据库（不删除历史）
   * 可选查询参数 ?date=YYYYMMDD 指定日期（默认今天）
   */
  app.post("/api/sector-effect/refresh", async (req, res) => {
    try {
      const rawDate = String(req.body.date || req.query.date || "").replace(/-/g, "").trim();
      const targetDate = /^\d{8}$/.test(rawDate) ? rawDate : toDateToken(new Date());
      const force = !!(req.body?.force ?? req.query.force === "true");

      const result = await fetchAndStore(targetDate, { force });

      res.json({
        success: true,
        skipped: !!result.skipped,
        date: result.date,
        requestedDate: result.requestedDate,
        substitutedDate: result.substitutedDate,
        totalLimitUp: result.totalLimitUp,
        sectorCount: result.sectors.length,
        topSectors: result.sectors.slice(0, 5),
        source: SOURCE,
        generatedAt: new Date().toISOString(),
        message: result.skipped
          ? `${result.date} 已存在模板历史数据（概念口径），已保留未覆盖；实时抓取仅对新日期生效`
          : undefined,
      });
    } catch (error: any) {
      res.status(502).json({
        success: false,
        error: error?.message || "更新板块效应数据失败",
        source: SOURCE,
      });
    }
  });

  /**
   * POST /api/sector-effect/import-history
   * 重新导入内置历史基线（2026 年腾讯文档模板）。
   * body: { force?: boolean } —— force=true 时用模板数据覆盖同日期已有记录；
   * 默认只补齐缺失日期，保留现有数据。
   */
  app.post("/api/sector-effect/import-history", async (req, res) => {
    try {
      const force = !!(req.body?.force ?? req.query.force === "true");
      const r = importBuiltinHistory(force);
      res.json({
        success: true,
        force,
        added: r.added,
        updated: r.updated,
        total: r.total,
        message: force
          ? `已重新导入历史基线：新增 ${r.added} 天，覆盖 ${r.updated} 天`
          : `已补齐历史基线：新增 ${r.added} 天（已有记录保持不变）`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "导入历史数据失败" });
    }
  });

  // 首次启动自动补齐历史基线（本地已有数据则跳过）
  ensureHistorySeeded();

  // 启动自动更新调度器
  startAutoUpdateScheduler();
}
