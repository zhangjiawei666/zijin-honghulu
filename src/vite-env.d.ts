/// <reference types="vite/client" />

/** 桌面客户端桥（由 electron/preload.mjs 注入） */
interface Window {
  monitorAlert?: {
    /** 通知主进程：新买点信号 → 系统通知 + 任务栏闪烁 */
    notify: (signal: { name?: string; code?: string; signal_type?: string; reason?: string }) => void;
    /** 是否运行在桌面客户端环境 */
    isDesktop: boolean;
  };
  /** 产业链报告导出桥（由 electron/preload.mjs 注入） */
  monitorExport?: {
    /** 导出 PDF：返回 { canceled, filePath?, error? } */
    exportPdf: (payload: { title: string; html: string }) => Promise<{ canceled: boolean; filePath?: string; error?: string }>;
  };
  /** 系统外壳桥（由 electron/preload.mjs 注入） */
  monitorShell?: {
    /** 用系统默认浏览器打开外部 URL（返回 { ok, error? }） */
    openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
  };
}
