import express from "express";
import https from "node:https";
import * as db from "./db.js";
import {
  SECTOR_EFFECT_HISTORY,
  HISTORY_SYNC_VERSION,
  type SectorDayType,
} from "./sectorEffectHistory.js";

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
 * 自动更新：每个交易日 20:00 自动抓取当日收盘涨停数据并入库（当日标签，不再错位到次日）。
 */

const EM_UT = "7eea3edcaed734bea9cbfc24409ed989";
/** 实时抓取来源名称（同花顺概念口径；回退时为东方财富行业口径） */
const SOURCE = "同花顺涨停板行情（板块TOP，概念口径）";
const SOURCE_EM_FALLBACK = "东方财富涨停板行情（涨停池，行业口径）";

/** 手动录入数据的来源标记。含此标记的日期属于用户资产，不会被自动抓取或模板导入覆盖。 */
const MANUAL_SOURCE = "手动录入";

/**
 * 实时抓取的数据源。
 *   - "tonghuashun"：同花顺 data.10jqka.com.cn，概念口径，**支持历史日期**，直接返回板块统计（当前默认）
 *   - "eastmoney" ：东方财富涨停池，行业口径，需按个股 hybk 自行聚合（保留为回退）
 * 同花顺取数失败时会自动回退到东方财富。
 */
const DATA_SOURCE: "tonghuashun" | "eastmoney" = "tonghuashun";

/** 数据源抓取结果：板块统计 + 真实涨停总数 */
interface SectorFetchResult {
  date: string;                                  // 数据源实际日期
  sectors: Array<{ name: string; count: number }>; // 按 count 降序
  totalLimitUp: number;                          // 全市场涨停总数（非各板块之和）
  source: string;                                // 实际生效的数据源名称
}

/**
 * 单日板块数「软上限」——仅用于防止脏数据（如数据源一次性返回上百个无意义板块），
 * 不参与列数计算。表格列数由「历史上出现过的板块名并集」动态决定，随数据增长，无硬上限。
 */
const SOFT_DAILY_SECTOR_CAP = 60;

/**
 * 判断某行是否属于「用户资产」——手动录入 或 腾讯文档模板。
 *
 * 这两类数据都不可被自动抓取的东财数据覆盖：
 *   - 手动录入：数据源出问题时用户手工修正的结果，优先级最高；
 *   - 腾讯文档模板：用户手工整理的历史基线（概念口径），与东财行业口径不同，覆盖会丢信息。
 */
function isProtectedSource(source: unknown): boolean {
  const s = String(source || "");
  return s.includes(MANUAL_SOURCE) || s.includes("腾讯文档");
}

/** 判断某行是否为「用户手动录入」（用于基线重同步时决定能否覆盖） */
function isManualEntry(source: unknown): boolean {
  return String(source || "").includes(MANUAL_SOURCE);
}

/** 元信息 key：已导入的内置基线版本 */
const META_HISTORY_VERSION = "history_sync_version";

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

// ============= 数据源工具函数 =============

/** 通用 UA（反爬需要） */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function requestJson(
  url: string,
  timeoutMs = 15000,
  headers?: Record<string, string>,
): Promise<any> {
  const __t0 = Date.now();
  if (process.env.SECTOR_DEBUG === '1') {
    console.log(`[SectorEffect][debug] → ${url.slice(0, 90)} (timeoutMs=${timeoutMs})`);
  }
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: headers || {
          "User-Agent": BROWSER_UA,
          Referer: "https://quote.eastmoney.com/",
        },
      },
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
    req.setTimeout(timeoutMs, () => {
      if (process.env.SECTOR_DEBUG === '1') {
        console.log(`[SectorEffect][debug] ✗ TIMEOUT after ${Date.now() - __t0}ms (set=${timeoutMs})`);
      }
      req.destroy(new Error("请求数据源超时"));
    });
    req.on("error", (err) => {
      if (process.env.SECTOR_DEBUG === '1') {
        console.log(`[SectorEffect][debug] ✗ ERR after ${Date.now() - __t0}ms: ${(err as Error)?.message}`);
      }
      reject(err);
    });
    req.on("response", () => {
      if (process.env.SECTOR_DEBUG === '1') {
        console.log(`[SectorEffect][debug] ← response headers at ${Date.now() - __t0}ms`);
      }
    });
    req.on("close", () => {
      if (process.env.SECTOR_DEBUG === '1') {
        console.log(`[SectorEffect][debug] ← close at ${Date.now() - __t0}ms`);
      }
    });
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

// ---------- 东方财富（行业口径，备用回退） ----------

