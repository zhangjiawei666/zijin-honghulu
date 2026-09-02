import { Button, Tooltip, Tag } from 'tdesign-react';
import {
  RefreshIcon,
  SunnyIcon,
  MoonIcon,
  MenuFoldIcon,
  MenuUnfoldIcon,
} from 'tdesign-icons-react';
import { Bot, Landmark } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { Model, Session, Agent, Theme } from '../types';
import { ICON_MAP } from '../utils/iconMap';
import { FONT_SIZE_OPTIONS, type FontSize } from '../hooks/useFontSize';

interface HeaderProps {
  isSettingsPage: boolean;
  pageTitle?: string;
  sidebarOpen: boolean;
  theme: Theme;
  fontSize: FontSize;
  currentSession: Session | undefined;
  currentAgent: Agent | undefined;
  models: Model[];
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onSetFontSize: (size: FontSize) => void;
  onRefreshModels: () => void;
}

export function Header({
  isSettingsPage,
  pageTitle,
  sidebarOpen,
  theme,
  fontSize,
  currentSession,
  currentAgent,
  models,
  onToggleSidebar,
  onToggleTheme,
  onSetFontSize,
  onRefreshModels,
}: HeaderProps) {
  const formatModelName = (modelId: string) => {
    const model = models.find(m => m.modelId === modelId);
    const name = model?.name || modelId;
    return name
      .replace(/^(Claude|GPT|Gemini|Kimi|DeepSeek|Qwen|GLM)\s*/i, '')
      .replace(/-/g, ' ')
      .trim() || name;
  };

  return (
    <header 
      className="h-14 flex justify-between items-center px-4 flex-shrink-0"
      style={{ 
        backgroundColor: 'var(--td-bg-color-page)'
      }}
    >
      <div className="flex items-center gap-3">
        <Button
          variant="text"
          shape="circle"
          icon={sidebarOpen ? <MenuFoldIcon /> : <MenuUnfoldIcon />}
          onClick={onToggleSidebar}
        />
        {!isSettingsPage && currentAgent && (
          <div 
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: currentAgent.color || 'var(--td-brand-color)' }}
          >
            {(() => {
              const Icon = ICON_MAP[currentAgent.icon || 'Bot'] || Bot;
              return <Icon size={14} color="white" />;
            })()}
          </div>
        )}
        <h1 
          className="text-base font-semibold"
          style={{ color: 'var(--td-text-color-primary)' }}
        >
          {pageTitle || (isSettingsPage ? '设置' : (currentSession?.title || APP_CONFIG.name))}
        </h1>
        {!isSettingsPage && currentSession && (
          <Tag size="small" variant="outline">
            {formatModelName(currentSession.model)}
          </Tag>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* 字体档位：小 / 中 / 大（仿通达信五号 / 小四 / 小三） */}
        <Tooltip content="界面字体大小：小 / 中 / 大">
          <div className="flex items-center rounded overflow-hidden" style={{ border: '1px solid var(--td-component-border)' }}>
            {FONT_SIZE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                title={opt.desc}
                onClick={() => onSetFontSize(opt.value)}
                className="px-2 leading-none transition-colors"
                style={{
                  minWidth: 26,
                  height: 26,
                  fontSize: opt.value === 'large' ? 14 : opt.value === 'small' ? 11 : 12,
                  fontWeight: fontSize === opt.value ? 700 : 400,
                  cursor: 'pointer',
                  border: 'none',
                  borderLeft: opt.value === 'small' ? 'none' : '1px solid var(--td-component-border)',
                  backgroundColor: fontSize === opt.value ? 'var(--td-brand-color)' : 'transparent',
                  color: fontSize === opt.value ? '#fff' : 'var(--td-text-color-secondary)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Tooltip>
        <Tooltip content={theme === 'light' ? '切换到故宫红模式' : theme === 'palace' ? '切换到深色模式' : '切换到浅色模式'}>
          <Button
            variant="outline"
            shape="circle"
            icon={theme === 'light' ? <Landmark size={16} /> : theme === 'palace' ? <MoonIcon /> : <SunnyIcon />}
            onClick={onToggleTheme}
          />
        </Tooltip>
        {!isSettingsPage && (
          <Tooltip content="刷新模型列表">
            <Button
              variant="outline"
              shape="circle"
              icon={<RefreshIcon />}
              onClick={onRefreshModels}
            />
          </Tooltip>
        )}
        <Tooltip content={`${APP_CONFIG.name} v${APP_CONFIG.version}`}>
          <span
            className="text-xs select-none px-1"
            style={{ color: 'var(--td-text-color-placeholder)' }}
          >
            v{APP_CONFIG.version}
          </span>
        </Tooltip>
      </div>
    </header>
  );
}
