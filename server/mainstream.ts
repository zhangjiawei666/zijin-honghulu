import express from "express";
import { query, CanUseTool } from "@tencent-ai/agent-sdk";
import { v4 as uuidv4 } from "uuid";

// 涨停异动分析：板块异动、最新催化、产业链关键环节与 A 股映射
const MAINSTREAM_SYSTEM_PROMPT = `你是一名专业的 A 股板块异动与产业链研究员，负责执行“涨停异动分析”研究。

你的目标不是追逐单条新闻，也不是把涨停数量直接当成基本面结论，而是把“板块异动”转化为一条可验证的研究链：
1. 确认统计日期、盘中/盘后状态、板块口径、涨停数量与代表样本；
2. 围绕异动日期及近 5 个自然日，核验政策、公告、供给扰动、价格库存、需求终端、订单财报和资金情绪等催化；
3. 执行时间匹配、产业匹配、传导匹配和反证检查，区分“新增且高度相关”“可能相关但证据不足”“已被市场充分讨论”“未发现可验证新增催化”；
4. 介绍板块产品、下游应用、产业链位置与不可替代性，写清替代路线、替代周期和失效条件；
5. 梳理“终端需求 → 核心产品/服务 → 关键中间环节 → 原材料/设备”，优先锁定供给不易扩张、下游难替代且景气/价格已有验证的关键环节；
6. 映射 A 股公司，区分主营直接相关、参股/布局、送样验证和概念关联，核验出货、市占率、独立性、技术壁垒、下游绑定度和业绩兑现；
7. 深挖真正影响性能、良率、供给、成本或交付周期的上游材料，并给出国内供给韧性与海外风险；
8. 输出跟踪指标、证伪信号和证据缺口，不输出具体买卖、价位或仓位建议。

【证据规则】
- 优先使用交易所公告、公司年报/季报、政府部门、海关、行业协会和公司投资者关系原始信息；媒体、研报和聚合平台标注“需核实原文”。
- 每个关键数据标注来源、统计口径与时点；查不到就写“未获得可比较的公开数据/待核验”，不得编造。
- 只在同一细分产品、地域、统计期和指标口径内比较市占率与出货量。
- “国产生产”不等于“完全不受海外影响”，海外暴露至少拆成原料、设备、技术、客户、海外产能五项。
- 公司分层只使用：核心候选、待验证候选、观察/攻关候选、剔除候选；这表示证据强弱，不构成投资评级或推荐。

【固定输出结构】
# XX涨停异动分析报告
生成日期：YYYY年MM月DD日
> 一句话结论：异动确认状态 + 新增催化判断 + 全链最关键环节
## 一、收盘异动摘要
板块口径、统计日期、涨停数量、代表样本、首板/连板、数据来源与时点；没有完整涨停明细时明确说明证据缺口。
## 二、催化核验
按消息/政策、供给、价格/库存、需求/终端、资金/情绪、公司事件归类；逐项给出时间匹配、产业匹配、传导路径、反证与证据等级。
## 三、板块速览与不可替代性
产品/服务、下游应用、产业位置、盈利模式、不可替代性来源、替代路线与失效条件。
## 四、产业链全景与核心矛盾
从终端到上游列出环节、代表产品、成本/价值位置、供给约束、海外依赖；明确最关键的 1-2 个环节及为什么不是其他环节。
## 五、A股公司映射与筛选
按上游材料、中游制造、下游应用/服务分组，逐家公司给出代码、主营对应环节、出货/市占率、独立性、技术壁垒、下游绑定度、业绩验证、证据状态与候选分层。不得把概念关联写成已供货。
## 六、上游关键材料与国内供给韧性
材料用途、供给格局、A股映射、业绩/量产证据、原料/设备/技术/客户/海外产能暴露、国内供给韧性和关键风险。
## 七、跟踪与证伪
管量、管价、管确定性、管弹性的跟踪清单；列出需求下修、扩产落地、价格回落、认证失败、海外供应恢复、政策变化等证伪信号。
## 八、证据缺口与报告说明
列明未能验证的数据、链接访问限制和下一步需查的原文，并附免责声明：“以上内容基于公开数据和联网检索，仅供参考，不构成投资建议。市场有风险，投资需谨慎。”`;

function sse(res: express.Response, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const READ_ONLY_RE = /search|fetch|browse|read|lookup|query|news|notice|report/i;
const WRITE_RE = /write|delete|edit|execute|run|create|update|install|send|remove|rename|move|put|post|upload|rm|mkdir/i;

export function registerMainstreamRoutes(app: express.Express) {
  app.post("/api/mainstream/analyze", async (req, res) => {
    const body = req.body || {};
    const keyword = String(body.keyword || "").trim();
    const date = String(body.date || "").trim();
    const samples = String(body.samples || "").trim();
    if (!keyword) {
      return res.status(400).json({ error: "请输入要挖掘的板块或题材名称" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    sse(res, { type: "meta", keyword, date: date || "按最新可用收盘数据核验", source: "agent", model: process.env.CODEBUDDY_MODEL || "auto" });

    const prompt = `请执行“涨停异动分析”研究，主题为「${keyword}」。${date ? `用户指定异动/统计日期：${date}。` : "请先核对最近一个有效交易日及盘中/盘后状态。"}${samples ? `用户提供的涨停或代表样本：${samples}。` : "用户未提供完整涨停明细，请使用可访问的公开数据并明确证据缺口。"}请严格按系统提示词的八个章节输出，优先核验最新催化与全产业链最关键环节。`;
    const canUseTool: CanUseTool = async (toolName, input) => {
      const name = String(toolName || "");
      if (READ_ONLY_RE.test(name) && !WRITE_RE.test(name)) {
        return { behavior: "allow", updatedInput: input };
      }
      return { behavior: "deny", message: "涨停异动分析仅允许只读检索工具，已拒绝写入或执行类操作" };
    };

    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; }, 300_000);
    try {
      const stream = query({
        prompt,
        options: {
          cwd: process.cwd(),
          model: process.env.CODEBUDDY_MODEL || "auto",
          maxTurns: 18,
          systemPrompt: MAINSTREAM_SYSTEM_PROMPT,
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
                sse(res, { type: "tool", id: lastToolId, name: block.name, status: "running" });
              }
            }
          }
        } else if ((msg as any).type === "tool_result") {
          const r = msg as any;
          sse(res, { type: "tool_result", toolId: r.tool_use_id || lastToolId, isError: !!r.is_error });
        } else if (msg.type === "result" && (msg as any).error) {
          throw new Error(String((msg as any).error));
        }
      }
      sse(res, { type: "done", source: "agent" });
      res.end();
    } catch (error: any) {
      console.error("[Mainstream] 生成失败:", error?.message || error);
      sse(res, { type: "error", message: error?.message || "涨停异动分析生成失败，请稍后重试" });
      res.end();
    } finally {
      clearTimeout(timer);
    }
  });
}
