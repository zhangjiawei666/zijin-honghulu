import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Alert, Tag, Input, Button, MessagePlugin } from 'tdesign-react';
import { Search, Loader, RefreshCw, History, FileDown, LogIn } from 'lucide-react';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

/* ========== 结果类型 ========== */

interface ToolCallInfo {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
}

interface DeepDiveResult {
  id: string;
  keyword: string;
  source: 'agent';
  model?: string;
  content: string;
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

/** 组装打印 HTML（A4 报告版式，含内联 CSS） */
function buildPrintHtml(innerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>个股深度挖掘报告</title>
<style>
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: "Microsoft YaHei","PingFang SC","Helvetica Neue",sans-serif; color:#1f2329; font-size:calc(12px * var(--font-scale, 1)); line-height:1.75; margin:0; }
h1 { text-align:center; font-size:calc(22px * var(--font-scale, 1)); margin:0 0 2px; }
.report-date { text-align:center; color:#666; font-size:calc(12px * var(--font-scale, 1)); margin:0 0 14px; }
h2 { font-size:calc(17px * var(--font-scale, 1)); border-left:4px solid #2f54eb; padding-left:8px; margin:22px 0 10px; }
h3 { font-size:calc(14px * var(--font-scale, 1)); margin:16px 0 8px; color:#333; }
h4 { font-size:calc(13px * var(--font-scale, 1)); margin:10px 0 6px; color:#1f2329; }
blockquote { background:#f5f7ff; border-left:4px solid #2f54eb; padding:8px 12px; margin:8px 0 16px; font-size:calc(12px * var(--font-scale, 1)); color:#333; }
ul,ol { margin:4px 0; padding-left:20px; }
li { margin:2px 0; }
.footer { margin-top:26px; border-top:1px solid #c9ccd4; padding-top:8px; color:#888; font-size:calc(11px * var(--font-scale, 1)); text-align:center; }
</style>
</head>
<body>
${innerHtml}
<p class="footer">报告生成工具：紫金红葫芦 · 个股深度挖掘工作流</p>
</body>
</html>`;
}

/* ========== 页面 ========== */

export function StockDeepDivePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [links, setLinks] = useState('');
  const [boundary, setBoundary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<DeepDiveResult[]>([]);
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
  const handleAnalyze = useCallback(async () => {
    const c = code.trim();
    const n = name.trim();
    if ((!c && !n) || isLoading) return;

    const id = `deepdive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const keyword = `${n}${c ? `（${c}）` : ''}`.trim();
    const result: DeepDiveResult = {
      id,
      keyword,
      source: 'agent',
      content: '',
      toolCalls: [],
      createdAt: new Date().toLocaleString(),
      done: false,
    };
    setResults(prev => [result, ...prev]);
    setActiveId(id);
    setIsLoading(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const resp = await fetch('/api/deepdive/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c, name: n, links: links.trim(), boundary: boundary.trim() }),
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
        MessagePlugin.error(err?.message || '个股深度挖掘失败，请稍后重试');
      }
      setResults(prev => prev.map(r =>
        r.id === id ? { ...r, done: true, error: err?.message || '生成失败', needsLogin: isAuthError || undefined } : r
      ));
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [code, name, links, boundary, isLoading]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleRerun = useCallback(() => {
    setActiveId(null);
    handleAnalyze();
  }, [handleAnalyze]);

  // 导出 PDF 报告
  const handleExportPdf = useCallback(async () => {
    if (!active || !active.done || active.error) return;
    if (!active.content) return;
    const html = buildPrintHtml(md.render(active.content));

    const bridge = (window as any).monitorExport;
    if (bridge?.exportPdf) {
      try {
        const res = await bridge.exportPdf({ title: `${active.keyword}个股深度挖掘报告`, html });
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
          个股深度挖掘
        </h2>
        <p className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
          输入个股代码 / 名称，沿「行业周期定位 → 个股竞争地位 → 催化与事件分层 → 辨识度与证据验证」四段递进研究链，产出带结论置信度的深度报告 · 全部由 AI 联网检索实时生成
        </p>
      </div>

      {/* 输入区 */}
      <Card className="mb-4" bordered>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <Input
              className="w-44 flex-shrink-0"
              size="large"
              placeholder="股票代码，如 600519"
              value={code}
              onChange={(v) => setCode(String(v || ''))}
              onEnter={() => handleAnalyze()}
              clearable
            />
            <Input
              className="flex-1"
              size="large"
              placeholder="股票名称，如 贵州茅台"
              value={name}
              onChange={(v) => setName(String(v || ''))}
              onEnter={() => handleAnalyze()}
              clearable
            />
            <Button
              size="large"
              theme="primary"
              icon={<Search size={16} />}
              loading={isLoading}
              disabled={isLoading || (!code.trim() && !name.trim())}
              onClick={() => handleAnalyze()}
            >
              开始深度挖掘
            </Button>
            {isLoading && (
              <Button size="large" theme="default" onClick={handleStop}>
                停止
              </Button>
            )}
          </div>
          <Input
            placeholder="可选：补充新闻 / 公告 / 研报链接（多个用换行分隔），将优先读取正文"
            value={links}
            onChange={(v) => setLinks(String(v || ''))}
          />
          <Input
            placeholder="可选：研究边界说明（如「仅看 AI 算力业务」「排除 ST 风险标的」）"
            value={boundary}
            onChange={(v) => setBoundary(String(v || ''))}
          />
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs ml-auto" style={{ color: 'var(--td-text-color-placeholder)' }}>
            全部由 AI 联网检索实时生成 · 代码或名称至少填一项
          </span>
        </div>
      </Card>

      {/* 结果区 */}
      {results.length === 0 && !isLoading && (
        <Card bordered>
          <div className="py-10 text-center">
            <Search size={40} style={{ color: 'var(--td-text-color-placeholder)' }} className="mx-auto mb-3" />
            <p className="text-sm mb-2" style={{ color: 'var(--td-text-color-secondary)' }}>
              输入个股代码或名称，沿四段递进研究链深度拆解：行业周期定位 → 个股竞争地位 → 催化与事件分层 → 辨识度与硬证据验证
            </p>
            <p className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
              所有结论均带反方证据 / 证伪条件，把故事变成可验证事实 · 数据以公开检索为准
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
                    onClick={handleRerun}
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
          {!active.done && active.content === '' && (
            <div className="py-6 text-center">
              <Loader size={24} className="animate-spin mx-auto mb-2" style={{ color: 'var(--td-brand-color)' }} />
              <p className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
                正在联网检索并深度挖掘「{active.keyword}」，预计 1-3 分钟……
              </p>
            </div>
          )}

          {/* Agent 通道：markdown 渲染（四段式 / 九段式报告） */}
          {active.content && (
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
