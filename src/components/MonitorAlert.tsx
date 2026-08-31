import { useEffect } from 'react';
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

export function MonitorAlert() {
  const burstRef = { list: [] as BuySignal[], timer: null as ReturnType<typeof setTimeout> | null };

  const handleBuySignal = (signal: BuySignal) => {
    NotificationPlugin.warning({
      title: `买点提醒：${signal.name}（${signal.code}）`,
      content: `${signal.signal_type}｜${signal.reason}`,
      placement: 'top-right',
      duration: 0,
      closeBtn: true,
    });

    burstRef.list.push(signal);
    if (burstRef.timer) return;
    burstRef.timer = setTimeout(() => {
      burstRef.timer = null;
      burstRef.list = [];
      playAlertSound();
    }, 2500);

    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`买点提醒：${signal.name}（${signal.code}）`, {
          body: `${signal.signal_type}｜${signal.reason}`,
          tag: `buy-${signal.code}-${Date.now()}`,
          icon: '/logo.png',
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
