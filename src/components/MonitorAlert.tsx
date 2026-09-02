import { useEffect, useRef } from 'react';
import { NotificationPlugin } from 'tdesign-react';
import { useMonitor, BuySignal } from '../hooks/useMonitor';

function playAlertSound() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const playTone = (from: number, to: number, start: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(from, start);
      oscillator.frequency.linearRampToValueAtTime(to, start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.05);
    };
    playTone(659, 1319, now, 0.13);
    playTone(784, 1568, now + 0.16, 0.24);
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch (error) {
    console.warn('[MonitorAlert] 提示音播放失败:', error);
  }
}

/** 监听行情监控页发出的清除命令，同时关闭页面通知和系统通知。 */
export function MonitorAlert() {
  const burstRef = useRef<BuySignal[]>([]);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const systemNotificationsRef = useRef<Notification[]>([]);

  const clearAlerts = () => {
    NotificationPlugin.closeAll();
    for (const notification of systemNotificationsRef.current) {
      try { notification.close(); } catch { /* 浏览器可能已自动关闭 */ }
    }
    systemNotificationsRef.current = [];
    burstRef.current = [];
    if (burstTimerRef.current) {
      clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
  };

  const handleBuySignal = (signal: BuySignal) => {
    NotificationPlugin.warning({
      title: `买点提醒：${signal.name}（${signal.code}）`,
      content: `${signal.signal_type}｜${signal.reason}`,
      placement: 'top-right',
      duration: 0,
      closeBtn: true,
    });

    burstRef.current.push(signal);
    if (burstTimerRef.current) return;
    burstTimerRef.current = setTimeout(() => {
      burstTimerRef.current = null;
      burstRef.current = [];
      playAlertSound();
    }, 2500);

    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const notification = new Notification(`买点提醒：${signal.name}（${signal.code}）`, {
          body: `${signal.signal_type}｜${signal.reason}`,
          tag: `buy-${signal.code}-${Date.now()}`,
          icon: '/logo.png',
        });
        systemNotificationsRef.current.push(notification);
        notification.addEventListener('close', () => {
          systemNotificationsRef.current = systemNotificationsRef.current.filter(item => item !== notification);
        });
      }
    } catch (error) {
      console.error('[MonitorAlert] 浏览器通知失败:', error);
    }
  };

  useMonitor({
    onBuySignal: handleBuySignal,
    onRunFinished: (info) => {
      if (info.signalCount > 0) console.log('[MonitorAlert] 发现买点:', info.summary);
    },
  });

  useEffect(() => {
    const onClear = () => clearAlerts();
    window.addEventListener('monitor-clear-alerts', onClear);
    return () => {
      window.removeEventListener('monitor-clear-alerts', onClear);
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const requestPermission = () => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    };
    window.addEventListener('click', requestPermission, { once: true });
    return () => window.removeEventListener('click', requestPermission);
  }, []);

  return null;
}
