import { useState } from 'react';
import {
  Card, Button, Input, Tag, Switch, MessagePlugin, Empty, Tooltip, Table, Dialog, Textarea,
} from 'tdesign-react';
import { AddIcon, DeleteIcon, RefreshIcon, UploadIcon, ClearIcon } from 'tdesign-icons-react';
import { useMonitor, MonitorStatus, WatchItem, MonitorRun, BuySignal } from '../hooks/useMonitor';

// ============= 状态卡片 =============

function StatusCard({ status, onToggle, onRefresh }: {
  status: MonitorStatus | null;
  onToggle: (enabled: boolean) => void;
  onRefresh: () => void;
}) {
  if (!status) return null;

  const tradingInfo = !status.isTradingDay
    ? { text: '非交易日（周末）', color: 'default' as const }
    : status.isTradingTime
      ? { text: '交易时段进行中', color: 'success' as const }
      : { text: '非交易时段（休市/午休）', color: 'warning' as const };

  const sourceText = status.source === 'agent' ? 'Agent 智能分析' : status.source === 'builtin' ? '内置行情' : '无';

  return (
    <Card title="监控状态" className="monitor-card">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>自动巡检</span>
            <Switch value={status.enabled} onChange={(v) => onToggle(Boolean(v))} />
          </div>
          <Tooltip content="立即执行一次巡检（不受交易时段限制）">
            <Button size="small" theme="primary" variant="outline" icon={<RefreshIcon />} onClick={onRefresh}>
              立即巡检
            </Button>
          </Tooltip>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatusItem label="交易状态" value={tradingInfo.text} color={tradingInfo.color} />
          <StatusItem label="下次巡检" value={formatTime(status.nextRunAt)} color="default" />
          <StatusItem label="最近巡检" value={formatTime(status.lastRunAt)} color="default" />
          <StatusItem label="数据源" value={sourceText} color="default" />
        </div>

        {status.isRunning && (
          <div className="text-sm" style={{ color: 'var(--td-brand-color)' }}>
            ⏳ 正在巡检自选股行情...
          </div>
        )}
        {!status.isRunning && status.lastRunSummary && (
          <div className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
            上次结果：{status.lastRunSummary}
          </div>
        )}
        {status.watchCount === 0 && (
          <div className="text-sm" style={{ color: 'var(--td-error-color)' }}>
            自选股为空，请先在下方添加需要监控的股票
          </div>
        )}
      </div>
    </Card>
  );
}

function StatusItem({ label, value, color }: { label: string; value: string; color: 'success' | 'warning' | 'error' | 'default' }) {
  const colorMap: Record<string, string> = {
    success: 'var(--td-success-color)',
    warning: 'var(--td-warning-color)',
    error: 'var(--td-error-color)',
    default: 'var(--td-text-color-primary)',
  };
  return (
    <div className="flex flex-col gap-1 p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-container-hover)' }}>
      <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: colorMap[color] }}>{value || '—'}</span>
    </div>
  );
}

// ============= 自选股管理 =============

// 解析批量导入文本：每行一条，支持 空格/逗号/Tab 分隔「代码 名称」，忽略空行和 #、// 注释
interface ParsedLine {
  code: string;      // 原始输入（可能带 sh/sz/bj 前缀）
  name: string;
  valid: boolean;    // 是否为合法 6 位代码
  duplicate: boolean; // 本次导入内是否重复
}

function parseWatchText(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const parts = line.split(/[,，\t\s]+/).filter(Boolean);
    const codeRaw = (parts[0] || '').trim();
    const name = parts.slice(1).join(' ').trim();
    const code = codeRaw.replace(/^(sh|sz|bj)/i, '').trim();
    const valid = /^\d{6}$/.test(code);
    const duplicate = valid && seen.has(code);
    out.push({ code: codeRaw, name, valid, duplicate });
    if (valid) seen.add(code);
  }
  return out;
}

const IMPORT_EXAMPLE = `600519 贵州茅台
000858,五粮液
300750 宁德时代
601318 中国平安
sh600036 招商银行`;

