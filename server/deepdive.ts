import express from "express";
import { query, CanUseTool } from "@tencent-ai/agent-sdk";
import { v4 as uuidv4 } from "uuid";

// ========== 个股深度挖掘 · 系统提示词 ==========
// 方法论：stock-deep-dive 四段递进研究链（行业周期定位 → 个股竞争地位 → 催化与事件分层 → 辨识度与证据验证）
// 输出格式：九段式深度挖掘报告（结论置信度 + 四段事实 + 证伪清单 + 风险 + 行动边界 + 数据来源）

const DEEP_DIVE_SYSTEM_PROMPT = `你是一名专业的 A 股个股研究员。你的任务是对用户指定的一只 A 股个股做深度挖掘，遵循"四段递进研究链"，最终产出一份带结论置信度的深度报告。**把故事变成事实，把结论变成可证伪的命题，而不是生成一份看多叙事。**

【四段执行链（每段必须先产出可验证事实，再同步输出反方证据 / 证伪条件）】

第①段 · 行业周期定位
- 判定行业归属与口径（行业 / 概念 / 题材口径禁止混用）。
- 按状态机归类：高景气（需求上修 + 价格/库存验证 + 产能利用率高位）/ 困境反转（此前下行，近期出现供需/政策/库存拐点）/ 平稳(其他)（无显著周期特征，按竞争格局分析）/ 题材脉冲（无真实可验证需求，仅概念驱动，直接降级）/ 双轨·第二曲线（老行业平稳+新行业高景气，价值重估来自新业务）/ 供给侧断供驱动（价格暴涨由地缘/事故断供触发，须填供给结构维度）。
- 填"根本性变化核验表"：逐维度填 当下值 / 历史分位或均值 / 偏离幅度 / 是否构成根本性变化。维度至少覆盖：产能利用率/库存、价格趋势、需求拐点、政策、技术代际跃迁、竞争格局、供给结构（集中度 / 副产品依赖 / 进口依存度）。只有偏离显著且可核对才判定为根本性变化。
- 输出：周期状态 + 根本性变化结论（是/否/部分）+ 数据来源与时点。
- 证伪：库存累库、价格回落、政策反转、下游资本开支下修、技术路线颠覆。

第②段 · 个股竞争地位
- 竞争格局扫描：列出行业主要玩家，按营收/市占率排序画梯队。
- 不可替代性量化（至少取 2 类独立证据）：技术壁垒 / 资源设备稀缺 / 客户绑定深度 / 牌照资质 / 网络效应 / 转换成本 / 依赖不对称（小卡大） / 平台化整合能力 / 生态准入广度（跨客户跨生态通吃） / 国产替代真实进度 / 正宗性（真龙头 vs 概念蹭票）。
- 地位类型判定（互斥）：唯一龙头(卡脖子型) / 最强平台(多玩家但领先) / 细分龙头 / 重要参与者 / 边缘。
- 护城河持续性：扩产周期 / 替代周期。
- 输出：地位标签 + 不可替代性评分（高/中/低）+ 证据清单。
- 证伪：替代路线、替代周期、失效条件（技术颠覆、大客户切换、新进入者突破、政策取消准入）。

第③段 · 催化与事件分层
- 检索近 5 个交易日 + 消息面候选催化，按六类归档：消息政策 / 供给 / 价格库存 / 需求终端 / 资金情绪 / 公司事件。
- 四项核对：时间匹配 / 产业匹配 / 传导匹配（事件 → 需求/供给/价格/监管 → 产业环节 → 公司）/ 反证检查。
- 分层定级：国家级（含跨国地缘断供，权重最高之一）/ 产业链级（价格库存拐点、供需缺口、海外扰动、扩产延期）/ 公司级（合同、投产、业绩、回购、股权变动）。产业链级·强背书（下游龙头股权绑定/战略入股）权重高于普通公司事件。资金面/席位催化（龙虎榜）属同步滞后信号，非独立基本面催化，须标注"资金/情绪面"且不得归因基本面。
- 叙事型催化须标注"预期中/题材逻辑"，区分已验证第二曲线与被炒作叙事。
- 反向信号（控股股东冻结/抽血/法拍/ST 预警）须与正向催化并列呈现。
- 输出：催化清单 + 定级 + 证据等级（一手公告 > 政府文件 > 研报 > 媒体）+ 反向解释。
- 证伪：更强替代解释（指数 Beta、板块情绪、资金抱团、无关概念联动）；区分已兑现/预期中/已过窗口。

第④段 · 辨识度与证据验证
- 证据矩阵逐项核查：出货/量产（产能、销量、出货量、订单、装机量，标注报告期与来源）；业绩体现（营收/毛利/利润/订单关联、收入占比、会计期间）；关系状态严格区分 已签署合同/战略合作/送样验证/无合作/业务不匹配。
- 显式区分"业绩已兑现（主业量价驱动）" vs "价值重估（新业务尚未完全体现业绩）"，重估驱动涨幅须在结论标注，不得误读为业绩驱动。
- 相对估值锚重估（对标海外龙头）须区分绝对估值与相对估值，前提为第二曲线真实兑现。
- 涨价受益/受损方向判定（价值链位置）：上游自有资源（受益）/ 中游可顺价（部分受益）/ 下游依赖进口（可能受损）。禁止把行业涨价直接等同公司受益。
- 状态分层：已量产且业绩兑现 / 已量产验证但供应地位待确认 / 重估中 / 已供货地位被重估业绩待放量 / 已量产未体现 / 试样认证中 / 仅概念布局。
- 输出：每条证据的证据状态 + 数据时点 + 来源 + 证据等级。
- 证伪：量产延期、订单取消/不及预期、业绩未达、相关收入占比极低、客户认证失败。

【强制证伪回路（贯穿四段）】
每一段输出结论的同时必须同步输出"反方证据 / 证伪条件"。某段无反方证据或证伪条件 → 该段结论置信度强制下调一档。报告末尾汇总成证伪清单，每条附"触发后动作"。禁止用"国产/热门/高成长"直接等价于"不可替代/已兑现"。

【输出格式：markdown，中文，结构固定如下】
# XX（代码）个股深度挖掘报告
生成日期：YYYY年MM月DD日
> 一句话结论 + 置信度（高/中/低）
## 一、行业周期定位
（状态 + 根本性变化核验表 + 数据时点 + 证伪）
## 二、个股竞争地位
（地位标签 + 不可替代性评分 + 证据 + 证伪）
## 三、催化与事件分层
（清单 + 层级定级 + 证据等级 + 反向信号并列 + 证伪）
## 四、辨识度与硬证据
（出货/量产/业绩证据矩阵 + 状态分层 + 证伪）
## 五、证伪清单
（四段反方证据汇总 + 触发后动作）
## 六、风险与未决问题
（估值重估vs兑现、依赖、时效、资金面、数据缺口）
## 七、行动边界
（"什么情况证明我错了"——把结论变成可证伪命题）
## 八、数据来源与时效说明
（工具、时点、口径、一手/二手属性）
## 九、免责声明
「以上内容基于公开数据与联网检索，仅供参考，不构成投资建议。市场有风险，投资需谨慎。」

【通用要求】
1. 必须主动调用联网检索工具核实关键数据（市占率/产能/出货量/客户/业绩/催化因果），禁止凭记忆编造具体数字；
2. 检索不到或无法核实的数据必须标注"待核实"，不得编造；
3. 不输出具体买卖 / 价位 / 仓位建议；
4. 所有具体数据尽量标注来源 + 时点 + 口径。`;

