import { useRef, useState, useEffect } from 'react';
import { CheckCircle, Library as LibraryIcon, Play, BookOpen, Sun, Moon, Monitor } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';

import docsContent from './Docs.md?raw';
import { ImportDialog } from './components/ImportDialog';
import { ImportTerraformDialog } from './components/ImportTerraformDialog';
import { TestTab } from './components/TestTab';
import { LibraryTab } from './components/LibraryTab';
import { useGrokSessionContext, GrokSessionProvider } from './contexts/GrokSessionContext';
import { parseTerraform } from './utils';
import type { TabId } from './types';

function AppContent() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ddIntegrationInputRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ test: null, history: null, docs: null });
  const [isTerraformImportOpen, setIsTerraformImportOpen] = useState(false);

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
    showToast,
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
    importFromTerraform,
    confirmDdImport,
    exportAsTerraform,
    isClearSessionPending,
    isClearHistoryPending,
    pendingDeleteId,
  } = useGrokSessionContext();

  const handleTerraformImport = (hcl: string) => {
    try {
      const parsed = parseTerraform(hcl);
      if (!parsed.idPrefix && !parsed.matchRules && !parsed.supportRules) {
        throw new Error('No valid configuration found');
      }
      importFromTerraform(parsed);
      setIsTerraformImportOpen(false);
    } catch (e) {
      console.error(e);
      showToast('Failed to parse Terraform configuration. Please check the format.');
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const TAB_IDS: TabId[] = ['test', 'history', 'docs'];
    const idx = TAB_IDS.indexOf(currentTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = TAB_IDS[(idx + 1) % TAB_IDS.length];
      setCurrentTab(next);
      tabRefs.current[next]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = TAB_IDS[(idx - 1 + TAB_IDS.length) % TAB_IDS.length];
      setCurrentTab(next);
      tabRefs.current[next]?.focus();
    }
  };

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

      <div className="tabs" role="tablist">
        <button
          ref={el => { tabRefs.current['test'] = el; }}
          role="tab"
          id="tab-test"
          aria-selected={currentTab === 'test'}
          aria-controls="panel-test"
          tabIndex={currentTab === 'test' ? 0 : -1}
          className={`tab ${currentTab === 'test' ? 'active' : ''}`}
          onClick={() => setCurrentTab('test')}
          onKeyDown={handleTabKeyDown}
        >
          <Play size={16} /> Test
        </button>
        <button
          ref={el => { tabRefs.current['history'] = el; }}
          role="tab"
          id="tab-history"
          aria-selected={currentTab === 'history'}
          aria-controls="panel-history"
          tabIndex={currentTab === 'history' ? 0 : -1}
          className={`tab ${currentTab === 'history' ? 'active' : ''}`}
          onClick={() => setCurrentTab('history')}
          onKeyDown={handleTabKeyDown}
        >
          <LibraryIcon size={16} /> Library
        </button>
        <button
          ref={el => { tabRefs.current['docs'] = el; }}
          role="tab"
          id="tab-docs"
          aria-selected={currentTab === 'docs'}
          aria-controls="panel-docs"
          tabIndex={currentTab === 'docs' ? 0 : -1}
          className={`tab ${currentTab === 'docs' ? 'active' : ''}`}
          onClick={() => setCurrentTab('docs')}
          onKeyDown={handleTabKeyDown}
        >
          <BookOpen size={16} /> Docs
        </button>
      </div>

      {currentTab === 'test' && (
        <div role="tabpanel" id="panel-test" aria-labelledby="tab-test">
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
        </div>
      )}

      {currentTab === 'history' && (
        <div role="tabpanel" id="panel-history" aria-labelledby="tab-history">
          <LibraryTab
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
            openTerraformImport={() => setIsTerraformImportOpen(true)}
            clearHistory={clearHistory}
            isClearHistoryPending={isClearHistoryPending}
            currentSessionId={currentSessionId}
            loadFromHistory={loadFromHistory}
            pendingDeleteId={pendingDeleteId}
            deleteFromHistory={deleteFromHistory}
          />
        </div>
      )}

      {currentTab === 'docs' && (
        <div role="tabpanel" id="panel-docs" aria-labelledby="tab-docs">
          <div className="card markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{docsContent}</ReactMarkdown>
          </div>
        </div>
      )}

      {ddImportCandidates && (
        <ImportDialog
          candidates={ddImportCandidates}
          onConfirm={confirmDdImport}
          onCancel={() => setDdImportCandidates(null)}
        />
      )}

      {isTerraformImportOpen && (
        <ImportTerraformDialog
          onConfirm={handleTerraformImport}
          onCancel={() => setIsTerraformImportOpen(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <GrokSessionProvider>
      <AppContent />
    </GrokSessionProvider>
  );
}
