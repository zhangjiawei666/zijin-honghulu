import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import * as db from './db-win7.js';
import { fetchRealtimeQuotes, fetchStockNames, monitor } from './monitor-win7.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const appDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
app.use(express.json());

function toMarketCode(input: string): string {
  const code = input.trim().toLowerCase();
  if (/^(sh|sz|bj)/.test(code)) return code;
  if (/^6|^9/.test(code)) return `sh${code}`;
  if (/^4|^8/.test(code)) return `bj${code}`;
  return `sz${code}`;
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), edition: '正式版' }));
app.get('/api/monitor/status', (_req, res) => res.json({ status: monitor.getStatus() }));
app.get('/api/monitor/events', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  monitor.addClient(res);
});
app.get('/api/quotes', async (_req, res) => {
  try {
    const items = db.getWatchlist();
    const quoteMap = await fetchRealtimeQuotes(items.map(item => toMarketCode(item.code)));
    res.json({ quotes: items.map(item => { const quote = quoteMap.get(toMarketCode(item.code)); return { ...item, name: quote?.name || item.name, price: quote?.price ?? null, changePct: quote?.changePct ?? null }; }), updatedAt: new Date().toISOString() });
  } catch (error: any) { res.status(502).json({ error: error?.message || '获取行情失败' }); }
});
app.get('/api/watchlist', (_req, res) => res.json({ items: db.getWatchlist() }));
app.post('/api/watchlist', (req, res) => {
  const code = String(req.body?.code || '').trim().replace(/^(sh|sz|bj)/i, '');
  const name = String(req.body?.name || '').trim();
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: '股票代码格式不正确，应为 6 位数字（如 600519）' });
  if (db.getWatchlist().some(item => item.code === code)) return res.status(409).json({ error: '该股票已在自选股中' });
  const item = db.addWatchItem({ id: uuidv4(), code, name: name || code, created_at: new Date().toISOString() });
  res.json({ item });
});
app.post('/api/watchlist/batch', async (req, res) => {
  try {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 200) : [];
    if (!rawItems.length) return res.status(400).json({ error: '请至少提供一条要导入的股票' });
    const exists = new Set(db.getWatchlist().map(item => item.code));
    const seen = new Set<string>();
    const skipped: Array<{ code: string; reason: string }> = [];
    const errors: Array<{ code: string; error: string }> = [];
    const parsed: Array<{ code: string; name: string }> = [];
    for (const raw of rawItems) {
      const code = String(raw?.code || '').trim().replace(/^(sh|sz|bj)/i, '');
      const name = String(raw?.name || '').trim();
      if (!/^\d{6}$/.test(code)) { errors.push({ code, error: '代码格式不正确' }); continue; }
      if (seen.has(code) || exists.has(code)) { skipped.push({ code, reason: '已在自选股中或本次重复' }); continue; }
      seen.add(code); parsed.push({ code, name });
    }
    const names = await fetchStockNames(parsed.filter(item => !item.name).map(item => item.code)).catch(() => new Map<string, string>());
    const now = new Date().toISOString();
    const addedCount = db.addWatchItemsBulk(parsed.map(item => ({ id: uuidv4(), code: item.code, name: item.name || names.get(item.code) || item.code, created_at: now })));
    res.json({ addedCount, skipped, errors });
  } catch (error: any) { res.status(500).json({ error: error?.message || '批量导入失败' }); }
});
app.delete('/api/watchlist/:id', (req, res) => { if (!db.deleteWatchItem(req.params.id)) return res.status(404).json({ error: '自选股不存在' }); res.json({ success: true }); });
app.post('/api/monitor/run', async (_req, res) => { try { res.json(await monitor.runCheck('manual')); } catch (error: any) { res.status(500).json({ error: error?.message || '巡检失败' }); } });
app.post('/api/monitor/toggle', (req, res) => { monitor.setEnabled(Boolean(req.body?.enabled)); res.json({ enabled: monitor.isEnabled() }); });
app.get('/api/monitor/runs', (_req, res) => res.json({ runs: db.getRecentRuns(20) }));
app.get('/api/monitor/signals', (_req, res) => res.json({ signals: db.getRecentSignals(50) }));

const distDir = path.join(appDir, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.listen(port, '127.0.0.1', () => {
  console.log(`[正式版] 服务已启动：http://127.0.0.1:${port}`);
  monitor.start();
});
