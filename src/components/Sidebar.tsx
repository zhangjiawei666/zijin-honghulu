import { Button, Tooltip } from 'tdesign-react';
import { AddIcon, DeleteIcon, SettingIcon } from 'tdesign-icons-react';
import { Bot, TrendingUp, Building2, Radar, Flame, Microscope } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { Session, Agent } from '../types';
import { ICON_MAP } from '../utils/iconMap';
import logoUrl from '../assets/logo.png';

interface SidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  isSettingsPage: boolean;
  isMonitorPage: boolean;
  isIndustryChainPage: boolean;
  isSectorEffectPage: boolean;
  isDeepDivePage: boolean;
  isMainstreamPage: boolean;
  sidebarOpen: boolean;
  agents: Agent[];
  getAgent: (id: string) => Agent | undefined;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSettings: () => void;
  onOpenMonitor: () => void;
  onOpenSectorEffect: () => void;
  onOpenDeepDive: () => void;
  onOpenMainstream: () => void;
  onOpenIndustryChain: () => void;
}

export function Sidebar({
  sessions,
  currentSessionId,
  isSettingsPage,
  isMonitorPage,
  isIndustryChainPage,
  isSectorEffectPage,
  isDeepDivePage,
  isMainstreamPage,
  sidebarOpen,
  agents,
  getAgent,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onOpenSettings,
  onOpenMonitor,
  onOpenSectorEffect,
  onOpenDeepDive,
  onOpenMainstream,
  onOpenIndustryChain,
}: SidebarProps) {
  return (
    <aside 
      className="flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden"
      style={{ 
        width: sidebarOpen ? 260 : 0,
        backgroundColor: 'var(--td-bg-color-container)'
      }}
    >
      {/* Logo */}
      <div className="h-14 px-4 flex items-center flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <img
            src={logoUrl}
            alt={APP_CONFIG.name}
            className="w-8 h-8 rounded-lg object-cover"
            draggable={false}
          />
          <span
            className="text-lg font-semibold"
            style={{ color: 'var(--td-text-color-primary)' }}
          >
            {APP_CONFIG.name}
          </span>
        </div>
      </div>

      {/* 顶部功能导航：按“板块效应 → 个股深度挖掘 → 行情监控 → 涨停异动分析 → 板块产业链”排列 */}
      <div className="px-3 pb-3 flex flex-col gap-2 flex-shrink-0">
        <Button
          icon={<Flame size={16} />}
          onClick={onOpenSectorEffect}
          block
          variant={isSectorEffectPage ? 'outline' : 'text'}
          theme={isSectorEffectPage ? 'primary' : 'default'}
        >
          板块效应
        </Button>
        <Button
          icon={<Microscope size={16} />}
          onClick={onOpenDeepDive}
          block
          variant={isDeepDivePage ? 'outline' : 'text'}
          theme={isDeepDivePage ? 'primary' : 'default'}
        >
          个股深度挖掘
        </Button>
        <Button
          icon={<TrendingUp size={16} />}
          onClick={onOpenMonitor}
          block
          variant={isMonitorPage ? 'outline' : 'text'}
          theme={isMonitorPage ? 'primary' : 'default'}
        >
          行情监控
        </Button>
        <Button
          icon={<Radar size={16} />}
          onClick={onOpenMainstream}
          block
          variant={isMainstreamPage ? 'outline' : 'text'}
          theme={isMainstreamPage ? 'primary' : 'default'}
        >
          涨停异动分析
        </Button>
        <Button
          icon={<Building2 size={16} />}
          onClick={onOpenIndustryChain}
          block
          variant={isIndustryChainPage ? 'outline' : 'text'}
          theme={isIndustryChainPage ? 'primary' : 'default'}
        >
          板块产业链
        </Button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map(session => {
          const sessionAgent = session.agentId ? getAgent(session.agentId) : getAgent('default');
          const AgentIcon = ICON_MAP[sessionAgent?.icon || 'Bot'] || Bot;
          return (
            <div 
              key={session.id}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors duration-200 group"
              style={{
                backgroundColor: session.id === currentSessionId && !isSettingsPage
                  ? 'var(--td-brand-color-light)' 
                  : 'transparent',
                color: session.id === currentSessionId && !isSettingsPage
                  ? 'var(--td-brand-color)' 
                  : 'var(--td-text-color-secondary)'
              }}
              onClick={() => onSelectSession(session.id)}
              onMouseEnter={(e) => {
                if (session.id !== currentSessionId || isSettingsPage) {
                  e.currentTarget.style.backgroundColor = 'var(--td-bg-color-component-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (session.id !== currentSessionId || isSettingsPage) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <div 
                className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
                style={{ backgroundColor: sessionAgent?.color || 'var(--td-brand-color)' }}
              >
                <AgentIcon size={12} color="white" />
              </div>
              <span className="flex-1 truncate text-sm">{session.title}</span>
              <Tooltip content="删除会话">
                <Button
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  variant="text"
                  shape="circle"
                  size="medium"
                  icon={<DeleteIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                />
              </Tooltip>
            </div>
          );
        })}
      </div>
      
      {/* 底部设置入口 */}
      <div className="p-3 border-t flex flex-col gap-2 flex-shrink-0" style={{ borderColor: 'var(--td-component-border)' }}>
        <Button
          icon={<SettingIcon />}
          onClick={onOpenSettings}
          block
          variant={isSettingsPage ? 'outline' : 'text'}
          theme={isSettingsPage ? 'primary' : 'default'}
        >
          设置
        </Button>
        {/* 新对话按钮（移到底部，便于在会话列表滚动后快速新建） */}
        <Button 
          icon={<AddIcon />}
          onClick={onNewChat}
          block
          variant="outline"
        >
          新对话
        </Button>
      </div>
    </aside>
  );
}
