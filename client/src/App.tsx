import { useRef } from 'react';
import { CheckCircle, History as HistoryIcon, Play, BookOpen } from 'lucide-react';
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
      <h1>Datadog Grok Tester</h1>

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
