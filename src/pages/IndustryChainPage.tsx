import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Alert, Tag, Input, Button, MessagePlugin } from 'tdesign-react';
import { Search, Loader, RefreshCw, History, FileDown, LogIn } from 'lucide-react';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

/* ========== 示例关键词 ========== */

const EXAMPLES = ['PCB 电子布', '存储芯片', '光伏硅料', '锂电池', '半导体设备', '创新药'];

/* ========== 关键环节分析报告数据类型（与后端 chain.ts 一致） ========== */

interface ReportCompany {
  name: string;
  code: string;
  techCard: { level: string; reason: string; detail: string };
  exportPolicy: { level: string; reason: string; detail: string };
  marketShare: { isTop: boolean; share: string; rank: string };
  delivery: { matched: boolean; deliveryTrend: string; perfTrend: string; detail: string };
  summary: string;
}
interface ReportBaseGroup { category: string; companies: ReportCompany[] }
interface ReportCoreCompany {
  name: string; code: string; marketShare: string; rank: string; techExclusive: string;
  orderCapacity: string; international: string; massProduction: string; performance: string;
}
interface ReportAlternative { name: string; code: string; relation: string; degree: string; position: string }
interface ReportIntermediate { category: string; listed: boolean; core?: ReportCoreCompany; alternatives?: ReportAlternative[]; summary: string }
interface ChainReport {
  title: string;
  oneLiner: string;
  materials: { name: string; type: string; costRatio: string; usage: string }[];
  baseGroups: ReportBaseGroup[];
  intermediates: ReportIntermediate[];
  reportNote: string;
}

/* ========== 结果类型 ========== */

interface ToolCallInfo {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
}

interface ChainResult {
  id: string;
  keyword: string;
  source: 'builtin' | 'agent';
  model?: string;
  content: string;
  report?: ChainReport;
  toolCalls: ToolCallInfo[];
  createdAt: string;
  done: boolean;
  error?: string;
  /** Agent 通道 401 未登录 → 显示一键登录引导 */
  needsLogin?: boolean;
}

/* ========== 工具函数 ========== */

