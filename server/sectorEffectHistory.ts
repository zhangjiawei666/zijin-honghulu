/**
 * 板块效应 · 内置历史数据（2026 年，完整日期轴）
 *
 * 来源：腾讯文档「2026板块效应」子表（用户自有模板，file_id=DU3NzbXpwSmdyRFdD / tab=jyc7q9）
 *       同步日期：2026-09-02
 * 口径：概念板块（商业航天、脑机接口、AI应用、可控核聚变等），与实时抓取的行业口径不同，
 *       属用户模板既有记录，原样保留，不做改写或臆造。
 *
 * 日期轴完整性：
 *   - 保留表格中从 2026/1/5 到 2026/9/2 的**每一天**，交易日与休市日均不省略，共 241 天；
 *   - trading = 交易日（162 天）
 *   - weekend = 周六周日休市（68 天）
 *   - holiday = 工作日法定节假日休市（11 天，春节 2/16-2/20 与 2/23、清明 4/6、劳动节 5/1 与 5/4-5/5、端午 6/19）
 *   - 未来日期（晚于同步日）不入库，避免把尚未发生的日期误标为节假日。
 *
 * 同步规则（重要）：
 *   - **只同步交易日数据**；周末与法定节假日行一律为空，仅保留日期以维持完整日期轴。
 *   - 已过滤腾讯文档中的非板块内容：纯备注文字（如「跟踪资金回流的情况」「按兵不动」）、
 *     纯列号数字（如「1」「2」「3」）、策略备注词（如「低吸」）。共剔除 8 个单元格。
 *   - 本次同步未改动表格的任何展示规则（列对齐、配色、图例、折叠逻辑等均保持不变）。
 *
 * 说明：
 *   - 东财/同花顺涨停池接口不支持历史日期查询（任意历史日期都会被替换为最近交易日），
 *     因此历史数据无法实时回填，只能以本文件作为历史基线。
 *   - 软件首次启动且本地库无板块效应数据时，自动导入本文件；
 *   - 之后每个交易日 20:00 自动更新 / 手动更新，只追加或更新交易日，不破坏休市日行。
 *   - 「今天尚未收盘」的状态在渲染时按日期动态判断，不写死在数据里。
 */
/**
 * 内置基线的同步版本戳。
 *
 * 每次从腾讯文档重新同步数据后**必须递增此值**：启动时 `sectorEffect.ts` 会比对
 * 库里记录的 `history_sync_version`，不一致就自动用新基线覆盖旧数据
 * （手动录入的行除外），保证用户更新软件后能拿到最新同步结果。
 */
export const HISTORY_SYNC_VERSION = '2026-09-02';

export type SectorDayType = 'trading' | 'weekend' | 'holiday';

export interface SectorEffectHistoryRow {
  /** 日期 YYYYMMDD（含休市日） */
  date: string;
  /** 展示日期 YYYY/M/D */
  date_display: string;
  /** 日期类型：trading 交易日 / weekend 周末休市 / holiday 法定节假日休市 */
  day_type: SectorDayType;
  /** 板块列表（概念口径），按模板列顺序；休市日或待更新日为空数组 */
  sectors: Array<{ name: string; count: number }>;
  /** 当日涨停总数（各板块计数之和）；休市日为 0 */
  total: number;
}

