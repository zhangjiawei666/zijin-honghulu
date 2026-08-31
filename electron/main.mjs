/**
 * 自选股行情监控 - 桌面版主进程
 * 负责：分配端口 → 启动内置 API 服务（独立 Node 子进程） → 打开应用窗口 → 系统通知权限
 */
import { app, BrowserWindow, session, dialog, Notification, ipcMain, shell } from 'electron';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !!process.env.VITE_DEV_SERVER_URL;

let mainWindow = null;
let serverProcess = null;
let flashTimer = null;

/** 买点提醒：系统通知 + 任务栏闪动 + 提示音（微信消息式提醒） */
function showBuySignalNotification(payload = {}) {
  const title = payload.title || '买点提醒';
  const body = payload.body || '';

  console.log(`[Main] 收到买点信号通知: ${title}`);

  // 1. 系统级通知（Windows 右下角 Toast，自带系统提示音；即使窗口不在前台也能看到）
  try {
    if (Notification.isSupported()) {
      const n = new Notification({
        title,
        body,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        urgency: 'critical',
        timeoutType: 'default',
        silent: false, // 播放系统通知声音
      });
      n.on('click', () => {
        // 点击通知 → 唤起并聚焦主窗口
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      });
      n.show();
    }
  } catch (e) {
    console.error('[Main] 系统通知失败:', e?.message || e);
  }

  // 2. 任务栏闪烁（窗口不在前台时，最多闪 12 秒或直到用户聚焦）
  if (mainWindow && !mainWindow.isFocused() && !mainWindow.isDestroyed()) {
    try {
      mainWindow.flashFrame(true);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(false);
      }, 12000);
      mainWindow.once('focus', () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(false);
      });
    } catch (e) {
      console.error('[Main] 任务栏闪烁失败:', e?.message || e);
    }
  }
}

/** 注册 IPC：渲染进程上报买点信号 / 导出 PDF 报告 */
function registerIpcHandlers() {
  ipcMain.on('buy-signal', (_event, payload) => {
    showBuySignalNotification(payload);
  });

  // 用系统默认浏览器打开外部 URL（一键登录授权页等）
  // 仅允许 http/https，防止任意协议/本地文件打开
  ipcMain.handle('open-external', async (_event, url) => {
    try {
      const target = String(url || '');
      if (!/^https?:\/\//i.test(target)) {
        return { ok: false, error: '仅支持 http/https 链接' };
      }
      await shell.openExternal(target);
      return { ok: true };
    } catch (e) {
      console.error('[Main] 打开外部链接失败:', e?.message || e);
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // 产业链关键环节分析报告 → PDF（隐藏窗口渲染 + printToPDF + 保存对话框）
  ipcMain.handle('export-pdf', async (_event, payload = {}) => {
    const { title = '产业链关键环节分析报告', html = '' } = payload || {};
    if (!html) return { canceled: false, error: '报告内容为空' };
    let win = null;
    try {
      win = new BrowserWindow({
        show: false,
        width: 900,
        height: 1200,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      });
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      // 等待页面渲染完成（含字体与 CSS）
      await new Promise((r) => setTimeout(r, 600));
      const pdf = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
      win.destroy();
      win = null;

      const safeTitle = String(title).replace(/[\\/:*?"<>|]/g, '_');
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow || undefined, {
        title: '导出产业链关键环节分析报告',
        defaultPath: `${safeTitle}.pdf`,
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      });
      if (canceled || !filePath) return { canceled: true };
      fs.writeFileSync(filePath, pdf);
      return { canceled: false, filePath };
    } catch (e) {
      if (win && !win.isDestroyed()) win.destroy();
      console.error('[Main] 导出 PDF 失败:', e?.message || e);
      return { canceled: false, error: e?.message || '导出 PDF 失败' };
    }
  });
}

/** 查找可用的 Node 运行时（优先系统 Node，fallback 到 Electron 内置 Node） */
function findNodePath() {
  // 1. 优先使用系统安装的 Node（用户本机已安装）
  const candidates = [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
    process.env.NODE_PATH_OVERRIDE,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch { /* continue */ }
  }

  // 2. 尝试从 PATH 找 node
  try {
    const nodeFromPath = execSync('where node', { encoding: 'utf-8' }).trim().split('\r\n')[0];
    if (nodeFromPath) return nodeFromPath;
  } catch { /* continue */ }

  // 3. Fallback：使用 Electron 内置的 Node（需 ELECTRON_RUN_AS_NODE=1）
  return process.execPath;
}

/** 查找 CodeBuddy CLI（SDK 的 query() 需要它），返回路径或 null */
function findCodebuddyCli() {
  // 1. 打包自带的 CLI（resources/app/cli/bin/codebuddy）
  const bundled = path.join(__dirname, '..', 'cli', 'bin', 'codebuddy');
  try {
    fs.accessSync(bundled, fs.constants.R_OK);
    return bundled;
  } catch { /* continue */ }
  // 2. 用户显式指定的环境变量
  if (process.env.CODEBUDDY_CODE_PATH) {
    try {
      fs.accessSync(process.env.CODEBUDDY_CODE_PATH, fs.constants.R_OK);
      return process.env.CODEBUDDY_CODE_PATH;
    } catch { /* continue */ }
  }
  // 3. 项目开发环境（node_modules 内捆绑 CLI）
  const devCli = path.join(__dirname, '..', 'node_modules', '@tencent-ai', 'agent-sdk', 'cli', 'bin', 'codebuddy');
  try {
    fs.accessSync(devCli, fs.constants.R_OK);
    return devCli;
  } catch { /* continue */ }
  return null;
}

/** 查找空闲端口（优先 3000，被占用则随机） */
function findFreePort(preferred = 3000) {
  return new Promise((resolve) => {
    const probe = (port) => {
      const srv = net.createServer();
      srv.once('error', () => probe(0)); // 占用则随机端口
      srv.listen(port, '127.0.0.1', () => {
        const actual = srv.address().port;
        srv.close(() => resolve(actual));
      });
    };
    probe(preferred);
  });
}

/** 等待端口就绪（轮询探测） */
function waitForPort(port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const client = new net.Socket();
      client.once('connect', () => {
        client.destroy();
        resolve();
      });
      client.once('error', () => {
        client.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`端口 ${port} 在 ${timeoutMs}ms 内未就绪`));
        } else {
          setTimeout(check, 200);
        }
      });
      client.connect(port, '127.0.0.1');
    };
    check();
  });
}