function formatCnDate(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}年${m}月${day}日`;
}

/** 内置报告 → 页面展示用（JSX 组件另写）与打印用 HTML 共用数据 */
function reportToHtml(report: ChainReport): string {
  const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const parts: string[] = [];
  parts.push(`<h1>${esc(report.title)}</h1>`);
  parts.push(`<p class="report-date">生成日期：${formatCnDate()}</p>`);
  parts.push(`<blockquote class="report-liner">${esc(report.oneLiner)}</blockquote>`);

  // 一、原材料识别分析
  parts.push(`<h2>一、原材料识别分析</h2>`);
  parts.push(`<h3>1.1 原材料成本占比排序</h3>`);
  parts.push(`<table><thead><tr><th>序号</th><th>原材料名称</th><th>类型</th><th>成本占比</th><th>用途说明</th></tr></thead><tbody>`);
  report.materials.forEach((m, i) => {
    parts.push(`<tr><td>${i + 1}</td><td>${esc(m.name)}</td><td>${esc(m.type)}</td><td>${esc(m.costRatio)}</td><td>${esc(m.usage)}</td></tr>`);
  });
  parts.push(`</tbody></table>`);

  // 二、基础原材料上市公司分析
  parts.push(`<h2>二、基础原材料上市公司分析</h2>`);
  report.baseGroups.forEach((g, gi) => {
    parts.push(`<h3>${gi + 1}.${g.category}</h3>`);
    g.companies.forEach((c) => {
      parts.push(`<div class="company">`);
      parts.push(`<h4>${esc(c.name)}（${esc(c.code)}）</h4>`);
      parts.push(`<p class="dim">技术卡脖子能力分析</p>`);
      parts.push(`<ul><li>能否卡国外厂商脖子：${esc(c.techCard.level)}</li><li>原因：${esc(c.techCard.reason)}</li><li>详细分析：${esc(c.techCard.detail)}</li></ul>`);
      parts.push(`<p class="dim">出口政策影响分析</p>`);
      parts.push(`<ul><li>受影响程度：${esc(c.exportPolicy.level)}</li><li>原因：${esc(c.exportPolicy.reason)}</li><li>详细分析：${esc(c.exportPolicy.detail)}</li></ul>`);
      parts.push(`<p class="dim">市场占有率分析</p>`);
      parts.push(`<ul><li>是否市场占有率最高：${c.marketShare.isTop ? '是' : '否'}</li><li>具体市场占有率：${esc(c.marketShare.share)}</li><li>排名：${esc(c.marketShare.rank)}</li></ul>`);
      parts.push(`<p class="dim">出货与业绩一致性分析</p>`);
      parts.push(`<ul><li>出货与业绩是否相符：${c.delivery.matched ? '是' : '否'}</li><li>出货趋势：${esc(c.delivery.deliveryTrend)}</li><li>业绩趋势：${esc(c.delivery.perfTrend)}</li><li>一致性分析：${esc(c.delivery.detail)}</li></ul>`);
      parts.push(`<p><strong>综合评价：</strong>${esc(c.summary)}</p>`);
      parts.push(`</div>`);
    });
  });
  parts.push(`<h3>基础原材料分析总结</h3>`);
  parts.push(`<p>本次分析覆盖了覆铜板三大核心基础原材料（铜箔、树脂材料、电子级玻纤布）的 9 家核心 A 股上市公司：树脂材料领域的圣泉集团、东材科技已实现高端产品国产替代，可完全卡国外厂商脖子；铜箔与电子级玻纤布龙头在细分领域实现部分替代，顶级高端产品仍与海外存在差距。市场占有率方面各细分龙头均居第一或领先；业绩一致性方面高端产品放量成为核心增长动力。整体看，三大原材料国产替代进程加快，龙头受益于 AI 与新能源双赛道需求。</p>`);

  // 三、中间产物上市公司分析
  parts.push(`<h2>三、中间产物上市公司分析</h2>`);
  report.intermediates.forEach((it, idx) => {
    parts.push(`<h3>3.${idx + 1} ${esc(it.category)}</h3>`);
    parts.push(`<p><strong>A股上市情况：</strong>${it.listed ? '是' : '否'}</p>`);
    if (it.core) {
      parts.push(`<p class="dim">核心上市公司分析</p>`);
      parts.push(`<ul><li>公司名称：${esc(it.core.name)}</li><li>股票代码：${esc(it.core.code)}</li><li>市场占有率：${esc(it.core.marketShare)}</li><li>排名：${esc(it.core.rank)}</li><li>技术独家性：${esc(it.core.techExclusive)}</li><li>订单与产能状态：${esc(it.core.orderCapacity)}</li><li>国际合作：${esc(it.core.international)}</li><li>量产情况：${esc(it.core.massProduction)}</li><li>业绩表现：${esc(it.core.performance)}</li></ul>`);
    }
    if (it.alternatives && it.alternatives.length) {
      parts.push(`<p class="dim">替代 / 上下游 A 股公司</p>`);
      parts.push(`<ul>`);
      it.alternatives.forEach((a) => {
        parts.push(`<li>${esc(a.name)}（${esc(a.code)}）：关系类型 ${esc(a.relation)}；国产化替代程度 ${esc(a.degree)}；供应链位置：${esc(a.position)}</li>`);
      });
      parts.push(`</ul>`);
    }
    parts.push(`<p><strong>分析总结：</strong>${esc(it.summary)}</p>`);
  });
  parts.push(`<h3>中间产物分析总结</h3>`);
  parts.push(`<p>三类中间产物均有 A 股核心上市公司布局，国产替代取得显著进展：覆铜板生益科技（英伟达 M9 认证 + 全产业链一体化）、DMP 单体浙江龙盛（打破沙特/日本寡头垄断）、关键设备卓郎/泰金/洪田（打破日本设备垄断）分别成为各细分领域龙头，受益于 AI 算力与半导体国产化趋势；泰坦股份（攻关中）构成稀缺性第二形态。整体处于国产替代加速、高端技术突破的关键阶段。</p>`);

  // 四、报告说明
  parts.push(`<h2>四、报告说明</h2>`);
  parts.push(`<p>${esc(report.reportNote)}</p>`);

  return parts.join('\n');
}

/** 组装打印 HTML（A4 报告版式，含内联 CSS） */
function buildPrintHtml(innerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>产业链关键环节分析报告</title>
<style>
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: "Microsoft YaHei","PingFang SC","Helvetica Neue",sans-serif; color:#1f2329; font-size:calc(12px * var(--font-scale, 1)); line-height:1.75; margin:0; }
h1 { text-align:center; font-size:calc(22px * var(--font-scale, 1)); margin:0 0 2px; }
.report-date { text-align:center; color:#666; font-size:calc(12px * var(--font-scale, 1)); margin:0 0 14px; }
.report-liner { background:#f5f7ff; border-left:4px solid #2f54eb; padding:8px 12px; margin:8px 0 16px; font-size:calc(12px * var(--font-scale, 1)); color:#333; }
h2 { font-size:calc(17px * var(--font-scale, 1)); border-left:4px solid #2f54eb; padding-left:8px; margin:22px 0 10px; }
h3 { font-size:calc(14px * var(--font-scale, 1)); margin:16px 0 8px; color:#333; }
h4 { font-size:calc(13px * var(--font-scale, 1)); margin:10px 0 6px; color:#1f2329; }
table { width:100%; border-collapse:collapse; margin:8px 0 14px; font-size:calc(11px * var(--font-scale, 1)); }
th,td { border:1px solid #b8bcc4; padding:5px 8px; text-align:left; vertical-align:top; word-break:break-all; }
th { background:#eef1ff; font-weight:700; }
strong { font-weight:700; }
ul,ol { margin:4px 0; padding-left:20px; }
li { margin:2px 0; }
.company { border:1px solid #d5d8de; border-radius:6px; padding:10px 12px; margin:10px 0; page-break-inside:avoid; }
.dim { font-weight:700; margin:8px 0 2px; color:#2f54eb; }
blockquote { margin:8px 0; }
.footer { margin-top:26px; border-top:1px solid #c9ccd4; padding-top:8px; color:#888; font-size:calc(11px * var(--font-scale, 1)); text-align:center; }
</style>
</head>
<body>
${innerHtml}
<p class="footer">报告生成工具：紫金红葫芦 · 产业链关键环节分析工作流</p>
</body>
</html>`;
}

