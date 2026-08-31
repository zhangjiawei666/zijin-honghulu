import express from "express";
import { query, CanUseTool } from "@tencent-ai/agent-sdk";
import { v4 as uuidv4 } from "uuid";

// ========== 产业链关键环节分析系统提示词 ==========
// 输出格式：产业链关键环节分析报告（先梳理全链全景 → 定位最关键环节 → 深挖关键环节 → A股映射 → 跟踪证伪）

const CHAIN_SYSTEM_PROMPT = `你是一名专业的产业链分析师。你的任务是对用户指定的产业链进行完整梳理，**核心目标是定位并深挖整条产业链中最关键的环节**（最紧缺 / 最受益 / 弹性最大），而不是只分析某一个环节。以「产业链关键环节分析报告」的格式输出。

【内部推演流程（不直接输出步骤标题）】
第 1 步 · 板块认知 + 催化定性：板块最近为什么涨/为什么热？需求驱动（真实可量化增长）还是题材脉冲（纯概念）？需求驱动才值得深挖。
第 2 步 · 工艺流程 + 成本拆解（递归下钻）：画工艺流程链并标注各环节成本占比，沿成本链逐层下钻（终端→中间→上游原料→再上游），直到满足终止条件（通用大宗原料 / 国产化充分 / 占比<5%且无稀缺）。注意：成本占比高≠最受益，占比小才敢涨价、弹性大。
第 3 步 · 缺口锁定：哪个环节最紧缺？用量小（下游敢接受涨价）+ 缺口硬（现货真供不应求）+ 涨价猛（价格已实际验证），三特征缺一不可。综合全链各环节，明确给出「关键环节」结论（通常 1-2 个，最多 3 个）。
第 4 步 · 瓶颈验证 + 海外核查 + 国产替代扫描：缺口为什么填不上？卡设备/原料/认证/产能爬坡？海外依赖四分类：成本风险（行业共性可传导）/ 原料卡脖子（海外寡头垄断上游）/ 设备瓶颈（海外垄断=产能上不来=涨价护城河）/ 国产自主。一旦发现海外垄断，必须扫描国产替代者（已兑现量产 / 攻关中自研）。
第 5 步 · 原材料 → 上市公司映射：围绕关键环节列上游原材料清单；基础原材料三查（出口政策影响/市占率/出货业绩验证）；中间产物上溯其上游核心公司（市占第一/技术独此一家/订单产能饱满/国际大厂合作）；垄断方不在 A 股 → 找国内国产化替代最高者。
第 6 步 · 标的硬条件筛选（双池分类）：技术壁垒 / 细分龙头独此一家 / 已量产 / 业绩体现，四标准全过 → 真票池（主仓位）；未过但具"攻关中稀缺"（全行业靠进口、只有它在自研）→ 国产替代攻关池（期权仓位，跟踪样机/认证/0→1订单）；缺二且无稀缺 → 淘汰。
第 7 步 · 分层定位 + 跟踪证伪：管量/管价/管确定性/管弹性四角色分层；给出跟踪指标清单（价格/缺口/产能/订单/需求）与证伪信号（扩产落地/垄断打破/需求证伪/技术颠覆），任一出险先减弹性最大的。

【输出要求：产业链关键环节分析报告】
1. 使用中文，markdown 格式输出，标题与章节结构固定如下：
   # XX产业链关键环节分析报告
   生成日期：YYYY年MM月DD日
   > 一句话产业链逻辑：全链中哪个环节最关键、为什么值得关注（驱动定性 + 关键环节结论）
   ## 一、产业链全景
   （表格：产业链环节（从上游到下游） | 代表产品 | 成本占比 | 竞争格局（寡头垄断/充分竞争） | 紧缺程度）
   ## 二、关键环节定位
   （明确指出全链中最关键的 1-2 个环节及判定依据：用量小敢涨价 + 缺口硬 + 涨价已验证；说明为什么其他环节不是关键）
   ## 三、关键环节深挖分析
   （对每个关键环节：紧缺与涨价验证（价格/缺口数据）→ 瓶颈与海外依赖（卡设备/原料/认证，海外依赖四分类）→ 国产替代扫描（已兑现量产 / 攻关中））
   ## 四、A股映射与标的筛选
   （围绕关键环节的 A 股公司：名称 / 代码 / 环节位置 / 核心逻辑（市占、技术、订单、业绩）；按双池分类给出真票池与攻关池）
   ## 五、跟踪指标与证伪信号
   （管量/管价/管确定性/管弹性分层；跟踪指标清单 + 证伪信号，出险先减弹性最大的）
   ## 六、报告说明
   - 分析维度说明（全链全景 / 关键环节定位 / 深挖 / 映射 / 跟踪）
   - 免责声明：「以上内容基于公开数据与联网检索，仅供参考，不构成投资建议。市场有风险，投资需谨慎。」
2. 关键环节的判定必须有数据支撑，结论必须落到具体数字（市占率、占比、价格涨幅、增速）；
3. 必须主动调用联网检索工具核实关键数据（市占率、价格、产能、认证、订单、最新新闻），禁止凭记忆编造具体数字；
4. 检索不到或无法核实的数据，必须标注"待核实"，不得编造；
5. 所有具体数据（价格/占比/市占率/涨幅）尽量标注时间点；
6. 若该产业链不属于制造业涨价链（如纯消费品牌/服务/平台/题材炒作），明确说明"不适用本分析方法"并简述原因；
7. 报告末尾固定输出免责声明：「以上内容基于公开数据与联网检索，仅供参考，不构成投资建议。市场有风险，投资需谨慎。」`;

