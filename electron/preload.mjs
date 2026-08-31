/**
 * 预加载脚本：在渲染进程与主进程之间建立安全的 IPC 桥
 * - window.monitorAlert.notify(signal)：买点提醒（系统通知 + 任务栏闪烁 + 窗口聚焦）
 * - window.monitorExport.exportPdf(payload)：产业链报告导出 PDF（printToPDF + 保存对话框）
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('monitorAlert', {
  /** 通知主进程：有新买点信号 */
  notify: (signal) => {
    try {
      ipcRenderer.send('buy-signal', {
        title: `买点提醒：${signal?.name ?? ''}（${signal?.code ?? ''}）`,
        body: `${signal?.signal_type ?? ''}｜${signal?.reason ?? ''}`,
        code: signal?.code ?? '',
      });
    } catch (e) {
      console.error('[preload] 通知主进程失败:', e);
    }
  },
  /** 查询是否运行在桌面客户端环境 */
  isDesktop: true,
});

contextBridge.exposeInMainWorld('monitorExport', {
  /** 导出产业链关键环节分析报告为 PDF（返回 { canceled, filePath?, error? }） */
  exportPdf: (payload) => {
    try {
      return ipcRenderer.invoke('export-pdf', payload);
    } catch (e) {
      console.error('[preload] 导出 PDF 调用失败:', e);
      return Promise.resolve({ canceled: false, error: String(e?.message || e) });
    }
  },
});

contextBridge.exposeInMainWorld('monitorShell', {
  /** 用系统默认浏览器打开外部 URL（用于一键登录授权页） */
  openExternal: (url) => {
    try {
      return ipcRenderer.invoke('open-external', url);
    } catch (e) {
      console.error('[preload] 打开外部链接失败:', e);
      return Promise.resolve({ ok: false, error: String(e?.message || e) });
    }
  },
});