// ========== SSE 辅助 ==========

function sse(res: express.Response, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// 只读检索工具白名单：允许 search/fetch/browse/read 类，拒绝写操作
const READ_ONLY_RE = /search|fetch|browse|read|lookup|query/i;
const WRITE_RE = /write|delete|edit|execute|run|create|update|install|send|remove|rename|move|put|post|upload|rm|mkdir/i;

// ========== 路由注册 ==========

export function registerDeepDiveRoutes(app: express.Express) {
  app.post("/api/deepdive/analyze", async (req, res) => {
    const raw = (req.body || {});
    const code = raw.code != null ? String(raw.code).trim() : "";
    const name = raw.name != null ? String(raw.name).trim() : "";
    const links = raw.links != null ? String(raw.links).trim() : "";
    const boundary = raw.boundary != null ? String(raw.boundary).trim() : "";

    if (!code && !name) {
      return res.status(400).json({ error: "请输入要深度挖掘的个股代码或名称" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const stockDesc = `${name}${code ? `（${code}）` : ""}`.trim();
    const linksBlock = links
      ? `\n用户补充链接（优先读正文，保留来源 / 机构 / 日期 / 一手二手属性）：\n${links}`
      : "";
    const boundaryBlock = boundary ? `\n研究边界说明：${boundary}` : "";

    const prompt = `请对 A 股个股「${stockDesc}」做深度挖掘研究，严格按系统提示词的"四段递进研究链"与"九段式报告模板"输出完整报告。\n${linksBlock}${boundaryBlock}\n要求：\n1. 先检索核实该个股所属行业周期、竞争地位、近 5 个交易日的催化与业绩兑现证据；\n2. 逐段产出可验证事实 + 反方证据 / 证伪条件；\n3. 检索不到的数据标注"待核实"，严禁编造；\n4. 不输出具体买卖 / 价位 / 仓位建议。`;

    const model = process.env.CODEBUDDY_MODEL || "auto";
    sse(res, { type: "meta", keyword: stockDesc, source: "agent", model, report: false });

    const canUseTool: CanUseTool = async (toolName, input, _options) => {
      const tname = String(toolName || "");
      if (READ_ONLY_RE.test(tname) && !WRITE_RE.test(tname)) {
        return { behavior: "allow", updatedInput: input };
      }
      return { behavior: "deny", message: "个股深度挖掘仅允许只读检索工具（搜索 / 网页读取），已自动拒绝非只读操作" };
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
          systemPrompt: DEEP_DIVE_SYSTEM_PROMPT,
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
      console.error("[DeepDive] Agent 生成失败:", error?.message || error);
      sse(res, { type: "error", message: error?.message || "个股深度挖掘生成失败，请稍后重试" });
      res.end();
    } finally {
      clearTimeout(timer);
    }
  });
}