async function fetchEastmoneyPool(dateToken: string): Promise<{ date: string; stocks: LimitUpStock[] }> {
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

// ---------- 同花顺（概念口径，主数据源） ----------

/** 同花顺 data.10jqka.com.cn 的反爬请求头：必须带 UA + Referer */
const THS_HEADERS = {
  "User-Agent": BROWSER_UA,
  Referer: "https://data.10jqka.com.cn/",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

/**
 * 同花顺板块名 → 用户腾讯文档口径的归并表。
 *
 * 目的：同花顺给的是概念名（如「机器人概念」），腾讯文档历史用的是简写（「机器人」），
 * 若不归并，同一个概念会在矩阵表里占两列，破坏「同一板块固定在同一列」的展示规则。
 *
 * 只收录语义明确、无歧义的同义词；无法确定的一律保留同花顺原名，绝不臆造归类。
 */
const THS_SECTOR_ALIAS: Record<string, string> = {
  机器人概念: "机器人",
  人形机器人: "机器人",
  芯片概念: "半导体",
  存储芯片: "半导体",
  光刻机: "半导体",
  人工智能: "AI应用",
  算力概念: "算力",
  数据中心: "算力",
  液冷: "液冷服务器",
  "AI液冷散热": "液冷服务器",
  电池: "锂电池",
  电池产业链: "锂电池",
  固态电池: "锂电池",
  航天: "商业航天",
  航空发动机: "商业航天",
  大飞机: "商业航天",
  有色: "有色金属",
  稀有金属: "有色金属",
  小金属: "有色金属",
  地产: "房地产",
  房地产开发: "房地产",
  农牧饲渔: "农业",
  猪肉概念: "农业",
  农牧: "农业",
  中字头: "央企国企改革",
  央国企: "央企国企改革",
  光模块: "光通信",
  光纤概念: "光通信",
  CPO: "光通信",
  电力设备: "电力",
  绿色电力: "电力",
  虚拟电厂: "智能电网",
  特高压: "智能电网",
};

/** 归并同花顺板块名到腾讯文档口径 */
function normalizeThsSector(raw: string): string {
  const base = String(raw || "").trim();
  if (!base) return "未标注板块";
  return THS_SECTOR_ALIAS[base] || base;
}

// ============= 展示层归并表（板块名 → 标准名） =============
//
// 仅在渲染阶段生效；原始板块名仍原样存库（手动编辑 / 审计均可追溯）。
// 只合并「同一子板块 / 同一炒作驱动」的同义板块，绝不臆造归类。
// 该表与数据源无关：腾讯文档基线、同花顺实时抓取、东财回退走同一套透视逻辑。
//
// 用户可在界面（板块管理）通过 app_meta 热更新覆盖，无需重新打包。
const SECTOR_CANON_GROUPS: Record<string, string[]> = {
  农业: ["大农业", "农林牧渔", "养殖", "猪肉", "养猪"],
  电力: ["智能电网", "算电协同", "AI电力", "AI配电", "AI能源", "电力+网络设备", "AI电力相关"],
  半导体: ["国产芯片", "芯片", "存储", "光刻机", "光刻胶", "大硅片", "硅片", "磷化铟", "长鑫科技", "CPU", "闪存", "存储芯片", "国产芯片+半导体", "存储+芯片", "存储芯片5+国产芯片"],
  液冷散热: ["液冷", "液冷服务器", "AI液冷", "服务器散热", "数据中心散热", "金刚石散热", "AI液冷散热", "AI散热"],
  算力: ["数据中心", "云计算", "超节点", "算力相关", "算力+数据中心", "数据中心算力", "云计算数据中心", "算力/词元概念"],
  AI应用: ["AI营销", "AI传媒", "AIPC", "AI手机", "AI硬件", "人工智能大模型", "AI大模型", "阿里AI", "AI编程", "AI基站"],
  医药: ["医疗医药", "中药", "AI医疗"],
  商业航天: ["军工", "航天", "航天+军工", "太空光伏"],
  锂电池: ["电池", "固态电池", "钠离子电池", "锂电产业链", "电池产业链", "锂电池产业链", "锂矿", "锂矿+锂电池", "新能源产业链", "电池储能", "储能", "PET符合铜箔"],
  石油石化: ["石油化工", "油气", "油服", "石油天然气", "石油", "石油石化"],
  黄金: ["贵金属", "黄金贵金属"],
  有色金属: ["有色金属", "有色稀土", "稀土", "矿产资源", "铝"],
  房地产: ["地产", "地产基建", "房地产"],
  基建: ["基建", "高铁轨交", "超级高铁"],
  传媒: ["影视", "影视短剧", "影视视频相关", "短剧", "游戏"],
  磷化工: ["磷化工/化工", "磷化工"],
  氟化工: ["氟化工/PTEE"],
  玻璃基板: ["玻璃基板", "玻璃基板封装", "苹果+玻璃基板", "玻璃纤维布", "电子布"],
  重组: ["资产重组", "并购重组", "股权转让", "摘帽", "ST摘帽", "摘帽相关"],
  培育钻石: ["培育钻石", "培育砖石"],
  核聚变: ["可控核聚变", "核聚变"],
  氢能: ["氢能源", "氢能", "氢气"],
  天然气: ["天然气"],
  大消费: ["消费"],
  业绩增长: ["业绩"],
};

/** 扁平化：别名 → 标准名（标准名本身不入表） */
const BASE_SECTOR_CANON: Record<string, string> = {};
for (const [std, aliases] of Object.entries(SECTOR_CANON_GROUPS)) {
  for (const a of aliases) if (a && a !== std) BASE_SECTOR_CANON[a] = std;
}

const META_CANON_OVERRIDES = "sector_canon_overrides"; // 手动合并覆盖：alias -> standard
const META_DISPLAY_NAMES = "sector_display_names";      // 手动显示名：standard -> label

/** 读取手动合并覆盖（app_meta，可热更新） */
function loadCanonOverrides(): Record<string, string> {
  try {
    const v = db.getMeta(META_CANON_OVERRIDES);
    return v ? JSON.parse(v) : {};
  } catch {
    return {};
  }
}
/** 读取手动显示名（app_meta，可热更新） */
function loadDisplayNames(): Record<string, string> {
  try {
    const v = db.getMeta(META_DISPLAY_NAMES);
    return v ? JSON.parse(v) : {};
  } catch {
    return {};
  }
}
/** 生效的归并映射：基础表 + 手动覆盖（覆盖优先） */
function effectiveCanon(): Record<string, string> {
  return { ...BASE_SECTOR_CANON, ...loadCanonOverrides() };
}
/** 板块名 → 标准名 */
function canonOf(name: string, map: Record<string, string>): string {
  const n = String(name || "").trim();
  return (n && map[n]) || n || "未标注板块";
}
/** 标准名 → 显示标签（手动重命名优先） */
function displayOf(std: string, map: Record<string, string>): string {
  return (std && map[std]) || std;
}

// ============= 透视构建：板块名 pivot =============

interface PivotColumn {
  key: string;     // 标准名（透视键）
  label: string;   // 显示标签（可手动重命名）
  merged: boolean; // 是否由多个原名归并而来（用于角标）
}
interface PivotCell {
  count: number;
  parts: Array<{ name: string; count: number }>; // 当日构成（悬停明细）
}
interface PivotRow {
  date: string;        // 显示日期 YYYY/M/D
  dateToken: string;   // YYYYMMDD
  dayType: DisplayDayType;
  isToday: boolean;
  source: string | null;
  substitutedDate: string | null;
  cells: Record<string, PivotCell>; // key -> cell
}

/**
 * 把按日存储的板块数据透视成「板块名 × 日期」矩阵。
 *
 * - 列 = 历史上出现过的板块标准名并集（经归并），无硬上限，随数据增长；
 * - 排序：近 windowDays 个交易日的活跃度降序（近期活跃靠前；windowDays=0 显示全部）；
 * - 过滤：windowDays>0 时仅保留「近 windowDays 交易日有过涨停」的列；
 * - 单元格：同日多个原名归并时涨停数相加，parts 记录各原名明细供悬停；
 * - 周末/节假日作为空行保留在日期轴中。
 */
function buildSectorPivot(
  allRows: Array<{
    date: string;
    day_type: string;
    sectors_json: string;
    source: string | null;
    substituted_date: string | null;
  }>,
  windowDays: number,
): { columns: PivotColumn[]; rows: PivotRow[] } {
  const canonMap = effectiveCanon();
  const dispMap = loadDisplayNames();

  interface DayAgg {
    date: string;
    dateToken: string;
    dayType: DisplayDayType;
    isToday: boolean;
    source: string | null;
    substitutedDate: string | null;
    trading: boolean;
    map: Map<string, { count: number; parts: Map<string, number> }>;
  }

  const dayAgg = new Map<string, DayAgg>();
  const stdAliases = new Map<string, Set<string>>(); // 每个标准名出现过哪些原名（判定 merged）
  const todayToken = toDateToken(new Date());

  for (const r of allRows) {
    let sectors: Array<{ name: string; count: number }> = [];
    try {
      sectors = JSON.parse(r.sectors_json);
    } catch {
      sectors = [];
    }
    if (!Array.isArray(sectors)) sectors = [];

    const storedType = (r.day_type as SectorDayType) || "trading";
    const isToday = r.date === todayToken;
    const dayType: DisplayDayType =
      isToday && sectors.length === 0 && storedType === "trading" ? "today" : storedType;

    const entry: DayAgg = {
      date: fmtDateDisplay(r.date),
      dateToken: r.date,
      dayType,
      isToday,
      source: r.source ?? null,
      substitutedDate: r.substituted_date,
      trading: storedType === "trading",
      map: new Map(),
    };

    for (const s of sectors) {
      const raw = String(s?.name ?? "").trim();
      const std = canonOf(raw, canonMap);
      const cnt = Number(s?.count) || 0;
      if (!std) continue;
      let agg = entry.map.get(std);
      if (!agg) {
        agg = { count: 0, parts: new Map() };
        entry.map.set(std, agg);
      }
      agg.count += cnt;
      agg.parts.set(raw, (agg.parts.get(raw) || 0) + cnt);
      if (!stdAliases.has(std)) stdAliases.set(std, new Set());
      stdAliases.get(std)!.add(raw);
    }
    dayAgg.set(r.date, entry);
  }

  // 近 N 交易日（用于活跃度排序与主线过滤）
  const tradingDates = [...dayAgg.values()]
    .filter(d => d.trading)
    .map(d => d.dateToken)
    .sort();
  const lastN = new Set(windowDays > 0 ? tradingDates.slice(-windowDays) : tradingDates);

  const colScore = new Map<string, number>(); // 近窗口活跃度
  const colTotal = new Map<string, number>(); // 全样本合计
  for (const d of dayAgg.values()) {
    for (const [std, agg] of d.map) {
      colTotal.set(std, (colTotal.get(std) || 0) + agg.count);
      if (windowDays === 0 || lastN.has(d.dateToken)) {
        colScore.set(std, (colScore.get(std) || 0) + agg.count);
      }
    }
  }

  let colKeys = [...colTotal.keys()];
  if (windowDays > 0) colKeys = colKeys.filter(k => (colScore.get(k) || 0) > 0);
  colKeys.sort(
    (a, b) =>
      (colScore.get(b) || 0) - (colScore.get(a) || 0) ||
      (colTotal.get(b) || 0) - (colTotal.get(a) || 0) ||
      a.localeCompare(b, "zh-Hans-CN"),
  );

  const columns: PivotColumn[] = colKeys.map(k => ({
    key: k,
    label: displayOf(k, dispMap),
    merged: (stdAliases.get(k)?.size || 0) > 1,
  }));

  const rows: PivotRow[] = [...dayAgg.values()]
    .sort((a, b) => a.dateToken.localeCompare(b.dateToken))
    .map(d => {
      const cells: Record<string, PivotCell> = {};
      for (const k of colKeys) {
        const agg = d.map.get(k);
        if (agg) {
          cells[k] = {
            count: agg.count,
            parts: [...agg.parts.entries()].map(([name, count]) => ({ name, count })),
          };
        }
      }
      return {
        date: d.date,
        dateToken: d.dateToken,
        dayType: d.dayType,
        isToday: d.isToday,
        source: d.source,
        substitutedDate: d.substitutedDate,
        cells,
      };
    });

  return { columns, rows };
}

/**
 * 抓取同花顺「板块 TOP」。
 *
 * 优势（实测 2026-09-02）：
 *   - 直接返回「板块名 + limit_up_num」，无需自己按个股聚合；
 *   - **支持历史日期**（东财不支持，传历史日期会被回写成最近交易日）；
 *   - 概念口径，与用户腾讯文档的板块命名同一层级。
 * 限制：只返回 TOP 20 板块（表格最多展示 17 列，够用）。
 */
async function fetchTonghuashunBlocks(dateToken: string): Promise<SectorFetchResult> {
  // 1) 板块统计（TOP 20）。同花顺对当日请求响应较慢（含个股明细，约 100KB+），
  //    超时给到 30 秒，并对网络抖动做一次重试。
  const blockUrl =
    `https://data.10jqka.com.cn/dataapi/limit_up/block_top`
    + `?filter=HS,GEM2STAR&date=${dateToken}`;

  let bj: any = null;
  let lastErr: unknown = null;
  // 最多 3 次：已知 Node 进程内首次 HTTPS 连接（DNS+TCP+TLS）约 5 秒，
  // 且 request.setTimeout 在连接建立阶段会提前触发，需要多给重试机会。
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      bj = await requestJson(blockUrl, 30000, THS_HEADERS);
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) {
        console.warn(
          `[SectorEffect] 同花顺连接较慢，第 ${attempt} 次重试（${dateToken}）`,
        );
        await new Promise(r => setTimeout(r, 800 * attempt));
      }
    }
  }
  if (!bj) throw lastErr instanceof Error ? lastErr : new Error("同花顺板块数据请求失败");

  const list: any[] = Array.isArray(bj?.data) ? bj.data : [];

  /**
   * 别名归并后可能出现同名板块（如「人工智能」与「AI应用」都归并为「AI应用」）。
   * 这类同义板块统计的是同一批涨停股，若相加会夸大数量，因此**保留最大值**，
   * 符合 sector-limitup-daily「同一板块内必须去重」的要求。
   */
  const merged = new Map<string, number>();
  for (const x of list) {
    const name = normalizeThsSector(String(x?.name || ""));
    const count = Number(x?.limit_up_num) || 0;
    if (!name || count <= 0) continue;
    const prev = merged.get(name);
    if (prev === undefined || count > prev) merged.set(name, count);
  }

  const sectors: Array<{ name: string; count: number }> = [...merged.entries()]
    .map(([name, count]) => ({ name, count }));
  sectors.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN"));

  // 2) 全市场涨停总数：取涨停池分页的 total（各板块 limit_up_num 之和会重复计数）
  let totalLimitUp = 0;
  try {
    const poolUrl =
      `https://data.10jqka.com.cn/dataapi/limit_up/limit_up_pool`
      + `?page=1&limit=1&field=199112,10,9001,330323,330324,330325,9002,330329,133971,133970,1968584,3475914,9003,9004`
      + `&filter=HS,GEM2STAR&order_field=330324&order_type=0&date=${dateToken}&_=1`;
    const pj = await requestJson(poolUrl, 25000, THS_HEADERS);
    totalLimitUp = Number(pj?.data?.page?.total) || 0;
  } catch {
    // 总数取不到不影响板块数据，置 0
  }

  return { date: dateToken, sectors, totalLimitUp, source: SOURCE };
}

