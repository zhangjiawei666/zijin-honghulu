import { useEffect, useMemo, useState } from 'react';
import { AddIcon, DeleteIcon, RefreshIcon, UploadIcon } from 'tdesign-icons-react';
import { Button, Dialog, Empty, Input, MessagePlugin, Switch, Tag, Textarea } from 'tdesign-react';
import { BuySignal, MonitorStatus, WatchItem, useMonitor } from '../hooks/useMonitor';

interface Quote extends WatchItem {
  price: number | null;
  changePct: number | null;
}

function formatTime(iso: string | null) {
  if (!iso) return '未巡检';
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function statusText(status: MonitorStatus | null) {
  if (!status) return '正在连接';
  if (!status.isTradingDay) return '非交易日';
  return status.isTradingTime ? '交易中' : '非交易时段';
}

function signalTheme(signal: string) {
  return signal.includes('中线') ? 'warning' : 'danger';
}

export function MobileMonitorPage() {
  const {
    status, watchlist, signals, loading, triggerRun, toggleMonitor,
    addWatchItem, batchAddWatchItems, removeWatchItem,
  } = useMonitor();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [quoteMap, setQuoteMap] = useState<Record<string, Quote>>({});
  const [quoteLoading, setQuoteLoading] = useState(false);

  const displayedSignals = useMemo(() => signals.slice(0, 12), [signals]);
  const watchQuotes = useMemo(() => watchlist.map(item => quoteMap[item.code] || { ...item, price: null, changePct: null }), [watchlist, quoteMap]);

  const refreshQuotes = async () => {
    setQuoteLoading(true);
    try {
      const response = await fetch('/api/quotes');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '获取行情失败');
      setQuoteMap(Object.fromEntries((data.quotes || []).map((item: Quote) => [item.code, item])));
    } catch (error: any) {
      MessagePlugin.error(error?.message || '获取行情失败');
    } finally {
      setQuoteLoading(false);
    }
  };

  useEffect(() => {
    refreshQuotes();
    const timer = window.setInterval(refreshQuotes, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [watchlist.length]);

  const addStock = async () => {
    const result = await addWatchItem(code.trim(), name.trim() || undefined);
    if (!result.ok) {
      MessagePlugin.error(result.error || '添加失败');
      return;
    }
    setCode('');
    setName('');
    MessagePlugin.success('已加入监控');
    refreshQuotes();
  };

  const importStocks = async () => {
    const items = importText.split(/\r?\n/).map(line => {
      const parts = line.trim().split(/[,，\t\s]+/).filter(Boolean);
      return { code: parts[0] || '', name: parts.slice(1).join(' ') || undefined };
    }).filter(item => item.code && !item.code.startsWith('#'));
    const result = await batchAddWatchItems(items);
    if (!result.ok) {
      MessagePlugin.error(result.error || '导入失败');
      return;
    }
    MessagePlugin.success(`已导入 ${result.addedCount || 0} 只股票`);
    setImportOpen(false);
    setImportText('');
    refreshQuotes();
  };

  return (
    <div className="mobile-monitor-page">
      <section className="monitor-hero">
        <div>
          <p className="monitor-eyebrow">实时巡检</p>
          <h1>自选股行情监控</h1>
          <p>仅按短线十五法与中线六二法的 5 个标准买点提示。</p>
        </div>
        <Button theme="primary" shape="round" icon={<RefreshIcon />} loading={loading || quoteLoading} onClick={() => { triggerRun(); refreshQuotes(); }}>
          立即巡检
        </Button>
      </section>

      <section className="mobile-status-grid">
        <div className="mobile-status-card">
          <span>自动巡检</span>
          <Switch value={Boolean(status?.enabled)} onChange={(value) => toggleMonitor(Boolean(value))} />
        </div>
        <div className="mobile-status-card">
          <span>市场状态</span>
          <strong>{statusText(status)}</strong>
        </div>
        <div className="mobile-status-card">
          <span>最近巡检</span>
          <strong>{formatTime(status?.lastRunAt || null)}</strong>
        </div>
        <div className="mobile-status-card">
          <span>下次巡检</span>
          <strong>{formatTime(status?.nextRunAt || null)}</strong>
        </div>
      </section>

      <section className="mobile-section">
        <div className="mobile-section-title">
          <div>
            <h2>自选股</h2>
            <p>{watchlist.length} 只正在监控</p>
          </div>
          <div className="mobile-actions">
            <Button variant="outline" shape="circle" icon={<RefreshIcon />} loading={quoteLoading} onClick={refreshQuotes} aria-label="刷新行情" />
            <Button variant="outline" size="small" icon={<UploadIcon />} onClick={() => setImportOpen(true)}>导入</Button>
          </div>
        </div>
        <div className="mobile-add-row">
          <Input value={code} onChange={(value) => setCode(value as string)} placeholder="股票代码" clearable />
          <Input value={name} onChange={(value) => setName(value as string)} placeholder="名称（可选）" clearable />
          <Button theme="primary" shape="circle" icon={<AddIcon />} loading={loading} onClick={addStock} aria-label="添加自选股" />
        </div>
        {watchQuotes.length === 0 ? (
          <div className="mobile-empty"><Empty description="添加自选股后即可开始监控" /></div>
        ) : (
          <div className="mobile-quote-list">
            {watchQuotes.map(item => {
              const isUp = (item.changePct || 0) > 0;
              const isDown = (item.changePct || 0) < 0;
              return (
                <article className="mobile-quote-card" key={item.id}>
                  <div className="quote-ident">
                    <strong>{item.name}</strong>
                    <span>{item.code}</span>
                  </div>
                  <div className={isUp ? 'quote-price quote-up' : isDown ? 'quote-price quote-down' : 'quote-price'}>
                    <strong>{item.price === null ? '—' : `¥${Number(item.price).toFixed(2)}`}</strong>
                    <span>{item.changePct === null ? '待刷新' : `${item.changePct > 0 ? '+' : ''}${Number(item.changePct).toFixed(2)}%`}</span>
                  </div>
                  <Button variant="text" shape="circle" size="small" icon={<DeleteIcon />} onClick={() => removeWatchItem(item.id).then(() => MessagePlugin.success('已移除'))} aria-label={`移除${item.name}`} />
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mobile-section">
        <div className="mobile-section-title">
          <div>
            <h2>买点信号</h2>
            <p>最近 12 条信号</p>
          </div>
        </div>
        {displayedSignals.length === 0 ? (
          <div className="mobile-empty"><Empty description="暂无买点信号" /></div>
        ) : (
          <div className="mobile-signal-list">
            {displayedSignals.map((signal: BuySignal) => (
              <article className="mobile-signal-card" key={signal.id}>
                <div className="signal-topline">
                  <div><strong>{signal.name}</strong><span>{signal.code}</span></div>
                  <Tag theme={signalTheme(signal.signal_type) as any} variant="light">{signal.signal_type}</Tag>
                </div>
                <p>{signal.reason}</p>
                <time>{formatTime(signal.created_at)}</time>
              </article>
            ))}
          </div>
        )}
      </section>

      <Dialog header="批量导入自选股" visible={importOpen} onClose={() => setImportOpen(false)} footer={null} placement="center" className="mobile-import-dialog">
        <div className="mobile-import-content">
          <p>每行一只，支持“代码 名称”或仅填代码。</p>
          <Textarea value={importText} onChange={(value) => setImportText(value as string)} autosize={{ minRows: 8, maxRows: 12 }} placeholder={'600519 贵州茅台\n000858 五粮液\n300750 宁德时代'} />
          <div className="mobile-dialog-actions">
            <Button variant="outline" onClick={() => setImportOpen(false)}>取消</Button>
            <Button theme="primary" loading={loading} onClick={importStocks}>导入</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
