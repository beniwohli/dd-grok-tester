import { useState, useEffect } from 'react';
import { generateId } from '../utils';
import type { Sample, ParseResult, HistoryItem, DDImportCandidate } from '../types';
import type { PendingConfirm } from './useConfirmActions';

interface UseGrokHistoryParams {
  currentSessionId: string;
  setCurrentSessionId: (id: string) => void;
  sessionName: string;
  setSessionName: (name: string) => void;
  matchRules: string;
  setMatchRules: (rules: string) => void;
  supportRules: string;
  setSupportRules: (rules: string) => void;
  samples: Sample[];
  setSamples: (samples: Sample[]) => void;
  setResults: (results: Record<string, ParseResult> | ((prev: Record<string, ParseResult>) => Record<string, ParseResult>)) => void;
  setCurrentTab: (tab: 'test' | 'history' | 'docs') => void;
  requestConfirm: (action: PendingConfirm, onConfirmed: () => void) => void;
  showToast: (message: string) => void;
}

export const useGrokHistory = ({
  currentSessionId,
  setCurrentSessionId,
  sessionName,
  setSessionName,
  matchRules,
  setMatchRules,
  supportRules,
  setSupportRules,
  samples,
  setSamples,
  setResults,
  setCurrentTab,
  requestConfirm,
  showToast,
}: UseGrokHistoryParams) => {
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('dd-grok-history');
    return saved ? JSON.parse(saved) : [];
  });

  const [ddImportCandidates, setDdImportCandidates] = useState<DDImportCandidate[] | null>(null);

  useEffect(() => {
    localStorage.setItem('dd-grok-history', JSON.stringify(history));
  }, [history]);

  const saveToHistory = () => {
    const existingIndex = history.findIndex(item => item.id === currentSessionId);
    
    const sessionData: HistoryItem = {
      id: currentSessionId,
      name: sessionName || undefined,
      timestamp: Date.now(),
      matchRules,
      supportRules,
      samples: [...samples]
    };

    if (existingIndex >= 0) {
      const newHistory = [...history];
      newHistory[existingIndex] = sessionData;
      setHistory(newHistory);
      showToast('Session updated in history');
    } else {
      setHistory([sessionData, ...history]);
      showToast('Session saved to history');
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setCurrentSessionId(item.id);
    setSessionName(item.name || '');
    setMatchRules(item.matchRules);
    setSupportRules(item.supportRules);
    setSamples(item.samples);
    setResults({});
    setCurrentTab('test');
    showToast('Session loaded');
  };

  const deleteFromHistory = (id: string) => {
    requestConfirm({ type: 'delete-item', id }, () => {
      setHistory(history.filter(item => item.id !== id));
      showToast('Session deleted from history');
    });
  };

  const clearHistory = () => {
    requestConfirm({ type: 'clear-history' }, () => {
      setHistory([]);
      showToast('History cleared');
    });
  };

  const exportHistory = () => {
    const dataStr = JSON.stringify(history, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'datadog-grok-history.json');
    linkElement.click();
    showToast('History exported');
  };

  const importHistory = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (Array.isArray(imported)) {
          const isValid = imported.every(item => item.id && item.matchRules && item.samples);
          if (isValid) {
            setHistory([...imported, ...history]);
            showToast(`Imported ${imported.length} sessions`);
          } else {
            showToast('Invalid history file format');
          }
        }
      } catch {
        showToast('Error parsing history file');
      }
    };
    reader.readAsText(file);
  };

  const importDatadogIntegrations = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const integrations = JSON.parse(e.target?.result as string);
        const candidates: DDImportCandidate[] = [];

        if (Array.isArray(integrations)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          integrations.forEach((integration: any) => {
            const pipeline = integration.pipeline;
            if (pipeline && Array.isArray(pipeline.processors)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              pipeline.processors.forEach((processor: any, processorIdx: number) => {
                if (processor.type === 'grok-parser' && processor.grok) {
                  candidates.push({
                    key: `${pipeline.name ?? 'unnamed'}-${processorIdx}`,
                    name: pipeline.name || '',
                    matchRules: processor.grok.matchRules || '',
                    supportRules: processor.grok.supportRules || '',
                    samples: (processor.samples || []).map((s: string) => ({
                      id: generateId(),
                      text: s,
                    })),
                  });
                }
              });
            }
          });

          if (candidates.length > 0) {
            setDdImportCandidates(candidates);
          } else {
            showToast('No grok processors found in file');
          }
        }
      } catch {
        showToast('Error parsing integrations file');
      }
    };
    reader.readAsText(file);
  };

  const confirmDdImport = (selected: DDImportCandidate[]) => {
    const newSessions: HistoryItem[] = selected.map(c => ({
      id: generateId(),
      name: c.name || undefined,
      timestamp: Date.now(),
      matchRules: c.matchRules,
      supportRules: c.supportRules,
      samples: c.samples,
    }));
    setHistory(prev => [...newSessions, ...prev]);
    setDdImportCandidates(null);
    showToast(`Imported ${newSessions.length} session${newSessions.length !== 1 ? 's' : ''}`);
  };

  return {
    history,
    ddImportCandidates,
    setDdImportCandidates,
    saveToHistory,
    loadFromHistory,
    deleteFromHistory,
    clearHistory,
    exportHistory,
    importHistory,
    importDatadogIntegrations,
    confirmDdImport,
  };
};
