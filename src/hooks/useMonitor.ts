import { useState, useEffect, useCallback, useRef } from 'react';

/** 监控状态（对应后端 /api/monitor/status） */
export interface MonitorStatus {
  enabled: boolean;
  isTradingTime: boolean;
  isTradingDay: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  isRunning: boolean;
  watchCount: number;
  lastRunSummary: string | null;
  source: string;
}

export interface WatchItem {
  id: string;
  code: string;
  name: string;
  created_at: string;
}

export interface MonitorRun {
  id: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  summary: string | null;
  signals_json: string | null;
}

export interface BuySignal {
  id: string;
  run_id: string | null;
  code: string;
  name: string;
  price: number | null;
  signal_type: string;
  reason: string;
  source: string;
  created_at: string;
}

export interface UseMonitorOptions {
  /** 收到买点信号时的回调（用于弹窗） */
  onBuySignal?: (signal: BuySignal) => void;
  /** 巡检完成时的回调 */
  onRunFinished?: (info: { runId: string; summary: string; signalCount: number; source: string }) => void;
}

export function useMonitor(options: UseMonitorOptions = {}) {
  const { onBuySignal, onRunFinished } = options;
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [signals, setSignals] = useState<BuySignal[]>([]);
  const [loading, setLoading] = useState(false);

  // 回调引用，避免 SSE 事件闭包过期
  const onBuySignalRef = useRef(onBuySignal);
  const onRunFinishedRef = useRef(onRunFinished);
  onBuySignalRef.current = onBuySignal;
  onRunFinishedRef.current = onRunFinished;

  // 刷新全部数据
  const refresh = useCallback(async () => {
    try {
      const [statusRes, watchRes, runsRes, signalsRes] = await Promise.all([
        fetch('/api/monitor/status'),
        fetch('/api/watchlist'),
        fetch('/api/monitor/runs?limit=20'),
        fetch('/api/monitor/signals?limit=50'),
      ]);
      const statusData = await statusRes.json();
      const watchData = await watchRes.json();
      const runsData = await runsRes.json();
      const signalsData = await signalsRes.json();

      setStatus(statusData.status);
      setWatchlist(watchData.items || []);
      setRuns(runsData.runs || []);
      setSignals(signalsData.signals || []);
    } catch (err) {
      console.error('[Monitor] 刷新数据失败:', err);
    }
  }, []);

  // 初始加载 + 每 60 秒刷新状态
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60 * 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  // SSE 事件监听（买点弹窗提醒）
  useEffect(() => {
    const es = new EventSource('/api/monitor/events');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'buy_signal' && data.signal) {
          onBuySignalRef.current?.(data.signal as BuySignal);
        } else if (data.type === 'monitor_run_finished') {
          onRunFinishedRef.current?.({
            runId: data.runId,
            summary: data.summary,
            signalCount: data.signalCount,
            source: data.source,
          });
          refresh();
        } else if (data.type === 'monitor_run_start') {
          setStatus(prev => prev ? { ...prev, isRunning: true } : prev);
        } else if (data.type === 'monitor_toggle') {
          setStatus(prev => prev ? { ...prev, enabled: data.enabled } : prev);
        }
      } catch { /* 忽略解析错误 */ }
    };
    es.onerror = () => {
      // EventSource 自动重连，无需处理
    };
    return () => es.close();
  }, [refresh]);

  // 添加自选股
  const addWatchItem = useCallback(async (code: string, name?: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '添加失败');
      await refresh();
      return { ok: true as const, item: data.item };
    } catch (err: any) {
      return { ok: false as const, error: err.message || String(err) };
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  // 批量导入自选股（返回添加/跳过/失败统计）
  const batchAddWatchItems = useCallback(async (items: { code: string; name?: string }[]) => {
    setLoading(true);
    try {
      const res = await fetch('/api/watchlist/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '批量导入失败');
      await refresh();
      return {
        ok: true as const,
        addedCount: data.addedCount || 0,
        skipped: data.skipped || [],
        errors: data.errors || [],
      };
    } catch (err: any) {
      return { ok: false as const, error: err.message || String(err) };
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  // 删除自选股
  const removeWatchItem = useCallback(async (id: string) => {
    const res = await fetch(`/api/watchlist/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '删除失败');
    await refresh();
    return data;
  }, [refresh]);

  // 手动触发巡检
  const triggerRun = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/monitor/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '触发失败');
      await refresh();
      return { ok: true as const, data };
    } catch (err: any) {
      return { ok: false as const, error: err.message || String(err) };
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  // 开启/关闭监控
  const toggleMonitor = useCallback(async (enabled: boolean) => {
    const res = await fetch('/api/monitor/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '操作失败');
    setStatus(prev => prev ? { ...prev, enabled: data.enabled } : prev);
    return data;
  }, []);

  return {
    status,
    watchlist,
    runs,
    signals,
    loading,
    refresh,
    addWatchItem,
    batchAddWatchItems,
    removeWatchItem,
    triggerRun,
    toggleMonitor,
  };
}
