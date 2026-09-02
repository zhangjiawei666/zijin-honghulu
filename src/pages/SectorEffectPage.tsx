import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Dialog, Input, InputNumber, MessagePlugin, Radio, Select, Tooltip,
} from 'tdesign-react';
import {
  Flame, Loader, RefreshCw, Search, Clock, Database, History, Pencil, Plus, Trash2, X,
} from 'lucide-react';

interface SectorCell {
  name: string;
  count: number;
}

/** 日期类型：trading 交易日 / weekend 周末休市 / holiday 法定节假日休市 / today 今日待更新 */
type DayType = 'trading' | 'weekend' | 'holiday' | 'today';

interface MatrixRow {
  date: string;              // 显示日期 YYYY/M/D
  dateToken: string;         // YYYYMMDD
  sectors: SectorCell[];
  totalLimitUp: number;
  substitutedDate: string | null;
  source: string | null;
  dayType: DayType;
  isToday: boolean;
  cells: (SectorCell | null)[];
}

/** 休市日的展示文案与配色 */
const DAY_TYPE_STYLE: Record<DayType, { label: string; bg: string; fg: string } | null> = {
  trading: null,
  weekend: { label: '周末休市', bg: '#f5f5f5', fg: '#8c8c8c' },
  holiday: { label: '节假日休市', bg: '#fff7e6', fg: '#d46b08' },
  today:   { label: '今日待更新', bg: '#f9f0ff', fg: '#722ed1' },
};

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 由 YYYY/M/D 推算星期 */
function weekdayOf(display: string): string {
  const parts = String(display || '').split('/').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return '';
  const [y, m, d] = parts;
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] || '';
}

/** 从日期字符串提取月份 */
function monthOf(dateStr: string): number {
  const parts = String(dateStr || '').split('/').map(Number);
  return parts.length >= 2 ? parts[1] : 0;
}

interface MatrixData {
  mode: 'matrix' | 'single';
  rows: MatrixRow[];
  columns: string[];
  maxCols: number;
  totalDates: number;
  stats?: { trading: number; weekend: number; holiday: number; today: number };
  source: string;
  generatedAt?: string;
  note?: string;
  error?: string;
  requestedDate?: string;
  date?: string;
  substitutedDate?: string | null;
  totalLimitUp?: number;
  sectors?: SectorCell[];
}

const UP_COLOR = '#e02020';
const CELL_BG_TOP = '#fff1f0';
const CELL_BG_MID = '#f0f5ff';
const CELL_BG_NORMAL = '#fafafa';

/** 月份标题描述（与效果图对齐） */
const MONTH_NOTES: Record<number, string> = {
  1: '正序排列，最早的日期在最上方',
  2: '春节长假，连续休市完整保留',
  3: '',
  4: '',
  5: '',
  6: '',
  7: '',
  8: '',
  9: '',
  10: '',
  11: '',
  12: '',
};

/** 连续休市日超过此数量时折叠显示为省略行 */
const COLLAPSE_THRESHOLD = 3;

// ============= 单日编辑对话框 =============

interface EditDraft {
  name: string;
  count: number;
}

const DAY_TYPE_OPTIONS = [
  { value: 'trading', label: '交易日' },
  { value: 'weekend', label: '周末休市' },
  { value: 'holiday', label: '节假日休市' },
];

/**
 * 手动编辑某一天的板块数据。
 *
 * 用于数据源抓取异常时的人工兜底：保存后该日被标记为「手动录入」，
 * 自动抓取和模板导入都不会再覆盖它；点「清空该日」可恢复自动更新。
 */
