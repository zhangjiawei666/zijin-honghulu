/**
 * 紫金红葫芦-正式版主进程
 * Win7 兼容版：Electron 22 + 内置 Node 16 + 固定规则行情服务。
 */
import { app, BrowserWindow, Notification, ipcMain, session } from 'electron';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let serverProcess = null;
let flashTimer = null;

function notifyBuySignal(payload = {}) {
  const title = payload.title || '买点提醒';
  const body = payload.body || '';
  try {
    if (Notification.isSupported()) {
      const notification = new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png') });
      notification.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      });
      notification.show();
    }
  } catch (error) { console.error('[正式版] 系统通知失败:', error?.message || error); }

  if (mainWindow && !mainWindow.isFocused() && !mainWindow.isDestroyed()) {
    try {
      mainWindow.flashFrame(true);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(false); }, 12000);
    } catch (error) { console.error('[正式版] 任务栏提醒失败:', error?.message || error); }
  }
}

function registerIpc() {
  ipcMain.on('buy-signal', (_event, payload) => notifyBuySignal(payload));
}

function findFreePort(preferred = 3000) {
  return new Promise(resolve => {
    const probe = port => {
      const server = net.createServer();
      server.once('error', () => probe(0));
      server.listen(port, '127.0.0.1', () => {
        const actual = server.address().port;
        server.close(() => resolve(actual));
      });
    };
    probe(preferred);
  });
}

function waitForPort(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const client = new net.Socket();
      client.once('connect', () => { client.destroy(); resolve(); });
      client.once('error', () => {
        client.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`端口 ${port} 在 ${timeoutMs}ms 内未就绪`));
        else setTimeout(check, 200);
      });
      client.connect(port, '127.0.0.1');
    };
    check();
  });
}

async function startServer(port) {
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const unpackedServer = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-server', 'win7-server.cjs');
  const packagedServer = path.join(__dirname, '..', 'dist-server', 'win7-server.cjs');
  const devServer = path.join(__dirname, '..', 'dist-server', 'win7-server.cjs');
  const serverMod = fs.existsSync(unpackedServer) ? unpackedServer : (fs.existsSync(packagedServer) ? packagedServer : devServer);
  serverProcess = spawn(process.execPath, [serverMod], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port), STOCK_MONITOR_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  serverProcess.stdout?.on('data', data => console.log(`[服务] ${data.toString().trim()}`));
  serverProcess.stderr?.on('data', data => console.error(`[服务] ${data.toString().trim()}`));
  serverProcess.on('error', error => console.error('[正式版] 服务启动失败:', error));
  await waitForPort(port);
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  serverProcess = null;
}

async function createWindow() {
  const port = await findFreePort(3000);
  await startServer(port);
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    title: '紫金红葫芦-正式版',
    autoHideMenuBar: true,
    backgroundColor: '#f9f3e9',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.mjs'), nodeIntegration: false, contextIsolation: true },
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.workbuddy.stockmonitor.formal');
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === 'notifications'));
  registerIpc();
  createWindow().catch(error => { console.error('[正式版] 启动失败:', error); app.quit(); });
});

app.on('window-all-closed', () => { stopServer(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', stopServer);
