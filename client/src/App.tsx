import { useRef, useState, useEffect } from 'react';
import { CheckCircle, History as HistoryIcon, Play, BookOpen, Sun, Moon, Monitor } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';

import docsContent from './Docs.md?raw';
import { ImportDialog } from './components/ImportDialog';
import { TestTab } from './components/TestTab';
import { HistoryTab } from './components/HistoryTab';
import { useGrokSession } from './hooks/useGrokSession';

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ddIntegrationInputRef = useRef<HTMLInputElement>(null);

  const [theme, setTheme] = useState<'light' | 'system' | 'dark'>(() => {
    return (localStorage.getItem('dd-grok-theme') as 'light' | 'system' | 'dark') || 'system';
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const applyTheme = () => {
      let isDark = false;
      if (theme === 'dark') {
        isDark = true;
      } else if (theme === 'light') {
        isDark = false;
      } else {
        isDark = mediaQuery.matches;
      }
      document.body.className = isDark ? 'dark-theme' : '';
    };

    applyTheme();
    localStorage.setItem('dd-grok-theme', theme);

    if (theme === 'system') {
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'system';
      if (prev === 'system') return 'dark';
      return 'light';
    });
  };

  const {
    currentTab,
    setCurrentTab,
    toast,
    currentSessionId,
    sessionName,
    setSessionName,
    samples,
    matchRules,
    setMatchRules,
    supportRules,
    setSupportRules,
    history,
    results,
    ddImportCandidates,
    setDdImportCandidates,
    addSample,
    updateSample,
    removeSample,
    clearSession,
    saveToHistory,
    loadFromHistory,
    deleteFromHistory,
    clearHistory,
    exportHistory,
    importHistory,
    importDatadogIntegrations,
    confirmDdImport,
    exportAsTerraform,
    isClearSessionPending,
    isClearHistoryPending,
    pendingDeleteId,
  } = useGrokSession();

  return (
    <div className="container">
      <div className="header-row">
        <h1>Datadog Grok Tester</h1>
        <div 
          className={`theme-switch-widget ${
            theme === 'light' ? 'light-active' : theme === 'system' ? 'system-active' : 'dark-active'
          }`} 
          onClick={toggleTheme}
          title={
            theme === 'light' 
              ? 'Switch to System Theme' 
              : theme === 'system' 
                ? 'Switch to Dark Theme' 
                : 'Switch to Light Theme'
          }
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleTheme();
            }
          }}
        >
          <div className="theme-switch-knob">
            {theme === 'light' ? (
              <Sun size={12} />
            ) : theme === 'system' ? (
              <Monitor size={12} />
            ) : (
              <Moon size={12} />
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="toast">
          <CheckCircle size={16} color="#4ade80" />
          {toast}
        </div>
      )}

      <div className="tabs">
        <div 
          className={`tab ${currentTab === 'test' ? 'active' : ''}`}
          onClick={() => setCurrentTab('test')}
        >
          <Play size={16} style={{ marginBottom: '-3px', marginRight: '4px' }} /> Test
        </div>
        <div 
          className={`tab ${currentTab === 'history' ? 'active' : ''}`}
          onClick={() => setCurrentTab('history')}
        >
          <HistoryIcon size={16} style={{ marginBottom: '-3px', marginRight: '4px' }} /> History
        </div>
        <div 
          className={`tab ${currentTab === 'docs' ? 'active' : ''}`}
          onClick={() => setCurrentTab('docs')}
        >
          <BookOpen size={16} style={{ marginBottom: '-3px', marginRight: '4px' }} /> Docs
        </div>
      </div>

      {currentTab === 'test' && (
        <TestTab
          isClearSessionPending={isClearSessionPending}
          clearSession={clearSession}
          saveToHistory={saveToHistory}
          sessionName={sessionName}
          setSessionName={setSessionName}
          matchRules={matchRules}
          setMatchRules={setMatchRules}
          supportRules={supportRules}
          setSupportRules={setSupportRules}
          samples={samples}
          addSample={addSample}
          updateSample={updateSample}
          removeSample={removeSample}
          results={results}
          exportAsTerraform={exportAsTerraform}
        />
      )}

      {currentTab === 'history' && (
        <HistoryTab
          history={history}
          exportHistory={exportHistory}
          fileInputRef={fileInputRef}
          importHistory={(e) => {
            importHistory(e);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          ddIntegrationInputRef={ddIntegrationInputRef}
          importDatadogIntegrations={(e) => {
            importDatadogIntegrations(e);
            if (ddIntegrationInputRef.current) ddIntegrationInputRef.current.value = '';
          }}
          clearHistory={clearHistory}
          isClearHistoryPending={isClearHistoryPending}
          currentSessionId={currentSessionId}
          loadFromHistory={loadFromHistory}
          pendingDeleteId={pendingDeleteId}
          deleteFromHistory={deleteFromHistory}
        />
      )}

      {currentTab === 'docs' && (
        <div className="card markdown-body" style={{ padding: '2rem', lineHeight: '1.6' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{docsContent}</ReactMarkdown>
        </div>
      )}

      {ddImportCandidates && (
        <ImportDialog
          candidates={ddImportCandidates}
          onConfirm={confirmDdImport}
          onCancel={() => setDdImportCandidates(null)}
        />
      )}
    </div>
  );
}

export default App;