// ========== 内置案例库（结构化关键环节分析报告） ==========

/** 基础原材料公司 · 四维分析 */
interface ReportCompany {
  name: string;
  code: string;
  techCard: { level: "是" | "部分" | "否"; reason: string; detail: string };
  exportPolicy: { level: "高" | "中" | "低"; reason: string; detail: string };
  marketShare: { isTop: boolean; share: string; rank: string };
  delivery: { matched: boolean; deliveryTrend: string; perfTrend: string; detail: string };
  summary: string;
}

/** 基础原材料分类组 */
interface ReportBaseGroup {
  category: string;
  companies: ReportCompany[];
}

/** 中间产物 · 核心公司 */
interface ReportCoreCompany {
  name: string;
  code: string;
  marketShare: string;
  rank: string;
  techExclusive: string;
  orderCapacity: string;
  international: string;
  massProduction: string;
  performance: string;
}

/** 中间产物 · 替代/上下游 A 股公司 */
interface ReportAlternative {
  name: string;
  code: string;
  relation: string;
  degree: string;
  position: string;
}

/** 中间产物分类 */
interface ReportIntermediate {
  category: string;
  listed: boolean;
  core?: ReportCoreCompany;
  alternatives?: ReportAlternative[];
  summary: string;
}

/** 关键环节分析报告结构化数据 */
interface ChainReport {
  title: string;
  oneLiner: string;
  materials: { name: string; type: string; costRatio: string; usage: string }[];
  baseGroups: ReportBaseGroup[];
  intermediates: ReportIntermediate[];
  reportNote: string;
}

interface BuiltinCase {
  keywords: string[];
  title: string;
  report: ChainReport;
}

// 内置案例：已移除固化的 PCB 本地数据，板块产业链改为全部由 AI 联网检索实时生成
const BUILTIN_CASES: BuiltinCase[] = [];

function matchBuiltin(keyword: string): BuiltinCase | null {
  const kw = keyword.toLowerCase();
  for (const c of BUILTIN_CASES) {
    for (const k of c.keywords) {
      if (kw.includes(k) || k.includes(kw)) return c;
    }
  }
  return null;
}

// ========== SSE 辅助 ==========

