import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/Header';
import { MonitorAlert } from './components/MonitorAlert';
import { NewChatDialog } from './components/NewChatDialog';
import { SettingsPage } from './components/SettingsPage';
import { Sidebar } from './components/Sidebar';
import { ChatPage } from './pages/ChatPage';
import { IndustryChainPage } from './pages/IndustryChainPage';
import { MainstreamMiningPage } from './pages/MainstreamMiningPage';
import { MonitorPage } from './pages/MonitorPage';
import { SectorEffectPage } from './pages/SectorEffectPage';
import { useAgents } from './hooks/useAgents';
import { useChat } from './hooks/useChat';
import { useModels } from './hooks/useModels';
import { useSessions } from './hooks/useSessions';
import { useTheme } from './hooks/useTheme';
import { useFontSize } from './hooks/useFontSize';
import { APP_CONFIG } from './config';
import type { PermissionMode } from './types';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { fontSize, setFontSize } = useFontSize();
  const { agents, addAgent, updateAgent, deleteAgent, getAgent } = useAgents();
  const { models, selectedModel, setSelectedModel, fetchModels } = useModels();
  const {
    sessions,
    currentSessionId,
    currentSession,
    setCurrentSessionId,
    setSessions,
    fetchSessions,
    deleteSession,
    updateSessionModel,
    addSession,
    updateSession,
    updateSessionMessages,
  } = useSessions();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [pendingAgentId, setPendingAgentId] = useState('default');
  const [pendingCwd, setPendingCwd] = useState('');

  const {
    isLoading,
    inputValue,
    setInputValue,
    permissionRequest,
    sendMessage,
    handleStop,
    handlePermissionAllow,
    handlePermissionDeny,
  } = useChat({
    currentSession,
    currentSessionId,
    selectedModel,
    getAgent,
    addSession,
    updateSession,
    updateSessionMessages,
    updateSessionModel,
    setCurrentSessionId,
    setSessions,
  });

  useEffect(() => {
    fetchSessions();
    fetchModels();
  }, []);

  useEffect(() => {
    document.title = APP_CONFIG.name;
  }, []);

  const path = location.pathname;
  const isSettingsPage = path === '/settings';
  const isSectorEffectPage = path === '/sector-effect';
  const isMonitorPage = path === '/monitor';
  const isMainstreamPage = path === '/mainstream-mining';
  const isIndustryChainPage = path === '/industry-chain';

  const pageTitle = isSectorEffectPage
    ? '板块效应'
    : isMonitorPage
      ? '行情监控'
      : isMainstreamPage
        ? '涨停异动分析'
        : isIndustryChainPage
          ? '板块产业链'
          : undefined;

  const goChat = useCallback(
    (sessionId: string | null) => {
      setCurrentSessionId(sessionId);
      navigate(sessionId ? `/chat/${sessionId}` : '/');
    },
    [navigate, setCurrentSessionId],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      goChat(sessionId);
    },
    [goChat],
  );

  const handleNewChat = useCallback(() => {
    setNewChatOpen(true);
  }, []);

  const handleNewChatConfirm = useCallback(
    (agentId: string, model: string, cwd?: string) => {
      setNewChatOpen(false);
      if (model && model !== selectedModel) setSelectedModel(model);
      setPendingAgentId(agentId || 'default');
      setPendingCwd(cwd || '');
      goChat(null);
    },
    [goChat, selectedModel, setSelectedModel],
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      deleteSession(sessionId);
      if (sessionId === currentSessionId) goChat(null);
    },
    [deleteSession, currentSessionId, goChat],
  );

  const chatPage = (
    <ChatPage
      key={`${pendingAgentId}|${pendingCwd}`}
      currentSession={currentSession}
      models={models}
      selectedModel={selectedModel}
      agents={agents}
      isLoading={isLoading}
      inputValue={inputValue}
      permissionRequest={permissionRequest}
      permissionMode={permissionMode}
      initialNewChatAgentId={pendingAgentId}
      initialNewChatCwd={pendingCwd}
      onSendMessage={sendMessage}
      onStop={handleStop}
      onInputChange={setInputValue}
      onModelChange={setSelectedModel}
      onPermissionAllow={handlePermissionAllow}
      onPermissionDeny={handlePermissionDeny}
      onPermissionModeChange={setPermissionMode}
    />
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--td-bg-color-page)' }}>
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        isSettingsPage={isSettingsPage}
        isSectorEffectPage={isSectorEffectPage}
        isMonitorPage={isMonitorPage}
        isIndustryChainPage={isIndustryChainPage}
        isMainstreamPage={isMainstreamPage}
        sidebarOpen={sidebarOpen}
        agents={agents}
        getAgent={getAgent}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => navigate('/settings')}
        onOpenSectorEffect={() => navigate('/sector-effect')}
        onOpenMonitor={() => navigate('/monitor')}
        onOpenMainstream={() => navigate('/mainstream-mining')}
        onOpenIndustryChain={() => navigate('/industry-chain')}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          isSettingsPage={isSettingsPage}
          pageTitle={pageTitle}
          sidebarOpen={sidebarOpen}
          theme={theme}
          fontSize={fontSize}
          currentSession={currentSession}
          currentAgent={getAgent(currentSession?.agentId || 'default')}
          models={models}
          onToggleSidebar={() => setSidebarOpen(open => !open)}
          onToggleTheme={toggleTheme}
          onSetFontSize={setFontSize}
          onRefreshModels={fetchModels}
        />

        <main className="flex-1 flex flex-col min-h-0">
          <Routes>
            <Route path="/" element={chatPage} />
            <Route path="/chat" element={<Navigate to="/" replace />} />
            <Route path="/chat/:sessionId" element={chatPage} />
            <Route path="/sector-effect" element={<SectorEffectPage />} />
            <Route path="/monitor" element={<MonitorPage />} />
            <Route path="/mainstream-mining" element={<MainstreamMiningPage />} />
            <Route path="/industry-chain" element={<IndustryChainPage />} />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  agents={agents}
                  onAdd={addAgent}
                  onUpdate={updateAgent}
                  onDelete={deleteAgent}
                  fontSize={fontSize}
                  onSetFontSize={setFontSize}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <NewChatDialog
        visible={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onConfirm={handleNewChatConfirm}
        agents={agents}
        models={models}
        defaultModel={selectedModel}
        defaultAgentId="default"
      />

      <MonitorAlert />
    </div>
  );
}

export default function App() {
  return <AppContent />;
}