/** 启动内置 API 服务（独立 Node 子进程运行 server.cjs） */
async function startApiServer(port) {
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const serverMod = path.join(__dirname, '..', 'dist-server', 'server.cjs');
  const nodePath = findNodePath();
  const cliPath = findCodebuddyCli();

  console.log(`[Main] 使用 Node 运行时: ${nodePath}`);
  console.log(`[Main] Server 模块: ${serverMod}`);
  console.log(`[Main] CodeBuddy CLI: ${cliPath || '(未找到，Agent 通道将不可用)'}`);

  const isElectronNode = nodePath === process.execPath;
  serverProcess = spawn(nodePath, [serverMod], {
    env: {
      ...process.env,
      ...(isElectronNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
      ...(cliPath ? { CODEBUDDY_CODE_PATH: cliPath } : {}),
      PORT: String(port),
      STOCK_MONITOR_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // 收集启动日志（用于调试）
  let stdoutBuf = '';
  let stderrBuf = '';

  serverProcess.stdout?.on('data', (data) => {
    const text = data.toString();
    stdoutBuf += text;
    console.log(`[Server] ${text.trim()}`);
  });
  serverProcess.stderr?.on('data', (data) => {
    const text = data.toString();
    stderrBuf += text;
    console.error(`[Server] ${text.trim()}`);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[Server] 进程退出，code=${code}`);
    if (code !== 0) {
      console.error('[Server] 异常退出，stdout:', stdoutBuf.slice(-500));
      console.error('[Server] 异常退出，stderr:', stderrBuf.slice(-500));
    }
    serverProcess = null;
  });

  serverProcess.on('error', (err) => {
    console.error('[Server] 进程启动失败:', err);
  });

  // 等待 server 真正就绪
  await waitForPort(port, 30000);
}

/** 停止 API 服务 */
function stopApiServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

async function createWindow() {
  const port = await findFreePort(3000);
  await startApiServer(port);

  try {
    mainWindow = new BrowserWindow({
      width: 1320,
      height: 860,
      minWidth: 960,
      minHeight: 640,
      title: '紫金红葫芦',
      autoHideMenuBar: true,
      backgroundColor: '#f9f3e9',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.mjs'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const url = isDev ? process.env.VITE_DEV_SERVER_URL : `http://127.0.0.1:${port}`;
    await mainWindow.loadURL(url);

    mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error(`[Main] 页面加载失败: ${code} ${desc}`);
    });

    mainWindow.on('closed', () => { mainWindow = null; });
  } catch (e) {
    console.error('[Main] 窗口创建失败（可能无图形环境）:', e?.message || e);
    stopApiServer();
  }
}

// 通知权限：允许页面使用系统通知（买点弹窗提醒）
app.whenReady().then(() => {
  // Windows 系统通知需要 AppUserModelID，否则 Toast 可能不显示
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.workbuddy.stockmonitor');
  }

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'notifications' || permission === 'media');
  });

  registerIpcHandlers();

  createWindow().catch((err) => {
    console.error('[Main] 启动失败:', err);
    dialog.showErrorBox('启动失败', String(err?.message || err));
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopApiServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopApiServer();
});