function DayEditDialog({ open, dateToken, onClose, onSaved }: {
  open: boolean;
  dateToken: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<EditDraft[]>([]);
  const [dayType, setDayType] = useState<string>('trading');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [isManual, setIsManual] = useState(false);

  // 打开时拉取该日原始数据（不做列截断，保证编辑不丢数据）
  useEffect(() => {
    if (!open || !dateToken) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const resp = await fetch(`/api/sector-effect/day/${dateToken}`);
        const json = await resp.json();
        if (cancelled) return;
        if (!resp.ok) throw new Error(json?.error || '读取失败');
        const list: EditDraft[] = Array.isArray(json.sectors)
          ? json.sectors.map((s: any) => ({ name: String(s?.name ?? ''), count: Number(s?.count ?? 0) }))
          : [];
        setDrafts(list.length > 0 ? list : [{ name: '', count: 0 }]);
        setDayType(json.dayType || 'trading');
        setIsManual(!!json.isManual);
      } catch (err: any) {
        if (!cancelled) {
          MessagePlugin.error(err?.message || '读取该日数据失败');
          onClose();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, dateToken, onClose]);

  const displayDate = useMemo(() => {
    if (!dateToken || dateToken.length !== 8) return dateToken || '';
    return `${dateToken.slice(0, 4)}/${Number(dateToken.slice(4, 6))}/${Number(dateToken.slice(6, 8))}`;
  }, [dateToken]);

  const handleSave = async () => {
    if (!dateToken) return;
    const valid = drafts.filter(d => d.name.trim());
    // 校验数量
    for (const d of valid) {
      if (!Number.isFinite(d.count) || d.count < 0) {
        MessagePlugin.warning(`「${d.name}」的涨停数无效，请填写 0 或正整数`);
        return;
      }
    }
    setSaving(true);
    try {
      const resp = await fetch(`/api/sector-effect/day/${dateToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectors: valid.map(d => ({ name: d.name.trim(), count: Math.round(d.count) })),
          dayType,
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json?.error || '保存失败');
      MessagePlugin.success(`已保存 ${displayDate}：${json.sectorCount} 个板块，合计 ${json.totalLimitUp} 只涨停`);
      onSaved();
      onClose();
    } catch (err: any) {
      MessagePlugin.error(err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!dateToken) return;
    setClearing(true);
    try {
      const resp = await fetch(`/api/sector-effect/day/${dateToken}`, { method: 'DELETE' });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json?.error || '清空失败');
      MessagePlugin.success(`已清空 ${displayDate}，该日恢复为自动更新`);
      onSaved();
      onClose();
    } catch (err: any) {
      MessagePlugin.error(err?.message || '清空失败');
    } finally {
      setClearing(false);
    }
  };

  const total = drafts.reduce((s, d) => s + (Number.isFinite(d.count) ? d.count : 0), 0);

  return (
    <Dialog
      header={`手动编辑 · ${displayDate}`}
      visible={open}
      onClose={onClose}
      width={620}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <Button variant="text" theme="danger" icon={<Trash2 size={15} />} loading={clearing} onClick={handleClear}>
            清空该日
          </Button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" onClick={onClose} disabled={saving || clearing}>取消</Button>
            <Button theme="primary" icon={<Pencil size={15} />} loading={saving} disabled={loading} onClick={handleSave}>
              保存
            </Button>
          </div>
        </div>
      )}
    >
      {loading ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <Loader size={22} className="animate-spin" style={{ margin: '0 auto 10px', color: 'var(--td-brand-color)' }} />
          <p style={{ fontSize: 13, color: 'var(--td-text-color-secondary)' }}>正在读取该日数据……</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isManual && (
            <Alert theme="warning" message="该日当前为「手动录入」数据，自动更新与模板导入均不会覆盖它。" />
          )}

          {/* 日期类型 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--td-text-color-secondary)', minWidth: 60 }}>日期类型</span>
            <Radio.Group value={dayType} onChange={(v) => setDayType(String(v))} variant="default-filled">
              {DAY_TYPE_OPTIONS.map(o => <Radio.Button key={o.value} value={o.value}>{o.label}</Radio.Button>)}
            </Radio.Group>
          </div>

          {/* 板块列表 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--td-text-color-secondary)' }}>
                板块与涨停数（合计 <strong style={{ color: UP_COLOR }}>{total}</strong> 只）
              </span>
              <Button
                size="small" variant="outline" icon={<Plus size={14} />}
                onClick={() => setDrafts(prev => [...prev, { name: '', count: 0 }])}
              >
                添加板块
              </Button>
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {drafts.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--td-text-color-placeholder)', textAlign: 'center', padding: '20px 0' }}>
                  暂无板块，点「添加板块」开始录入
                </p>
              )}
              {drafts.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--td-text-color-placeholder)', width: 34, flexShrink: 0 }}>
                    板块{i + 1}
                  </span>
                  <Input
                    value={d.name}
                    placeholder="板块名称"
                    onChange={(v) => setDrafts(prev => prev.map((x, xi) => xi === i ? { ...x, name: String(v ?? '') } : x))}
                    style={{ flex: 1 }}
                  />
                  <InputNumber
                    value={d.count}
                    min={0}
                    step={1}
                    theme="normal"
                    style={{ width: 96 }}
                    onChange={(v) => setDrafts(prev => prev.map((x, xi) => xi === i ? { ...x, count: Number(v ?? 0) } : x))}
                  />
                  <Button
                    size="small" variant="text" shape="square"
                    icon={<X size={14} />}
                    onClick={() => setDrafts(prev => prev.filter((_, xi) => xi !== i))}
                  />
                </div>
              ))}
            </div>
          </div>

          <p style={{ fontSize: 12, color: 'var(--td-text-color-placeholder)', lineHeight: 1.7, margin: 0 }}>
            板块名称留空的行会被忽略。保存后该日标记为「手动录入」，自动更新不再覆盖；
            需要恢复自动抓取时，点左下角「清空该日」即可。
          </p>
        </div>
      )}
    </Dialog>
  );
}

export function SectorEffectPage() {
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [data, setData] = useState<MatrixData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const todayRowRef = useRef<HTMLTableRowElement | null>(null);

  // 手动编辑模式：开启后点击任意日期行可编辑该日板块数据
  const [editMode, setEditMode] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const openDayEditor = useCallback((dateToken: string) => {
    setEditingDate(dateToken);
    setEditOpen(true);
  }, []);

  const closeDayEditor = useCallback(() => {
    setEditOpen(false);
    setEditingDate(null);
  }, []);

  // ============= 数据加载 =============

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/sector-effect?limit=400');
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || `请求失败（${resp.status}）`);
      setData(json as MatrixData);
    } catch (err: any) {
      setError(err?.message || '获取板块效应数据失败');
      MessagePlugin.error(err?.message || '获取板块效应数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 手动刷新
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      const raw = date.trim().replace(/-/g, '');
      if (raw && /^\d{8}$/.test(raw)) body.date = raw;
      const resp = await fetch('/api/sector-effect/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json?.error || '更新失败');
      if (json.skipped) {
        MessagePlugin.warning(json.message || `${json.date} 已有模板历史数据，已保留未覆盖`);
      } else {
        MessagePlugin.success(`已更新 ${json.date} 数据：${json.totalLimitUp}只涨停，${json.sectorCount}个板块`);
      }
      await loadMatrix();
    } catch (err: any) {
      setError(err?.message || '更新失败');
      MessagePlugin.error(err?.message || '更新失败');
    } finally {
      setRefreshing(false);
    }
  };

  // 导入历史
  const handleImportHistory = async (force: boolean = false) => {
    setImporting(true);
    setError(null);
    try {
      const resp = await fetch('/api/sector-effect/import-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json?.error || '导入失败');
      MessagePlugin.success(json.message || `已导入 ${json.added} 个交易日`);
      await loadMatrix();
    } catch (err: any) {
      setError(err?.message || '导入历史数据失败');
      MessagePlugin.error(err?.message || '导入历史数据失败');
    } finally {
      setImporting(false);
    }
  };

  // 查询指定日期
  const handleQuery = async () => {
    const raw = date.trim().replace(/-/g, '');
    if (raw && !/^\d{8}$/.test(raw)) {
      MessagePlugin.warning('日期格式应为 YYYY-MM-DD 或 YYYYMMDD');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = raw ? `?date=${encodeURIComponent(raw)}` : '';
      const resp = await fetch(`/api/sector-effect${query}`);
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || `请求失败（${resp.status}）`);
      setData(json as MatrixData);
    } catch (err: any) {
      setError(err?.message || '获取数据失败');
      MessagePlugin.error(err?.message || '获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMatrix(); }, [loadMatrix]);

  // ============= 滚动控制 =============

  /** 跳到今天所在行（用 getBoundingClientRect 在内容空间中精确定位 + 滚动范围裁剪，
   *  避免 sticky 表头/多层定位祖先导致 offsetTop 计算失败） */
  const scrollToToday = useCallback(() => {
    const row = todayRowRef.current;
    const wrapper = wrapperRef.current;
    if (!row || !wrapper) return;
    const rowRect = row.getBoundingClientRect();
    const wrapRect = wrapper.getBoundingClientRect();
    // 行顶在 wrapper 内容空间中的位置 = (行视口顶 - wrapper 视口顶) + 当前已滚动距离
    const rowTopInContent = (rowRect.top - wrapRect.top) + wrapper.scrollTop;
    const target = rowTopInContent - wrapper.clientHeight / 2 + row.offsetHeight / 2;
    const maxScroll = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
    const clamped = Math.max(0, Math.min(target, maxScroll));
    wrapper.scrollTo({ top: clamped, behavior: 'smooth' });
  }, []);

  const scrollToTop = useCallback(() => {
    wrapperRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // 打开时自动滚动到今天（延迟等 DOM 渲染完成）
  useEffect(() => {
    if (data?.mode !== 'matrix' || !data.rows?.length) return;
    const t = setTimeout(() => scrollToToday(), 200);
    return () => clearTimeout(t);
  }, [data, scrollToToday]);

  // ============= 计算属性 =============

  const colCount = Math.max(data?.columns?.length ?? 0, data?.sectors?.length ?? 0, 11);

  const historyCount = data?.rows?.filter(r => r.source?.includes('腾讯文档')).length ?? 0;
  const liveCount = (data?.rows?.length ?? 0) - historyCount;

  /**
   * 增强行数据：添加月份分隔标记和折叠信息。
   * 返回数组元素类型：实际数据行 | 月份标题行 | 省略折叠行
   */
  const displayRows = useMemo(() => {
    if (!data?.rows || data.mode !== 'matrix') return [];

    const result: Array<{ type: 'data'; row: MatrixRow; index: number }
                    | { type: 'month'; month: number; note: string }
                    | { type: 'collapse'; startIdx: number; endIdx: number; count: number; dayType: DayType; startDate: string; endDate: string }> = [];

    let currentMonth = 0;
    let collapseStart = -1;
    let collapseType: DayType | null = null;

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      const m = monthOf(row.date);

      // 月份变化 → 插入月份标题
      if (m !== currentMonth) {
        // 先关闭上一个折叠段
        if (collapseStart >= 0 && collapseType && i - collapseStart >= COLLAPSE_THRESHOLD) {
          result.push({
            type: 'collapse',
            startIdx: collapseStart,
            endIdx: i - 1,
            count: i - collapseStart,
            dayType: collapseType,
            startDate: data.rows[collapseStart].date,
            endDate: data.rows[i - 1].date,
          });
        } else if (collapseStart >= 0) {
          // 不够折叠阈值，补回原始行
          for (let j = collapseStart; j < i; j++) {
            result.push({ type: 'data', row: data.rows[j], index: j });
          }
        }
        collapseStart = -1;
        collapseType = null;

        result.push({ type: 'month', month: m, note: MONTH_NOTES[m] || '' });
        currentMonth = m;
      }

      // 交易日 → 直接输出
      if (row.dayType === 'trading') {
        // 关闭之前的折叠段
        if (collapseStart >= 0 && collapseType) {
          if (i - collapseStart >= COLLAPSE_THRESHOLD) {
            result.push({
              type: 'collapse',
              startIdx: collapseStart,
              endIdx: i - 1,
              count: i - collapseStart,
              dayType: collapseType,
              startDate: data.rows[collapseStart].date,
              endDate: data.rows[i - 1].date,
            });
          } else {
            for (let j = collapseStart; j < i; j++) {
              result.push({ type: 'data', row: data.rows[j], index: j });
            }
          }
          collapseStart = -1;
          collapseType = null;
        }
        result.push({ type: 'data', row, index: i });
      } else {
        // 休市日 → 开始或延续折叠
        if (collapseStart < 0) {
          collapseStart = i;
          collapseType = row.dayType;
        }
        // 如果休市日类型变了（如周末→节假日），也关闭当前折叠段
        else if (collapseType !== row.dayType) {
          if (i - collapseStart >= COLLAPSE_THRESHOLD) {
            result.push({
              type: 'collapse',
              startIdx: collapseStart,
              endIdx: i - 1,
              count: i - collapseStart,
              dayType: collapseType!,
              startDate: data.rows[collapseStart].date,
              endDate: data.rows[i - 1].date,
            });
          } else {
            for (let j = collapseStart; j < i; j++) {
              result.push({ type: 'data', row: data.rows[j], index: j });
            }
          }
          collapseStart = i;
          collapseType = row.dayType;
        }
        // 否则继续累积到当前折叠段
      }
    }

    // 处理末尾的折叠段
    if (collapseStart >= 0 && collapseType) {
      const remaining = data.rows.length - collapseStart;
      if (remaining >= COLLAPSE_THRESHOLD) {
        result.push({
          type: 'collapse',
          startIdx: collapseStart,
          endIdx: data.rows.length - 1,
          count: remaining,
          dayType: collapseType,
          startDate: data.rows[collapseStart].date,
          endDate: data.rows[data.rows.length - 1].date,
        });
      } else {
        for (let j = collapseStart; j < data.rows.length; j++) {
          result.push({ type: 'data', row: data.rows[j], index: j });
        }
      }
    }

    return result;
  }, [data?.rows, data?.mode]);

  // ============= 渲染辅助函数 =============

  const renderCell = (cell: SectorCell | null, colIndex: number) => {
    if (!cell) return <td key={colIndex} className="sector-cell empty" />;
    let bgStyle = CELL_BG_NORMAL;
    if (colIndex < 3) bgStyle = CELL_BG_TOP;
    else if (colIndex < 7) bgStyle = CELL_BG_MID;
    return (
      <td key={colIndex} className="sector-cell" style={{ backgroundColor: bgStyle }}>
        <Tooltip content={`${cell.name}: ${cell.count}只涨停`}>
          <span className="cell-text">{cell.name}{cell.count}</span>
        </Tooltip>
      </td>
    );
  };

  // ============= 主渲染（带错误边界） =============

  try {

  // ============= 渲染 =============
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      {/* 标题区 */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--td-text-color-primary)' }}>
          <Flame size={20} style={{ color: 'var(--td-brand-color)', flexShrink: 0 }} />
          板块效应
        </h2>
        <p style={{ fontSize: 13, margin: 0, color: 'var(--td-text-color-secondary)', lineHeight: 1.6 }}>
          按交易日统计 A 股涨停股并归集到行业板块，以矩阵表格展示每日板块分布。
          数据自动保留在本地，支持手动刷新更新；数据源异常时可开「手动编辑」逐日手工修正。
          不把涨停家数直接等同于板块强度或买卖建议。
        </p>
      </div>

      {/* 操作栏 */}
      <Card bordered style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            style={{ flex: 1, minWidth: 200 }}
            size="large"
            value={date}
            placeholder="指定日期（如 2026-08-31，留空则取最近交易日）"
            onChange={v => setDate(String(v || ''))}
            onEnter={handleQuery}
            clearable
          />
          <Button size="large" theme="primary" icon={<Search size={16} />} loading={loading} disabled={loading} onClick={handleQuery}>查询</Button>
          <Button size="large" icon={<RefreshCw size={16} />} loading={refreshing} disabled={refreshing || loading} onClick={handleRefresh}>
            {refreshing ? '更新中...' : '手动更新'}
          </Button>
          <Button size="large" variant="outline" icon={<Database size={16} />} disabled={loading} onClick={loadMatrix}>查看全部</Button>
          <Tooltip content="导入 2026 年腾讯文档模板历史数据（仅补齐缺失日期，不覆盖已有记录）">
            <Button size="large" variant="outline" icon={<History size={16} />} loading={importing} disabled={importing || loading} onClick={() => handleImportHistory(false)}>导入历史</Button>
          </Tooltip>
          <Tooltip content={editMode ? '退出编辑模式' : '开启后点击任意日期行，可手工修改该日的板块数据（数据源异常时的兜底录入）'}>
            <Button
              size="large"
              variant="outline"
              theme={editMode ? 'primary' : 'default'}
              icon={<Pencil size={16} />}
              disabled={loading}
              onClick={() => setEditMode(v => !v)}
            >
              {editMode ? '退出编辑' : '手动编辑'}
            </Button>
          </Tooltip>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--td-text-color-placeholder)' }}>
            <Clock size={14} /><span>交易日当日 20:00 更新</span>
          </div>
        </div>
      </Card>

      {/* 错误提示 */}
      {error && !data && (
        <Alert theme="error" message={error} style={{ marginBottom: 16 }} />
      )}

      {/* 加载中 */}
      {loading && !data && (
        <Card bordered>
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <Loader size={26} className="animate-spin" style={{ margin: '0 auto 12px', color: 'var(--td-brand-color)' }} />
            <p style={{ fontSize: 14, color: 'var(--td-text-color-secondary)' }}>正在加载板块效应数据……</p>
          </div>
        </Card>
      )}

      {/* ====== 矩阵表格（核心内容）====== */}
      {data && data.mode === 'matrix' && data.rows.length > 0 && (
        <Card bordered style={{ overflow: 'visible' }}>
          {/* 统计栏 + 图例 + 按钮 */}
          <div style={{ marginBottom: 10 }}>
            {/* 第一行：统计数据 */}
            <div style={{ fontSize: 13, color: 'var(--td-text-color-secondary)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: 'var(--td-text-color-primary)' }}>板块效应</span>
              <span>共 <strong>{data.totalDates}</strong> 天</span>
              <span>·</span>
              <span>交易日 <strong>{data.stats?.trading ?? 0}</strong></span>
              <span>·</span>
              <span>周末休市 <strong>{data.stats?.weekend ?? 0}</strong></span>
              <span>·</span>
              <span>节假日 <strong>{data.stats?.holiday ?? 0}</strong></span>
              <span>·</span>
              <span>今日 <strong>{data.stats?.today ?? 0}</strong></span>
              <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                <Button size="small" variant="outline" onClick={scrollToTop}>回到顶部</Button>
                <Button size="small" variant="outline" onClick={scrollToToday}>跳到今天</Button>
              </div>
            </div>
            {/* 第二行：颜色图例 */}
            <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#fff1f0', border: '1px solid #ffccc7' }} /> 榜首板块
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#f0f5ff', border: '1px solid #d6e4ff' }} /> 中列板块
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#f5f5f5', border: '1px solid #e7e7e7' }} /> 周末休市
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#fff7e6', border: '1px solid #ffe7ba' }} /> 节假日休市
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#f9f0ff', border: '1px solid #d3adf7' }} /> 今日待更新
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#722ed1' }} /> 手动录入 ✎
              </span>
              {editMode && (
                <span style={{ color: 'var(--td-brand-color)', fontWeight: 600 }}>
                  · 编辑模式已开启，点击任意日期行即可修改
                </span>
              )}
            </div>
          </div>

          {/* 表格容器 */}
          <div className="matrix-table-wrapper" ref={wrapperRef}>
            <table className="matrix-table">
              <thead>
                <tr>
                  <th className="col-date">时间</th>
                  {data.columns.slice(0, Math.min(data.maxCols, 11)).map((col, i) => (
                    <th key={i} className={`col-sector ${i < 3 ? 'col-top' : i < 7 ? 'col-mid' : ''}`}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((item, di) => {
                  // ---- 月份标题行 ----
                  if (item.type === 'month') {
                    return (
                      <tr key={`m-${item.month}`} className="month-header-row">
                        <td colSpan={Math.min(data.maxCols, 11) + 1} className="month-header-cell">
                          <strong>{item.month} 月</strong>
                          {item.note && <span className="month-note"> · {item.note}</span>}
                        </td>
                      </tr>
                    );
                  }

                  // ---- 折叠省略行 ----
                  if (item.type === 'collapse') {
                    const cs = DAY_TYPE_STYLE[item.dayType];
                    return (
                      <tr key={`c-${item.startIdx}`} className="collapse-row">
                        <td colSpan={Math.min(data.maxCols, 11) + 1}
                          className="collapse-cell"
                          style={{ backgroundColor: cs?.bg || '#f5f5f5', color: cs?.fg || '#8c8c8c' }}>
                          … 省略 {item.startDate.replace(/\//g, '/')} – {item.endDate.replace(/\//g, '/')} 共 <strong>{item.count}</strong> 天 …
                        </td>
                      </tr>
                    );
                  }

                  // ---- 实际数据行 ----
                  const row = item.row;
                  const restStyle = DAY_TYPE_STYLE[row.dayType];

                  // 休市日未折叠 → 正常显示
                  if (restStyle) {
                    return (
                      <tr
                        key={row.dateToken}
                        ref={row.isToday ? todayRowRef : undefined}
                        className={editMode ? 'row-editable' : undefined}
                        onClick={editMode ? () => openDayEditor(row.dateToken) : undefined}
                      >
                        <td className="cell-date" style={{ backgroundColor: restStyle.bg }}>
                          <span className="date-text" style={{ color: restStyle.fg }}>{row.date}</span>
                          <span className="date-week" style={{ color: restStyle.fg }}>{weekdayOf(row.date)}</span>
                        </td>
                        <td className="rest-cell" colSpan={Math.min(data.maxCols, 11)}
                          style={{ backgroundColor: restStyle.bg, color: restStyle.fg }}>
                          {restStyle.label}
                          {row.dayType === 'today' && ' · 今日待更新，今晚 20:00 更新'}
                          {editMode && <span style={{ marginLeft: 8, opacity: 0.75 }}>· 点击编辑</span>}
                        </td>
                      </tr>
                    );
                  }

                  // 交易日
                  const isManual = !!row.source?.includes('手动录入');
                  return (
                    <tr
                      key={row.dateToken}
                      ref={row.isToday ? todayRowRef : undefined}
                      className={editMode ? 'row-editable' : undefined}
                      onClick={editMode ? () => openDayEditor(row.dateToken) : undefined}
                    >
                      <td className="cell-date">
                        <Tooltip content={`来源：${row.source || '未知'}`}>
                          <span className="src-dot" style={{ backgroundColor: row.source?.includes('腾讯文档') ? '#bfbfbf' : isManual ? '#722ed1' : UP_COLOR }} />
                        </Tooltip>
                        <span className="date-text">{row.date}</span>
                        <span className="date-week">{weekdayOf(row.date)}</span>
                        {isManual && (
                          <Tooltip content="该日为手动录入数据，自动更新不会覆盖">
                            <span className="date-manual">✎</span>
                          </Tooltip>
                        )}
                        {row.substitutedDate && (
                          <Tooltip content={`实际数据日期: ${row.substitutedDate}`}>
                            <span className="date-subst">※</span>
                          </Tooltip>
                        )}
                      </td>
                      {row.cells.slice(0, Math.min(data.maxCols, 11)).map((cell, ci) => renderCell(cell, ci))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 底部说明 */}
          {data.note && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--td-component-stroke)', fontSize: 12, lineHeight: 1.8, color: 'var(--td-text-color-placeholder)' }}>
              <div>{data.note}</div>
              <div style={{ marginTop: 4 }}>以上内容基于公开行情数据统计，仅供研究参考，不构成投资建议。市场有风险，投资需谨慎。</div>
            </div>
          )}
        </Card>
      )}

      {/* 单日手动编辑对话框 */}
      <DayEditDialog
        open={editOpen}
        dateToken={editingDate}
        onClose={closeDayEditor}
        onSaved={loadMatrix}
      />

      {/* 无数据空状态 */}
      {data && data.mode === 'matrix' && data.rows.length === 0 && (
        <Card bordered>
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <Database size={40} style={{ margin: '0 auto 12px', color: 'var(--td-text-color-placeholder)' }} />
            <p style={{ fontSize: 14, color: 'var(--td-text-color-secondary)' }}>{data.note || '暂无数据'}</p>
            <Button theme="primary" icon={<RefreshCw size={16} />} onClick={handleRefresh} style={{ marginTop: 12 }}>获取最新数据</Button>
          </div>
        </Card>
      )}

      {/* 单日查询回退展示 */}
      {data && data.mode === 'single' && (
        <Card bordered>
          <div style={{ marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 11, color: 'var(--td-text-color-placeholder)' }}>统计日期</div><div style={{ fontSize: 16, fontWeight: 600 }}>{data.date}</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--td-text-color-placeholder)' }}>涨停总数</div><div style={{ fontSize: 16, fontWeight: 600, color: UP_COLOR }}>{data.totalLimitUp ?? 0} 只</div></div>
            <div><div style={{ fontSize: 11, color: 'var(--td-text-color-placeholder)' }}>涉及板块</div><div style={{ fontSize: 16, fontWeight: 600 }}>{data.sectors?.length ?? 0} 个</div></div>
          </div>
          {data.substitutedDate && <Alert theme="warning" message={`${data.requestedDate} 无有效收盘数据，已改用 ${data.substitutedDate}`} style={{ marginBottom: 12 }} />}
          {(!data.sectors || data.sectors.length === 0) ? (
            <Alert theme="info" message={data.note || '该日期暂无有效涨停数据'} style={{ marginBottom: 12 }} />
          ) : (
            <div className="matrix-table-wrapper">
              <table className="matrix-table">
                <thead><tr><th className="col-date">时间</th>{data.sectors!.slice(0, 17).map((_, i) => <th key={i} className={`col-sector ${i < 3 ? 'col-top' : i < 7 ? 'col-mid' : ''}`}>板块{i + 1}</th>)}</tr></thead>
                <tbody><tr><td className="cell-date"><span className="date-text">{String(data.date ?? '').replace(/(\d{4})(\d{2})(\d{2})/, '$1/$2/$3')}</span></td>{data.sectors!.slice(0, 17).map((sec, i) => renderCell(sec, i))}</tr></tbody>
              </table>
            </div>
          )}
          <Button variant="outline" icon={<Database size={16} />} onClick={loadMatrix} style={{ marginTop: 12 }}>查看全部历史数据</Button>
        </Card>
      )}

      {/* 内联样式 */}
      <style>{`
        .matrix-table-wrapper {
          overflow: auto;
          -webkit-overflow-scrolling: touch;
          max-height: 72vh;
        }

        .matrix-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          min-width: max(100%, ${(colCount + 1) * 110}px);
        }

        .matrix-table thead th {
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--td-bg-color-secondary, #f3f3f3);
          border: 1px solid var(--td-component-stroke, #e7e7e7);
          padding: 8px 6px;
          text-align: center;
          font-weight: 600;
          font-size: 12px;
          color: var(--td-text-color-primary, #333);
          white-space: nowrap;
        }

        .matrix-table thead th.col-date {
          background: var(--td-brand-color-light, #e6f7ff);
          min-width: 90px;
          width: 90px;
          position: sticky;
          top: 0;
          left: 0;
          z-index: 15;
        }

        .matrix-table thead th.col-top { background: #fff1f0; color: #cf1322; }
        .matrix-table thead th.col-mid { background: #f0f5ff; color: #2f54eb; }

        .matrix-table tbody tr:hover { background: var(--td-bg-color-container-hover, #fafafa); }

        .matrix-table td {
          border: 1px solid var(--td-component-stroke, #e7e7e7);
          padding: 4px 4px;
          text-align: center;
          vertical-align: middle;
          height: 34px;
          min-width: 100px;
          white-space: nowrap;
        }

        .matrix-table td.sector-cell.empty { background: #fafafa !important; }

        .matrix-table td.cell-date {
          background: var(--td-brand-color-light, #e6f7ff);
          font-weight: 500;
          position: sticky;
          left: 0;
          z-index: 5;
          min-width: 90px;
          width: 90px;
        }

        .matrix-table .date-text { font-size: 12px; color: var(--td-text-color-primary, #333); font-variant-numeric: tabular-nums; }
        .matrix-table .date-week { font-size: 10px; margin-left: 4px; opacity: 0.7; }
        .matrix-table td.rest-cell { text-align: center; font-size: 12px; letter-spacing: 0.5px; height: 30px; }
        .matrix-table .src-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; margin-right: 4px; vertical-align: middle; flex-shrink: 0; }
        .matrix-table .date-subst { font-size: 10px; color: var(--td-warning-color, #e37318); cursor: help; margin-left: 2px; }
        .matrix-table .date-manual { font-size: 10px; color: #722ed1; cursor: help; margin-left: 2px; }

        /* 编辑模式：整行可点击并高亮 */
        .matrix-table tbody tr.row-editable { cursor: pointer; }
        .matrix-table tbody tr.row-editable:hover { outline: 2px solid var(--td-brand-color, #0052d9); outline-offset: -2px; }
        .matrix-table .cell-text { font-size: 12.5px; font-weight: 500; cursor: default; display: inline-block; padding: 2px 8px; border-radius: 3px; line-height: 1.6; transition: transform 0.15s ease; }
        .matrix-table .cell-text:hover { transform: scale(1.06); }

        /* 月份标题行 */
        .matrix-table .month-header-row td {
          background: linear-gradient(90deg, #fafafa 0%, #f0f0f0 100%);
          border: none;
          border-bottom: 2px solid var(--td-component-stroke, #e7e7e7);
          padding: 6px 12px;
          text-align: left;
          font-size: 13px;
          height: auto;
          color: var(--td-text-color-primary, #333);
        }
        .matrix-table .month-note {
          font-weight: 400;
          color: var(--td-text-color-secondary, #666);
          font-size: 12px;
        }

        /* 折叠省略行 */
        .matrix-table .collapse-row td {
          text-align: center;
          font-size: 12px;
          letter-spacing: 0.3px;
          height: 28px;
          cursor: pointer;
        }
        .matrix-table .collapse-row:hover td {
          opacity: 0.85;
        }

        @media (max-width: 768px) {
          .matrix-table { font-size: 11px; min-width: max(100%, ${colCount * 80 + 90}px); }
          .matrix-table td { min-width: 70px; padding: 2px 2px; height: 28px; }
          .matrix-table .cell-text { font-size: 11px; padding: 1px 4px; }
          .matrix-table td.cell-date { min-width: 70px; width: 70px; }
        }
      `}</style>
    </div>
  );

  } catch (err: any) {
    // 渲染级错误兜底：防止整页白屏
    if (!renderError) setRenderError(err?.message || String(err));
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <Alert theme="error" message={`页面渲染异常：${err?.message || '未知错误'}`} style={{ marginBottom: 16 }} />
        <Button theme="primary" onClick={() => { setData(null); setRenderError(null); }}>重试加载</Button>
      </div>
    );
  }
}