/**
 * 统一入口：按数据源抓取某日的「板块统计 + 真实涨停总数」。
 *
 * 返回 totalLimitUp 而非让调用方用 sum(板块count) 代替 —— 同一只股票可归入多个板块，
 * 各板块 limit_up_num 相加会重复计数，必须用数据源给出的全市场涨停总数。
 */
async function fetchSectorStats(dateToken: string): Promise<SectorFetchResult> {
  if (DATA_SOURCE === "tonghuashun") {
    try {
      return await fetchTonghuashunBlocks(dateToken);
    } catch (err: any) {
      // 同花顺不可用 → 回退东方财富，保证功能不中断
      console.warn(
        `[SectorEffect] 同花顺取数失败（${err?.message || err}），回退东方财富`,
      );
    }
  }
  const em = await fetchEastmoneyPool(dateToken);

  /**
   * 关键防护：东财不支持历史日期——传入历史日期时，它返回的 qdate 会被回写成
   * 「最近交易日」。若照单全收，就会把最近交易日的数据写到别的日期上，
   * 造成日期错乱（实测：请求 20260901 返回 20260902 的数据）。
   * 这里直接在回退路径上拒绝，避免污染正确日期的数据。
   */
  if (em.stocks.length > 0 && em.date !== dateToken) {
    throw new Error(
      `东方财富不支持 ${dateToken} 的历史数据（数据源回写为 ${em.date}），已放弃写入以避免日期错乱`,
    );
  }

  return {
    date: em.date,
    sectors: aggregate(em.stocks),
    totalLimitUp: em.stocks.length,
    source: SOURCE_EM_FALLBACK,
  };
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
  let result = await fetchSectorStats(dateToken);
  let substitutedDate: string | null = null;

  // 非交易日或尚未收盘：向前回溯
  if (result.sectors.length === 0) {
    for (let i = 1; i <= 7; i += 1) {
      const candidate = shiftDays(dateToken, -i);
      const probe = await fetchSectorStats(candidate);
      if (probe.sectors.length > 0) {
        result = probe;
        substitutedDate = probe.date;
        break;
      }
    }
  }

  if (!substitutedDate && result.date !== dateToken) substitutedDate = result.date;

  const sectors = result.sectors;

  /**
   * 关键防护：抓取结果为空时绝不写库。
   *
   * 东财涨停池不支持历史日期查询——传入任意历史日期，数据源都会把 qdate 回写成
   * 「最近交易日」并返回空池。若照常 UPSERT，就会用空数据覆盖掉该最近交易日已有的
   * 有效记录（实测：查询 20260315 后，20260831 的真实数据被清空）。
   *
   * 同花顺 block_top 支持历史日期，但周末/节假日同样返回空，此防护依旧必要。
   */
  if (sectors.length === 0) {
    console.warn(
      `[SectorEffect] 请求 ${dateToken} 未取到有效涨停数据（数据源日期=${result.date}），跳过写入以避免覆盖已有记录`,
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
    // 手动录入的数据同样受保护——用户手工修正的结果不应被自动抓取顶掉。
    if (existing && isProtectedSource(existing.source)) {
      console.log(
        `[SectorEffect] ${result.date} 已有模板/手动录入数据，保护跳过写入（需替换请显式传 force）`,
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
  // total_limit_up 用数据源给出的全市场涨停总数，而非各板块之和（会重复计数）。
  db.upsertSectorEffect({
    date: result.date,
    day_type: "trading",
    sectors_json: JSON.stringify(sectors),
    total_limit_up: result.totalLimitUp,
    source: result.source,
    substituted_date: substitutedDate,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log(
    `[SectorEffect] 存储 ${result.date} 完成: ${result.totalLimitUp}只涨停, ${sectors.length}个板块`
    + `（数据源：${result.source}）`,
  );

  return {
    date: result.date,
    requestedDate: dateToken,
    substitutedDate,
    sectors,
    totalLimitUp: result.totalLimitUp,
  };
}

// ============= 内置历史数据导入 =============

const HISTORY_SOURCE = "腾讯文档模板·2026板块效应（概念板块口径）";

/**
 * 导入内置历史数据（2026 年腾讯文档模板）。
 *
 * 背景：东财涨停池接口不支持历史日期查询——传入任意历史日期都会被数据源强制替换为
 * 最近交易日，更早的日期返回空池。同花顺 block_top 虽支持历史日期，但用户模板里的
 * 概念口径是手工整理的结果，仍以内置文件作为历史基线最可靠。
 *
 * 策略：
 *   - 默认只补齐本地缺失的日期，不覆盖已有记录（保留用户后续抓取/修正的数据）；
 *   - force=true 时用模板数据覆盖同日期记录。
 *   - resync=true 时（基线版本变更）覆盖非手动录入的记录。
 *
 * @returns 本次新增条数、覆盖条数、跳过的无效行数
 */
/**
 * @param force  强制覆盖一切（含用户手动录入的行）—— 仅用于用户在界面显式「强制导入」。
 * @param resync 基线版本更新后的自动重同步：覆盖非手动录入的行，手动数据仍受保护。
 */
function importBuiltinHistory(force = false, resync = false): { added: number; updated: number; total: number } {
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
    //
    // 例外：非强制模式下，用户手动录入过该日数据（哪怕是休市日）时跳过，尊重用户修正。
    if (dayType !== "trading") {
      if (existing && !force && !(resync && !isManualEntry(existing.source))) {
        continue;
      }
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

    // 已存在时的覆盖策略：
    //   force  → 覆盖一切（用户显式强制导入）
    //   resync → 覆盖非手动录入的数据（基线版本更新后的自动重同步）
    //   默认   → 保留现有数据（仅补齐缺失日期）
    if (existing && !force && !(resync && !isManualEntry(existing.source))) continue;

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
    // 手动录入的数据由用户自己负责，不做垃圾清理（可能有意保留特定板块名）
    if (isProtectedSource(r.source)) continue;
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

/**
 * 清理旧版 08:00 调度遗留的已知日期错位：将被数据源标记为 9/1 的记录迁回 9/1。
 *
 * 旧版在 9/2 早上执行时，可能把 9/1 收盘数据写到 9/2。迁移必须依据
 * substituted_date（数据源实际返回日期）判断，不能依赖当前系统时间窗口；否则用户
 * 在 9/2 20:00 之后或更晚启动软件时，旧错位记录会永久残留。
 *
 * 同时支持两种数据源标记：
 *   ① 新版 substituted_date='20260901' → 直接迁移；
 *   ② 老版本 substituted_date 缺失（substituted_date=null/''）→ 用「旧版 08:00 错位窗口」
 *      作为第二重限制：只有 2026/9/2 20:00（中国标准时间）之前写入的 9/2 记录才允许迁移。
 *
 * 目标行 9/1 不存在（数据库是 9/2 当天新建的）时也支持：从 9/2 复制一份并改成 9/1 标签。
 */
function repairKnownLegacyDateShift(): boolean {
  const shifted = db.getSectorEffectByDate('20260902');
  if (!shifted) return false;
  if (shifted.day_type !== 'trading') return false;

  let shiftedSectors: Array<{ name: string; count: number }> = [];
  try {
    shiftedSectors = JSON.parse(shifted.sectors_json);
  } catch {
    return false;
  }
  if (!Array.isArray(shiftedSectors) || shiftedSectors.length === 0) return false;
  if (!String(shifted.source || '').includes('东方财富')) return false;

  // 以数据源实际日期为首要证据。旧版本部分记录没有保存 substituted_date，
  // 对这类历史遗留记录，再用「旧版 08:00 错位窗口」作为第二重限制：
  // 只有 2026/9/2 当日 20:00（中国标准时间）之前写入的 9/2 记录才允许迁移。
  const actualDate = String(shifted.substituted_date || '').replace(/-/g, '');
  const legacyCutoff = Date.parse('2026-09-02T12:00:00.000Z'); // 中国时间 2026/9/2 20:00
  const createdAt = Date.parse(String(shifted.created_at || ''));
  const isLegacyWindow = Number.isFinite(createdAt) && createdAt < legacyCutoff;
  if (actualDate !== '20260901' && !(actualDate === '' && isLegacyWindow)) {
    console.warn(`[SectorEffect] 检测到 20260902 有实时数据，但无法确认其属于 20260901（actual=${actualDate || '未知'}，created_at=${shifted.created_at || '未知'}），未自动迁移`);
    return false;
  }

  const target = db.getSectorEffectByDate('20260901');
  let targetSectors: Array<{ name: string; count: number }> = [];
  if (target) {
    // 9/1 若是用户手动录入的 → 不迁移，尊重用户修正
    if (isProtectedSource(target.source)) return false;
    try { targetSectors = JSON.parse(target.sectors_json); } catch { /* 解析失败按空处理 */ }
    // 9/1 已被「东方财富」抓取的真实数据覆盖过 → 不重复迁移，避免数据回滚
    if (String(target.source || '').includes('东方财富')) return false;
    // 9/1 已有非模板来源的实时数据 → 不重复迁移
    if (Array.isArray(targetSectors) && targetSectors.length > 0
        && !String(target.source || '').includes('腾讯文档模板')) return false;
  }

  // 9/1 不存在 或 9/1 是空白行：把 9/2 的实时数据迁过去
  const nowIso = new Date().toISOString();
  db.upsertSectorEffect({
    date: '20260901',
    day_type: 'trading',
    sectors_json: shifted.sectors_json,
    total_limit_up: shifted.total_limit_up,
    source: shifted.source,
    substituted_date: null,
    created_at: target?.created_at || nowIso,
    updated_at: nowIso,
  });
  db.deleteSectorEffect('20260902');
  console.warn(`[SectorEffect] 已修正旧版日期错位：20260902 → 20260901（${target ? '覆盖空白行' : '新建缺失行'}，依据数据源实际日期）`);
  return true;
}

function ensureHistorySeeded(): void {
  try {
    // 1) 基线版本检测：腾讯文档重新同步后 HISTORY_SYNC_VERSION 会变化，
    //    此时自动重同步（覆盖非手动录入的行），让用户更新软件就能拿到最新数据。
    let resync = false;
    const savedVersion = db.getMeta(META_HISTORY_VERSION);
    if (savedVersion !== HISTORY_SYNC_VERSION) {
      resync = savedVersion !== null; // 首次运行不算 resync，走普通补齐
      console.log(
        `[SectorEffect] 内置基线版本变更：${savedVersion ?? '(首次)'} → ${HISTORY_SYNC_VERSION}`
        + (resync ? '，将自动重同步（手动录入的行保留）' : ''),
      );
    }

    // 2) 导入 / 重同步内置基线。
    //    注意：必须先导入基线再跑 9/1 迁移 —— 2026-09-02 的腾讯文档基线已包含 9/1 真实数据，
    //    先导入可让迁移逻辑识别到 9/1 已有数据而跳过，避免把 9/2 的东财数据误搬到 9/1。
    const r = importBuiltinHistory(false, resync);
    db.setMeta(META_HISTORY_VERSION, HISTORY_SYNC_VERSION);
    if (r.added > 0 || r.updated > 0) {
      const trading = SECTOR_EFFECT_HISTORY.filter(x => x.day_type === 'trading').length;
      const resting = SECTOR_EFFECT_HISTORY.length - trading;
      console.log(
        `[SectorEffect] 内置历史基线${resync ? '已重同步' : '已补齐'}：`
        + `新增 ${r.added} 天、更新 ${r.updated} 天`
        + `（模板共 ${r.total} 行：交易日 ${trading} 天、休市日 ${resting} 天）`,
      );
    } else {
      console.log("[SectorEffect] 内置历史基线已完整，无需补齐");
    }

    // 3) 旧版日期错位迁移（一次性历史修复，基线已含 9/1 数据时会自动跳过）
    const repaired = repairKnownLegacyDateShift();
    if (repaired) console.log('[SectorEffect] 已完成 9/1 数据归属修复');

    // 4) 清理照搬腾讯文档产生的脏单元格
    const gc = cleanupGarbageSectors();
    if (gc > 0) console.log(`[SectorEffect] 启动清理：剔除 ${gc} 行照搬脏单元格`);
  } catch (err: any) {
    console.error("[SectorEffect] 导入历史基线失败:", err?.message || err);
  }
}

// ============= 板块效应自动更新调度器（交易日 17:00 / 18:00 两轮 + 启动补抓） =============

let autoUpdateTimer: ReturnType<typeof setInterval> | null = null;
let schedDailyKey: string = '';     // 当前排程所属日期
let schedRoundsDone: number = 0;    // 当天已完成轮次（0/1/2）

/**
 * A 股休市日（每年初按国务院当年安排更新；若漏配或误配，fetchAndStore 的空结果不写库
 * 保护仍会兜底，不会用脏数据覆盖有效记录）。
 * 注：调休补班周六若交易所实际开市，本集合未含，会被当作周末跳过——属边缘情况，可手动更新补齐。
 */
const EXCHANGE_HOLIDAYS_2026 = new Set<string>([
  '20260101', '20260102', '20260103',            // 元旦
  '20260215', '20260216', '20260217', '20260218', '20260219', '20260220', '20260221', '20260222', // 春节
  '20260404', '20260405', '20260406',            // 清明
  '20260501', '20260502', '20260503', '20260504', '20260505', // 劳动
  '20260619', '20260620', '20260621',            // 端午
  '20260925', '20260926', '20260927',            // 中秋
  '20261001', '20261002', '20261003', '20261004', '20261005', '20261006', '20261007', // 国庆
]);

/** 交易日判定：周一~周五，且非法定休市日 */
function isTradingDay(d: Date): boolean {
  const day = d.getDay();
  if (day < 1 || day > 5) return false;
  return !EXCHANGE_HOLIDAYS_2026.has(toDateToken(d));
}

function resetSchedIfNewDay(now: Date): void {
  const key = toDateToken(now);
  if (key !== schedDailyKey) {
    schedDailyKey = key;
    schedRoundsDone = 0;
  }
}

/** 启动自动更新调度器：交易日 17:00、18:00 各抓一次（两轮）；App 在 18:00 后启动则补抓一次 */
export function startAutoUpdateScheduler(): void {
  if (autoUpdateTimer) return;  // 已启动

  const fireOnce = async (label: string): Promise<void> => {
    try {
      const now = new Date();
      if (!isTradingDay(now)) return;
      const todayToken = toDateToken(now);
      console.log(`[SectorEffect] 自动更新触发(${label}): ${todayToken}`);
      await fetchAndStore(todayToken);
    } catch (err: any) {
      console.error('[SectorEffect] 自动更新失败:', err?.message || err);
    }
  };

  // 每分钟检查一次是否到了 17:00 / 18:00（按日重置轮次）
  autoUpdateTimer = setInterval(() => {
    try {
      const now = new Date();
      resetSchedIfNewDay(now);
      if (!isTradingDay(now)) return;
      const h = now.getHours();
      if (h === 17 && schedRoundsDone < 1) { schedRoundsDone = 1; fireOnce('17:00'); }
      else if (h === 18 && schedRoundsDone < 2) { schedRoundsDone = 2; fireOnce('18:00'); }
    } catch (err: any) {
      console.error('[SectorEffect] 调度检查异常:', err?.message || err);
    }
  }, 60000);

  // 启动补抓：今天为交易日且已过 18:00、且今日尚未更新 → 立即补一次（规避关 App 漏更）
  (async () => {
    try {
      const now = new Date();
      resetSchedIfNewDay(now);
      if (isTradingDay(now) && now.getHours() >= 18 && schedRoundsDone < 2) {
        schedRoundsDone = 2;
        await fireOnce('启动补抓');
      }
    } catch (err: any) {
      console.error('[SectorEffect] 启动补抓异常:', err?.message || err);
    }
  })();

  console.log('[SectorEffect] 自动更新调度器已启动（交易日 17:00/18:00 两轮 + 启动补抓）');
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

      // 矩阵模式：按「板块名透视(pivot)」重排。
      // 列 = 历史上出现过的板块名并集（经归并映射），无硬上限；
      // 排序按近 windowDays 交易日活跃度（近期活跃靠前）；windowDays=0 显示全部列。
      const windowDays = (() => {
        const w = parseInt(String(req.query.window || "15"), 10);
        return [0, 10, 15, 20].includes(w) ? w : 15;
      })();
      const allRowsAll = db.getSectorEffectAll(
        Math.min(parseInt(String(req.query.limit || "100000"), 10) || 100000, 100000),
      );

      if (allRowsAll.length === 0) {
        return res.json({
          mode: 'matrix',
          window: windowDays,
          rows: [],
          columns: [],
          totalDates: 0,
          source: SOURCE,
          note: '暂无数据，请点击"更新"按钮获取最新数据',
        });
      }

      const pivot = buildSectorPivot(allRowsAll, windowDays);
      const stats = {
        trading: pivot.rows.filter(r => r.dayType === 'trading').length,
        weekend: pivot.rows.filter(r => r.dayType === 'weekend').length,
        holiday: pivot.rows.filter(r => r.dayType === 'holiday').length,
        today: pivot.rows.filter(r => r.dayType === 'today').length,
      };

      res.json({
        mode: 'matrix',
        window: windowDays,
        columns: pivot.columns,
        rows: pivot.rows,
        totalDates: pivot.rows.length,
        stats,
        source: SOURCE,
        generatedAt: new Date().toISOString(),
        note:
          '列由历史上出现过的板块名并集动态生成（无硬上限，随数据增长）；'
          + '同板块固定在同一列，便于纵向追踪持续性与情绪；涨停为 0 当天留空；'
          + '归并仅发生在展示层，原始板块名仍保留在库中；'
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
      // 注意：东财涨停池不支持历史日期查询（qdate 会被回写为最近交易日），
      // 因此默认刷新目标只能是「今天」。指定 date 时也仅对最近交易日有效。
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
          ? `${result.date} 已存在模板或手动录入数据，已保留未覆盖；实时抓取仅对新日期生效（如需替换请勾选强制覆盖）`
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
   * GET /api/sector-effect/day/:date
   * 获取单日原始数据（编辑用）。与矩阵模式不同，这里不做列截断，
   * 返回该日完整板块列表，保证编辑后不会意外丢掉超出展示列数的数据。
   */
  app.get("/api/sector-effect/day/:date", (req, res) => {
    const dateToken = String(req.params.date || "").replace(/-/g, "").trim();
    if (!/^\d{8}$/.test(dateToken)) {
      return res.status(400).json({ success: false, error: "日期格式应为 YYYYMMDD" });
    }
    const row = db.getSectorEffectByDate(dateToken);
    if (!row) {
      return res.json({
        success: true,
        exists: false,
        date: dateToken,
        dayType: "trading" as SectorDayType,
        sectors: [] as Array<{ name: string; count: number }>,
        totalLimitUp: 0,
        source: null,
      });
    }
    let sectors: Array<{ name: string; count: number }> = [];
    try { sectors = JSON.parse(row.sectors_json); } catch { sectors = []; }
    return res.json({
      success: true,
      exists: true,
      date: row.date,
      dayType: row.day_type,
      sectors,
      totalLimitUp: row.total_limit_up,
      source: row.source,
      updatedAt: row.updated_at,
      isManual: isProtectedSource(row.source),
    });
  });

  /**
   * PUT /api/sector-effect/day/:date
   * 手动保存某日板块数据（数据源异常时的兜底录入）。
   *
   * body:
   *   - sectors: [{ name: string, count: number }]  必填，板块与涨停数
   *   - dayType: 'trading' | 'weekend' | 'holiday'  可选，默认 trading
   *
   * 写入后 source 标记为「手动录入」，此后自动抓取与模板导入都不会覆盖该日；
   * 需要恢复自动更新时，用 DELETE 清空该日即可（清空后重新变回自动数据）。
   */
  app.put("/api/sector-effect/day/:date", (req, res) => {
    const dateToken = String(req.params.date || "").replace(/-/g, "").trim();
    if (!/^\d{8}$/.test(dateToken)) {
      return res.status(400).json({ success: false, error: "日期格式应为 YYYYMMDD" });
    }

    const rawSectors = Array.isArray(req.body?.sectors) ? req.body.sectors : null;
    if (!rawSectors) {
      return res.status(400).json({ success: false, error: "缺少 sectors 字段" });
    }

    // 校验并规范化：板块名去空白、数量取非负整数；名称为空的行直接丢弃
    const sectors: Array<{ name: string; count: number }> = [];
    const warnings: string[] = [];
    for (const item of rawSectors) {
      const name = String(item?.name ?? "").trim();
      if (!name) continue;
      const count = Number(item?.count);
      if (!Number.isFinite(count) || count < 0) {
        warnings.push(`「${name}」的涨停数不是有效数字，已按 0 处理`);
        sectors.push({ name, count: 0 });
        continue;
      }
      sectors.push({ name, count: Math.round(count) });
    }
    if (sectors.length > SOFT_DAILY_SECTOR_CAP) {
      return res.status(400).json({
        success: false,
        error: `单日板块数量最多 ${SOFT_DAILY_SECTOR_CAP} 个（当前 ${sectors.length} 个）`,
      });
    }

    const rawDayType = String(req.body?.dayType || "trading");
    const dayType: SectorDayType =
      rawDayType === "weekend" || rawDayType === "holiday" ? rawDayType : "trading";

    // 休市日不应带板块数据——若用户在休市日填了板块，保留但给出提示
    if (dayType !== "trading" && sectors.length > 0) {
      warnings.push("该日已标记为休市，但仍写入了板块数据，展示时会被休市样式覆盖");
    }

    const existing = db.getSectorEffectByDate(dateToken);
    const nowIso = new Date().toISOString();
    db.upsertSectorEffect({
      date: dateToken,
      day_type: dayType,
      sectors_json: JSON.stringify(sectors),
      total_limit_up: sectors.reduce((s, x) => s + x.count, 0),
      source: MANUAL_SOURCE,
      substituted_date: null,
      created_at: existing?.created_at || nowIso,
      updated_at: nowIso,
    });

    console.log(
      `[SectorEffect] 手动保存 ${dateToken}：${sectors.length} 个板块，`
      + `涨停合计 ${sectors.reduce((s, x) => s + x.count, 0)} 只（${dayType}）`,
    );

    return res.json({
      success: true,
      date: dateToken,
      dayType,
      sectorCount: sectors.length,
      totalLimitUp: sectors.reduce((s, x) => s + x.count, 0),
      source: MANUAL_SOURCE,
      warnings: warnings.length > 0 ? warnings : undefined,
      updatedAt: nowIso,
    });
  });

  /**
   * DELETE /api/sector-effect/day/:date
   * 清空某日数据（板块置空、涨停数归零），并把来源改回自动数据源，
   * 这样该日重新回到「可被自动抓取更新」的状态。日期行本身保留，不破坏日期轴。
   */
  app.delete("/api/sector-effect/day/:date", (req, res) => {
    const dateToken = String(req.params.date || "").replace(/-/g, "").trim();
    if (!/^\d{8}$/.test(dateToken)) {
      return res.status(400).json({ success: false, error: "日期格式应为 YYYYMMDD" });
    }
    const existing = db.getSectorEffectByDate(dateToken);
    if (!existing) {
      return res.status(404).json({ success: false, error: "该日期不存在" });
    }
    db.upsertSectorEffect({
      date: dateToken,
      day_type: existing.day_type,
      sectors_json: "[]",
      total_limit_up: 0,
      source: SOURCE,           // 改回自动源，允许后续自动抓取重新填充
      substituted_date: null,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    });
    console.log(`[SectorEffect] 已清空 ${dateToken} 的板块数据，恢复为自动更新状态`);
    return res.json({ success: true, date: dateToken, cleared: true });
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

  // ============= 板块归并配置（手动安全网） =============
  // 这些覆盖存储在 app_meta，独立于板块数据，自动同步/抓取不会触碰；
  // 用户可在此纠偏自动归并、合并新概念、重命名列、或一键重置回自动。

  /**
   * GET /api/sector-effect/canon
   * 返回当前生效的归并配置：基础分组、手动覆盖、手动显示名。
   */
  app.get("/api/sector-effect/canon", (_req, res) => {
    try {
      res.json({
        success: true,
        groups: SECTOR_CANON_GROUPS,
        overrides: loadCanonOverrides(),
        displayNames: loadDisplayNames(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "读取归并配置失败" });
    }
  });

  /**
   * POST /api/sector-effect/canon
   * 手动维护归并/重命名（安全网）。
   * body.action:
   *   - merge   : { alias, standard } 把某原名归并到标准列（standard 可为已有或新建）
   *   - unmerge : { alias }          解除归并（该原名独立成列）
   *   - rename  : { standard, label } 重命名某标准列的显示标签
   *   - reset   : 清空全部手动覆盖与显示名，回到纯自动透视
   */
  app.post("/api/sector-effect/canon", (req, res) => {
    try {
      const action = String(req.body?.action || "");
      const overrides = loadCanonOverrides();
      const displayNames = loadDisplayNames();

      if (action === "reset") {
        db.setMeta(META_CANON_OVERRIDES, JSON.stringify({}));
        db.setMeta(META_DISPLAY_NAMES, JSON.stringify({}));
        return res.json({ success: true, action, overrides: {}, displayNames: {} });
      }

      if (action === "merge") {
        const alias = String(req.body?.alias || "").trim();
        const standard = String(req.body?.standard || "").trim();
        if (!alias || !standard) {
          return res.status(400).json({ success: false, error: "merge 需要 alias 与 standard" });
        }
        overrides[alias] = standard;
        db.setMeta(META_CANON_OVERRIDES, JSON.stringify(overrides));
        return res.json({ success: true, action, overrides, displayNames });
      }

      if (action === "unmerge") {
        const alias = String(req.body?.alias || "").trim();
        if (!alias) return res.status(400).json({ success: false, error: "unmerge 需要 alias" });
        // 解除归并 = 该原名独立成列（映射到自身）
        overrides[alias] = alias;
        db.setMeta(META_CANON_OVERRIDES, JSON.stringify(overrides));
        return res.json({ success: true, action, overrides, displayNames });
      }

      if (action === "rename") {
        const standard = String(req.body?.standard || "").trim();
        const label = String(req.body?.label || "").trim();
        if (!standard) return res.status(400).json({ success: false, error: "rename 需要 standard" });
        if (label) displayNames[standard] = label;
        else delete displayNames[standard];
        db.setMeta(META_DISPLAY_NAMES, JSON.stringify(displayNames));
        return res.json({ success: true, action, overrides, displayNames });
      }

      return res.status(400).json({
        success: false,
        error: "未知 action，支持 merge / unmerge / rename / reset",
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || "更新归并配置失败" });
    }
  });

  // 首次启动自动补齐历史基线（本地已有数据则跳过）
  ensureHistorySeeded();

  // 启动自动更新调度器
  startAutoUpdateScheduler();
}
