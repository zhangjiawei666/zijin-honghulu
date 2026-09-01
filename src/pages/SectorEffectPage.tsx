import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Input, MessagePlugin, Tooltip } from 'tdesign-react';
import { Flame, Loader, RefreshCw, Search, Clock, Database, History } from 'lucide-react';

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
  source: string | null;     // 区分「腾讯文档模板历史」与「东财实时抓取」
  dayType: DayType;          // 日期类型，决定整行渲染方式
  isToday: boolean;          // 是否为今天（自动滚动定位锚点）
  cells: (SectorCell | null)[];
}

/** 休市日的展示文案与配色 */
const DAY_TYPE_STYLE: Record<DayType, { label: string; bg: string; fg: string } | null> = {
  trading: null,
  weekend: { label: '周末休市', bg: '#f5f5f5', fg: '#8c8c8c' },
  holiday: { label: '节假日休市', bg: '#fff7e6', fg: '#d46b08' },
  today: { label: '今日待更新', bg: '#f9f0ff', fg: '#722ed1' },
};

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 由 YYYY/M/D 推算星期，用于日期列辅助显示 */
function weekdayOf(display: string): string {
  const parts = String(display || '').split('/').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return '';
  const [y, m, d] = parts;
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] || '';
}

interface MatrixData {
  mode: 'matrix' | 'single';
  rows: MatrixRow[];
  columns: string[];         // ['板块1', '板块2', ...]
  maxCols: number;
  totalDates: number;
  stats?: {                  // 日期类型统计
    trading: number;
    weekend: number;
    holiday: number;
    today: number;
  };
  source: string;
  generatedAt?: string;
  note?: string;
  error?: string;
  // single mode fields
  requestedDate?: string;
  date?: string;
  substitutedDate?: string | null;
  totalLimitUp?: number;
  sectors?: SectorCell[];
}

/** 单日查询结果（用于单日模式回显） */
interface SingleDayData {
  requestedDate: string;
  date: string;
  substitutedDate: string | null;
  totalLimitUp: number;
  sectors: SectorCell[];
  source: string;
  generatedAt: string;
  note: string;
}

const UP_COLOR = '#e02020';       // 涨停红（A股惯例）
const CELL_BG_TOP = '#fff1f0';    // 前三名板块浅红底
const CELL_BG_MID = '#f0f5ff';    // 中间板块浅蓝底
const CELL_BG_NORMAL = '#fafafa'; // 普通灰底

