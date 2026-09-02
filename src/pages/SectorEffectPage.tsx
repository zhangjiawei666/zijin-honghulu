import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Dialog, Input, InputNumber, MessagePlugin, Radio, Select, Tooltip,
} from 'tdesign-react';
import {
  Flame, Loader, RefreshCw, Search, Clock, Database, History, Pencil, Plus, Trash2, X,
  Settings2, EyeOff,
} from 'lucide-react';

interface PivotCell {
  count: number;
  parts: Array<{ name: string; count: number }>;
}
interface PivotColumn {
  key: string;     // 标准名（透视键）
  label: string;   // 显示标签（可手动重命名）
  merged: boolean; // 是否由多个原名归并而来
}
interface PivotRow {
  date: string;
  dateToken: string;
  dayType: DayType;
  isToday: boolean;
  source: string | null;
  substitutedDate: string | null;
  cells: Record<string, PivotCell>;
}

/** 日期类型：trading 交易日 / weekend 周末休市 / holiday 法定节假日休市 / today 今日待更新 */
type DayType = 'trading' | 'weekend' | 'holiday' | 'today';

/** 休市日的展示文案与配色 */
const DAY_TYPE_STYLE: Record<DayType, { label: string; bg: string; fg: string } | null> = {
  trading: null,
  weekend: { label: '周末休市', bg: '#f5f5f5', fg: '#8c8c8c' },
  holiday: { label: '节假日休市', bg: '#fff7e6', fg: '#d46b08' },
  today:   { label: '今日待更新', bg: '#f9f0ff', fg: '#722ed1' },
};

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function weekdayOf(display: string): string {
  const parts = String(display || '').split('/').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return '';
  const [y, m, d] = parts;
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] || '';
}
function monthOf(dateStr: string): number {
  const parts = String(dateStr || '').split('/').map(Number);
  return parts.length >= 2 ? parts[1] : 0;
}

interface MatrixData {
  mode: 'matrix' | 'single';
  window?: number;
  rows: PivotRow[];
  columns: PivotColumn[];
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
  sectors?: Array<{ name: string; count: number }>;
}

const UP_COLOR = '#e02020';
const CELL_BG_TOP = '#fff1f0';
const CELL_BG_MID = '#f0f5ff';
const CELL_BG_NORMAL = '#fafafa';

const MONTH_NOTES: Record<number, string> = {
  1: '正序排列，最早的日期在最上方',
  2: '春节长假，连续休市完整保留',
};

const COLLAPSE_THRESHOLD = 3;

const WINDOW_OPTIONS = [
  { value: 0, label: '全部' },
  { value: 10, label: '近10日' },
  { value: 15, label: '近15日' },
  { value: 20, label: '近20日' },
];

// ============= 单日编辑对话框（保持不变） =============

interface EditDraft { name: string; count: number; }
const DAY_TYPE_OPTIONS = [
  { value: 'trading', label: '交易日' },
  { value: 'weekend', label: '周末休市' },
  { value: 'holiday', label: '节假日休市' },
];

function DayEditDialog({ open, dateToken, onClose, onSaved }: {
  open: boolean; dateToken: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<EditDraft[]>([]);
  const [dayType, setDayType] = useState<string>('trading');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [isManual, setIsManual] = useState(false);

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
        if (!cancelled) { MessagePlugin.error(err?.message || '读取该日数据失败'); onClose(); }
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
        body: JSON.stringify({ sectors: valid.map(d => ({ name: d.name.trim(), count: Math.round(d.count) })), dayType }),
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
          <Button variant="text" theme="danger" icon={<Trash2 size={15} />} loading={clearing} onClick={handleClear}>清空该日</Button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" onClick={onClose} disabled={saving || clearing}>取消</Button>
            <Button theme="primary" icon={<Pencil size={15} />} loading={saving} disabled={loading} onClick={handleSave}>保存</Button>
          </div>
        </div>
      )}
    >
      {loading ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <Loader size={22} className="animate-spin" style={{ margin: '0 auto 10px', color: 'var(--td-brand-color)' }} />
          <p style={{ fontSize: 'calc(13px * var(--font-scale, 1))', color: 'var(--td-text-color-secondary)' }}>正在读取该日数据……</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isManual && <Alert theme="warning" message="该日当前为「手动录入」数据，自动更新与模板导入均不会覆盖它。" />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 'calc(13px * var(--font-scale, 1))', color: 'var(--td-text-color-secondary)', minWidth: 60 }}>日期类型</span>
            <Radio.Group value={dayType} onChange={(v) => setDayType(String(v))} variant="default-filled">
              {DAY_TYPE_OPTIONS.map(o => <Radio.Button key={o.value} value={o.value}>{o.label}</Radio.Button>)}
            </Radio.Group>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 'calc(13px * var(--font-scale, 1))', color: 'var(--td-text-color-secondary)' }}>
                板块与涨停数（合计 <strong style={{ color: UP_COLOR }}>{total}</strong> 只）
              </span>
              <Button size="small" variant="outline" icon={<Plus size={14} />} onClick={() => setDrafts(prev => [...prev, { name: '', count: 0 }])}>添加板块</Button>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {drafts.length === 0 && (
                <p style={{ fontSize: 'calc(13px * var(--font-scale, 1))', color: 'var(--td-text-color-placeholder)', textAlign: 'center', padding: '20px 0' }}>暂无板块，点「添加板块」开始录入</p>
              )}
              {drafts.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 'calc(12px * var(--font-scale, 1))', color: 'var(--td-text-color-placeholder)', width: 34, flexShrink: 0 }}>板块{i + 1}</span>
                  <Input value={d.name} placeholder="板块名称" onChange={(v) => setDrafts(prev => prev.map((x, xi) => xi === i ? { ...x, name: String(v ?? '') } : x))} style={{ flex: 1 }} />
                  <InputNumber value={d.count} min={0} step={1} theme="normal" style={{ width: 96 }} onChange={(v) => setDrafts(prev => prev.map((x, xi) => xi === i ? { ...x, count: Number(v ?? 0) } : x))} />
                  <Button size="small" variant="text" shape="square" icon={<X size={14} />} onClick={() => setDrafts(prev => prev.filter((_, xi) => xi !== i))} />
                </div>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 'calc(12px * var(--font-scale, 1))', color: 'var(--td-text-color-placeholder)', lineHeight: 1.7, margin: 0 }}>
            板块名称留空的行会被忽略。保存后该日标记为「手动录入」，自动更新不再覆盖；需要恢复自动抓取时，点左下角「清空该日」即可。
          </p>
        </div>
      )}
    </Dialog>
  );
}

