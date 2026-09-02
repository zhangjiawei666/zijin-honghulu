import { useState, useEffect, useCallback } from 'react';

/** 字体档位：小 / 中 / 大 */
export type FontSize = 'small' | 'medium' | 'large';

const STORAGE_KEY = 'fontSize';

/**
 * 三档缩放比例，仿通达信「经典字体设置」的中文字号规格：
 *
 * 通达信默认报价字体为「小四（12pt）」，调小一般取「五号（10.5pt）」，
 * 调大一般取「小三（15pt）」。这里按相对默认的比值换算成缩放系数：
 *
 *   小 = 五号 10.5pt ÷ 12pt = 0.875
 *   中 = 小四 12pt（通达信默认） = 1.000
 *   大 = 小三 15pt ÷ 12pt = 1.250
 *
 * 通达信另有「界面缩放比例」100%/110%/125% 的整体缩放，本项目用字体缩放达到同等观感。
 */
export const FONT_SCALE: Record<FontSize, number> = {
  small: 0.875,
  medium: 1,
  large: 1.25,
};

/** 档位展示信息（中文字号标注，方便对照通达信习惯） */
export const FONT_SIZE_OPTIONS: Array<{
  value: FontSize;
  label: string;
  desc: string;
}> = [
  { value: 'small', label: '小', desc: '五号 10.5pt · 同屏显示更多行' },
  { value: 'medium', label: '中', desc: '小四 12pt · 通达信默认' },
  { value: 'large', label: '大', desc: '小三 15pt · 看盘更清晰' },
];

/**
 * 全局字体档位管理。
 *
 * 实现机制（与 useTheme 一致，落到 <html> 上）：
 *   - 在 documentElement 写 `data-font-size="small|medium|large"` 属性；
 *   - 同时写 `--font-scale` CSS 变量，样式表据此用 calc() 缩放所有字号。
 *
 * 属性选择器 `html[data-font-size]` 的优先级高于 tdesign 定义变量的 `:root`，
 * 因此能覆盖 `--td-font-size-*` 系列，让 Button / Input / Table / Dialog 等
 * 组件字号随档位一起变化。
 */
export function useFontSize() {
  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved as FontSize) || 'medium';
  });

  // 应用字体档位到 DOM
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-font-size', fontSize);
    root.style.setProperty('--font-scale', String(FONT_SCALE[fontSize]));
    localStorage.setItem(STORAGE_KEY, fontSize);
  }, [fontSize]);

  const setFontSize = useCallback((next: FontSize) => {
    setFontSizeState(next);
  }, []);

  /** 小 → 中 → 大 → 小 循环切换 */
  const cycleFontSize = useCallback(() => {
    setFontSizeState(prev =>
      prev === 'small' ? 'medium' : prev === 'medium' ? 'large' : 'small',
    );
  }, []);

  return {
    fontSize,
    setFontSize,
    cycleFontSize,
  };
}
