import { useCallback, useRef, useState } from 'react';
import { Alert, Button, Card, Input, Tag, Textarea, MessagePlugin } from 'tdesign-react';
import { Activity, FileText, Loader, Search, Square } from 'lucide-react';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const EXAMPLES = ['存储芯片', '人形机器人', '可控核聚变', '商业航天', '低空经济', '固态电池'];

type ToolCall = { id: string; name: string; status: 'running' | 'completed' | 'error' };
type Research = { id: string; keyword: string; date: string; content: string; tools: ToolCall[]; done: boolean; error?: string };

export function MainstreamMiningPage() {
  const [keyword, setKeyword] = useState('');
  const [date, setDate] = useState('');
  const [samples, setSamples] = useState('');
  const [research, setResearch] = useState<Research | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const update = (fn: (prev: Research) => Research) => setResearch(prev => prev ? fn(prev) : prev);

  const handleAnalyze = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw || loading) return;
    const item: Research = { id: `mainstream-${Date.now()}`, keyword: kw, date, content: '', tools: [], done: false };
    setResearch(item);
    setLoading(true);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const resp = await fetch('/api/mainstream/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, date, samples }), signal: abort.signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`请求失败（${resp.status}）`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          let data: any;
          try { data = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (data.type === 'text') update(r => ({ ...r, content: r.content + (data.content || '') }));
          if (data.type === 'tool') update(r => ({ ...r, tools: [...r.tools, { id: data.id, name: data.name, status: 'running' }] }));
          if (data.type === 'tool_result') update(r => ({ ...r, tools: r.tools.map(t => t.id === data.toolId ? { ...t, status: data.isError ? 'error' : 'completed' } : t) }));
          if (data.type === 'done') update(r => ({ ...r, done: true }));
          if (data.type === 'error') throw new Error(data.message || '涨停异动分析失败');
        }
      }
      update(r => ({ ...r, done: true }));
    } catch (err: any) {
      if (err?.name === 'AbortError') MessagePlugin.info('已停止涨停异动分析');
      else MessagePlugin.error(err?.message || '涨停异动分析失败');
      update(r => ({ ...r, done: true, error: err?.message || '生成失败' }));
    } finally {
      setLoading(false); abortRef.current = null;
    }
  }, [keyword, date, samples, loading]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--td-text-color-primary)' }}>涨停异动分析</h2>
        <p className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
          从板块异动出发，核验最新催化，梳理产业链并定位最关键环节；不把涨停数量直接等同于基本面结论。
        </p>
      </div>
      <Card bordered className="mb-4">
        <div className="flex gap-3 mb-3">
          <Input className="flex-1" size="large" value={keyword} placeholder="输入板块 / 题材，如：存储芯片、人形机器人……" onChange={v => setKeyword(String(v || ''))} onEnter={handleAnalyze} clearable />
          <Button size="large" theme="primary" icon={<Search size={16} />} loading={loading} disabled={loading || !keyword.trim()} onClick={handleAnalyze}>开始挖掘</Button>
          {loading && <Button size="large" icon={<Square size={14} />} onClick={() => abortRef.current?.abort()}>停止</Button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input value={date} placeholder="异动 / 统计日期（可选，如 2026-08-28）" onChange={v => setDate(String(v || ''))} />
          <Input value={samples} placeholder="涨停股或代表样本（可选，用逗号分隔）" onChange={v => setSamples(String(v || ''))} />
        </div>
        <div className="flex flex-wrap gap-2 mt-3 items-center">
          <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>示例：</span>
          {EXAMPLES.map(ex => <Tag key={ex} theme="primary" variant="outline" style={{ cursor: 'pointer' }} onClick={() => { setKeyword(ex); }}>{ex}</Tag>)}
        </div>
      </Card>
      {!research && <Card bordered><div className="py-12 text-center"><Activity size={42} className="mx-auto mb-3" style={{ color: 'var(--td-brand-color)' }} /><p className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>输入一个板块或题材，开始涨停异动分析</p><p className="text-xs mt-2" style={{ color: 'var(--td-text-color-placeholder)' }}>异动确认 → 催化核验 → 关键环节 → A股映射 → 证伪跟踪</p></div></Card>}
      {research && <Card bordered>
        <div className="flex items-center gap-2 mb-3"><FileText size={17} style={{ color: 'var(--td-brand-color)' }} /><span className="font-bold" style={{ color: 'var(--td-text-color-primary)' }}>{research.keyword}涨停异动分析报告</span><Tag theme="primary" variant="light">AI 联网研究</Tag>{!research.done && <Tag theme="warning" variant="light" icon={<Loader size={12} className="animate-spin" />}>研究中</Tag>}</div>
        {research.tools.length > 0 && <div className="flex flex-wrap gap-2 mb-3">{research.tools.map(t => <Tag key={t.id} variant="outline" theme={t.status === 'completed' ? 'success' : t.status === 'error' ? 'danger' : 'primary'}>{t.status === 'running' ? '检索中' : t.status === 'completed' ? '已检索' : '检索失败'} · {t.name}</Tag>)}</div>}
        {research.error && <Alert theme="error" message={research.error} className="mb-3" />}
        {!research.content && !research.done && <div className="py-8 text-center"><Loader size={24} className="animate-spin mx-auto mb-2" style={{ color: 'var(--td-brand-color)' }} /><p className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>正在核验异动与催化，并梳理全产业链关键环节……</p></div>}
        {research.content && <div className="chat-markdown text-sm leading-relaxed" style={{ color: 'var(--td-text-color-primary)' }} dangerouslySetInnerHTML={{ __html: md.render(research.content) }} />}
        {research.done && <div className="mt-4 pt-3 border-t text-xs" style={{ borderColor: 'var(--td-component-stroke)', color: 'var(--td-text-color-placeholder)' }}>以上内容基于联网检索与公开信息，仅供研究参考，不构成投资建议。市场有风险，投资需谨慎。</div>}
      </Card>}
    </div>
  );
}