// ============= 板块管理对话框（手动安全网） =============

interface CanonConfig {
  groups: Record<string, string[]>;
  overrides: Record<string, string>;
  displayNames: Record<string, string>;
}

function SectorManageDialog({ open, columns, onClose, onChanged }: {
  open: boolean;
  columns: PivotColumn[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [cfg, setCfg] = useState<CanonConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [alias, setAlias] = useState('');
  const [standard, setStandard] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/sector-effect/canon');
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json?.error || '读取失败');
      setCfg({ groups: json.groups || {}, overrides: json.overrides || {}, displayNames: json.displayNames || {} });
    } catch (err: any) {
      MessagePlugin.error(err?.message || '读取归并配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const post = useCallback(async (body: any) => {
    setBusy(true);
    try {
      const resp = await fetch('/api/sector-effect/canon', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json?.error || '操作失败');
      setCfg({ groups: json.groups || {}, overrides: json.overrides || {}, displayNames: json.displayNames || {} });
      onChanged();
      MessagePlugin.success('已更新归并配置');
    } catch (err: any) {
      MessagePlugin.error(err?.message || '操作失败');
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  // 当前生效的「标准列 -> 别名列表」（基础分组 + 手动覆盖合并）
  const mergedView = useMemo(() => {
    if (!cfg) return [] as Array<{ std: string; aliases: string[]; renamed: boolean }>;
    const map = new Map<string, Set<string>>();
    for (const [std, aliases] of Object.entries(cfg.groups)) {
      if (!map.has(std)) map.set(std, new Set());
      for (const a of aliases) map.get(std)!.add(a);
    }
    for (const [a, std] of Object.entries(cfg.overrides)) {
      if (!map.has(std)) map.set(std, new Set());
      if (a !== std) map.get(std)!.add(a);
    }
    return [...map.entries()].map(([std, aliases]) => ({
      std,
      aliases: [...aliases],
      renamed: !!cfg.displayNames[std] && cfg.displayNames[std] !== std,
    }));
  }, [cfg]);

  const stdOptions = useMemo(() => columns.map(c => ({ value: c.key, label: c.key })), [columns]);

  return (
    <Dialog
      header="板块管理 · 归并与重命名（手动安全网）"
      visible={open}
      onClose={onClose}
      width={720}
      footer={<Button theme="primary" onClick={onClose}>关闭</Button>}
    >
      {loading || !cfg ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <Loader size={22} className="animate-spin" style={{ margin: '0 auto 10px', color: 'var(--td-brand-color)' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Alert theme="info" message="归并仅发生在展示层，原始板块名仍保留在库中。手动覆盖独立存储，自动同步不会覆盖；可一键「重置为自动」。" />

          {/* 新增归并 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'calc(13px * var(--font-scale, 1))', color: 'var(--td-text-color-secondary)' }}>合并</span>
            <Input value={alias} placeholder="原名（如 种植业）" onChange={v => setAlias(String(v ?? ''))} style={{ width: 180 }} />
            <span style={{ fontSize: 'calc(13px * var(--font-scale, 1))', color: 'var(--td-text-color-secondary)' }}>→</span>
            <Select value={standard} filterable creatable onChange={v => setStandard(String(v ?? ''))} placeholder="归并到标准列" style={{ width: 200 }} options={stdOptions} />
            <Button theme="primary" loading={busy} disabled={!alias.trim() || !standard.trim()} onClick={() => { post({ action: 'merge', alias: alias.trim(), standard: standard.trim() }); setAlias(''); setStandard(''); }}>添加归并</Button>
          </div>

          {/* 归并一览 */}
          <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--td-component-stroke)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'calc(13px * var(--font-scale, 1))' }}>
              <thead>
                <tr style={{ background: 'var(--td-bg-color-secondary)', position: 'sticky', top: 0 }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--td-component-stroke)' }}>标准列</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--td-component-stroke)' }}>归并自（别名）</th>
                  <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--td-component-stroke)' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {mergedView.map(({ std, aliases, renamed }) => (
                  <tr key={std} style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--td-text-color-primary)' }}>
                      {cfg.displayNames[std] || std}
                      {renamed && <span style={{ marginLeft: 6, fontSize: 'calc(11px * var(--font-scale, 1))', color: 'var(--td-brand-color)' }}>(原名 {std})</span>}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--td-text-color-secondary)' }}>
                      {aliases.length > 0 ? aliases.join('、') : <span style={{ color: 'var(--td-text-color-placeholder)' }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Button size="small" variant="text" onClick={() => { const v = window.prompt(`重命名「${std}」为：`, cfg.displayNames[std] || std); if (v !== null) post({ action: 'rename', standard: std, label: v.trim() }); }}>重命名</Button>
                      {aliases.length > 0 && (
                        <Button size="small" variant="text" theme="warning" onClick={() => { if (window.confirm(`确认拆分「${std}」？其别名将各自独立成列。`)) aliases.forEach(a => post({ action: 'unmerge', alias: a })); }}>拆分</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button theme="danger" variant="outline" loading={busy} onClick={() => { if (window.confirm('确认重置为自动？将清空全部手动归并与重命名。')) post({ action: 'reset' }); }}>重置为自动</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ============= 主页面 =============

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

  const [editMode, setEditMode] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // 近 N 日主线窗口（0=全部）
  const [windowN, setWindowN] = useState<number>(15);
  // 视图级隐藏的列（仅前端，不影响数据）
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  // 列头右键菜单
  const [colMenu, setColMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  // 板块管理弹窗
  const [manageOpen, setManageOpen] = useState(false);

  const openDayEditor = useCallback((dateToken: string) => { setEditingDate(dateToken); setEditOpen(true); }, []);
  const closeDayEditor = useCallback(() => { setEditOpen(false); setEditingDate(null); }, []);

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/sector-effect?window=${windowN}&limit=100000`);
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || `请求失败（${resp.status}）`);
      setData(json as MatrixData);
    } catch (err: any) {
      setError(err?.message || '获取板块效应数据失败');
      MessagePlugin.error(err?.message || '获取板块效应数据失败');
    } finally {
      setLoading(false);
    }
  }, [windowN]);

  const handleRefresh = async () => {
    setRefreshing(true); setError(null);
    try {
      const body: Record<string, string> = {};
      const raw = date.trim().replace(/-/g, '');
      if (raw && /^\d{8}$/.test(raw)) body.date = raw;
      const resp = await fetch('/api/sector-effect/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json?.error || '更新失败');
      if (json.skipped) MessagePlugin.warning(json.message || `${json.date} 已有模板历史数据，已保留未覆盖`);
      else MessagePlugin.success(`已更新 ${json.date} 数据：${json.totalLimitUp}只涨停，${json.sectorCount}个板块`);
      await loadMatrix();
    } catch (err: any) {
      setError(err?.message || '更新失败');
      MessagePlugin.error(err?.message || '更新失败');
    } finally { setRefreshing(false); }
  };

  const handleImportHistory = async (force: boolean = false) => {
    setImporting(true); setError(null);
    try {
      const resp = await fetch('/api/sector-effect/import-history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }) });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json?.error || '导入失败');
      MessagePlugin.success(json.message || `已导入 ${json.added} 个交易日`);
      await loadMatrix();
    } catch (err: any) {
      setError(err?.message || '导入历史数据失败');
      MessagePlugin.error(err?.message || '导入历史数据失败');
    } finally { setImporting(false); }
  };

  const handleQuery = async () => {
    const raw = date.trim().replace(/-/g, '');
    if (raw && !/^\d{8}$/.test(raw)) { MessagePlugin.warning('日期格式应为 YYYY-MM-DD 或 YYYYMMDD'); return; }
    setLoading(true); setError(null);
    try {
      const query = raw ? `?date=${encodeURIComponent(raw)}` : `?window=${windowN}`;
      const resp = await fetch(`/api/sector-effect${query}`);
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || `请求失败（${resp.status}）`);
      setData(json as MatrixData);
    } catch (err: any) {
      setError(err?.message || '获取数据失败');
      MessagePlugin.error(err?.message || '获取数据失败');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadMatrix(); }, [loadMatrix]);

  const scrollToToday = useCallback(() => {
    const row = todayRowRef.current; const wrapper = wrapperRef.current;
    if (!row || !wrapper) return;
    const rowRect = row.getBoundingClientRect();
    const wrapRect = wrapper.getBoundingClientRect();
    const rowTopInContent = (rowRect.top - wrapRect.top) + wrapper.scrollTop;
    const target = rowTopInContent - wrapper.clientHeight / 2 + row.offsetHeight / 2;
    const maxScroll = Math.max(0, wrapper.scrollHeight - wrapper.clientHeight);
    wrapper.scrollTo({ top: Math.max(0, Math.min(target, maxScroll)), behavior: 'smooth' });
  }, []);
  const scrollToTop = useCallback(() => { wrapperRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, []);

  useEffect(() => {
    if (data?.mode !== 'matrix' || !data.rows?.length) return;
    const t = setTimeout(() => scrollToToday(), 200);
    return () => clearTimeout(t);
  }, [data, scrollToToday]);

  // 可见列（排除视图级隐藏）
  const visibleColumns = useMemo(
    () => (data?.columns || []).filter(c => !hiddenKeys.has(c.key)),
    [data?.columns, hiddenKeys],
  );
  const colCount = visibleColumns.length;

  // ============= 渲染辅助 =============

  const renderCell = (cell: PivotCell | undefined, column: PivotColumn) => {
    if (!cell) return <td key={column.key} className="sector-cell empty" />;
    const merged = cell.parts.length > 1;
    const tip = merged
      ? `${column.label} ${cell.count}只涨停\n归并自：\n${cell.parts.map(p => `· ${p.name}: ${p.count}`).join('\n')}`
      : `${column.label}: ${cell.count}只涨停`;
    return (
      <td key={column.key} className="sector-cell" style={{ backgroundColor: CELL_BG_NORMAL }}>
        <Tooltip content={tip} showArrow>
          <span className="cell-text">
            {column.label}{cell.count}
            {merged && <sup className="merge-badge">!</sup>}
          </span>
        </Tooltip>
      </td>
    );
  };

  const displayRows = useMemo(() => {
    if (!data?.rows || data.mode !== 'matrix') return [];
    const result: Array<
      { type: 'data'; row: PivotRow; index: number }
      | { type: 'month'; month: number; note: string }
      | { type: 'collapse'; startIdx: number; endIdx: number; count: number; dayType: DayType; startDate: string; endDate: string }
    > = [];
    let currentMonth = 0;
    let collapseStart = -1;
    let collapseType: DayType | null = null;
    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      const m = monthOf(row.date);
      if (m !== currentMonth) {
        if (collapseStart >= 0 && collapseType && i - collapseStart >= COLLAPSE_THRESHOLD) {
          result.push({ type: 'collapse', startIdx: collapseStart, endIdx: i - 1, count: i - collapseStart, dayType: collapseType, startDate: data.rows[collapseStart].date, endDate: data.rows[i - 1].date });
        } else if (collapseStart >= 0) {
          for (let j = collapseStart; j < i; j++) result.push({ type: 'data', row: data.rows[j], index: j });
        }
        collapseStart = -1; collapseType = null;
        result.push({ type: 'month', month: m, note: MONTH_NOTES[m] || '' });
        currentMonth = m;
      }
      if (row.dayType === 'trading') {
        if (collapseStart >= 0 && collapseType) {
          if (i - collapseStart >= COLLAPSE_THRESHOLD) {
            result.push({ type: 'collapse', startIdx: collapseStart, endIdx: i - 1, count: i - collapseStart, dayType: collapseType, startDate: data.rows[collapseStart].date, endDate: data.rows[i - 1].date });
          } else {
            for (let j = collapseStart; j < i; j++) result.push({ type: 'data', row: data.rows[j], index: j });
          }
          collapseStart = -1; collapseType = null;
        }
        result.push({ type: 'data', row, index: i });
      } else {
        if (collapseStart < 0) { collapseStart = i; collapseType = row.dayType; }
        else if (collapseType !== row.dayType) {
          if (i - collapseStart >= COLLAPSE_THRESHOLD) {
            result.push({ type: 'collapse', startIdx: collapseStart, endIdx: i - 1, count: i - collapseStart, dayType: collapseType!, startDate: data.rows[collapseStart].date, endDate: data.rows[i - 1].date });
          } else {
            for (let j = collapseStart; j < i; j++) result.push({ type: 'data', row: data.rows[j], index: j });
          }
          collapseStart = i; collapseType = row.dayType;
        }
      }
    }
    if (collapseStart >= 0 && collapseType) {
      const remaining = data.rows.length - collapseStart;
      if (remaining >= COLLAPSE_THRESHOLD) {
        result.push({ type: 'collapse', startIdx: collapseStart, endIdx: data.rows.length - 1, count: remaining, dayType: collapseType, startDate: data.rows[collapseStart].date, endDate: data.rows[data.rows.length - 1].date });
      } else {
        for (let j = collapseStart; j < data.rows.length; j++) result.push({ type: 'data', row: data.rows[j], index: j });
      }
    }
    return result;
  }, [data?.rows, data?.mode]);

  // ============= 主渲染 =============

  try {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }} onClick={() => setColMenu(null)}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 'calc(20px * var(--font-scale, 1))', fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--td-text-color-primary)' }}>
            <Flame size={20} style={{ color: 'var(--td-brand-color)', flexShrink: 0 }} />
            板块效应
          </h2>
          <p style={{ fontSize: 'calc(13px * var(--font-scale, 1))', margin: 0, color: 'var(--td-text-color-secondary)', lineHeight: 1.6 }}>
            按交易日统计 A 股涨停股并归集到板块，以「板块名 × 日期」矩阵展示。同一板块固定在一列，便于纵向追踪主线持续性与情绪；
            列数随数据动态增长。数据自动保留在本地；归并/重命名可在「板块管理」中手动维护。
          </p>
        </div>

        <Card bordered style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input style={{ flex: 1, minWidth: 200 }} size="large" value={date} placeholder="指定日期（如 2026-08-31，留空则取最近交易日）" onChange={v => setDate(String(v || ''))} onEnter={handleQuery} clearable />
            <Button size="large" theme="primary" icon={<Search size={16} />} loading={loading} disabled={loading} onClick={handleQuery}>查询</Button>
            <Button size="large" icon={<RefreshCw size={16} />} loading={refreshing} disabled={refreshing || loading} onClick={handleRefresh}>{refreshing ? '更新中...' : '手动更新'}</Button>
            <Button size="large" variant="outline" icon={<Database size={16} />} disabled={loading} onClick={loadMatrix}>查看全部</Button>
            <Tooltip content="导入 2026 年腾讯文档模板历史数据（仅补齐缺失日期，不覆盖已有记录）">
              <Button size="large" variant="outline" icon={<History size={16} />} loading={importing} disabled={importing || loading} onClick={() => handleImportHistory(false)}>导入历史</Button>
            </Tooltip>
            <Tooltip content={editMode ? '退出编辑模式' : '开启后点击任意日期行，可手工修改该日的板块数据'}>
              <Button size="large" variant="outline" theme={editMode ? 'primary' : 'default'} icon={<Pencil size={16} />} disabled={loading} onClick={() => setEditMode(v => !v)}>{editMode ? '退出编辑' : '手动编辑'}</Button>
            </Tooltip>
            <Button size="large" variant="outline" icon={<Settings2 size={16} />} onClick={() => setManageOpen(true)}>板块管理</Button>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 'calc(12px * var(--font-scale, 1))', color: 'var(--td-text-color-placeholder)' }}>
              <span>只看近</span>
              <Select value={windowN} onChange={v => setWindowN(Number(v))} style={{ width: 110 }} options={WINDOW_OPTIONS} />
              <span>日主线</span>
            </div>
          </div>
          {hiddenKeys.size > 0 && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 'calc(12px * var(--font-scale, 1))', color: 'var(--td-text-color-secondary)' }}>
              <EyeOff size={13} />
              <span>已隐藏 {hiddenKeys.size} 列（仅视图，不影响数据）</span>
              <Button size="small" variant="text" onClick={() => setHiddenKeys(new Set())}>显示全部</Button>
            </div>
          )}
        </Card>

        {error && !data && <Alert theme="error" message={error} style={{ marginBottom: 16 }} />}

        {loading && !data && (
          <Card bordered>
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <Loader size={26} className="animate-spin" style={{ margin: '0 auto 12px', color: 'var(--td-brand-color)' }} />
              <p style={{ fontSize: 'calc(14px * var(--font-scale, 1))', color: 'var(--td-text-color-secondary)' }}>正在加载板块效应数据……</p>
            </div>
          </Card>
        )}

        {data && data.mode === 'matrix' && data.rows.length > 0 && (
          <Card bordered style={{ overflow: 'visible' }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 'calc(13px * var(--font-scale, 1))', color: 'var(--td-text-color-secondary)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
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
                <span>·</span>
                <span>显示 <strong>{visibleColumns.length}</strong> 个板块列</span>
                <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                  <Button size="small" variant="outline" onClick={scrollToTop}>回到顶部</Button>
                  <Button size="small" variant="outline" onClick={scrollToToday}>跳到今天</Button>
                </div>
              </div>
              <div style={{ fontSize: 'calc(12px * var(--font-scale, 1))', color: 'var(--td-text-color-placeholder)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#fff1f0', border: '1px solid #ffccc7' }} /> 涨停多（情绪高）</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#f5f5f5', border: '1px solid #e7e7e7' }} /> 周末/节假日休市</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#722ed1' }} /> 归并板块（悬停看子板块）</span>
                {editMode && <span style={{ color: 'var(--td-brand-color)', fontWeight: 600 }}>· 编辑模式已开启，点击任意日期行即可修改</span>}
              </div>
            </div>

            <div className="matrix-table-wrapper" ref={wrapperRef}>
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th className="col-date">时间</th>
                    {visibleColumns.map(col => (
                      <th key={col.key} className="col-sector" onContextMenu={(e) => { e.preventDefault(); setColMenu({ key: col.key, x: e.clientX, y: e.clientY }); }}>
                        {col.label}
                        {col.merged && <span className="col-merged-flag" title="由多个同名板块归并">⇄</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((item, di) => {
                    if (item.type === 'month') {
                      return (
                        <tr key={`m-${item.month}`} className="month-header-row">
                          <td colSpan={visibleColumns.length + 1} className="month-header-cell">
                            <strong>{item.month} 月</strong>
                            {item.note && <span className="month-note"> · {item.note}</span>}
                          </td>
                        </tr>
                      );
                    }
                    if (item.type === 'collapse') {
                      const cs = DAY_TYPE_STYLE[item.dayType];
                      return (
                        <tr key={`c-${item.startIdx}`} className="collapse-row">
                          <td colSpan={visibleColumns.length + 1} className="collapse-cell" style={{ backgroundColor: cs?.bg || '#f5f5f5', color: cs?.fg || '#8c8c8c' }}>
                            … 省略 {item.startDate.replace(/\//g, '/')} – {item.endDate.replace(/\//g, '/')} 共 <strong>{item.count}</strong> 天 …
                          </td>
                        </tr>
                      );
                    }
                    const row = item.row;
                    const restStyle = DAY_TYPE_STYLE[row.dayType];
                    if (restStyle) {
                      return (
                        <tr key={row.dateToken} ref={row.isToday ? todayRowRef : undefined} className={editMode ? 'row-editable' : undefined} onClick={editMode ? () => openDayEditor(row.dateToken) : undefined}>
                          <td className="cell-date" style={{ backgroundColor: restStyle.bg }}>
                            <span className="date-text" style={{ color: restStyle.fg }}>{row.date}</span>
                            <span className="date-week" style={{ color: restStyle.fg }}>{weekdayOf(row.date)}</span>
                          </td>
                          <td className="rest-cell" colSpan={visibleColumns.length} style={{ backgroundColor: restStyle.bg, color: restStyle.fg }}>
                            {restStyle.label}
                            {row.dayType === 'today' && ' · 今日待更新，今晚 20:00 更新'}
                            {editMode && <span style={{ marginLeft: 8, opacity: 0.75 }}>· 点击编辑</span>}
                          </td>
                        </tr>
                      );
                    }
                    const isManual = !!row.source?.includes('手动录入');
                    return (
                      <tr key={row.dateToken} ref={row.isToday ? todayRowRef : undefined} className={editMode ? 'row-editable' : undefined} onClick={editMode ? () => openDayEditor(row.dateToken) : undefined}>
                        <td className="cell-date">
                          <Tooltip content={`来源：${row.source || '未知'}`}>
                            <span className="src-dot" style={{ backgroundColor: row.source?.includes('腾讯文档') ? '#bfbfbf' : isManual ? '#722ed1' : UP_COLOR }} />
                          </Tooltip>
                          <span className="date-text">{row.date}</span>
                          <span className="date-week">{weekdayOf(row.date)}</span>
                          {isManual && <Tooltip content="该日为手动录入数据，自动更新不会覆盖"><span className="date-manual">✎</span></Tooltip>}
                          {row.substitutedDate && <Tooltip content={`实际数据日期: ${row.substitutedDate}`}><span className="date-subst">※</span></Tooltip>}
                        </td>
                        {visibleColumns.map(col => renderCell(row.cells[col.key], col))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {data.note && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--td-component-stroke)', fontSize: 'calc(12px * var(--font-scale, 1))', lineHeight: 1.8, color: 'var(--td-text-color-placeholder)' }}>
                <div>{data.note}</div>
                <div style={{ marginTop: 4 }}>以上内容基于公开行情数据统计，仅供研究参考，不构成投资建议。市场有风险，投资需谨慎。</div>
              </div>
            )}
          </Card>
        )}

        <DayEditDialog open={editOpen} dateToken={editingDate} onClose={closeDayEditor} onSaved={loadMatrix} />
        <SectorManageDialog open={manageOpen} columns={data?.columns || []} onClose={() => setManageOpen(false)} onChanged={loadMatrix} />

        {/* 列头右键菜单 */}
        {colMenu && (
          <div className="col-menu" style={{ position: 'fixed', top: colMenu.y, left: colMenu.x, zIndex: 1000 }} onClick={e => e.stopPropagation()}>
            <div className="col-menu-item" onClick={() => { const v = window.prompt(`重命名「${colMenu.key}」为：`, colMenu.key); if (v !== null) { fetch('/api/sector-effect/canon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rename', standard: colMenu.key, label: v.trim() }) }).then(() => { setColMenu(null); loadMatrix(); }); } }}>重命名</div>
            <div className="col-menu-item" onClick={() => { const v = window.prompt(`将「${colMenu.key}」合并到（输入目标标准列名）：`, colMenu.key); if (v !== null && v.trim()) { fetch('/api/sector-effect/canon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'merge', alias: colMenu.key, standard: v.trim() }) }).then(() => { setColMenu(null); loadMatrix(); }); } }}>合并到…</div>
            <div className="col-menu-item" onClick={() => { fetch('/api/sector-effect/canon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unmerge', alias: colMenu.key }) }).then(() => { setColMenu(null); loadMatrix(); }); }}>拆分（独立成列）</div>
            <div className="col-menu-item danger" onClick={() => { setHiddenKeys(prev => new Set(prev).add(colMenu.key)); setColMenu(null); }}>隐藏本列（视图）</div>
          </div>
        )}

        {data && data.mode === 'matrix' && data.rows.length === 0 && (
          <Card bordered>
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <Database size={40} style={{ margin: '0 auto 12px', color: 'var(--td-text-color-placeholder)' }} />
              <p style={{ fontSize: 'calc(14px * var(--font-scale, 1))', color: 'var(--td-text-color-secondary)' }}>{data.note || '暂无数据'}</p>
              <Button theme="primary" icon={<RefreshCw size={16} />} onClick={handleRefresh} style={{ marginTop: 12 }}>获取最新数据</Button>
            </div>
          </Card>
        )}

        {data && data.mode === 'single' && (
          <Card bordered>
            <div style={{ marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: 'calc(11px * var(--font-scale, 1))', color: 'var(--td-text-color-placeholder)' }}>统计日期</div><div style={{ fontSize: 'calc(16px * var(--font-scale, 1))', fontWeight: 600 }}>{data.date}</div></div>
              <div><div style={{ fontSize: 'calc(11px * var(--font-scale, 1))', color: 'var(--td-text-color-placeholder)' }}>涨停总数</div><div style={{ fontSize: 'calc(16px * var(--font-scale, 1))', fontWeight: 600, color: UP_COLOR }}>{data.totalLimitUp ?? 0} 只</div></div>
              <div><div style={{ fontSize: 'calc(11px * var(--font-scale, 1))', color: 'var(--td-text-color-placeholder)' }}>涉及板块</div><div style={{ fontSize: 'calc(16px * var(--font-scale, 1))', fontWeight: 600 }}>{data.sectors?.length ?? 0} 个</div></div>
            </div>
            {data.substitutedDate && <Alert theme="warning" message={`${data.requestedDate} 无有效收盘数据，已改用 ${data.substitutedDate}`} style={{ marginBottom: 12 }} />}
            {(!data.sectors || data.sectors.length === 0) ? (
              <Alert theme="info" message={data.note || '该日期暂无有效涨停数据'} style={{ marginBottom: 12 }} />
            ) : (
              <div className="matrix-table-wrapper">
                <table className="matrix-table">
                  <thead><tr><th className="col-date">时间</th>{data.sectors!.map((_, i) => <th key={i} className="col-sector">板块{i + 1}</th>)}</tr></thead>
                  <tbody><tr><td className="cell-date"><span className="date-text">{String(data.date ?? '').replace(/(\d{4})(\d{2})(\d{2})/, '$1/$2/$3')}</span></td>{data.sectors!.map((sec, i) => <td key={i} className="sector-cell" style={{ backgroundColor: CELL_BG_NORMAL }}><Tooltip content={`${sec.name}: ${sec.count}只涨停`}><span className="cell-text">{sec.name}{sec.count}</span></Tooltip></td>)}</tr></tbody>
                </table>
              </div>
            )}
            <Button variant="outline" icon={<Database size={16} />} onClick={loadMatrix} style={{ marginTop: 12 }}>查看全部历史数据</Button>
          </Card>
        )}

        <style>{`
          .matrix-table-wrapper { overflow: auto; -webkit-overflow-scrolling: touch; max-height: 72vh; }
          .matrix-table { width: 100%; border-collapse: collapse; font-size: calc(13px * var(--font-scale, 1)); min-width: max(100%, ${(colCount + 1) * 110}px); }
          .matrix-table thead th { position: sticky; top: 0; z-index: 10; background: var(--td-bg-color-secondary, #f3f3f3); border: 1px solid var(--td-component-stroke, #e7e7e7); padding: 8px 6px; text-align: center; font-weight: 600; font-size: calc(12px * var(--font-scale, 1)); color: var(--td-text-color-primary, #333); white-space: nowrap; cursor: context-menu; }
          .matrix-table thead th.col-date { background: var(--td-brand-color-light, #e6f7ff); min-width: 90px; width: 90px; position: sticky; top: 0; left: 0; z-index: 15; }
          .col-merged-flag { margin-left: 3px; color: #b06b00; font-size: calc(11px * var(--font-scale, 1)); }
          .matrix-table tbody tr:hover { background: var(--td-bg-color-container-hover, #fafafa); }
          .matrix-table td { border: 1px solid var(--td-component-stroke, #e7e7e7); padding: 4px 4px; text-align: center; vertical-align: middle; height: 34px; min-width: 100px; white-space: nowrap; }
          .matrix-table td.sector-cell.empty { background: #fafafa !important; }
          .matrix-table td.cell-date { background: var(--td-brand-color-light, #e6f7ff); font-weight: 500; position: sticky; left: 0; z-index: 5; min-width: 90px; width: 90px; }
          .matrix-table .date-text { font-size: calc(12px * var(--font-scale, 1)); color: var(--td-text-color-primary, #333); font-variant-numeric: tabular-nums; }
          .matrix-table .date-week { font-size: calc(10px * var(--font-scale, 1)); margin-left: 4px; opacity: 0.7; }
          .matrix-table td.rest-cell { text-align: center; font-size: calc(12px * var(--font-scale, 1)); letter-spacing: 0.5px; height: 30px; }
          .matrix-table .src-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; margin-right: 4px; vertical-align: middle; flex-shrink: 0; }
          .matrix-table .date-subst { font-size: calc(10px * var(--font-scale, 1)); color: var(--td-warning-color, #e37318); cursor: help; margin-left: 2px; }
          .matrix-table .date-manual { font-size: calc(10px * var(--font-scale, 1)); color: #722ed1; cursor: help; margin-left: 2px; }
          .matrix-table tbody tr.row-editable { cursor: pointer; }
          .matrix-table tbody tr.row-editable:hover { outline: 2px solid var(--td-brand-color, #0052d9); outline-offset: -2px; }
          .matrix-table .cell-text { font-size: calc(12.5px * var(--font-scale, 1)); font-weight: 500; cursor: default; display: inline-block; padding: 2px 8px; border-radius: 3px; line-height: 1.6; transition: transform 0.15s ease; }
          .matrix-table .cell-text:hover { transform: scale(1.06); }
          .merge-badge { color: #b06b00; font-weight: 700; font-size: calc(11px * var(--font-scale, 1)); margin-left: 2px; }
          .matrix-table .month-header-row td { background: linear-gradient(90deg, #fafafa 0%, #f0f0f0 100%); border: none; border-bottom: 2px solid var(--td-component-stroke, #e7e7e7); padding: 6px 12px; text-align: left; font-size: calc(13px * var(--font-scale, 1)); height: auto; color: var(--td-text-color-primary, #333); }
          .matrix-table .month-note { font-weight: 400; color: var(--td-text-color-secondary, #666); font-size: calc(12px * var(--font-scale, 1)); }
          .matrix-table .collapse-row td { text-align: center; font-size: calc(12px * var(--font-scale, 1)); letter-spacing: 0.3px; height: 28px; cursor: pointer; }
          .matrix-table .collapse-row:hover td { opacity: 0.85; }
          .col-menu { background: var(--td-bg-color-container, #fff); border: 1px solid var(--td-component-stroke, #e7e7e7); border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); overflow: hidden; min-width: 150px; }
          .col-menu-item { padding: 9px 14px; font-size: calc(13px * var(--font-scale, 1)); color: var(--td-text-color-primary, #333); cursor: pointer; }
          .col-menu-item:hover { background: var(--td-bg-color-container-hover, #f5f5f5); }
          .col-menu-item.danger { color: var(--td-error-color, #e02020); }
          @media (max-width: 768px) {
            .matrix-table { font-size: calc(11px * var(--font-scale, 1)); min-width: max(100%, ${colCount * 80 + 90}px); }
            .matrix-table td { min-width: 70px; padding: 2px 2px; height: 28px; }
            .matrix-table .cell-text { font-size: calc(11px * var(--font-scale, 1)); padding: 1px 4px; }
            .matrix-table td.cell-date { min-width: 70px; width: 70px; }
          }
        `}</style>
      </div>
    );
  } catch (err: any) {
    if (!renderError) setRenderError(err?.message || String(err));
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <Alert theme="error" message={`页面渲染异常：${err?.message || '未知错误'}`} style={{ marginBottom: 16 }} />
        <Button theme="primary" onClick={() => { setData(null); setRenderError(null); }}>重试加载</Button>
      </div>
    );
  }
}