export const SECTOR_EFFECT_HISTORY: SectorEffectHistoryRow[] = [
  {
    "date": "20260105",
    "date_display": "2026/1/5",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 18 },
      { "name": "机器人", "count": 4 },
      { "name": "半导体", "count": 10 },
      { "name": "电池", "count": 4 },
      { "name": "脑机接口", "count": 35 },
      { "name": "人工智能大模型", "count": 9 },
      { "name": "医药", "count": 4 },
      { "name": "地产", "count": 5 },
      { "name": "公告", "count": 4 }
    ],
    "total": 93
  },
  {
    "date": "20260106",
    "date_display": "2026/1/6",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 21 },
      { "name": "机器人", "count": 5 },
      { "name": "半导体", "count": 7 },
      { "name": "锂电池产业链", "count": 4 },
      { "name": "脑机接口", "count": 19 },
      { "name": "AI应用", "count": 3 },
      { "name": "超级高铁", "count": 3 },
      { "name": "地产", "count": 3 },
      { "name": "公告", "count": 8 },
      { "name": "化工", "count": 12 },
      { "name": "智能驾驶", "count": 9 },
      { "name": "大金融", "count": 6 },
      { "name": "大消费", "count": 5 },
      { "name": "有色金属", "count": 4 }
    ],
    "total": 109
  },
  {
    "date": "20260107",
    "date_display": "2026/1/7",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 13 },
      { "name": "机器人", "count": 4 },
      { "name": "半导体", "count": 4 },
      { "name": "脑机接口", "count": 7 },
      { "name": "AI应用", "count": 3 },
      { "name": "医疗医药", "count": 3 },
      { "name": "数据中心", "count": 9 },
      { "name": "公告", "count": 4 },
      { "name": "煤炭", "count": 3 },
      { "name": "光通信", "count": 4 },
      { "name": "光刻胶", "count": 10 },
      { "name": "大消费", "count": 4 },
      { "name": "有色金属", "count": 1 },
      { "name": "可控核聚变", "count": 6 }
    ],
    "total": 75
  },
  {
    "date": "20260108",
    "date_display": "2026/1/8",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 37 },
      { "name": "职能制造+机器人", "count": 8 },
      { "name": "半导体", "count": 9 },
      { "name": "锂电池", "count": 2 },
      { "name": "脑机接口", "count": 6 },
      { "name": "AI应用", "count": 3 },
      { "name": "医疗医药", "count": 2 },
      { "name": "数据中心", "count": 4 },
      { "name": "公告", "count": 1 },
      { "name": "光刻胶", "count": 1 },
      { "name": "大消费", "count": 3 },
      { "name": "可控核聚变", "count": 9 }
    ],
    "total": 85
  },
  {
    "date": "20260109",
    "date_display": "2026/1/9",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 31 },
      { "name": "机器人", "count": 5 },
      { "name": "半导体", "count": 4 },
      { "name": "AI应用", "count": 17 },
      { "name": "医药", "count": 4 },
      { "name": "算力", "count": 4 },
      { "name": "AI医疗", "count": 8 },
      { "name": "消费", "count": 3 },
      { "name": "有色金属", "count": 3 },
      { "name": "可控核聚变", "count": 3 }
    ],
    "total": 82
  },
  {
    "date": "20260110",
    "date_display": "2026/1/10",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260111",
    "date_display": "2026/1/11",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260112",
    "date_display": "2026/1/12",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 55 },
      { "name": "机器人", "count": 4 },
      { "name": "半导体", "count": 3 },
      { "name": "AI传媒", "count": 8 },
      { "name": "AI营销", "count": 16 },
      { "name": "AI应用", "count": 42 },
      { "name": "数据中心", "count": 5 },
      { "name": "公告", "count": 5 },
      { "name": "AI编程", "count": 5 },
      { "name": "AI医疗", "count": 9 },
      { "name": "可控核聚变", "count": 7 }
    ],
    "total": 159
  },
  {
    "date": "20260113",
    "date_display": "2026/1/13",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 10 },
      { "name": "AI营销", "count": 7 },
      { "name": "AI应用", "count": 12 },
      { "name": "医疗医药", "count": 6 },
      { "name": "电力", "count": 3 },
      { "name": "石油石化", "count": 3 },
      { "name": "AI医疗", "count": 14 },
      { "name": "可控核聚变", "count": 3 }
    ],
    "total": 58
  },
  {
    "date": "20260114",
    "date_display": "2026/1/14",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 21 },
      { "name": "半导体", "count": 8 },
      { "name": "阿里AI", "count": 5 },
      { "name": "AI营销", "count": 12 },
      { "name": "AI应用", "count": 26 },
      { "name": "电力", "count": 3 },
      { "name": "公告", "count": 4 },
      { "name": "AI医疗", "count": 5 }
    ],
    "total": 84
  },
  {
    "date": "20260115",
    "date_display": "2026/1/15",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 4 },
      { "name": "机器人", "count": 1 },
      { "name": "半导体", "count": 11 },
      { "name": "AI应用", "count": 7 },
      { "name": "智能电网", "count": 4 },
      { "name": "公告", "count": 4 },
      { "name": "光刻胶", "count": 3 },
      { "name": "旅游", "count": 3 },
      { "name": "有色金属", "count": 3 }
    ],
    "total": 40
  },
  {
    "date": "20260116",
    "date_display": "2026/1/16",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 4 },
      { "name": "机器人", "count": 11 },
      { "name": "半导体", "count": 21 },
      { "name": "AI应用", "count": 1 },
      { "name": "智能电网", "count": 10 },
      { "name": "家装", "count": 3 }
    ],
    "total": 50
  },
  {
    "date": "20260117",
    "date_display": "2026/1/17",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260118",
    "date_display": "2026/1/18",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260119",
    "date_display": "2026/1/19",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 9 },
      { "name": "机器人", "count": 13 },
      { "name": "半导体", "count": 1 },
      { "name": "固态电池", "count": 1 },
      { "name": "AI硬件", "count": 3 },
      { "name": "AI应用", "count": 3 },
      { "name": "医药", "count": 1 },
      { "name": "智能电网", "count": 22 },
      { "name": "化工", "count": 3 },
      { "name": "消费", "count": 7 },
      { "name": "有色金属", "count": 1 }
    ],
    "total": 64
  },
  {
    "date": "20260120",
    "date_display": "2026/1/20",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "机器人", "count": 4 },
      { "name": "半导体", "count": 5 },
      { "name": "AI应用", "count": 5 },
      { "name": "智能电网", "count": 6 },
      { "name": "地产", "count": 6 },
      { "name": "化工", "count": 11 },
      { "name": "消费", "count": 4 }
    ],
    "total": 44
  },
  {
    "date": "20260121",
    "date_display": "2026/1/21",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "机器人", "count": 8 },
      { "name": "国产芯片", "count": 16 },
      { "name": "锂电池产业链", "count": 4 },
      { "name": "AI营销", "count": 2 },
      { "name": "算力相关", "count": 5 },
      { "name": "业绩", "count": 3 },
      { "name": "化工", "count": 2 },
      { "name": "AI医疗", "count": 1 },
      { "name": "PCB板", "count": 3 },
      { "name": "黄金", "count": 6 },
      { "name": "有色金属", "count": 4 }
    ],
    "total": 57
  },
  {
    "date": "20260122",
    "date_display": "2026/1/22",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 24 },
      { "name": "机器人", "count": 11 },
      { "name": "国产芯片", "count": 7 },
      { "name": "AI硬件", "count": 3 },
      { "name": "公告", "count": 3 },
      { "name": "油气", "count": 4 },
      { "name": "PCB板", "count": 6 },
      { "name": "有色金属", "count": 5 },
      { "name": "可控核聚变", "count": 2 }
    ],
    "total": 65
  },
  {
    "date": "20260123",
    "date_display": "2026/1/23",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 23 },
      { "name": "机器人", "count": 4 },
      { "name": "固态电池", "count": 3 },
      { "name": "AI应用", "count": 7 },
      { "name": "医药", "count": 3 },
      { "name": "智能电网", "count": 2 },
      { "name": "太空光伏", "count": 36 },
      { "name": "黄金", "count": 6 }
    ],
    "total": 84
  },
  {
    "date": "20260124",
    "date_display": "2026/1/24",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260125",
    "date_display": "2026/1/25",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260126",
    "date_display": "2026/1/26",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 5 },
      { "name": "机器人", "count": 7 },
      { "name": "AI硬件", "count": 3 },
      { "name": "AI应用", "count": 4 },
      { "name": "医药", "count": 11 },
      { "name": "算力", "count": 5 },
      { "name": "光伏", "count": 3 },
      { "name": "化工", "count": 3 },
      { "name": "油气", "count": 3 },
      { "name": "贵金属", "count": 14 },
      { "name": "有色金属", "count": 9 }
    ],
    "total": 67
  },
  {
    "date": "20260127",
    "date_display": "2026/1/27",
    "day_type": "trading",
    "sectors": [
      { "name": "航天", "count": 8 },
      { "name": "机器人", "count": 4 },
      { "name": "半导体", "count": 9 },
      { "name": "AI硬件", "count": 6 },
      { "name": "AI应用", "count": 5 },
      { "name": "算力", "count": 2 },
      { "name": "光伏", "count": 6 },
      { "name": "贵金属/有色", "count": 8 }
    ],
    "total": 48
  },
  {
    "date": "20260128",
    "date_display": "2026/1/28",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "国产芯片", "count": 8 },
      { "name": "化工", "count": 3 },
      { "name": "油气", "count": 5 },
      { "name": "染料", "count": 4 },
      { "name": "贵金属", "count": 31 },
      { "name": "有色金属", "count": 16 },
      { "name": "可控核聚变", "count": 1 }
    ],
    "total": 70
  },
  {
    "date": "20260129",
    "date_display": "2026/1/29",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 4 },
      { "name": "机器人", "count": 1 },
      { "name": "半导体", "count": 1 },
      { "name": "AI应用", "count": 7 },
      { "name": "大消费", "count": 3 },
      { "name": "房地产", "count": 7 },
      { "name": "足球", "count": 4 },
      { "name": "化工", "count": 7 },
      { "name": "油服", "count": 7 },
      { "name": "白酒", "count": 19 },
      { "name": "黄金", "count": 9 },
      { "name": "有色金属", "count": 3 }
    ],
    "total": 72
  },
  {
    "date": "20260130",
    "date_display": "2026/1/30",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 3 },
      { "name": "半导体", "count": 3 },
      { "name": "算力", "count": 5 },
      { "name": "AI应用", "count": 5 },
      { "name": "消费", "count": 3 },
      { "name": "光通信", "count": 9 },
      { "name": "公告", "count": 3 },
      { "name": "化工", "count": 4 },
      { "name": "业绩", "count": 5 },
      { "name": "农业", "count": 4 }
    ],
    "total": 44
  },
  {
    "date": "20260131",
    "date_display": "2026/1/31",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260201",
    "date_display": "2026/2/1",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260202",
    "date_display": "2026/2/2",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 1 },
      { "name": "算力", "count": 2 },
      { "name": "AI应用", "count": 2 },
      { "name": "消费", "count": 9 },
      { "name": "智能电网", "count": 10 },
      { "name": "光通信", "count": 3 }
    ],
    "total": 27
  },
  {
    "date": "20260203",
    "date_display": "2026/2/3",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 13 },
      { "name": "机器人", "count": 4 },
      { "name": "AI应用", "count": 4 },
      { "name": "消费", "count": 3 },
      { "name": "光伏", "count": 12 },
      { "name": "化工", "count": 3 },
      { "name": "光通信", "count": 5 },
      { "name": "北京城市规划", "count": 4 },
      { "name": "黄金", "count": 2 }
    ],
    "total": 50
  },
  {
    "date": "20260204",
    "date_display": "2026/2/4",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 4 },
      { "name": "氢能源", "count": 4 },
      { "name": "消费", "count": 4 },
      { "name": "智能电网", "count": 3 },
      { "name": "光伏", "count": 13 },
      { "name": "煤炭", "count": 14 },
      { "name": "光通信", "count": 3 },
      { "name": "地产", "count": 7 },
      { "name": "公告", "count": 3 }
    ],
    "total": 57
  },
  {
    "date": "20260205",
    "date_display": "2026/2/5",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 1 },
      { "name": "固态电池", "count": 2 },
      { "name": "算力", "count": 3 },
      { "name": "AI应用", "count": 3 },
      { "name": "消费", "count": 12 },
      { "name": "影视", "count": 3 },
      { "name": "太空光伏", "count": 1 },
      { "name": "煤炭", "count": 1 },
      { "name": "福建", "count": 3 },
      { "name": "并购重组", "count": 4 }
    ],
    "total": 35
  },
  {
    "date": "20260206",
    "date_display": "2026/2/6",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 10 },
      { "name": "固态电池", "count": 5 },
      { "name": "AI应用", "count": 1 },
      { "name": "大消费", "count": 5 },
      { "name": "智能电网", "count": 3 },
      { "name": "光伏", "count": 4 },
      { "name": "化工", "count": 5 },
      { "name": "光通信", "count": 3 },
      { "name": "医药", "count": 3 },
      { "name": "贵金属", "count": 2 },
      { "name": "资产重组", "count": 3 }
    ],
    "total": 46
  },
  {
    "date": "20260207",
    "date_display": "2026/2/7",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260208",
    "date_display": "2026/2/8",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260209",
    "date_display": "2026/2/9",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 8 },
      { "name": "机器人", "count": 2 },
      { "name": "半导体", "count": 3 },
      { "name": "算力", "count": 10 },
      { "name": "AI应用", "count": 16 },
      { "name": "消费", "count": 1 },
      { "name": "光伏", "count": 16 },
      { "name": "化工", "count": 3 },
      { "name": "光通信", "count": 4 },
      { "name": "染料", "count": 5 },
      { "name": "贵金属", "count": 1 },
      { "name": "资产重组", "count": 6 }
    ],
    "total": 75
  },
  {
    "date": "20260210",
    "date_display": "2026/2/10",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 2 },
      { "name": "半导体", "count": 3 },
      { "name": "固态电池", "count": 2 },
      { "name": "算力", "count": 9 },
      { "name": "影视短剧", "count": 23 },
      { "name": "光伏", "count": 2 },
      { "name": "化工", "count": 2 },
      { "name": "传媒", "count": 9 }
    ],
    "total": 54
  },
  {
    "date": "20260211",
    "date_display": "2026/2/11",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 2 },
      { "name": "算力", "count": 6 },
      { "name": "消费", "count": 2 },
      { "name": "影视/视频相关", "count": 5 },
      { "name": "光伏", "count": 1 },
      { "name": "化工", "count": 5 },
      { "name": "光通信", "count": 3 },
      { "name": "染料", "count": 4 },
      { "name": "玻璃纤维布", "count": 9 },
      { "name": "矿产资源", "count": 10 }
    ],
    "total": 47
  },
  {
    "date": "20260212",
    "date_display": "2026/2/12",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 4 },
      { "name": "算力+数据中心", "count": 15 },
      { "name": "AI应用", "count": 3 },
      { "name": "智能电网", "count": 5 },
      { "name": "光伏", "count": 2 },
      { "name": "化工", "count": 2 },
      { "name": "光通信", "count": 4 },
      { "name": "液冷", "count": 10 },
      { "name": "玻纤", "count": 5 },
      { "name": "有色金属", "count": 7 }
    ],
    "total": 57
  },
  {
    "date": "20260213",
    "date_display": "2026/2/13",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 3 },
      { "name": "半导体", "count": 4 },
      { "name": "算力", "count": 4 },
      { "name": "光通信", "count": 3 },
      { "name": "军工", "count": 3 },
      { "name": "无人驾驶", "count": 3 }
    ],
    "total": 21
  },
  {
    "date": "20260214",
    "date_display": "2026/2/14",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260215",
    "date_display": "2026/2/15",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260216",
    "date_display": "2026/2/16",
    "day_type": "holiday",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260217",
    "date_display": "2026/2/17",
    "day_type": "holiday",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260218",
    "date_display": "2026/2/18",
    "day_type": "holiday",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260219",
    "date_display": "2026/2/19",
    "day_type": "holiday",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260220",
    "date_display": "2026/2/20",
    "day_type": "holiday",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260221",
    "date_display": "2026/2/21",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260222",
    "date_display": "2026/2/22",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260223",
    "date_display": "2026/2/23",
    "day_type": "holiday",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260224",
    "date_display": "2026/2/24",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 5 },
      { "name": "半导体", "count": 3 },
      { "name": "算力", "count": 3 },
      { "name": "PCB", "count": 3 },
      { "name": "智能电网", "count": 6 },
      { "name": "光伏", "count": 1 },
      { "name": "化工", "count": 16 },
      { "name": "光通信", "count": 7 },
      { "name": "石油天然气", "count": 18 },
      { "name": "玻纤", "count": 5 },
      { "name": "黄金", "count": 4 }
    ],
    "total": 72
  },
  {
    "date": "20260225",
    "date_display": "2026/2/25",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 3 },
      { "name": "国产芯片", "count": 3 },
      { "name": "锂矿", "count": 3 },
      { "name": "算力", "count": 2 },
      { "name": "AI硬件", "count": 3 },
      { "name": "地产", "count": 4 },
      { "name": "磷化工/化工", "count": 17 },
      { "name": "石油", "count": 2 },
      { "name": "玻纤", "count": 3 },
      { "name": "有色金属", "count": 12 },
      { "name": "稀土", "count": 3 }
    ],
    "total": 56
  },
  {
    "date": "20260226",
    "date_display": "2026/2/26",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "机器人", "count": 3 },
      { "name": "半导体", "count": 2 },
      { "name": "锂电池", "count": 4 },
      { "name": "算力", "count": 5 },
      { "name": "AI硬件", "count": 9 },
      { "name": "电力", "count": 4 },
      { "name": "液冷服务器", "count": 4 },
      { "name": "磷化工", "count": 3 },
      { "name": "光通信", "count": 6 },
      { "name": "AI能源", "count": 10 }
    ],
    "total": 53
  },
  {
    "date": "20260227",
    "date_display": "2026/2/27",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 3 },
      { "name": "国产芯片", "count": 1 },
      { "name": "锂电池", "count": 1 },
      { "name": "算力", "count": 7 },
      { "name": "华为产业链", "count": 6 },
      { "name": "大消费", "count": 4 },
      { "name": "智能电网", "count": 9 },
      { "name": "光伏", "count": 5 },
      { "name": "磷化工/化工", "count": 3 },
      { "name": "光通信", "count": 3 },
      { "name": "黄金", "count": 3 },
      { "name": "有色金属", "count": 13 },
      { "name": "稀土", "count": 1 }
    ],
    "total": 59
  },
  {
    "date": "20260228",
    "date_display": "2026/2/28",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260301",
    "date_display": "2026/3/1",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260302",
    "date_display": "2026/3/2",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 1 },
      { "name": "算力相关", "count": 6 },
      { "name": "液冷", "count": 2 },
      { "name": "AI电力", "count": 3 },
      { "name": "光伏", "count": 1 },
      { "name": "甲醇", "count": 6 },
      { "name": "光通信", "count": 7 },
      { "name": "油服", "count": 32 },
      { "name": "黄金", "count": 7 },
      { "name": "矿产资源", "count": 8 },
      { "name": "军工", "count": 9 }
    ],
    "total": 82
  },
  {
    "date": "20260303",
    "date_display": "2026/3/3",
    "day_type": "trading",
    "sectors": [
      { "name": "算力", "count": 2 },
      { "name": "航运", "count": 8 },
      { "name": "天然气", "count": 27 },
      { "name": "光通信", "count": 2 },
      { "name": "油服", "count": 24 },
      { "name": "矿产资源", "count": 4 }
    ],
    "total": 67
  },
  {
    "date": "20260304",
    "date_display": "2026/3/4",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 6 },
      { "name": "国产芯片", "count": 2 },
      { "name": "算力", "count": 6 },
      { "name": "闪存", "count": 3 },
      { "name": "智能电网", "count": 12 },
      { "name": "农业", "count": 3 },
      { "name": "光通信", "count": 2 },
      { "name": "油服", "count": 4 },
      { "name": "有色金属", "count": 1 },
      { "name": "军工", "count": 1 }
    ],
    "total": 40
  },
  {
    "date": "20260305",
    "date_display": "2026/3/5",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 7 },
      { "name": "半导体", "count": 3 },
      { "name": "算力", "count": 6 },
      { "name": "MicroLED", "count": 22 },
      { "name": "消费", "count": 2 },
      { "name": "智能电网", "count": 8 },
      { "name": "可控核聚变", "count": 3 },
      { "name": "石油石化", "count": 6 },
      { "name": "光通信", "count": 3 }
    ],
    "total": 60
  },
  {
    "date": "20260306",
    "date_display": "2026/3/6",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 3 },
      { "name": "存储芯片", "count": 2 },
      { "name": "算力", "count": 10 },
      { "name": "医疗医药", "count": 3 },
      { "name": "智能电网", "count": 18 },
      { "name": "燃气轮机", "count": 7 },
      { "name": "化工", "count": 12 },
      { "name": "有色金属", "count": 1 },
      { "name": "军工", "count": 3 }
    ],
    "total": 59
  },
  {
    "date": "20260307",
    "date_display": "2026/3/7",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260308",
    "date_display": "2026/3/8",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260309",
    "date_display": "2026/3/9",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 4 },
      { "name": "Openclaw", "count": 17 },
      { "name": "智能电网", "count": 13 }
    ],
    "total": 34
  },
  {
    "date": "20260310",
    "date_display": "2026/3/10",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 4 },
      { "name": "机器人", "count": 6 },
      { "name": "国产芯片", "count": 1 },
      { "name": "算力", "count": 6 },
      { "name": "Openclaw", "count": 6 },
      { "name": "医药", "count": 1 },
      { "name": "智能电网", "count": 4 },
      { "name": "PCB", "count": 3 },
      { "name": "光通信", "count": 10 },
      { "name": "液冷服务器", "count": 3 },
      { "name": "军工", "count": 1 }
    ],
    "total": 45
  },
  {
    "date": "20260311",
    "date_display": "2026/3/11",
    "day_type": "trading",
    "sectors": [
      { "name": "芯片", "count": 2 },
      { "name": "锂电池", "count": 2 },
      { "name": "算力", "count": 1 },
      { "name": "Openclaw", "count": 2 },
      { "name": "医药", "count": 2 },
      { "name": "智能电网", "count": 9 },
      { "name": "光伏", "count": 4 },
      { "name": "化工", "count": 13 },
      { "name": "光通信", "count": 5 },
      { "name": "液冷", "count": 2 }
    ],
    "total": 42
  },
  {
    "date": "20260312",
    "date_display": "2026/3/12",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 2 },
      { "name": "国产芯片", "count": 1 },
      { "name": "锂电池", "count": 1 },
      { "name": "算力", "count": 1 },
      { "name": "智能电网", "count": 11 },
      { "name": "风电", "count": 6 },
      { "name": "化工", "count": 10 },
      { "name": "光通信", "count": 3 },
      { "name": "天然气", "count": 3 },
      { "name": "煤炭", "count": 3 }
    ],
    "total": 41
  },
  {
    "date": "20260313",
    "date_display": "2026/3/13",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 3 },
      { "name": "锂电池", "count": 4 },
      { "name": "医药", "count": 4 },
      { "name": "智能电网", "count": 2 },
      { "name": "风电", "count": 7 },
      { "name": "化工", "count": 9 },
      { "name": "光通信", "count": 3 },
      { "name": "热泵", "count": 4 },
      { "name": "煤炭", "count": 2 },
      { "name": "公告", "count": 3 },
      { "name": "核聚变", "count": 5 }
    ],
    "total": 46
  },
  {
    "date": "20260314",
    "date_display": "2026/3/14",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260315",
    "date_display": "2026/3/15",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260316",
    "date_display": "2026/3/16",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 4 },
      { "name": "存储芯片5+国产芯片", "count": 2 },
      { "name": "AI硬件", "count": 3 },
      { "name": "AI应用", "count": 3 },
      { "name": "风电", "count": 2 },
      { "name": "化工", "count": 3 },
      { "name": "光通信", "count": 3 },
      { "name": "储能", "count": 3 },
      { "name": "电力", "count": 3 },
      { "name": "海洋经济", "count": 4 }
    ],
    "total": 30
  },
  {
    "date": "20260317",
    "date_display": "2026/3/17",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 2 },
      { "name": "芯片", "count": 1 },
      { "name": "算力", "count": 1 },
      { "name": "风电", "count": 4 },
      { "name": "化工", "count": 4 },
      { "name": "储能", "count": 8 },
      { "name": "电力", "count": 3 },
      { "name": "房地产", "count": 5 },
      { "name": "氢气", "count": 3 }
    ],
    "total": 31
  },
  {
    "date": "20260318",
    "date_display": "2026/3/18",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 4 },
      { "name": "存储", "count": 5 },
      { "name": "算力", "count": 9 },
      { "name": "液冷", "count": 6 },
      { "name": "医药", "count": 4 },
      { "name": "智能电网", "count": 7 },
      { "name": "光通信", "count": 4 },
      { "name": "储能", "count": 3 },
      { "name": "PCB", "count": 3 },
      { "name": "氢能", "count": 1 }
    ],
    "total": 46
  },
  {
    "date": "20260319",
    "date_display": "2026/3/19",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 2 },
      { "name": "算力", "count": 7 },
      { "name": "智能电网", "count": 8 },
      { "name": "天然气", "count": 4 }
    ],
    "total": 21
  },
  {
    "date": "20260320",
    "date_display": "2026/3/20",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 2 },
      { "name": "锂电池", "count": 1 },
      { "name": "光伏", "count": 11 },
      { "name": "光通信", "count": 1 },
      { "name": "电力", "count": 5 },
      { "name": "房地产", "count": 2 }
    ],
    "total": 22
  },
  {
    "date": "20260321",
    "date_display": "2026/3/21",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260322",
    "date_display": "2026/3/22",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260323",
    "date_display": "2026/3/23",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 3 },
      { "name": "国产芯片", "count": 1 },
      { "name": "算力", "count": 1 },
      { "name": "光伏", "count": 7 },
      { "name": "煤炭", "count": 3 },
      { "name": "电力", "count": 4 }
    ],
    "total": 19
  },
  {
    "date": "20260324",
    "date_display": "2026/3/24",
    "day_type": "trading",
    "sectors": [
      { "name": "航天", "count": 3 },
      { "name": "机器人", "count": 5 },
      { "name": "国产芯片", "count": 1 },
      { "name": "锂电池", "count": 8 },
      { "name": "算力", "count": 5 },
      { "name": "医药", "count": 2 },
      { "name": "光伏", "count": 5 },
      { "name": "军工", "count": 3 },
      { "name": "光通信", "count": 5 },
      { "name": "电力", "count": 20 },
      { "name": "房地产", "count": 3 },
      { "name": "氢气", "count": 3 }
    ],
    "total": 63
  },
  {
    "date": "20260325",
    "date_display": "2026/3/25",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 4 },
      { "name": "国产芯片", "count": 3 },
      { "name": "电池储能", "count": 4 },
      { "name": "算力/词元概念", "count": 6 },
      { "name": "液冷", "count": 2 },
      { "name": "大消费", "count": 6 },
      { "name": "化工", "count": 3 },
      { "name": "光通信", "count": 11 },
      { "name": "电力", "count": 22 },
      { "name": "福建", "count": 3 },
      { "name": "氢能", "count": 1 }
    ],
    "total": 65
  },
  {
    "date": "20260326",
    "date_display": "2026/3/26",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "机器人", "count": 1 },
      { "name": "锂电池", "count": 6 },
      { "name": "算力", "count": 4 },
      { "name": "医药", "count": 4 },
      { "name": "化工", "count": 4 },
      { "name": "电力", "count": 11 }
    ],
    "total": 33
  },
  {
    "date": "20260327",
    "date_display": "2026/3/27",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "锂电池产业链", "count": 19 },
      { "name": "算力", "count": 7 },
      { "name": "医疗医药", "count": 14 },
      { "name": "大消费", "count": 5 },
      { "name": "化工", "count": 7 },
      { "name": "光通信", "count": 4 },
      { "name": "电力", "count": 9 }
    ],
    "total": 66
  },
  {
    "date": "20260328",
    "date_display": "2026/3/28",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260329",
    "date_display": "2026/3/29",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260330",
    "date_display": "2026/3/30",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 9 },
      { "name": "机器人", "count": 5 },
      { "name": "算力", "count": 2 },
      { "name": "医疗医药", "count": 9 },
      { "name": "农业", "count": 3 },
      { "name": "光伏", "count": 2 },
      { "name": "光通信", "count": 9 },
      { "name": "铝", "count": 8 },
      { "name": "福建", "count": 3 },
      { "name": "业绩增长", "count": 3 }
    ],
    "total": 53
  },
  {
    "date": "20260331",
    "date_display": "2026/3/31",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 5 },
      { "name": "机器人", "count": 4 },
      { "name": "高铁轨交", "count": 7 },
      { "name": "医药", "count": 5 },
      { "name": "消费", "count": 4 },
      { "name": "光伏", "count": 3 },
      { "name": "光通信", "count": 2 },
      { "name": "两轮车", "count": 3 },
      { "name": "电力", "count": 7 },
      { "name": "福建", "count": 1 },
      { "name": "业绩增长", "count": 5 }
    ],
    "total": 46
  },
  {
    "date": "20260401",
    "date_display": "2026/4/1",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 3 },
      { "name": "国产芯片", "count": 3 },
      { "name": "锂电池", "count": 3 },
      { "name": "算力", "count": 7 },
      { "name": "智能电网", "count": 3 },
      { "name": "医药", "count": 13 },
      { "name": "光通信", "count": 4 },
      { "name": "电力", "count": 4 }
    ],
    "total": 40
  },
  {
    "date": "20260402",
    "date_display": "2026/4/2",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "锂电池", "count": 2 },
      { "name": "医药", "count": 6 },
      { "name": "化工", "count": 2 },
      { "name": "石油石化", "count": 5 }
    ],
    "total": 17
  },
  {
    "date": "20260403",
    "date_display": "2026/4/3",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 6 },
      { "name": "算力", "count": 8 },
      { "name": "医疗医药", "count": 4 },
      { "name": "光通信", "count": 10 }
    ],
    "total": 28
  },
  {
    "date": "20260404",
    "date_display": "2026/4/4",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260405",
    "date_display": "2026/4/5",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260406",
    "date_display": "2026/4/6",
    "day_type": "holiday",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260407",
    "date_display": "2026/4/7",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 2 },
      { "name": "国产芯片", "count": 5 },
      { "name": "电池产业链", "count": 3 },
      { "name": "算力", "count": 2 },
      { "name": "PCB", "count": 4 },
      { "name": "医疗医药", "count": 6 },
      { "name": "房地产", "count": 3 },
      { "name": "有机硅", "count": 4 },
      { "name": "光通信", "count": 7 },
      { "name": "石油化工", "count": 28 },
      { "name": "电力", "count": 4 },
      { "name": "足球", "count": 7 },
      { "name": "公告", "count": 3 }
    ],
    "total": 80
  },
  {
    "date": "20260408",
    "date_display": "2026/4/8",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 5 },
      { "name": "机器人", "count": 5 },
      { "name": "国产芯片", "count": 6 },
      { "name": "AI应用", "count": 11 },
      { "name": "算力", "count": 18 },
      { "name": "PCB", "count": 10 },
      { "name": "医疗医药", "count": 7 },
      { "name": "房地产", "count": 4 },
      { "name": "服务器散热", "count": 9 },
      { "name": "消费", "count": 3 },
      { "name": "光通信", "count": 12 },
      { "name": "燃气轮机", "count": 8 },
      { "name": "电力", "count": 5 },
      { "name": "黄金贵金属", "count": 6 },
      { "name": "美伊战争", "count": 4 }
    ],
    "total": 113
  },
  {
    "date": "20260409",
    "date_display": "2026/4/9",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 2 },
      { "name": "国产芯片", "count": 5 },
      { "name": "算力", "count": 6 },
      { "name": "医药", "count": 3 },
      { "name": "房地产", "count": 4 },
      { "name": "服务器散热", "count": 5 },
      { "name": "苹果+玻璃基板", "count": 5 },
      { "name": "光通信", "count": 9 }
    ],
    "total": 41
  },
  {
    "date": "20260410",
    "date_display": "2026/4/10",
    "day_type": "trading",
    "sectors": [
      { "name": "航天", "count": 1 },
      { "name": "机器人", "count": 3 },
      { "name": "国产芯片", "count": 5 },
      { "name": "锂电池", "count": 4 },
      { "name": "算力", "count": 2 },
      { "name": "医疗医药", "count": 2 },
      { "name": "液冷服务器", "count": 7 },
      { "name": "玻璃基板", "count": 5 },
      { "name": "光通信", "count": 4 },
      { "name": "燃气轮机", "count": 3 },
      { "name": "资产重组", "count": 4 },
      { "name": "大消费", "count": 5 },
      { "name": "业绩增长", "count": 5 }
    ],
    "total": 50
  },
  {
    "date": "20260411",
    "date_display": "2026/4/11",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260412",
    "date_display": "2026/4/12",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260413",
    "date_display": "2026/4/13",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 1 },
      { "name": "国产芯片", "count": 3 },
      { "name": "电池产业链", "count": 8 },
      { "name": "算力", "count": 5 },
      { "name": "PCB", "count": 3 },
      { "name": "液冷服务器", "count": 3 },
      { "name": "电子布", "count": 3 },
      { "name": "光通信", "count": 7 },
      { "name": "智能电网", "count": 4 },
      { "name": "业绩增长", "count": 5 }
    ],
    "total": 42
  },
  {
    "date": "20260414",
    "date_display": "2026/4/14",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 4 },
      { "name": "国产芯片", "count": 4 },
      { "name": "锂电池", "count": 5 },
      { "name": "算力", "count": 9 },
      { "name": "PCB", "count": 3 },
      { "name": "医药", "count": 3 },
      { "name": "液冷服务器", "count": 3 },
      { "name": "光通信", "count": 2 },
      { "name": "电力", "count": 5 }
    ],
    "total": 38
  },
  {
    "date": "20260415",
    "date_display": "2026/4/15",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 5 },
      { "name": "国产芯片", "count": 4 },
      { "name": "电池产业链", "count": 2 },
      { "name": "算力", "count": 8 },
      { "name": "医疗医药", "count": 13 },
      { "name": "电力", "count": 1 },
      { "name": "大消费", "count": 5 },
      { "name": "业绩", "count": 4 }
    ],
    "total": 42
  },
  {
    "date": "20260416",
    "date_display": "2026/4/16",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 9 },
      { "name": "电池产业链", "count": 12 },
      { "name": "算力", "count": 18 },
      { "name": "AI硬件", "count": 4 },
      { "name": "燃气轮机", "count": 5 },
      { "name": "有色金属", "count": 4 },
      { "name": "大消费", "count": 6 },
      { "name": "公告", "count": 7 }
    ],
    "total": 65
  },
  {
    "date": "20260417",
    "date_display": "2026/4/17",
    "day_type": "trading",
    "sectors": [
      { "name": "航天", "count": 4 },
      { "name": "机器人", "count": 4 },
      { "name": "国产芯片", "count": 8 },
      { "name": "锂电池", "count": 4 },
      { "name": "算力", "count": 10 },
      { "name": "医药", "count": 1 },
      { "name": "液冷服务器", "count": 4 },
      { "name": "玻璃基板", "count": 3 },
      { "name": "光通信", "count": 14 },
      { "name": "智能电网", "count": 2 },
      { "name": "业绩增长", "count": 4 }
    ],
    "total": 58
  },
  {
    "date": "20260418",
    "date_display": "2026/4/18",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260419",
    "date_display": "2026/4/19",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260420",
    "date_display": "2026/4/20",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 18 },
      { "name": "机器人", "count": 2 },
      { "name": "国产芯片", "count": 3 },
      { "name": "固态电池", "count": 1 },
      { "name": "算力", "count": 10 },
      { "name": "AI应用", "count": 3 },
      { "name": "液冷服务器", "count": 4 },
      { "name": "玻璃基板", "count": 2 },
      { "name": "光通信", "count": 9 },
      { "name": "电力", "count": 3 },
      { "name": "消费", "count": 5 },
      { "name": "业绩增长", "count": 8 }
    ],
    "total": 68
  },
  {
    "date": "20260421",
    "date_display": "2026/4/21",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 10 },
      { "name": "机器人", "count": 2 },
      { "name": "国产芯片", "count": 6 },
      { "name": "锂电池", "count": 1 },
      { "name": "医药", "count": 1 },
      { "name": "液冷服务器", "count": 1 },
      { "name": "MicroLED", "count": 3 },
      { "name": "光通信", "count": 4 },
      { "name": "汽车产业链", "count": 3 },
      { "name": "电力", "count": 5 },
      { "name": "消费", "count": 2 },
      { "name": "业绩", "count": 3 }
    ],
    "total": 41
  },
  {
    "date": "20260422",
    "date_display": "2026/4/22",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "机器人", "count": 3 },
      { "name": "国产芯片", "count": 4 },
      { "name": "云计算数据中心", "count": 3 },
      { "name": "PCB", "count": 2 },
      { "name": "医药", "count": 1 },
      { "name": "AI硬件", "count": 2 },
      { "name": "液冷服务器", "count": 2 },
      { "name": "玻璃基板", "count": 1 },
      { "name": "光通信", "count": 12 },
      { "name": "算电协同", "count": 2 },
      { "name": "消费", "count": 2 },
      { "name": "业绩", "count": 6 }
    ],
    "total": 43
  },
  {
    "date": "20260423",
    "date_display": "2026/4/23",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "国产芯片", "count": 5 },
      { "name": "算力", "count": 3 },
      { "name": "AI硬件", "count": 3 },
      { "name": "玻璃基板", "count": 4 },
      { "name": "光通信", "count": 6 },
      { "name": "电力", "count": 6 },
      { "name": "大消费", "count": 5 },
      { "name": "业绩增长", "count": 11 }
    ],
    "total": 46
  },
  {
    "date": "20260424",
    "date_display": "2026/4/24",
    "day_type": "trading",
    "sectors": [
      { "name": "航天", "count": 2 },
      { "name": "国产芯片", "count": 5 },
      { "name": "电池产业链", "count": 15 },
      { "name": "算力", "count": 10 },
      { "name": "化工", "count": 4 },
      { "name": "大消费", "count": 2 },
      { "name": "业绩", "count": 14 }
    ],
    "total": 52
  },
  {
    "date": "20260425",
    "date_display": "2026/4/25",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260426",
    "date_display": "2026/4/26",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260427",
    "date_display": "2026/4/27",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 7 },
      { "name": "国产芯片", "count": 7 },
      { "name": "钠离子电池", "count": 1 },
      { "name": "算力", "count": 8 },
      { "name": "PCB", "count": 3 },
      { "name": "氦气", "count": 4 },
      { "name": "算电协同", "count": 3 },
      { "name": "消费", "count": 1 },
      { "name": "业绩增长", "count": 23 }
    ],
    "total": 57
  },
  {
    "date": "20260428",
    "date_display": "2026/4/28",
    "day_type": "trading",
    "sectors": [
      { "name": "国产芯片", "count": 7 },
      { "name": "电池", "count": 2 },
      { "name": "算力", "count": 7 },
      { "name": "医药", "count": 6 },
      { "name": "消费", "count": 1 },
      { "name": "业绩增长", "count": 27 }
    ],
    "total": 50
  },
  {
    "date": "20260429",
    "date_display": "2026/4/29",
    "day_type": "trading",
    "sectors": [
      { "name": "航天", "count": 1 },
      { "name": "机器人", "count": 2 },
      { "name": "半导体", "count": 2 },
      { "name": "锂电池", "count": 16 },
      { "name": "算力", "count": 12 },
      { "name": "有色稀土", "count": 9 },
      { "name": "光通信", "count": 4 },
      { "name": "氦气", "count": 2 },
      { "name": "消费", "count": 2 },
      { "name": "业绩增长", "count": 42 }
    ],
    "total": 92
  },
  {
    "date": "20260430",
    "date_display": "2026/4/30",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 9 },
      { "name": "机器人", "count": 7 },
      { "name": "国产芯片", "count": 16 },
      { "name": "锂电池", "count": 9 },
      { "name": "算力", "count": 5 },
      { "name": "房地产", "count": 3 },
      { "name": "体育产业", "count": 5 },
      { "name": "业绩增长", "count": 18 }
    ],
    "total": 72
  },
  {
    "date": "20260501",
    "date_display": "2026/5/1",
    "day_type": "holiday",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260502",
    "date_display": "2026/5/2",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260503",
    "date_display": "2026/5/3",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260504",
    "date_display": "2026/5/4",
    "day_type": "holiday",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260505",
    "date_display": "2026/5/5",
    "day_type": "holiday",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260506",
    "date_display": "2026/5/6",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "机器人", "count": 2 },
      { "name": "国产芯片", "count": 7 },
      { "name": "电池产业链", "count": 4 },
      { "name": "算力", "count": 14 },
      { "name": "数据中心", "count": 8 },
      { "name": "CPU", "count": 4 },
      { "name": "AI应用", "count": 3 },
      { "name": "液冷服务器", "count": 3 },
      { "name": "存储", "count": 10 },
      { "name": "光通信", "count": 5 },
      { "name": "燃气轮机", "count": 3 },
      { "name": "电力", "count": 8 },
      { "name": "大消费", "count": 6 },
      { "name": "公告", "count": 10 }
    ],
    "total": 90
  },
  {
    "date": "20260507",
    "date_display": "2026/5/7",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 5 },
      { "name": "机器人", "count": 11 },
      { "name": "国产芯片", "count": 6 },
      { "name": "算力", "count": 13 },
      { "name": "数据中心", "count": 10 },
      { "name": "AI应用", "count": 1 },
      { "name": "PCB", "count": 11 },
      { "name": "光通信", "count": 15 },
      { "name": "中东", "count": 3 },
      { "name": "电力", "count": 7 },
      { "name": "公告", "count": 4 }
    ],
    "total": 86
  },
  {
    "date": "20260508",
    "date_display": "2026/5/8",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 12 },
      { "name": "机器人", "count": 21 },
      { "name": "国产芯片", "count": 1 },
      { "name": "电池产业链", "count": 5 },
      { "name": "算力", "count": 10 },
      { "name": "医药", "count": 4 },
      { "name": "AI应用", "count": 4 },
      { "name": "PCB", "count": 4 },
      { "name": "油气", "count": 3 },
      { "name": "光通信", "count": 13 },
      { "name": "地产", "count": 6 },
      { "name": "电力", "count": 1 },
      { "name": "大消费", "count": 3 }
    ],
    "total": 87
  },
  {
    "date": "20260509",
    "date_display": "2026/5/9",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260510",
    "date_display": "2026/5/10",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260511",
    "date_display": "2026/5/11",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 6 },
      { "name": "机器人", "count": 3 },
      { "name": "国产芯片", "count": 12 },
      { "name": "电池产业链", "count": 2 },
      { "name": "算力", "count": 2 },
      { "name": "数据中心", "count": 7 },
      { "name": "医药", "count": 4 },
      { "name": "玻璃基板封装", "count": 3 },
      { "name": "PCB", "count": 5 },
      { "name": "存储", "count": 4 },
      { "name": "光通信", "count": 11 },
      { "name": "房地产", "count": 7 },
      { "name": "智能电网", "count": 5 },
      { "name": "消费", "count": 5 },
      { "name": "液冷服务器", "count": 3 }
    ],
    "total": 79
  },
  {
    "date": "20260512",
    "date_display": "2026/5/12",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 5 },
      { "name": "国产芯片", "count": 6 },
      { "name": "医药", "count": 2 },
      { "name": "PCB", "count": 3 },
      { "name": "光通信", "count": 8 },
      { "name": "房地产", "count": 5 },
      { "name": "电力", "count": 13 },
      { "name": "大消费", "count": 3 },
      { "name": "液冷服务器", "count": 3 }
    ],
    "total": 49
  },
  {
    "date": "20260513",
    "date_display": "2026/5/13",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "机器人", "count": 6 },
      { "name": "国产芯片", "count": 11 },
      { "name": "锂电池", "count": 2 },
      { "name": "算力", "count": 8 },
      { "name": "数据中心", "count": 10 },
      { "name": "新能源产业链", "count": 3 },
      { "name": "PCB", "count": 6 },
      { "name": "股权转让", "count": 4 },
      { "name": "光通信", "count": 7 },
      { "name": "电力", "count": 24 },
      { "name": "消费", "count": 4 },
      { "name": "液冷服务器", "count": 4 }
    ],
    "total": 92
  },
  {
    "date": "20260514",
    "date_display": "2026/5/14",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 5 },
      { "name": "锂电池", "count": 2 },
      { "name": "算力", "count": 5 },
      { "name": "碳化硅", "count": 5 },
      { "name": "光伏", "count": 6 },
      { "name": "光通信", "count": 7 },
      { "name": "养猪", "count": 4 },
      { "name": "智能电网", "count": 2 },
      { "name": "消费", "count": 2 },
      { "name": "液冷服务器", "count": 4 }
    ],
    "total": 42
  },
  {
    "date": "20260515",
    "date_display": "2026/5/15",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 17 },
      { "name": "半导体", "count": 3 },
      { "name": "算力", "count": 3 },
      { "name": "医药", "count": 1 },
      { "name": "氟化工", "count": 9 },
      { "name": "无人驾驶", "count": 3 },
      { "name": "足球", "count": 3 },
      { "name": "智能电网", "count": 3 },
      { "name": "消费", "count": 3 }
    ],
    "total": 46
  },
  {
    "date": "20260516",
    "date_display": "2026/5/16",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260517",
    "date_display": "2026/5/17",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260518",
    "date_display": "2026/5/18",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 6 },
      { "name": "机器人", "count": 12 },
      { "name": "存储+芯片", "count": 19 },
      { "name": "锂电池", "count": 2 },
      { "name": "算力", "count": 8 },
      { "name": "AI硬件", "count": 5 },
      { "name": "光通信", "count": 5 },
      { "name": "电力", "count": 7 }
    ],
    "total": 64
  },
  {
    "date": "20260519",
    "date_display": "2026/5/19",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "机器人", "count": 20 },
      { "name": "国产芯片", "count": 9 },
      { "name": "算力", "count": 12 },
      { "name": "AI应用", "count": 2 },
      { "name": "PCB", "count": 2 },
      { "name": "被动元件", "count": 4 },
      { "name": "光通信", "count": 5 },
      { "name": "股权转让", "count": 4 },
      { "name": "电力", "count": 14 }
    ],
    "total": 75
  },
  {
    "date": "20260520",
    "date_display": "2026/5/20",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 8 },
      { "name": "芯片", "count": 26 },
      { "name": "锂电池", "count": 2 },
      { "name": "算力", "count": 2 },
      { "name": "数据中心", "count": 2 },
      { "name": "AI硬件", "count": 1 },
      { "name": "公告", "count": 4 },
      { "name": "光通信", "count": 3 },
      { "name": "股权转让", "count": 3 },
      { "name": "大消费", "count": 4 },
      { "name": "液冷服务器", "count": 5 }
    ],
    "total": 60
  },
  {
    "date": "20260521",
    "date_display": "2026/5/21",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 6 },
      { "name": "半导体", "count": 3 },
      { "name": "算力", "count": 5 },
      { "name": "医药", "count": 3 },
      { "name": "玻璃基板", "count": 5 },
      { "name": "智能驾驶", "count": 4 },
      { "name": "智能电网", "count": 1 }
    ],
    "total": 28
  },
  {
    "date": "20260522",
    "date_display": "2026/5/22",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "机器人", "count": 10 },
      { "name": "半导体", "count": 9 },
      { "name": "有色金属", "count": 5 },
      { "name": "数据中心", "count": 10 },
      { "name": "医药", "count": 4 },
      { "name": "玻璃基板", "count": 4 },
      { "name": "PCB", "count": 22 },
      { "name": "被动元件", "count": 12 },
      { "name": "光通信", "count": 6 },
      { "name": "金刚石散热", "count": 5 },
      { "name": "电力", "count": 3 },
      { "name": "消费", "count": 8 },
      { "name": "液冷服务器", "count": 3 }
    ],
    "total": 104
  },
  {
    "date": "20260523",
    "date_display": "2026/5/23",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260524",
    "date_display": "2026/5/24",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260525",
    "date_display": "2026/5/25",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 15 },
      { "name": "国产芯片", "count": 17 },
      { "name": "算力", "count": 6 },
      { "name": "医药", "count": 4 },
      { "name": "煤炭", "count": 8 },
      { "name": "PCB", "count": 7 },
      { "name": "被动元件", "count": 5 },
      { "name": "光通信", "count": 10 },
      { "name": "培育钻石", "count": 3 },
      { "name": "电力", "count": 9 },
      { "name": "消费", "count": 3 },
      { "name": "液冷服务器", "count": 1 }
    ],
    "total": 89
  },
  {
    "date": "20260526",
    "date_display": "2026/5/26",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 8 },
      { "name": "国产芯片", "count": 7 },
      { "name": "有色金属", "count": 3 },
      { "name": "算力", "count": 2 },
      { "name": "PCB", "count": 6 },
      { "name": "电力", "count": 5 },
      { "name": "消费", "count": 4 }
    ],
    "total": 35
  },
  {
    "date": "20260527",
    "date_display": "2026/5/27",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 3 },
      { "name": "半导体", "count": 2 },
      { "name": "有色金属", "count": 3 },
      { "name": "算力+数据中心", "count": 9 },
      { "name": "短剧", "count": 3 },
      { "name": "医药", "count": 1 },
      { "name": "PCB", "count": 3 },
      { "name": "超级电容", "count": 4 },
      { "name": "智能电网", "count": 7 },
      { "name": "大消费", "count": 4 }
    ],
    "total": 39
  },
  {
    "date": "20260528",
    "date_display": "2026/5/28",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "机器人", "count": 3 },
      { "name": "国产芯片+半导体", "count": 14 },
      { "name": "电池", "count": 3 },
      { "name": "算力", "count": 6 },
      { "name": "医药", "count": 1 },
      { "name": "房地产", "count": 4 },
      { "name": "PCB", "count": 11 },
      { "name": "被动元件", "count": 8 },
      { "name": "光通信", "count": 7 },
      { "name": "超级电容", "count": 5 },
      { "name": "电力", "count": 13 },
      { "name": "消费", "count": 4 },
      { "name": "AI散热", "count": 9 }
    ],
    "total": 91
  },
  {
    "date": "20260529",
    "date_display": "2026/5/29",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 1 },
      { "name": "半导体", "count": 2 },
      { "name": "医药", "count": 2 },
      { "name": "房地产", "count": 11 },
      { "name": "PCB", "count": 1 },
      { "name": "戴尔", "count": 3 },
      { "name": "电力", "count": 9 },
      { "name": "消费", "count": 11 },
      { "name": "液冷服务器", "count": 1 }
    ],
    "total": 41
  },
  {
    "date": "20260530",
    "date_display": "2026/5/30",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260531",
    "date_display": "2026/5/31",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260601",
    "date_display": "2026/6/1",
    "day_type": "trading",
    "sectors": [
      { "name": "AI应用", "count": 15 },
      { "name": "机器人", "count": 12 },
      { "name": "半导体", "count": 7 },
      { "name": "电池产业链", "count": 4 },
      { "name": "算力+数据中心", "count": 12 },
      { "name": "化工", "count": 3 },
      { "name": "医药", "count": 1 },
      { "name": "地产基建", "count": 5 },
      { "name": "AIPC", "count": 11 },
      { "name": "公告", "count": 3 },
      { "name": "玻璃基板", "count": 3 },
      { "name": "电力", "count": 8 },
      { "name": "大消费", "count": 9 },
      { "name": "煤炭", "count": 9 }
    ],
    "total": 102
  },
  {
    "date": "20260602",
    "date_display": "2026/6/2",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 8 },
      { "name": "半导体", "count": 4 },
      { "name": "有色金属", "count": 4 },
      { "name": "算力相关", "count": 7 },
      { "name": "地产基建", "count": 3 },
      { "name": "AIPC", "count": 2 },
      { "name": "被动元件", "count": 7 },
      { "name": "光通信", "count": 13 },
      { "name": "玻璃基板", "count": 3 },
      { "name": "电力", "count": 1 },
      { "name": "消费", "count": 2 },
      { "name": "煤炭", "count": 2 }
    ],
    "total": 56
  },
  {
    "date": "20260603",
    "date_display": "2026/6/3",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 10 },
      { "name": "半导体", "count": 9 },
      { "name": "电池", "count": 3 },
      { "name": "医药", "count": 1 },
      { "name": "房地产", "count": 1 },
      { "name": "PCB", "count": 1 },
      { "name": "光通信", "count": 13 },
      { "name": "电力", "count": 7 },
      { "name": "消费", "count": 5 },
      { "name": "煤炭", "count": 2 }
    ],
    "total": 53
  },
  {
    "date": "20260604",
    "date_display": "2026/6/4",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 6 },
      { "name": "半导体", "count": 13 },
      { "name": "云计算", "count": 5 },
      { "name": "燃气轮机", "count": 4 },
      { "name": "基建", "count": 3 },
      { "name": "液冷服务器", "count": 3 },
      { "name": "被动元件", "count": 12 },
      { "name": "光通信", "count": 5 },
      { "name": "玻璃基板", "count": 5 },
      { "name": "电力", "count": 4 },
      { "name": "消费", "count": 4 },
      { "name": "煤炭", "count": 4 }
    ],
    "total": 68
  },
  {
    "date": "20260605",
    "date_display": "2026/6/5",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 5 },
      { "name": "机器人", "count": 19 },
      { "name": "半导体", "count": 6 },
      { "name": "房地产", "count": 3 },
      { "name": "光伏", "count": 3 },
      { "name": "被动元件", "count": 3 },
      { "name": "玻璃基板", "count": 5 },
      { "name": "大消费", "count": 4 }
    ],
    "total": 48
  },
  {
    "date": "20260606",
    "date_display": "2026/6/6",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260607",
    "date_display": "2026/6/7",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260608",
    "date_display": "2026/6/8",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 11 },
      { "name": "半导体", "count": 4 },
      { "name": "固态电池", "count": 1 },
      { "name": "算力", "count": 2 },
      { "name": "人工智能大模型", "count": 8 },
      { "name": "医药", "count": 3 },
      { "name": "房地产", "count": 2 },
      { "name": "光通信", "count": 2 },
      { "name": "电力", "count": 1 },
      { "name": "大消费", "count": 5 },
      { "name": "煤炭", "count": 2 }
    ],
    "total": 43
  },
  {
    "date": "20260609",
    "date_display": "2026/6/9",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 8 },
      { "name": "半导体", "count": 24 },
      { "name": "锂矿+锂电池", "count": 2 },
      { "name": "算力", "count": 4 },
      { "name": "AI硬件", "count": 11 },
      { "name": "医药", "count": 2 },
      { "name": "房地产", "count": 3 },
      { "name": "PCB", "count": 21 },
      { "name": "被动元件", "count": 11 },
      { "name": "光通信", "count": 13 },
      { "name": "AI大模型", "count": 12 },
      { "name": "电力", "count": 3 },
      { "name": "消费", "count": 3 },
      { "name": "公告", "count": 4 }
    ],
    "total": 121
  },
  {
    "date": "20260610",
    "date_display": "2026/6/10",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 3 },
      { "name": "半导体", "count": 14 },
      { "name": "锂电池", "count": 1 },
      { "name": "算力", "count": 9 },
      { "name": "AI应用", "count": 7 },
      { "name": "房地产", "count": 4 },
      { "name": "PCB", "count": 7 },
      { "name": "化工", "count": 3 },
      { "name": "低空经济", "count": 3 },
      { "name": "大消费", "count": 7 },
      { "name": "工业气体", "count": 5 }
    ],
    "total": 63
  },
  {
    "date": "20260611",
    "date_display": "2026/6/11",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 5 },
      { "name": "半导体", "count": 18 },
      { "name": "锂电池", "count": 2 },
      { "name": "有色金属", "count": 7 },
      { "name": "房地产", "count": 2 },
      { "name": "PCB", "count": 4 },
      { "name": "化工", "count": 7 },
      { "name": "光通信", "count": 5 },
      { "name": "低空经济", "count": 3 },
      { "name": "电力", "count": 1 },
      { "name": "大消费", "count": 3 },
      { "name": "公告", "count": 3 }
    ],
    "total": 60
  },
  {
    "date": "20260612",
    "date_display": "2026/6/12",
    "day_type": "trading",
    "sectors": [
      { "name": "航天+军工", "count": 9 },
      { "name": "机器人", "count": 6 },
      { "name": "半导体", "count": 9 },
      { "name": "锂电池", "count": 2 },
      { "name": "AI硬件", "count": 3 },
      { "name": "有色金属", "count": 14 },
      { "name": "大金融", "count": 3 },
      { "name": "PCB", "count": 4 },
      { "name": "化工", "count": 3 },
      { "name": "光通信", "count": 3 },
      { "name": "低空经济", "count": 3 },
      { "name": "电力", "count": 2 },
      { "name": "大消费", "count": 12 },
      { "name": "公告", "count": 3 }
    ],
    "total": 76
  },
  {
    "date": "20260613",
    "date_display": "2026/6/13",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260614",
    "date_display": "2026/6/14",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260615",
    "date_display": "2026/6/15",
    "day_type": "trading",
    "sectors": [
      { "name": "航天", "count": 3 },
      { "name": "机器人", "count": 12 },
      { "name": "半导体", "count": 13 },
      { "name": "玻璃基板封装", "count": 4 },
      { "name": "数据中心算力", "count": 11 },
      { "name": "AI应用", "count": 3 },
      { "name": "有色金属", "count": 6 },
      { "name": "金融", "count": 3 },
      { "name": "PCB", "count": 25 },
      { "name": "被动元件", "count": 14 },
      { "name": "光通信", "count": 13 },
      { "name": "新能源汽车", "count": 3 },
      { "name": "电力", "count": 2 },
      { "name": "PET符合铜箔", "count": 3 },
      { "name": "航运", "count": 6 }
    ],
    "total": 121
  },
  {
    "date": "20260616",
    "date_display": "2026/6/16",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 8 },
      { "name": "半导体", "count": 11 },
      { "name": "锂电池", "count": 4 },
      { "name": "算力", "count": 5 },
      { "name": "有色金属", "count": 8 },
      { "name": "PCB", "count": 16 },
      { "name": "被动元件", "count": 8 },
      { "name": "光通信", "count": 10 },
      { "name": "玻璃基板封装", "count": 3 },
      { "name": "AI配电", "count": 15 },
      { "name": "大消费", "count": 7 },
      { "name": "液冷服务器", "count": 4 }
    ],
    "total": 99
  },
  {
    "date": "20260617",
    "date_display": "2026/6/17",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 6 },
      { "name": "机器人", "count": 3 },
      { "name": "半导体", "count": 12 },
      { "name": "锂电池", "count": 2 },
      { "name": "算力", "count": 4 },
      { "name": "AI硬件", "count": 6 },
      { "name": "大金融", "count": 3 },
      { "name": "PCB", "count": 15 },
      { "name": "被动元件", "count": 4 },
      { "name": "光通信", "count": 5 },
      { "name": "玻璃基板封装", "count": 11 },
      { "name": "消费", "count": 3 },
      { "name": "医药", "count": 3 }
    ],
    "total": 77
  },
  {
    "date": "20260618",
    "date_display": "2026/6/18",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 5 },
      { "name": "机器人", "count": 13 },
      { "name": "半导体", "count": 14 },
      { "name": "锂电池", "count": 3 },
      { "name": "算力", "count": 3 },
      { "name": "AI硬件", "count": 4 },
      { "name": "有色金属", "count": 3 },
      { "name": "PCB", "count": 10 },
      { "name": "被动元件", "count": 6 },
      { "name": "光通信", "count": 7 },
      { "name": "氧化锆", "count": 5 },
      { "name": "大消费", "count": 3 },
      { "name": "医疗医药", "count": 7 }
    ],
    "total": 83
  },
  {
    "date": "20260619",
    "date_display": "2026/6/19",
    "day_type": "holiday",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260620",
    "date_display": "2026/6/20",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260621",
    "date_display": "2026/6/21",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260622",
    "date_display": "2026/6/22",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 5 },
      { "name": "国产芯片", "count": 4 },
      { "name": "锂电池", "count": 3 },
      { "name": "云计算数据中心", "count": 6 },
      { "name": "人工智能大模型", "count": 6 },
      { "name": "有色金属", "count": 24 },
      { "name": "大金融", "count": 10 },
      { "name": "PCB", "count": 6 },
      { "name": "光通信", "count": 9 },
      { "name": "玻璃基板封装", "count": 5 },
      { "name": "智能电网", "count": 5 },
      { "name": "磷化工", "count": 7 },
      { "name": "培育砖石", "count": 7 },
      { "name": "氟化工", "count": 3 },
      { "name": "钛白粉", "count": 3 }
    ],
    "total": 105
  },
  {
    "date": "20260623",
    "date_display": "2026/6/23",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 11 },
      { "name": "半导体", "count": 10 },
      { "name": "数据中心", "count": 6 },
      { "name": "有色金属", "count": 5 },
      { "name": "大金融", "count": 4 },
      { "name": "光通信", "count": 5 },
      { "name": "玻璃基板封装", "count": 2 },
      { "name": "大消费", "count": 11 },
      { "name": "培育砖石", "count": 2 },
      { "name": "工业气体", "count": 4 },
      { "name": "医疗医药", "count": 4 }
    ],
    "total": 64
  },
  {
    "date": "20260624",
    "date_display": "2026/6/24",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "半导体", "count": 29 },
      { "name": "锂矿", "count": 4 },
      { "name": "算力", "count": 4 },
      { "name": "数据中心散热", "count": 5 },
      { "name": "有色化工", "count": 6 },
      { "name": "PCB", "count": 9 },
      { "name": "被动元件", "count": 4 },
      { "name": "光通信", "count": 10 },
      { "name": "医疗医药", "count": 4 }
    ],
    "total": 77
  },
  {
    "date": "20260625",
    "date_display": "2026/6/25",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 4 },
      { "name": "半导体", "count": 16 },
      { "name": "算力", "count": 5 },
      { "name": "数据中心散热", "count": 3 },
      { "name": "有色化工", "count": 8 },
      { "name": "大金融", "count": 1 },
      { "name": "PCB", "count": 11 },
      { "name": "被动元件", "count": 12 },
      { "name": "光通信", "count": 6 },
      { "name": "大消费", "count": 6 },
      { "name": "培育砖石", "count": 1 },
      { "name": "医药", "count": 2 }
    ],
    "total": 75
  },
  {
    "date": "20260626",
    "date_display": "2026/6/26",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 8 },
      { "name": "机器人", "count": 3 },
      { "name": "半导体", "count": 11 },
      { "name": "液冷", "count": 4 },
      { "name": "大硅片", "count": 4 },
      { "name": "PCB", "count": 4 },
      { "name": "光通信", "count": 2 },
      { "name": "玻璃基板", "count": 6 },
      { "name": "电力", "count": 3 },
      { "name": "大消费", "count": 4 },
      { "name": "光刻胶", "count": 4 }
    ],
    "total": 53
  },
  {
    "date": "20260627",
    "date_display": "2026/6/27",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260628",
    "date_display": "2026/6/28",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260629",
    "date_display": "2026/6/29",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 5 },
      { "name": "半导体", "count": 20 },
      { "name": "锂电池", "count": 1 },
      { "name": "液冷", "count": 2 },
      { "name": "有色金属", "count": 2 },
      { "name": "PCB", "count": 1 },
      { "name": "被动元件", "count": 2 },
      { "name": "光通信", "count": 1 },
      { "name": "玻璃基板封装", "count": 1 },
      { "name": "可控核聚变", "count": 7 },
      { "name": "大消费", "count": 18 },
      { "name": "存储", "count": 5 },
      { "name": "医药", "count": 26 }
    ],
    "total": 93
  },
  {
    "date": "20260630",
    "date_display": "2026/6/30",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 10 },
      { "name": "机器人", "count": 27 },
      { "name": "半导体", "count": 29 },
      { "name": "锂电池", "count": 4 },
      { "name": "算力+数据中心", "count": 10 },
      { "name": "液冷", "count": 4 },
      { "name": "PCB", "count": 2 },
      { "name": "光通信", "count": 8 },
      { "name": "玻璃基板", "count": 6 },
      { "name": "电力", "count": 2 },
      { "name": "大消费", "count": 8 },
      { "name": "AI硬件", "count": 4 },
      { "name": "存储", "count": 7 },
      { "name": "医药", "count": 2 }
    ],
    "total": 123
  },
  {
    "date": "20260701",
    "date_display": "2026/7/1",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "机器人", "count": 20 },
      { "name": "半导体", "count": 22 },
      { "name": "电池产业链", "count": 3 },
      { "name": "算力", "count": 11 },
      { "name": "化工", "count": 4 },
      { "name": "有色金属", "count": 2 },
      { "name": "大金融", "count": 6 },
      { "name": "氟化工", "count": 5 },
      { "name": "业绩增长", "count": 4 },
      { "name": "光通信", "count": 3 },
      { "name": "养殖", "count": 9 },
      { "name": "电力", "count": 4 },
      { "name": "大消费", "count": 11 },
      { "name": "地产", "count": 5 },
      { "name": "存储", "count": 5 },
      { "name": "医疗医药", "count": 11 }
    ],
    "total": 128
  },
  {
    "date": "20260702",
    "date_display": "2026/7/2",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 22 },
      { "name": "半导体", "count": 10 },
      { "name": "算力", "count": 4 },
      { "name": "化工", "count": 5 },
      { "name": "黄金", "count": 3 },
      { "name": "AI硬件", "count": 3 },
      { "name": "业绩增长", "count": 3 },
      { "name": "AI应用", "count": 4 },
      { "name": "大消费", "count": 7 },
      { "name": "海南", "count": 3 },
      { "name": "医疗医药", "count": 7 }
    ],
    "total": 71
  },
  {
    "date": "20260703",
    "date_display": "2026/7/3",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 8 },
      { "name": "机器人", "count": 44 },
      { "name": "半导体", "count": 7 },
      { "name": "液冷", "count": 3 },
      { "name": "黄金", "count": 6 },
      { "name": "电力", "count": 3 },
      { "name": "大消费", "count": 6 },
      { "name": "医药", "count": 2 }
    ],
    "total": 79
  },
  {
    "date": "20260704",
    "date_display": "2026/7/4",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260705",
    "date_display": "2026/7/5",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260706",
    "date_display": "2026/7/6",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 7 },
      { "name": "半导体", "count": 11 },
      { "name": "算力", "count": 2 },
      { "name": "液冷", "count": 4 },
      { "name": "PCB", "count": 2 },
      { "name": "光通信", "count": 3 },
      { "name": "AI电力相关", "count": 6 },
      { "name": "大消费", "count": 7 },
      { "name": "医药", "count": 1 }
    ],
    "total": 43
  },
  {
    "date": "20260707",
    "date_display": "2026/7/7",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 8 },
      { "name": "半导体", "count": 4 },
      { "name": "锂电池", "count": 1 },
      { "name": "有色金属", "count": 1 },
      { "name": "PCB", "count": 1 },
      { "name": "业绩增长", "count": 3 },
      { "name": "硅片", "count": 4 },
      { "name": "消费", "count": 2 }
    ],
    "total": 26
  },
  {
    "date": "20260708",
    "date_display": "2026/7/8",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 6 },
      { "name": "数据中心", "count": 17 },
      { "name": "黄金", "count": 1 },
      { "name": "公告", "count": 4 },
      { "name": "大消费", "count": 4 },
      { "name": "AI硬件", "count": 5 },
      { "name": "医药", "count": 1 }
    ],
    "total": 38
  },
  {
    "date": "20260709",
    "date_display": "2026/7/9",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 6 },
      { "name": "半导体", "count": 19 },
      { "name": "长鑫科技", "count": 13 },
      { "name": "PCB", "count": 6 },
      { "name": "业绩增长", "count": 8 },
      { "name": "大消费", "count": 1 },
      { "name": "AI硬件", "count": 10 },
      { "name": "医药", "count": 2 }
    ],
    "total": 67
  },
  {
    "date": "20260710",
    "date_display": "2026/7/10",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 27 },
      { "name": "机器人", "count": 8 },
      { "name": "半导体", "count": 9 },
      { "name": "算力", "count": 6 },
      { "name": "业绩", "count": 10 },
      { "name": "玻璃基板封装", "count": 3 },
      { "name": "智能电网", "count": 3 },
      { "name": "大消费", "count": 1 },
      { "name": "AI应用", "count": 9 },
      { "name": "医药", "count": 11 }
    ],
    "total": 87
  },
  {
    "date": "20260711",
    "date_display": "2026/7/11",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260712",
    "date_display": "2026/7/12",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260713",
    "date_display": "2026/7/13",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 1 },
      { "name": "半导体", "count": 4 },
      { "name": "业绩", "count": 3 },
      { "name": "大消费", "count": 2 },
      { "name": "医药", "count": 8 }
    ],
    "total": 20
  },
  {
    "date": "20260714",
    "date_display": "2026/7/14",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 7 },
      { "name": "半导体", "count": 3 },
      { "name": "锂电池", "count": 1 },
      { "name": "算力", "count": 1 },
      { "name": "PCB", "count": 5 },
      { "name": "业绩", "count": 24 },
      { "name": "被动元件", "count": 4 },
      { "name": "大消费", "count": 1 },
      { "name": "AI硬件", "count": 2 },
      { "name": "石油石化", "count": 6 },
      { "name": "医药", "count": 8 }
    ],
    "total": 62
  },
  {
    "date": "20260715",
    "date_display": "2026/7/15",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 7 },
      { "name": "PCB", "count": 1 },
      { "name": "业绩", "count": 23 },
      { "name": "智能电网", "count": 1 },
      { "name": "大消费", "count": 11 },
      { "name": "医药", "count": 15 }
    ],
    "total": 59
  },
  {
    "date": "20260716",
    "date_display": "2026/7/16",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 3 },
      { "name": "国产芯片", "count": 3 },
      { "name": "云计算数据中心", "count": 3 },
      { "name": "PCB", "count": 1 },
      { "name": "业绩", "count": 2 },
      { "name": "大消费", "count": 3 },
      { "name": "AI手机", "count": 5 },
      { "name": "医药", "count": 8 }
    ],
    "total": 28
  },
  {
    "date": "20260717",
    "date_display": "2026/7/17",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 1 },
      { "name": "锂电池", "count": 1 },
      { "name": "算力", "count": 5 },
      { "name": "证券", "count": 1 },
      { "name": "PCB", "count": 1 },
      { "name": "电力", "count": 9 },
      { "name": "中药", "count": 2 }
    ],
    "total": 22
  },
  {
    "date": "20260718",
    "date_display": "2026/7/18",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260719",
    "date_display": "2026/7/19",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260720",
    "date_display": "2026/7/20",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 2 },
      { "name": "算力", "count": 7 },
      { "name": "大金融", "count": 1 },
      { "name": "业绩", "count": 3 },
      { "name": "电力", "count": 18 },
      { "name": "大消费", "count": 2 },
      { "name": "AI硬件", "count": 2 },
      { "name": "油服", "count": 4 },
      { "name": "医药", "count": 2 }
    ],
    "total": 41
  },
  {
    "date": "20260721",
    "date_display": "2026/7/21",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 5 },
      { "name": "半导体", "count": 40 },
      { "name": "玻璃基板", "count": 3 },
      { "name": "算力+数据中心", "count": 11 },
      { "name": "AI应用", "count": 3 },
      { "name": "有色金属", "count": 4 },
      { "name": "大金融", "count": 4 },
      { "name": "PCB", "count": 11 },
      { "name": "业绩", "count": 3 },
      { "name": "光通信", "count": 7 },
      { "name": "被动元件", "count": 7 },
      { "name": "智能电网", "count": 3 },
      { "name": "AI硬件", "count": 3 },
      { "name": "黄金", "count": 2 },
      { "name": "医药", "count": 1 }
    ],
    "total": 108
  },
  {
    "date": "20260722",
    "date_display": "2026/7/22",
    "day_type": "trading",
    "sectors": [
      { "name": "半导体", "count": 4 },
      { "name": "算力", "count": 4 },
      { "name": "AI应用", "count": 1 },
      { "name": "超节点", "count": 3 },
      { "name": "电力", "count": 12 },
      { "name": "AI硬件", "count": 2 },
      { "name": "黄金", "count": 3 },
      { "name": "医药", "count": 5 }
    ],
    "total": 34
  },
  {
    "date": "20260723",
    "date_display": "2026/7/23",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 5 },
      { "name": "机器人", "count": 8 },
      { "name": "半导体", "count": 3 },
      { "name": "锂电池", "count": 10 },
      { "name": "算力+数据中心", "count": 8 },
      { "name": "有色金属", "count": 3 },
      { "name": "地产", "count": 4 },
      { "name": "军工", "count": 4 },
      { "name": "化工", "count": 9 },
      { "name": "电力+网络设备", "count": 34 },
      { "name": "摘帽", "count": 3 },
      { "name": "黄金", "count": 3 },
      { "name": "医疗医药", "count": 6 }
    ],
    "total": 100
  },
  {
    "date": "20260724",
    "date_display": "2026/7/24",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "半导体", "count": 8 },
      { "name": "锂电池", "count": 2 },
      { "name": "军工", "count": 7 },
      { "name": "智能电网", "count": 6 },
      { "name": "消费", "count": 2 }
    ],
    "total": 26
  },
  {
    "date": "20260725",
    "date_display": "2026/7/25",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260726",
    "date_display": "2026/7/26",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260727",
    "date_display": "2026/7/27",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 13 },
      { "name": "半导体", "count": 9 },
      { "name": "锂电产业链", "count": 7 },
      { "name": "算力", "count": 4 },
      { "name": "脑机接口", "count": 6 },
      { "name": "PCB", "count": 10 },
      { "name": "业绩增长", "count": 3 },
      { "name": "光通信", "count": 4 },
      { "name": "被动元件", "count": 7 },
      { "name": "智能电网", "count": 11 },
      { "name": "大消费", "count": 13 },
      { "name": "燃气轮机", "count": 3 },
      { "name": "医药", "count": 9 }
    ],
    "total": 99
  },
  {
    "date": "20260728",
    "date_display": "2026/7/28",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 5 },
      { "name": "光刻机", "count": 11 },
      { "name": "锂电池", "count": 1 },
      { "name": "算力", "count": 3 },
      { "name": "脑机接口", "count": 6 },
      { "name": "大金融", "count": 1 },
      { "name": "智能电网", "count": 4 },
      { "name": "大消费", "count": 8 },
      { "name": "AI应用", "count": 6 }
    ],
    "total": 45
  },
  {
    "date": "20260729",
    "date_display": "2026/7/29",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 6 },
      { "name": "半导体", "count": 5 },
      { "name": "锂电池", "count": 6 },
      { "name": "大金融", "count": 3 },
      { "name": "房地产", "count": 6 },
      { "name": "化工", "count": 4 },
      { "name": "被动元件", "count": 2 },
      { "name": "智能电网", "count": 6 },
      { "name": "大消费", "count": 25 },
      { "name": "游戏", "count": 3 },
      { "name": "教育", "count": 3 }
    ],
    "total": 69
  },
  {
    "date": "20260730",
    "date_display": "2026/7/30",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 2 },
      { "name": "国产芯片", "count": 2 },
      { "name": "锂电池", "count": 2 },
      { "name": "算力", "count": 1 },
      { "name": "被动元件", "count": 1 },
      { "name": "智能电网", "count": 4 },
      { "name": "大消费", "count": 11 },
      { "name": "AI应用", "count": 3 },
      { "name": "汽车产业链", "count": 8 },
      { "name": "医药", "count": 2 }
    ],
    "total": 36
  },
  {
    "date": "20260731",
    "date_display": "2026/7/31",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 14 },
      { "name": "国产芯片", "count": 7 },
      { "name": "锂电池", "count": 1 },
      { "name": "算力+数据中心", "count": 18 },
      { "name": "人工智能大模型", "count": 18 },
      { "name": "PCB", "count": 3 },
      { "name": "房地产", "count": 4 },
      { "name": "光通信", "count": 3 },
      { "name": "被动元件", "count": 2 },
      { "name": "智能电网", "count": 4 },
      { "name": "大消费", "count": 6 },
      { "name": "医药", "count": 2 }
    ],
    "total": 84
  },
  {
    "date": "20260801",
    "date_display": "2026/8/1",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260802",
    "date_display": "2026/8/2",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260803",
    "date_display": "2026/8/3",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 15 },
      { "name": "存储芯片", "count": 1 },
      { "name": "锂电产业链", "count": 1 },
      { "name": "算力", "count": 1 },
      { "name": "核电", "count": 16 },
      { "name": "电力", "count": 5 },
      { "name": "AI应用", "count": 11 },
      { "name": "光伏", "count": 3 },
      { "name": "医药", "count": 1 }
    ],
    "total": 56
  },
  {
    "date": "20260804",
    "date_display": "2026/8/4",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 10 },
      { "name": "半导体", "count": 8 },
      { "name": "算力", "count": 21 },
      { "name": "AI液冷散热", "count": 8 },
      { "name": "PCB", "count": 19 },
      { "name": "磷化铟", "count": 5 },
      { "name": "光通信", "count": 16 },
      { "name": "MLCC", "count": 4 },
      { "name": "电力", "count": 5 },
      { "name": "消费", "count": 2 },
      { "name": "AI应用", "count": 14 },
      { "name": "医疗医药", "count": 12 }
    ],
    "total": 125
  },
  {
    "date": "20260805",
    "date_display": "2026/8/5",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 12 },
      { "name": "半导体", "count": 17 },
      { "name": "AI液冷散热", "count": 7 },
      { "name": "有色金属", "count": 4 },
      { "name": "智能驾驶", "count": 8 },
      { "name": "PCB", "count": 10 },
      { "name": "磷化铟", "count": 3 },
      { "name": "光通信", "count": 11 },
      { "name": "MLCC", "count": 4 },
      { "name": "电力", "count": 1 },
      { "name": "黄金", "count": 6 },
      { "name": "AI应用", "count": 6 },
      { "name": "玻璃基板", "count": 3 },
      { "name": "医药", "count": 1 }
    ],
    "total": 93
  },
  {
    "date": "20260806",
    "date_display": "2026/8/6",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 1 },
      { "name": "半导体", "count": 6 },
      { "name": "算力", "count": 1 },
      { "name": "数字人民币", "count": 8 },
      { "name": "AI基站", "count": 3 },
      { "name": "PCB", "count": 7 },
      { "name": "磷化铟", "count": 2 },
      { "name": "光通信", "count": 6 },
      { "name": "电力", "count": 4 },
      { "name": "煤炭", "count": 7 },
      { "name": "AI应用", "count": 4 },
      { "name": "电子特气", "count": 4 },
      { "name": "医疗医药", "count": 6 }
    ],
    "total": 60
  },
  {
    "date": "20260807",
    "date_display": "2026/8/7",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 3 },
      { "name": "半导体", "count": 8 },
      { "name": "数据中心", "count": 2 },
      { "name": "PCB", "count": 18 },
      { "name": "光通信", "count": 3 },
      { "name": "电力", "count": 1 },
      { "name": "AI应用", "count": 2 },
      { "name": "医疗医药", "count": 20 }
    ],
    "total": 58
  },
  {
    "date": "20260808",
    "date_display": "2026/8/8",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260809",
    "date_display": "2026/8/9",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260810",
    "date_display": "2026/8/10",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 1 },
      { "name": "机器人", "count": 7 },
      { "name": "芯片", "count": 2 },
      { "name": "锂电池", "count": 3 },
      { "name": "算力", "count": 6 },
      { "name": "有色金属", "count": 2 },
      { "name": "黄金", "count": 3 },
      { "name": "PCB", "count": 2 },
      { "name": "磷化铟", "count": 2 },
      { "name": "化工", "count": 4 },
      { "name": "军工", "count": 4 },
      { "name": "电力", "count": 9 },
      { "name": "大消费", "count": 8 },
      { "name": "AI应用", "count": 3 },
      { "name": "基建", "count": 8 },
      { "name": "医疗医药", "count": 16 }
    ],
    "total": 80
  },
  {
    "date": "20260811",
    "date_display": "2026/8/11",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 10 },
      { "name": "半导体", "count": 4 },
      { "name": "算力", "count": 7 },
      { "name": "影视", "count": 3 },
      { "name": "黄金", "count": 2 },
      { "name": "军工", "count": 2 },
      { "name": "电力", "count": 3 },
      { "name": "大消费", "count": 5 },
      { "name": "AI应用", "count": 2 },
      { "name": "医疗医药", "count": 8 }
    ],
    "total": 46
  },
  {
    "date": "20260812",
    "date_display": "2026/8/12",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 2 },
      { "name": "机器人", "count": 10 },
      { "name": "半导体", "count": 5 },
      { "name": "算力", "count": 12 },
      { "name": "有色金属", "count": 2 },
      { "name": "PCB", "count": 2 },
      { "name": "光通信", "count": 10 },
      { "name": "电力", "count": 3 },
      { "name": "大消费", "count": 13 },
      { "name": "AI应用", "count": 5 },
      { "name": "房地产", "count": 5 },
      { "name": "医药", "count": 7 }
    ],
    "total": 76
  },
  {
    "date": "20260813",
    "date_display": "2026/8/13",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 5 },
      { "name": "半导体", "count": 3 },
      { "name": "固态电池", "count": 1 },
      { "name": "算力", "count": 6 },
      { "name": "光通信", "count": 2 },
      { "name": "军工", "count": 1 },
      { "name": "智能电网", "count": 5 },
      { "name": "大消费", "count": 5 },
      { "name": "AI应用", "count": 2 },
      { "name": "医药", "count": 14 }
    ],
    "total": 44
  },
  {
    "date": "20260814",
    "date_display": "2026/8/14",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 5 },
      { "name": "半导体", "count": 7 },
      { "name": "算力", "count": 4 },
      { "name": "光通信", "count": 14 },
      { "name": "军工", "count": 2 },
      { "name": "大消费", "count": 1 },
      { "name": "医疗医药", "count": 10 }
    ],
    "total": 43
  },
  {
    "date": "20260815",
    "date_display": "2026/8/15",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260816",
    "date_display": "2026/8/16",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260817",
    "date_display": "2026/8/17",
    "day_type": "trading",
    "sectors": [
      { "name": "航天", "count": 4 },
      { "name": "机器人", "count": 12 },
      { "name": "半导体", "count": 11 },
      { "name": "算力", "count": 7 },
      { "name": "液冷服务器", "count": 3 },
      { "name": "有色金属", "count": 3 },
      { "name": "PCB", "count": 9 },
      { "name": "燃气轮机", "count": 4 },
      { "name": "光通信", "count": 9 },
      { "name": "化工", "count": 3 },
      { "name": "智能电网", "count": 4 },
      { "name": "大消费", "count": 9 },
      { "name": "农林牧渔", "count": 6 },
      { "name": "医疗医药", "count": 10 }
    ],
    "total": 94
  },
  {
    "date": "20260818",
    "date_display": "2026/8/18",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 11 },
      { "name": "半导体", "count": 3 },
      { "name": "国产软件", "count": 4 },
      { "name": "业绩增长", "count": 4 },
      { "name": "光通信", "count": 7 },
      { "name": "化工", "count": 2 },
      { "name": "大消费", "count": 8 },
      { "name": "农林牧渔", "count": 24 },
      { "name": "医疗医药", "count": 4 }
    ],
    "total": 67
  },
  {
    "date": "20260819",
    "date_display": "2026/8/19",
    "day_type": "trading",
    "sectors": [
      { "name": "商业航天", "count": 3 },
      { "name": "锂电池", "count": 1 },
      { "name": "房地产", "count": 7 },
      { "name": "石油石化", "count": 3 },
      { "name": "煤炭", "count": 5 },
      { "name": "农业", "count": 5 },
      { "name": "医药", "count": 4 }
    ],
    "total": 28
  },
  {
    "date": "20260820",
    "date_display": "2026/8/20",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 6 },
      { "name": "半导体", "count": 1 },
      { "name": "算力", "count": 3 },
      { "name": "黄金", "count": 3 },
      { "name": "PCB", "count": 3 },
      { "name": "光通信", "count": 1 },
      { "name": "智能电网", "count": 2 },
      { "name": "大消费", "count": 4 },
      { "name": "农业", "count": 1 },
      { "name": "医药", "count": 39 }
    ],
    "total": 63
  },
  {
    "date": "20260821",
    "date_display": "2026/8/21",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 10 },
      { "name": "半导体", "count": 4 },
      { "name": "锂电池", "count": 2 },
      { "name": "液冷", "count": 3 },
      { "name": "有色金属", "count": 1 },
      { "name": "黄金", "count": 4 },
      { "name": "PCB", "count": 1 },
      { "name": "光通信", "count": 9 },
      { "name": "智能电网", "count": 1 },
      { "name": "大消费", "count": 3 },
      { "name": "医药", "count": 8 }
    ],
    "total": 46
  },
  {
    "date": "20260822",
    "date_display": "2026/8/22",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260823",
    "date_display": "2026/8/23",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260824",
    "date_display": "2026/8/24",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 3 },
      { "name": "半导体", "count": 3 },
      { "name": "锂电池", "count": 4 },
      { "name": "算力", "count": 3 },
      { "name": "黄金", "count": 3 },
      { "name": "电力", "count": 3 },
      { "name": "消费", "count": 2 },
      { "name": "农业", "count": 2 },
      { "name": "医药", "count": 6 }
    ],
    "total": 29
  },
  {
    "date": "20260825",
    "date_display": "2026/8/25",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 4 },
      { "name": "国产芯片", "count": 5 },
      { "name": "锂电池", "count": 1 },
      { "name": "算力", "count": 4 },
      { "name": "液冷", "count": 5 },
      { "name": "黄金", "count": 1 },
      { "name": "房地产", "count": 2 },
      { "name": "光通信", "count": 2 },
      { "name": "智能电网", "count": 2 },
      { "name": "大消费", "count": 6 },
      { "name": "煤炭", "count": 2 },
      { "name": "农业", "count": 4 },
      { "name": "医药", "count": 9 }
    ],
    "total": 47
  },
  {
    "date": "20260826",
    "date_display": "2026/8/26",
    "day_type": "trading",
    "sectors": [
      { "name": "半导体", "count": 3 },
      { "name": "锂电池", "count": 1 },
      { "name": "液冷", "count": 2 },
      { "name": "有色金属", "count": 3 },
      { "name": "黄金", "count": 4 },
      { "name": "大金融", "count": 6 },
      { "name": "光通信", "count": 6 },
      { "name": "可控核聚变", "count": 3 },
      { "name": "电力", "count": 2 },
      { "name": "农业", "count": 3 },
      { "name": "医药", "count": 5 }
    ],
    "total": 38
  },
  {
    "date": "20260827",
    "date_display": "2026/8/27",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 2 },
      { "name": "半导体", "count": 4 },
      { "name": "算力", "count": 1 },
      { "name": "液冷服务器", "count": 4 },
      { "name": "有色金属", "count": 1 },
      { "name": "黄金", "count": 3 },
      { "name": "PCB", "count": 6 },
      { "name": "大金融", "count": 5 },
      { "name": "光通信", "count": 15 },
      { "name": "存储", "count": 3 },
      { "name": "氟化工", "count": 4 },
      { "name": "农林牧渔", "count": 8 },
      { "name": "医疗医药", "count": 4 }
    ],
    "total": 60
  },
  {
    "date": "20260828",
    "date_display": "2026/8/28",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 5 },
      { "name": "算力", "count": 5 },
      { "name": "液冷服务器", "count": 2 },
      { "name": "黄金", "count": 2 },
      { "name": "PCB", "count": 2 },
      { "name": "大金融", "count": 2 },
      { "name": "AI应用", "count": 8 },
      { "name": "房地产", "count": 4 },
      { "name": "智能电网", "count": 4 },
      { "name": "大消费", "count": 4 },
      { "name": "氟化工/PTEE", "count": 3 },
      { "name": "农业", "count": 12 },
      { "name": "医药", "count": 5 }
    ],
    "total": 58
  },
  {
    "date": "20260829",
    "date_display": "2026/8/29",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260830",
    "date_display": "2026/8/30",
    "day_type": "weekend",
    "sectors": [],
    "total": 0
  },
  {
    "date": "20260831",
    "date_display": "2026/8/31",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 8 },
      { "name": "半导体", "count": 5 },
      { "name": "算力", "count": 4 },
      { "name": "AI液冷", "count": 10 },
      { "name": "短剧", "count": 16 },
      { "name": "PCB", "count": 6 },
      { "name": "大金融", "count": 2 },
      { "name": "房地产", "count": 7 },
      { "name": "智能电网", "count": 1 },
      { "name": "大消费", "count": 5 },
      { "name": "化工", "count": 3 },
      { "name": "农业", "count": 4 },
      { "name": "医药", "count": 1 }
    ],
    "total": 72
  },
  {
    "date": "20260901",
    "date_display": "2026/9/1",
    "day_type": "trading",
    "sectors": [
      { "name": "航天", "count": 1 },
      { "name": "锂电池", "count": 1 },
      { "name": "AI应用", "count": 4 },
      { "name": "AI液冷", "count": 1 },
      { "name": "有色金属", "count": 1 },
      { "name": "短剧", "count": 10 },
      { "name": "大金融", "count": 7 },
      { "name": "光通信", "count": 3 },
      { "name": "房地产", "count": 1 },
      { "name": "算电协同", "count": 1 },
      { "name": "大消费", "count": 12 },
      { "name": "化工", "count": 2 },
      { "name": "农业", "count": 14 },
      { "name": "医药", "count": 8 }
    ],
    "total": 66
  },
  {
    "date": "20260902",
    "date_display": "2026/9/2",
    "day_type": "trading",
    "sectors": [
      { "name": "机器人", "count": 6 },
      { "name": "半导体", "count": 3 },
      { "name": "液冷服务器", "count": 4 },
      { "name": "短剧", "count": 3 },
      { "name": "大金融", "count": 2 },
      { "name": "光通信", "count": 2 },
      { "name": "电力", "count": 3 },
      { "name": "大消费", "count": 4 },
      { "name": "氟化工", "count": 2 },
      { "name": "大农业", "count": 2 },
      { "name": "医药", "count": 1 }
    ],
    "total": 32
  },
];
