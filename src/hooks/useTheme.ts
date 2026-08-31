import { useState, useEffect, useCallback } from 'react';
import { Theme } from '../types';

const STORAGE_KEY = 'theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (saved as Theme) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });

  // 应用主题到 DOM
  useEffect(() => {
    document.documentElement.classList.remove('dark', 'palace');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'palace') {
      document.documentElement.classList.add('palace');
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = useCallback(() => {
    // 浅色 → 故宫红 → 深色 → 浅色 循环切换
    setTheme(prev => prev === 'light' ? 'palace' : prev === 'palace' ? 'dark' : 'light');
  }, []);

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}