function sse(res: express.Response, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// 只读检索工具白名单：允许 search/fetch/browse/read 类，拒绝写操作
const READ_ONLY_RE = /search|fetch|browse|read|lookup|query/i;
const WRITE_RE = /write|delete|edit|execute|run|create|update|install|send|remove|rename|move|put|post|upload|rm|mkdir/i;

// ========== 路由注册 ==========

export function registerChainRoutes(app: express.Express) {
  app.post("/api/chain/analyze", async (req, res) => {
    const raw = (req.body || {}).keyword;
    const keyword = raw != null ? String(raw).trim() : "";
    if (!keyword) {
      return res.status(400).json({ error: "请输入要梳理的产业链 / 板块名称" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // 1) 命中内置案例 → 秒出结构化报告
    const builtin = matchBuiltin(keyword);
    if (builtin) {
      console.log(`[Chain] 命中内置案例库: ${builtin.title}（keyword=${keyword}）`);
      sse(res, { type: "meta", keyword, source: "builtin", title: builtin.title, report: true });
      sse(res, { type: "report", report: builtin.report });
      sse(res, { type: "done", source: "builtin" });
      return res.end();
    }

    // 2) 未命中 → Agent 通道（联网检索 → 全链梳理 → 定位关键环节 → 关键环节分析报告）
    console.log(`[Chain] 未命中内置库，走 Agent 通道生成: ${keyword}`);
    const model = process.env.CODEBUDDY_MODEL || "auto";
    sse(res, { type: "meta", keyword, source: "agent", model, report: false });

    const prompt = `请对「${keyword}」产业链/板块进行完整梳理，核心目标是定位整条产业链中最关键的环节（最紧缺 / 最受益 / 弹性最大），并按「产业链关键环节分析报告」格式输出。\n\n要求：\n1. 先检索核实该板块近期驱动因素与关键数据；\n2. 沿产业链逐层下钻（环节全景、成本占比、紧缺环节、卡脖子瓶颈、海外依赖、A 股标的映射）；\n3. 输出格式见系统提示词（标题 + 生成日期 + 一句话产业链逻辑 / 一、产业链全景（环节表格）/ 二、关键环节定位（明确指出最关键的 1-2 个环节及判定依据）/ 三、关键环节深挖分析（紧缺与涨价验证、瓶颈与海外依赖、国产替代扫描）/ 四、A股映射与标的筛选（真票池/攻关池）/ 五、跟踪指标与证伪信号 / 六、报告说明）；\n4. 检索不到的数据标注"待核实"，严禁编造。`;

    const canUseTool: CanUseTool = async (toolName, input, _options) => {
      const name = String(toolName || "");
      if (READ_ONLY_RE.test(name) && !WRITE_RE.test(name)) {
        return { behavior: "allow", updatedInput: input };
      }
      return { behavior: "deny", message: "产业链分析仅允许只读检索工具（搜索/网页读取），已自动拒绝非只读操作" };
    };

    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; }, 300_000);

    try {
      const stream = query({
        prompt,
        options: {
          cwd: process.cwd(),
          model,
          maxTurns: 15,
          systemPrompt: CHAIN_SYSTEM_PROMPT,
          permissionMode: "default",
          canUseTool,
        },
      });

      let lastToolId: string | null = null;

      for await (const msg of stream) {
        if (timedOut) break;
        if (msg.type === "assistant") {
          const content = (msg as any).message?.content;
          if (typeof content === "string") {
            sse(res, { type: "text", content });
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block?.type === "text" && block.text) {
                sse(res, { type: "text", content: block.text });
              } else if (block?.type === "tool_use") {
                lastToolId = block.id || uuidv4();
                sse(res, {
                  type: "tool",
                  id: lastToolId,
                  name: block.name,
                  input: (block as any).input || {},
                  status: "running",
                });
              }
            }
          }
        } else if ((msg as any).type === "tool_result") {
          const r = msg as any;
          const id = r.tool_use_id || lastToolId;
          const content = typeof r.content === "string" ? r.content : JSON.stringify(r.content || "");
          sse(res, { type: "tool_result", toolId: id, content, isError: !!r.is_error });
        } else if (msg.type === "result") {
          const r = msg as any;
          if (r.error) throw new Error(String(r.error));
        }
      }

      sse(res, { type: "done", source: "agent" });
      res.end();
    } catch (error: any) {
      console.error("[Chain] Agent 生成失败:", error?.message || error);
      sse(res, { type: "error", message: error?.message || "产业链分析生成失败，请稍后重试" });
      res.end();
    } finally {
      clearTimeout(timer);
    }
  });
}