/** 批量导入对话框：文本粘贴 / 文件导入 → 解析预览 → 提交 */
function BatchImportDialog({ visible, onClose, onImport }: {
  visible: boolean;
  onClose: () => void;
  onImport: (items: { code: string; name?: string }[]) => Promise<{
    ok: boolean;
    addedCount?: number;
    skipped?: { code: string; name?: string; reason: string }[];
    errors?: { code: string; name?: string; error: string }[];
    error?: string;
  }>;
}) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedLine[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: any[]; errors: any[] } | null>(null);

  const handleTextChange = (v: string) => {
    setText(v);
    setParsed(parseWatchText(v));
    setResult(null);
  };

  // 读取 .txt / .csv 文件（兼容 UTF-8 与 GBK 编码）
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const utf8 = new TextDecoder('utf-8').decode(buf);
      const content = utf8.includes('\uFFFD') ? new TextDecoder('gbk').decode(buf) : utf8;
      handleTextChange(content);
      MessagePlugin.success(`已读取 ${file.name}`);
    } catch {
      MessagePlugin.error('文件读取失败，请使用 .txt 或 .csv 文本文件');
    }
  };

  const validItems = parsed.filter(p => p.valid && !p.duplicate);
  const invalidCount = parsed.filter(p => !p.valid).length;
  const duplicateCount = parsed.filter(p => p.valid && p.duplicate).length;

  const handleImport = async () => {
    if (validItems.length === 0) {
      MessagePlugin.warning('没有可导入的有效条目，请检查输入格式');
      return;
    }
    setImporting(true);
    try {
      const res = await onImport(validItems.map(p => ({ code: p.code, name: p.name || undefined })));
      if (!res.ok) {
        MessagePlugin.error(res.error || '导入失败');
      } else {
        const added = res.addedCount ?? 0;
        setResult({ added, skipped: res.skipped || [], errors: res.errors || [] });
        MessagePlugin.success(`导入成功：${added} 只`);
      }
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (importing) return;
    setText('');
    setParsed([]);
    setResult(null);
    onClose();
  };

  return (
    <Dialog header="批量导入自选股" visible={visible} onClose={handleClose} width={680} footer={null}>
      <div className="flex flex-col gap-3">
        {/* 输入区 */}
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
            每行一只股票，格式：<code className="px-1 rounded" style={{ backgroundColor: 'var(--td-bg-color-container-hover)' }}>代码 名称</code>（名称可省略，导入时自动补全）
          </span>
          <Button size="small" variant="text" onClick={() => handleTextChange(IMPORT_EXAMPLE)}>
            填入示例
          </Button>
        </div>
        <Textarea
          value={text}
          onChange={(v) => handleTextChange(v as string)}
          placeholder={'示例：\n600519 贵州茅台\n000858 五粮液\n300750 宁德时代\n\n也支持 sh600519、600519,贵州茅台、Tab 分隔，或从通达信导出的自选股文本'}
          autosize={{ minRows: 7, maxRows: 12 }}
          disabled={importing}
        />

        {/* 文件导入 */}
        <div className="flex items-center gap-3">
          <label
            className="flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer text-sm border border-dashed"
            style={{ borderColor: 'var(--td-component-stroke-color)', color: 'var(--td-text-color-secondary)' }}
          >
            <UploadIcon />
            从文件导入（.txt / .csv）
            <input
              type="file"
              accept=".txt,.csv,.tsv"
              onChange={handleFile}
              className="hidden"
              disabled={importing}
            />
          </label>
          <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
            支持通达信导出的自选股文件（UTF-8 / GBK 均可）
          </span>
        </div>

        {/* 解析统计 + 预览 */}
        {parsed.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 text-sm">
              <Tag theme="success" variant="light">有效 {validItems.length}</Tag>
              {duplicateCount > 0 && <Tag theme="warning" variant="light">本次重复 {duplicateCount}</Tag>}
              {invalidCount > 0 && <Tag theme="danger" variant="light">格式错误 {invalidCount}</Tag>}
            </div>
            <div
              className="max-h-48 overflow-y-auto rounded-lg border"
              style={{ borderColor: 'var(--td-component-stroke-color)' }}
            >
              {parsed.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-1.5 text-sm"
                  style={{
                    backgroundColor: !p.valid
                      ? 'var(--td-error-color-1)'
                      : p.duplicate
                        ? 'var(--td-warning-color-1)'
                        : i % 2 === 0
                          ? 'var(--td-bg-color-container)'
                          : 'var(--td-bg-color-container-hover)',
                  }}
                >
                  <span style={{ color: 'var(--td-text-color-primary)' }}>
                    <span className="font-mono">{p.code}</span>
                    {p.name && <span className="ml-2">{p.name}</span>}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                    {!p.valid ? '代码格式错误' : p.duplicate ? '本次重复' : '待导入'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 导入结果 */}
        {result && (
          <div className="flex flex-col gap-2 rounded-lg p-3" style={{ backgroundColor: 'var(--td-success-color-1)' }}>
            <div className="text-sm font-medium" style={{ color: 'var(--td-success-color)' }}>
              ✅ 导入完成：成功 {result.added} 只
            </div>
            {result.skipped.length > 0 && (
              <div className="text-xs" style={{ color: 'var(--td-warning-color)' }}>
                跳过 {result.skipped.length} 只：{result.skipped.map((s: any) => `${s.code}（${s.reason}）`).join('、')}
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="text-xs" style={{ color: 'var(--td-error-color)' }}>
                失败 {result.errors.length} 只：{result.errors.map((e: any) => `${e.code}（${e.error}）`).join('、')}
              </div>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            关闭
          </Button>
          <Button theme="primary" icon={<AddIcon />} onClick={handleImport} loading={importing} disabled={importing}>
            导入 {validItems.length > 0 ? `（${validItems.length} 只）` : ''}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function WatchlistCard({ watchlist, loading, onAdd, onRemove, onBatchImport }: {
  watchlist: WatchItem[];
  loading: boolean;
  onAdd: (code: string, name?: string) => Promise<{ ok: boolean; error?: string }>;
  onRemove: (id: string) => Promise<void>;
  onBatchImport: (items: { code: string; name?: string }[]) => Promise<{
    ok: boolean;
    addedCount?: number;
    skipped?: { code: string; name?: string; reason: string }[];
    errors?: { code: string; name?: string; error: string }[];
    error?: string;
  }>;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [batchVisible, setBatchVisible] = useState(false);

  const handleAdd = async () => {
    if (!code.trim()) {
      MessagePlugin.warning('请输入股票代码');
      return;
    }
    const result = await onAdd(code.trim(), name.trim() || undefined);
    if (result.ok) {
      MessagePlugin.success('已添加到自选股');
      setCode('');
      setName('');
    } else {
      MessagePlugin.error(result.error || '添加失败');
    }
  };

  return (
    <Card title={`自选股监控列表（${watchlist.length}）`} className="monitor-card">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="股票代码，如 600519"
            value={code}
            onChange={(v) => setCode(v as string)}
            style={{ maxWidth: 200 }}
          />
          <Input
            placeholder="名称（可选）"
            value={name}
            onChange={(v) => setName(v as string)}
            style={{ maxWidth: 200 }}
          />
          <Button icon={<AddIcon />} onClick={handleAdd} loading={loading} disabled={loading}>
            添加
          </Button>
          <Button icon={<UploadIcon />} variant="outline" onClick={() => setBatchVisible(true)} disabled={loading}>
            批量导入
          </Button>
        </div>

        {watchlist.length === 0 ? (
          <Empty description="暂无自选股，添加后即可在交易时段自动巡检" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {watchlist.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--td-bg-color-container-hover)' }}
              >
                <span className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>{item.name}</span>
                <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>{item.code}</span>
                <Tooltip content="移除">
                  <Button
                    size="small" variant="text" shape="circle"
                    icon={<DeleteIcon />}
                    onClick={() => onRemove(item.id).then(() => MessagePlugin.success('已移除'))}
                  />
                </Tooltip>
              </div>
            ))}
          </div>
        )}

        <BatchImportDialog
          visible={batchVisible}
          onClose={() => setBatchVisible(false)}
          onImport={onBatchImport}
        />
      </div>
    </Card>
  );
}

// ============= 买点信号 =============

function SignalsCard({ signals, onClear }: { signals: BuySignal[]; onClear: () => void }) {
  const columns = [
    { colKey: 'time', title: '时间', width: 150, cell: ({ row }: any) => formatTime(row.created_at) },
    { colKey: 'name', title: '股票', width: 130, cell: ({ row }: any) => (
      <span>
        <span className="font-medium" style={{ color: 'var(--td-text-color-primary)' }}>{row.name}</span>{' '}
        <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>{row.code}</span>
      </span>
    )},
    { colKey: 'signal_type', title: '信号', width: 180, cell: ({ row }: any) => (
      <Tag theme="danger" variant="light">{row.signal_type}</Tag>
    )},
    { colKey: 'price', title: '价格', width: 90, cell: ({ row }: any) => row.price ? `¥${Number(row.price).toFixed(2)}` : '—' },
    { colKey: 'source', title: '来源', width: 130, cell: ({ row }: any) => (
      row.source === 'agent'
        ? <Tag theme="primary" variant="light">Agent 智能</Tag>
        : <Tag theme="success" variant="light">内置行情</Tag>
    )},
    { colKey: 'reason', title: '触发原因', ellipsis: true, cell: ({ row }: any) => (
      <span style={{ color: 'var(--td-text-color-secondary)' }}>{row.reason}</span>
    )},
  ];

  return (
    <Card
      title={
        <div className="flex items-center justify-between gap-3">
          <span>买点信号提醒（{signals.length}）</span>
          <Button
            size="small"
            variant="outline"
            icon={<ClearIcon />}
            onClick={onClear}
            disabled={signals.length === 0}
          >
            一键清除弹窗
          </Button>
        </div>
      }
      className="monitor-card"
    >
      {signals.length === 0 ? (
        <Empty description="暂无买点信号。出现买点时，页面会自动弹窗提醒您" />
      ) : (
        <Table
          data={signals}
          columns={columns as any}
          rowKey="id"
          size="medium"
          hover
        />
      )}
    </Card>
  );
}

// ============= 运行历史 =============

function RunsCard({ runs }: { runs: MonitorRun[] }) {
  const columns = [
    { colKey: 'started_at', title: '开始时间', width: 170, cell: ({ row }: any) => formatTime(row.started_at) },
    { colKey: 'trigger', title: '触发方式', width: 110, cell: ({ row }: any) => (
      <Tag variant="light">
        {row.trigger === 'schedule' ? '定时' : row.trigger === 'manual' ? '手动' : '启动'}
      </Tag>
    )},
    { colKey: 'status', title: '状态', width: 90, cell: ({ row }: any) => (
      row.status === 'running'
        ? <Tag theme="warning" variant="light">运行中</Tag>
        : <Tag theme="success" variant="light">完成</Tag>
    )},
    { colKey: 'summary', title: '结果', ellipsis: true, cell: ({ row }: any) => (
      <span style={{ color: 'var(--td-text-color-secondary)' }}>{row.summary || '—'}</span>
    )},
  ];

  return (
    <Card title="巡检历史" className="monitor-card">
      {runs.length === 0 ? (
        <Empty description="暂无巡检记录" />
      ) : (
        <Table
          data={runs}
          columns={columns as any}
          rowKey="id"
          size="medium"
          hover
        />
      )}
    </Card>
  );
}

// ============= 工具函数 =============

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return '—';
  }
}

// ============= 页面 =============

export function MonitorPage() {
  const { status, watchlist, runs, signals, loading, triggerRun, toggleMonitor, addWatchItem, batchAddWatchItems, removeWatchItem, clearAlerts } = useMonitor();

  return (
    <div className="monitor-page">
      <div className="monitor-content">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
            自选股行情监控
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--td-text-color-secondary)' }}>
            交易时段每 30 分钟自动巡检一次，发现符合条件的买点后立即提醒
          </p>
        </div>

        <StatusCard
          status={status}
          onToggle={toggleMonitor}
          onRefresh={() => triggerRun()}
        />

        <WatchlistCard
          watchlist={watchlist}
          loading={loading}
          onAdd={addWatchItem}
          onRemove={removeWatchItem}
          onBatchImport={batchAddWatchItems}
        />

        <SignalsCard signals={signals} onClear={() => {
          clearAlerts();
          MessagePlugin.success('已清除当前弹窗和页面买点提醒');
        }} />
        <RunsCard runs={runs} />
      </div>
    </div>
  );
}