export function SectorEffectPage() {
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [data, setData] = useState<MatrixData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const todayRowRef = useRef<HTMLTableRowElement | null>(null);

  // 表格为正序（最早日期在顶部），打开时自动滚动定位到今天，
  // 免得每次都要手动翻几百行才能看到最新数据。
  // 使用手动 offset 计算而非 scrollIntoView，避免 sticky 表头/首列干扰。
  useEffect(() => {
    if (data?.mode !== 'matrix' || !data.rows?.length) return;
    const timer = setTimeout(() => scrollToToday(), 150);
    return () => clearTimeout(timer);
  }, [data, scrollToToday]);

  /** 回到表格顶部（最早日期） */
  const scrollToTop = () => {
    wrapperRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** 跳到今天所在行（手动计算偏移量，避免 scrollIntoView 在 sticky 表格中失效） */
  const scrollToToday = useCallback(() => {
    const row = todayRowRef.current;
    const wrapper = wrapperRef.current;
    if (!row || !wrapper) return;
    // 用 offsetTop 相对滚动容器计算目标位置，居中显示
    const rowTop = row.offsetTop - wrapper.offsetTop;
    wrapper.scrollTo({
      top: rowTop - wrapper.clientHeight / 2 + row.offsetHeight / 2,
      behavior: 'smooth',
    });
  }, []);

  // 加载矩阵数据（历史全部）
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

  // 手动刷新（抓取最新数据并保留历史）
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

      // 刷新矩阵视图
      await loadMatrix();
    } catch (err: any) {
      setError(err?.message || '更新失败');
      MessagePlugin.error(err?.message || '更新失败');
    } finally {
      setRefreshing(false);
    }
  };

  // 导入内置历史基线（2026 腾讯文档模板）
  // force=true 时用模板数据覆盖同日期已有记录；默认只补齐缺失日期
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

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  /**
   * 安全计算列数。
   * 关键：单日查询模式（mode='single'）下后端只返回 sectors、不返回 columns，
   * 早期版本在这里直接取 data.columns.length 会抛 TypeError 导致整页白屏。
   */
  const colCount = Math.max(
    data?.columns?.length ?? 0,
    data?.sectors?.length ?? 0,
    11,
  );

  /** 来源统计：区分「腾讯文档模板历史」与「东财实时抓取」两种口径 */
  const historyCount = data?.rows?.filter(r => r.source?.includes('腾讯文档')).length ?? 0;
  const liveCount = (data?.rows?.length ?? 0) - historyCount;

  /** 渲染单个单元格 */
  const renderCell = (cell: SectorCell | null, colIndex: number, rowIndex: number) => {
    if (!cell) return <td key={colIndex} className="sector-cell empty" />;

    // 根据列位置决定背景色（前3列红色系，中间蓝色系，其余灰色）
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
          数据自动保留在本地，支持手动刷新更新。不把涨停家数直接等同于板块强度或买卖建议。
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
          <Button
            size="large"
            theme="primary"
            icon={<Search size={16} />}
            loading={loading}
            disabled={loading}
            onClick={handleQuery}
          >
            查询
          </Button>
          <Button
            size="large"
            icon={<RefreshCw size={16} />}
            loading={refreshing}
            disabled={refreshing || loading}
            onClick={handleRefresh}
          >
            {refreshing ? '更新中...' : '手动更新'}
          </Button>
          <Button
            size="large"
            variant="outline"
            icon={<Database size={16} />}
            disabled={loading}
            onClick={loadMatrix}
          >
            查看全部
          </Button>
          <Tooltip content="导入 2026 年腾讯文档模板历史数据（仅补齐缺失日期，不覆盖已有记录）">
            <Button
              size="large"
              variant="outline"
              icon={<History size={16} />}
              loading={importing}
              disabled={importing || loading}
              onClick={() => handleImportHistory(false)}
            >
              导入历史
            </Button>
          </Tooltip>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--td-text-color-placeholder)' }}>
            <Clock size={14} />
            <span>交易日 08:00 自动更新</span>
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

      {/* 矩阵表格 */}
      {data && data.mode === 'matrix' && (
        <>
          {data.rows.length === 0 ? (
            <Card bordered>
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <Database size={40} style={{ margin: '0 auto 12px', color: 'var(--td-text-color-placeholder)' }} />
                <p style={{ fontSize: 14, color: 'var(--td-text-color-secondary)' }}>{data.note || '暂无数据'}</p>
                <Button theme="primary" icon={<RefreshCw size={16} />} onClick={handleRefresh} style={{ marginTop: 12 }}>
                  获取最新数据
                </Button>
              </div>
            </Card>
          ) : (
            <Card bordered style={{ overflow: 'auto' }}>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, color: 'var(--td-text-color-secondary)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span>共 <strong style={{ color: 'var(--td-text-color-primary)' }}>{data.totalDates}</strong> 天</span>
                  <span>&nbsp;·&nbsp;</span>
                  <span>交易日 <strong style={{ color: 'var(--td-text-color-primary)' }}>{data.stats?.trading ?? 0}</strong></span>
                  <span>&nbsp;·&nbsp;</span>
                  <span>周末休市 <strong style={{ color: 'var(--td-text-color-primary)' }}>{data.stats?.weekend ?? 0}</strong></span>
                  <span>&nbsp;·&nbsp;</span>
                  <span>节假日 <strong style={{ color: 'var(--td-text-color-primary)' }}>{data.stats?.holiday ?? 0}</strong></span>
                  <span>&nbsp;·&nbsp;</span>
                  <span><strong style={{ color: 'var(--td-text-color-primary)' }}>{data.maxCols}</strong> 个板块列</span>
                  {historyCount > 0 && (
                    <>
                      <span>&nbsp;·&nbsp;</span>
                      <span>模板历史 <strong style={{ color: 'var(--td-text-color-primary)' }}>{historyCount}</strong> 天</span>
                    </>
                  )}
                  {liveCount > 0 && (
                    <>
                      <span>&nbsp;·&nbsp;</span>
                      <span>实时抓取 <strong style={{ color: UP_COLOR }}>{liveCount}</strong> 天</span>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                    <Button size="small" variant="outline" onClick={scrollToTop}>
                      回到顶部
                    </Button>
                    <Button size="small" variant="outline" onClick={scrollToToday}>
                      跳到今天
                    </Button>
                  </div>
                </div>
                {data.generatedAt && (
                  <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder)' }}>
                    更新于 {new Date(data.generatedAt).toLocaleString('zh-CN')}
                  </div>
                )}
              </div>

              <div className="matrix-table-wrapper" ref={wrapperRef}>
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th className="col-date">时间</th>
                      {data.columns.map((col, i) => (
                        <th key={i} className={`col-sector ${i < 3 ? 'col-top' : i < 7 ? 'col-mid' : ''}`}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, ri) => {
                      const restStyle = DAY_TYPE_STYLE[row.dayType];

                      // 休市日：整行跨列显示状态文案，保持日期轴连续
                      if (restStyle) {
                        return (
                          <tr key={row.dateToken} ref={row.isToday ? todayRowRef : undefined}>
                            <td className="cell-date" style={{ backgroundColor: restStyle.bg }}>
                              <span className="date-text" style={{ color: restStyle.fg }}>
                                {row.date}
                              </span>
                              <span className="date-week" style={{ color: restStyle.fg }}>
                                {weekdayOf(row.date)}
                              </span>
                            </td>
                            <td
                              className="rest-cell"
                              colSpan={data.maxCols}
                              style={{ backgroundColor: restStyle.bg, color: restStyle.fg }}
                            >
                              {restStyle.label}
                              {row.dayType === 'today' && ' · 交易日 08:00 自动更新'}
                            </td>
                          </tr>
                        );
                      }

                      // 交易日：正常渲染各板块单元格
                      return (
                        <tr key={row.dateToken} ref={row.isToday ? todayRowRef : undefined}>
                          <td className="cell-date">
                            <Tooltip content={`来源：${row.source || '未知'}`}>
                              <span
                                className="src-dot"
                                style={{ backgroundColor: row.source?.includes('腾讯文档') ? '#bfbfbf' : UP_COLOR }}
                              />
                            </Tooltip>
                            <span className="date-text">{row.date}</span>
                            <span className="date-week">{weekdayOf(row.date)}</span>
                            {row.substitutedDate && (
                              <Tooltip content={`实际数据日期: ${row.substitutedDate}`}>
                                <span className="date-subst">※</span>
                              </Tooltip>
                            )}
                          </td>
                          {row.cells.map((cell, ci) => renderCell(cell, ci, ri))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {data.note && (
                <div
                  style={{
                    marginTop: 16,
                    paddingTop: 12,
                    borderTop: '1px solid var(--td-component-stroke)',
                    fontSize: 12,
                    lineHeight: 1.8,
                    color: 'var(--td-text-color-placeholder)'
                  }}
                >
                  <div>{data.note}</div>
                  <div style={{ marginTop: 4 }}>以上内容基于公开行情数据统计，仅供研究参考，不构成投资建议。市场有风险，投资需谨慎。</div>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* 单日查询结果回退展示 */}
      {data && data.mode === 'single' && (
        <Card bordered>
          <div style={{ marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--td-text-color-placeholder)' }}>统计日期</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--td-text-color-primary)' }}>{data.date}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--td-text-color-placeholder)' }}>涨停总数</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: UP_COLOR }}>{data.totalLimitUp ?? 0} 只</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--td-text-color-placeholder)' }}>涉及板块</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--td-text-color-primary)' }}>{data.sectors?.length ?? 0} 个</div>
            </div>
          </div>

          {data.substitutedDate && (
            <Alert theme="warning" message={`${data.requestedDate} 无有效收盘数据，已改用 ${data.substitutedDate}`} style={{ marginBottom: 12 }} />
          )}

          {/* 无板块数据时给出明确说明，而不是渲染一张空表 */}
          {(!data.sectors || data.sectors.length === 0) ? (
            <Alert theme="info" message={data.note || '该日期暂无有效涨停数据'} style={{ marginBottom: 12 }} />
          ) : (
            <div className="matrix-table-wrapper">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th className="col-date">时间</th>
                    {data.sectors.slice(0, 17).map((sec, i) => (
                      <th key={i} className={`col-sector ${i < 3 ? 'col-top' : i < 7 ? 'col-mid' : ''}`}>板块{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="cell-date"><span className="date-text">{String(data.date ?? '').replace(/(\d{4})(\d{2})(\d{2})/, '$1/$2/$3')}</span></td>
                    {data.sectors.slice(0, 17).map((sec, i) => renderCell(sec, i, 0))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <Button variant="outline" icon={<Database size={16} />} onClick={loadMatrix} style={{ marginTop: 12 }}>
            查看全部历史数据
          </Button>
        </Card>
      )}

      {/* 内联样式 */}
      <style>{`
        .matrix-table-wrapper {
          overflow: auto;
          -webkit-overflow-scrolling: touch;
          /* 历史数据可达数百行，限制视口高度并双向冻结表头/首列，避免整页被撑得过长 */
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

        /* 表头左上角单元格需同时冻结行列，z-index 必须高于普通表头(10)和首列(5) */
        .matrix-table thead th.col-date {
          background: var(--td-brand-color-light, #e6f7ff);
          min-width: 90px;
          width: 90px;
          position: sticky;
          top: 0;
          left: 0;
          z-index: 15;
        }

        .matrix-table thead th.col-top {
          background: #fff1f0;
          color: #cf1322;
        }

        .matrix-table thead th.col-mid {
          background: #f0f5ff;
          color: #2f54eb;
        }

        .matrix-table tbody tr:hover {
          background: var(--td-bg-color-container-hover, #fafafa);
        }

        .matrix-table td {
          border: 1px solid var(--td-component-stroke, #e7e7e7);
          padding: 4px 4px;
          text-align: center;
          vertical-align: middle;
          height: 34px;
          min-width: 100px;
          white-space: nowrap;
        }

        .matrix-table td.sector-cell.empty {
          background: #fafafa !important;
        }

        .matrix-table td.cell-date {
          background: var(--td-brand-color-light, #e6f7ff);
          font-weight: 500;
          position: sticky;
          left: 0;
          z-index: 5;
          min-width: 90px;
          width: 90px;
        }

        .matrix-table .date-text {
          font-size: 12px;
          color: var(--td-text-color-primary, #333);
          font-variant-numeric: tabular-nums;
        }

        /* 星期，作为日期的辅助信息弱化处理 */
        .matrix-table .date-week {
          font-size: 10px;
          margin-left: 4px;
          opacity: 0.7;
        }

        /* 休市日跨列单元格：整行居中显示休市原因 */
        .matrix-table td.rest-cell {
          text-align: center;
          font-size: 12px;
          letter-spacing: 0.5px;
          height: 30px;
        }

        /* 来源圆点：灰=腾讯文档模板历史，红=东财实时抓取 */
        .matrix-table .src-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          margin-right: 4px;
          vertical-align: middle;
          flex-shrink: 0;
        }

        .matrix-table .date-subst {
          font-size: 10px;
          color: var(--td-warning-color, #e37318);
          cursor: help;
          margin-left: 2px;
        }

        .matrix-table .cell-text {
          font-size: 12.5px;
          font-weight: 500;
          cursor: default;
          display: inline-block;
          padding: 2px 8px;
          border-radius: 3px;
          line-height: 1.6;
          transition: transform 0.15s ease;
        }

        .matrix-table .cell-text:hover {
          transform: scale(1.06);
        }

        /* 涨停数字用红色强调 */
        .matrix-table .cell-text::after {
          content: attr(data-count);
          display: none;
        }

        @media (max-width: 768px) {
          .matrix-table {
            font-size: 11px;
            min-width: max(100%, ${colCount * 80 + 90}px);
          }
          .matrix-table td {
            min-width: 70px;
            padding: 2px 2px;
            height: 28px;
          }
          .matrix-table .cell-text {
            font-size: 11px;
            padding: 1px 4px;
          }
          .matrix-table td.cell-date {
            min-width: 70px;
            width: 70px;
          }
        }
      `}</style>
    </div>
  );
}