/* ========== 页面 ========== */

export function IndustryChainPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ChainResult[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  // 自动滚动到底部（流式输出时）
  useEffect(() => {
    if (isLoading && resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [results, isLoading]);

  // 活跃结果
  const active = results.find(r => r.id === activeId) || results[0];

  // 流式解析 SSE
  const handleAnalyze = useCallback(async (rawKeyword?: string) => {
    const kw = (rawKeyword ?? keyword).trim();
    if (!kw || isLoading) return;

    const id = `chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result: ChainResult = {
      id,
      keyword: kw,
      source: 'agent',
      content: '',
      toolCalls: [],
      createdAt: new Date().toLocaleString(),
      done: false,
    };
    setResults(prev => [result, ...prev]);
    setActiveId(id);
    setIsLoading(true);
    setKeyword('');

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const resp = await fetch('/api/chain/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw }),
        signal: abort.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || `请求失败（${resp.status}）`);
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('无法读取响应流');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let data: any;
          try {
            data = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (data.type === 'meta') {
            setResults(prev => prev.map(r =>
              r.id === id
                ? { ...r, source: data.source, model: data.model, keyword: data.keyword || r.keyword }
                : r
            ));
          } else if (data.type === 'report') {
            // 内置案例：结构化报告数据
            setResults(prev => prev.map(r =>
              r.id === id ? { ...r, report: data.report } : r
            ));
          } else if (data.type === 'text') {
            setResults(prev => prev.map(r =>
              r.id === id ? { ...r, content: r.content + (data.content || '') } : r
            ));
          } else if (data.type === 'tool') {
            setResults(prev => prev.map(r => {
              if (r.id !== id) return r;
              const exists = r.toolCalls.some(t => t.id === data.id);
              const toolCalls = exists
                ? r.toolCalls
                : [...r.toolCalls, { id: data.id, name: data.name, status: 'running' as const }];
              return { ...r, toolCalls };
            }));
          } else if (data.type === 'tool_result') {
            setResults(prev => prev.map(r => ({
              ...r,
              toolCalls: r.toolCalls.map(t =>
                t.id === data.toolId ? { ...t, status: data.isError ? ('error' as const) : ('completed' as const) } : t
              ),
            })));
          } else if (data.type === 'done') {
            setResults(prev => prev.map(r => r.id === id ? { ...r, done: true } : r));
          } else if (data.type === 'error') {
            throw new Error(data.message || '生成失败');
          }
        }
      }
    } catch (err: any) {
      // 检测 Agent 通道 401 未登录错误 → 显示一键登录引导
      const isAuthError = /401|Authentication required|\/login|not\s+signed\s+in/i.test(err?.message || '');
      if (err?.name === 'AbortError') {
        MessagePlugin.info('已停止生成');
      } else if (isAuthError) {
        // 不弹全局错误，走页面内登录引导卡片
      } else {
        MessagePlugin.error(err?.message || '产业链分析失败，请稍后重试');
      }
      setResults(prev => prev.map(r =>
        r.id === id ? { ...r, done: true, error: err?.message || '生成失败', needsLogin: isAuthError || undefined } : r
      ));
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [keyword, isLoading]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleRerun = useCallback((kw: string) => {
    setActiveId(null);
    handleAnalyze(kw);
  }, [handleAnalyze]);

  // 导出 PDF 报告
  const handleExportPdf = useCallback(async () => {
    if (!active || !active.done || active.error) return;
    let innerHtml = '';
    let title = '';
    if (active.report) {
      title = active.report.title;
      innerHtml = reportToHtml(active.report);
    } else if (active.content) {
      title = `${active.keyword}产业链关键环节分析报告`;
      innerHtml = md.render(active.content);
    } else {
      return;
    }
    const html = buildPrintHtml(innerHtml);

    const bridge = (window as any).monitorExport;
    if (bridge?.exportPdf) {
      try {
        const res = await bridge.exportPdf({ title, html });
        if (res?.canceled) MessagePlugin.info('已取消导出');
        else if (res?.filePath) MessagePlugin.success(`报告已保存：${res.filePath}`);
        else MessagePlugin.error(res?.error || '导出 PDF 失败');
      } catch (e: any) {
        MessagePlugin.error(`导出失败：${e?.message || e}`);
      }
    } else {
      // 浏览器降级：新窗口打印（可另存为 PDF）
      const w = window.open('', '_blank');
      if (!w) {
        MessagePlugin.error('浏览器拦截了弹窗，请允许弹出窗口后重试');
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 400);
    }
  }, [active]);

  return (
    <div className="flex-1 overflow-y-auto p-6" ref={resultRef}>
      {/* 页面标题 */}
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--td-text-color-primary)' }}>
          板块产业链
        </h2>
        <p className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
          输入产业链 / 板块名称，自动定位整条产业链中最关键的环节并深挖分析（最紧缺 / 最受益 / 弹性最大）· 全部由 AI 联网检索实时生成
        </p>
      </div>

      {/* 搜索区 */}
      <Card className="mb-4" bordered>
        <div className="flex gap-3">
          <Input
            className="flex-1"
            size="large"
            placeholder="输入产业链 / 板块名称，如：存储芯片、光伏、半导体设备……"
            value={keyword}
            onChange={(v) => setKeyword(String(v || ''))}
            onEnter={() => handleAnalyze()}
            clearable
          />
          <Button
            size="large"
            theme="primary"
            icon={<Search size={16} />}
            loading={isLoading}
            disabled={isLoading || !keyword.trim()}
            onClick={() => handleAnalyze()}
          >
            梳理
          </Button>
          {isLoading && (
            <Button size="large" theme="default" onClick={handleStop}>
              停止
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>示例：</span>
          {EXAMPLES.map((ex) => (
            <Tag
              key={ex}
              variant="outline"
              theme="primary"
              onClick={() => handleAnalyze(ex)}
              style={{ cursor: 'pointer' }}
            >
              {ex}
            </Tag>
          ))}
          <span className="text-xs ml-auto" style={{ color: 'var(--td-text-color-placeholder)' }}>
            全部由 AI 联网检索实时生成
          </span>
        </div>
      </Card>

      {/* 结果区 */}
      {results.length === 0 && !isLoading && (
        <Card bordered>
          <div className="py-10 text-center">
            <Search size={40} style={{ color: 'var(--td-text-color-placeholder)' }} className="mx-auto mb-3" />
            <p className="text-sm mb-2" style={{ color: 'var(--td-text-color-secondary)' }}>
              输入产业链名称，自动梳理全产业链并聚焦其中最关键的环节进行深挖分析：环节全景 → 关键环节定位 → 紧缺与受益逻辑 → A 股映射
            </p>
            <p className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
              所有产业链均由 AI 联网检索实时生成，数据以检索结果为准
            </p>
          </div>
        </Card>
      )}

      {/* 历史结果列表 */}
      {results.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {results.map((r) => (
            <Tag
              key={r.id}
              variant={active?.id === r.id ? 'dark' : 'light'}
              theme={active?.id === r.id ? 'primary' : 'default'}
              onClick={() => setActiveId(r.id)}
              style={{ cursor: 'pointer' }}
              icon={<History size={12} />}
            >
              {r.keyword}{r.done ? '' : ' · 生成中'}
            </Tag>
          ))}
        </div>
      )}

      {active && (
        <Card bordered className="mb-4">
          {/* 结果头部 */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-sm font-bold" style={{ color: 'var(--td-text-color-primary)' }}>
              {active.keyword}
            </span>
            <Tag theme="warning" variant="light">AI 联网生成</Tag>
            {active.report && <Tag theme="primary" variant="light">关键环节分析报告</Tag>}
            {!active.done && <Tag theme="primary" variant="light" icon={<Loader size={12} className="animate-spin" />}>生成中</Tag>}
            <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>{active.createdAt}</span>
            <div className="ml-auto flex gap-2">
              {active.done && !active.error && (
                <>
                  <Button
                    size="small"
                    theme="primary"
                    variant="outline"
                    icon={<FileDown size={14} />}
                    onClick={handleExportPdf}
                  >
                    导出 PDF
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    theme="primary"
                    icon={<RefreshCw size={14} />}
                    onClick={() => handleRerun(active.keyword)}
                  >
                    重新生成
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* 工具调用状态（Agent 检索过程） */}
          {active.source === 'agent' && active.toolCalls.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {active.toolCalls.map((t) => (
                <Tag
                  key={t.id}
                  variant="outline"
                  theme={t.status === 'error' ? 'danger' : t.status === 'completed' ? 'success' : 'primary'}
                  icon={t.status === 'running' ? <Loader size={12} className="animate-spin" /> : undefined}
                >
                  {t.status === 'running' ? '检索中' : t.status === 'completed' ? '已检索' : '检索失败'} · {t.name}
                </Tag>
              ))}
            </div>
          )}

          {active.error && active.needsLogin ? (
            <div
              className="p-4 rounded-xl border mb-3 flex items-center gap-3"
              style={{
                backgroundColor: 'var(--td-warning-color-container)',
                borderColor: 'var(--td-warning-color)',
              }}
            >
              <LogIn size={18} style={{ color: 'var(--td-warning-color)' }} />
              <div className="flex-1">
                <div style={{ color: 'var(--td-text-color-primary)' }} className="font-medium text-sm">
                  AI 分析需要登录 CodeBuddy 账号
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--td-text-color-secondary)' }}>
                  前往「设置」页一键登录：点击后在浏览器中授权一次即可，无需命令行操作
                </div>
              </div>
              <Button theme="primary" size="small" icon={<LogIn size={14} />} onClick={() => navigate('/settings')}>
                去登录
              </Button>
            </div>
          ) : active.error ? (
            <Alert theme="error" message={active.error} className="mb-3" />
          ) : null}

          {/* 生成中骨架 */}
          {!active.done && active.content === '' && !active.report && (
            <div className="py-6 text-center">
              <Loader size={24} className="animate-spin mx-auto mb-2" style={{ color: 'var(--td-brand-color)' }} />
              <p className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
                正在联网检索并梳理「{active.keyword}」产业链，预计 1-3 分钟……
              </p>
            </div>
          )}

          {/* 内置案例：结构化报告版式 */}
          {active.report && (
            <ReportView report={active.report} />
          )}

          {/* Agent 通道：markdown 渲染 */}
          {!active.report && active.content && (
            <div
              className="chain-markdown chat-markdown text-sm leading-relaxed"
              style={{ color: 'var(--td-text-color-primary)' }}
              dangerouslySetInnerHTML={{ __html: md.render(active.content) }}
            />
          )}

          {!active.done && active.content !== '' && (
            <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
              <Loader size={12} className="animate-spin" /> 继续生成中……
            </div>
          )}

          {active.done && (
            <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--td-component-stroke)' }}>
              <p className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                以上内容由 AI 基于联网检索生成，数据以官方公告与公开信息为准，仅供参考，不构成投资建议。市场有风险，投资需谨慎。
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ========== 关键环节分析报告 · 页面版式（内置案例） ========== */

function ReportView({ report }: { report: ChainReport }) {
  const t = 'var(--td-text-color-primary)';
  const t2 = 'var(--td-text-color-secondary)';
  const accent = 'var(--td-brand-color)';
  const stroke = 'var(--td-component-stroke)';
  const hover = 'var(--td-bg-color-container-hover)';

  return (
    <div className="report-view text-sm">
      {/* 报告头 */}
      <div className="text-center mb-1">
        <h3 className="text-xl font-bold" style={{ color: t }}>{report.title}</h3>
        <p className="text-xs mt-1" style={{ color: t2 }}>生成日期：{formatCnDate()}</p>
      </div>
      <div
        className="rounded-lg px-4 py-3 mb-4 text-xs leading-relaxed"
        style={{ backgroundColor: 'var(--td-brand-color-light)', borderLeft: `4px solid ${accent}`, color: t }}
      >
        <strong>一句话逻辑：</strong>{report.oneLiner}
      </div>

      {/* 一、原材料识别分析 */}
      <SectionTitle no="一" title="原材料识别分析" />
      <SectionSubTitle>1.1 原材料成本占比排序</SectionSubTitle>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: hover }}>
              {['序号', '原材料名称', '类型', '成本占比', '用途说明'].map((h) => (
                <th key={h} className="px-2 py-1.5 font-bold border" style={{ borderColor: stroke, color: t }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.materials.map((m, i) => (
              <tr key={m.name}>
                <td className="px-2 py-1.5 border" style={{ borderColor: stroke, color: t2 }}>{i + 1}</td>
                <td className="px-2 py-1.5 border font-bold" style={{ borderColor: stroke, color: t }}>{m.name}</td>
                <td className="px-2 py-1.5 border" style={{ borderColor: stroke, color: t2 }}>
                  <Tag theme={m.type === '中间产物' ? 'warning' : 'default'} variant="light">{m.type}</Tag>
                </td>
                <td className="px-2 py-1.5 border font-bold" style={{ borderColor: stroke, color: accent }}>{m.costRatio}</td>
                <td className="px-2 py-1.5 border" style={{ borderColor: stroke, color: t2 }}>{m.usage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 二、基础原材料上市公司分析 */}
      <SectionTitle no="二" title="基础原材料上市公司分析" />
      {report.baseGroups.map((g, gi) => (
        <div key={g.category} className="mb-4">
          <SectionSubTitle>{gi + 1}.{g.category}</SectionSubTitle>
          {g.companies.map((c) => (
            <div key={c.name} className="rounded-lg border p-3 mb-3" style={{ borderColor: stroke }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold" style={{ color: t }}>{c.name}</span>
                <Tag variant="outline" theme="primary">{c.code}</Tag>
              </div>
              <Dim label="技术卡脖子能力分析" color={accent} />
              <ULine label="能否卡国外厂商脖子" value={c.techCard.level} />
              <ULine label="原因" value={c.techCard.reason} />
              <ULine label="详细分析" value={c.techCard.detail} />
              <Dim label="出口政策影响分析" color={accent} />
              <ULine label="受影响程度" value={c.exportPolicy.level} />
              <ULine label="原因" value={c.exportPolicy.reason} />
              <ULine label="详细分析" value={c.exportPolicy.detail} />
              <Dim label="市场占有率分析" color={accent} />
              <ULine label="是否市场占有率最高" value={c.marketShare.isTop ? '是' : '否'} />
              <ULine label="具体市场占有率" value={c.marketShare.share} />
              <ULine label="排名" value={c.marketShare.rank} />
              <Dim label="出货与业绩一致性分析" color={accent} />
              <ULine label="出货与业绩是否相符" value={c.delivery.matched ? '是' : '否'} />
              <ULine label="出货趋势" value={c.delivery.deliveryTrend} />
              <ULine label="业绩趋势" value={c.delivery.perfTrend} />
              <ULine label="一致性分析" value={c.delivery.detail} />
              <p className="text-xs mt-2" style={{ color: t }}>
                <strong>综合评价：</strong>{c.summary}
              </p>
            </div>
          ))}
        </div>
      ))}
      <SectionSubTitle>基础原材料分析总结</SectionSubTitle>
      <p className="text-xs leading-relaxed mb-4" style={{ color: t2 }}>
        本次分析覆盖了覆铜板三大核心基础原材料（铜箔、树脂材料、电子级玻纤布）的 9 家核心 A 股上市公司：树脂材料领域的圣泉集团、东材科技已实现高端产品国产替代，可完全卡国外厂商脖子；铜箔与电子级玻纤布龙头在细分领域实现部分替代，顶级高端产品仍与海外存在差距。市场占有率方面各细分龙头均居第一或领先；业绩一致性方面高端产品放量成为核心增长动力。整体看，三大原材料国产替代进程加快，龙头受益于 AI 与新能源双赛道需求。
      </p>

      {/* 三、中间产物上市公司分析 */}
      <SectionTitle no="三" title="中间产物上市公司分析" />
      {report.intermediates.map((it, idx) => (
        <div key={it.category} className="mb-4">
          <SectionSubTitle>3.{idx + 1} {it.category}</SectionSubTitle>
          <p className="text-xs mb-2" style={{ color: t }}>
            <strong>A股上市情况：</strong>
            <Tag theme={it.listed ? 'success' : 'danger'} variant="light" className="ml-1">{it.listed ? '是' : '否'}</Tag>
          </p>
          {it.core && (
            <div className="rounded-lg border p-3 mb-2" style={{ borderColor: stroke }}>
              <Dim label="核心上市公司分析" color={accent} />
              <ULine label="公司名称" value={`${it.core.name}（${it.core.code}）`} />
              <ULine label="市场占有率" value={it.core.marketShare} />
              <ULine label="排名" value={it.core.rank} />
              <ULine label="技术独家性" value={it.core.techExclusive} />
              <ULine label="订单与产能状态" value={it.core.orderCapacity} />
              <ULine label="国际合作" value={it.core.international} />
              <ULine label="量产情况" value={it.core.massProduction} />
              <ULine label="业绩表现" value={it.core.performance} />
            </div>
          )}
          {it.alternatives && it.alternatives.length > 0 && (
            <div className="rounded-lg border p-3 mb-2" style={{ borderColor: stroke }}>
              <Dim label="替代 / 上下游 A 股公司" color={accent} />
              {it.alternatives.map((a) => (
                <p key={a.name} className="text-xs mb-1" style={{ color: t2 }}>
                  <strong style={{ color: t }}>{a.name}（{a.code}）</strong>：关系类型 {a.relation}；国产化替代程度 {a.degree}；供应链位置：{a.position}
                </p>
              ))}
            </div>
          )}
          <p className="text-xs leading-relaxed" style={{ color: t2 }}>
            <strong style={{ color: t }}>分析总结：</strong>{it.summary}
          </p>
        </div>
      ))}
      <SectionSubTitle>中间产物分析总结</SectionSubTitle>
      <p className="text-xs leading-relaxed mb-4" style={{ color: t2 }}>
        三类中间产物均有 A 股核心上市公司布局，国产替代取得显著进展：覆铜板生益科技（英伟达 M9 认证 + 全产业链一体化）、DMP 单体浙江龙盛（打破沙特/日本寡头垄断）、关键设备卓郎/泰金/洪田（打破日本设备垄断）分别成为各细分领域龙头，受益于 AI 算力与半导体国产化趋势；泰坦股份（攻关中）构成稀缺性第二形态。整体处于国产替代加速、高端技术突破的关键阶段。
      </p>

      {/* 四、报告说明 */}
      <SectionTitle no="四" title="报告说明" />
      <p className="text-xs leading-relaxed" style={{ color: t2 }}>{report.reportNote}</p>
    </div>
  );
}

function SectionTitle({ no, title }: { no: string; title: string }) {
  return (
    <h4 className="text-base font-bold my-3" style={{ color: 'var(--td-text-color-primary)', borderLeft: '4px solid var(--td-brand-color)', paddingLeft: 8 }}>
      {no}、{title}
    </h4>
  );
}

function SectionSubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h5 className="text-sm font-bold my-2" style={{ color: 'var(--td-text-color-primary)' }}>{children}</h5>
  );
}

function Dim({ label, color }: { label: string; color: string }) {
  return <p className="text-xs font-bold mt-2 mb-0.5" style={{ color }}>{label}</p>;
}

function ULine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs mb-0.5 leading-relaxed" style={{ color: 'var(--td-text-color-secondary)' }}>
      <span style={{ color: 'var(--td-text-color-primary)' }}>{label}：</span>{value}
    </p>
  );
}
