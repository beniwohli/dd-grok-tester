import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { generateId, parseRuleLine } from '../utils';
import type { Sample, ParseResult, HistoryItem, DDImportCandidate } from '../types';

type PendingConfirm =
  | { type: 'clear-session' }
  | { type: 'clear-history' }
  | { type: 'delete-item'; id: string };

export const useGrokSession = () => {
  const [currentTab, setCurrentTab] = useState<'test' | 'history' | 'docs'>('test');
  const [toast, setToast] = useState<string | null>(null);
  
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const confirmTimeoutRef = useRef<number | null>(null);

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return localStorage.getItem('dd-grok-session-id') || generateId();
  });

  const [sessionName, setSessionName] = useState<string>(() => {
    return localStorage.getItem('dd-grok-session-name') || '';
  });

  const [samples, setSamples] = useState<Sample[]>(() => {
    const saved = localStorage.getItem('dd-grok-samples-v2');
    if (saved) return JSON.parse(saved);
    return [{ id: generateId(), text: '' }];
  });
  
  const [matchRules, setMatchRules] = useState(() => {
    return localStorage.getItem('dd-grok-match-rules') || '';
  });
  
  const [supportRules, setSupportRules] = useState(() => {
    return localStorage.getItem('dd-grok-support-rules') || '';
  });

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('dd-grok-history');
    return saved ? JSON.parse(saved) : [];
  });

  const [results, setResults] = useState<Record<string, ParseResult>>({});
  const lastRequestTimer = useRef<number | null>(null);

  const [ddImportCandidates, setDdImportCandidates] = useState<DDImportCandidate[] | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const persistTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = window.setTimeout(() => {
      localStorage.setItem('dd-grok-session-id', currentSessionId);
      localStorage.setItem('dd-grok-session-name', sessionName);
      localStorage.setItem('dd-grok-samples-v2', JSON.stringify(samples));
      localStorage.setItem('dd-grok-match-rules', matchRules);
      localStorage.setItem('dd-grok-support-rules', supportRules);
    }, 300);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [currentSessionId, sessionName, samples, matchRules, supportRules]);

  useEffect(() => {
    localStorage.setItem('dd-grok-history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current !== null) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  const requestConfirm = useCallback(
    (action: PendingConfirm, onConfirmed: () => void): void => {
      const isSamePending =
        pendingConfirm !== null &&
        pendingConfirm.type === action.type &&
        (action.type !== 'delete-item' ||
          (pendingConfirm.type === 'delete-item' && pendingConfirm.id === action.id));

      if (isSamePending) {
        if (confirmTimeoutRef.current !== null) {
          clearTimeout(confirmTimeoutRef.current);
          confirmTimeoutRef.current = null;
        }
        setPendingConfirm(null);
        onConfirmed();
      } else {
        if (confirmTimeoutRef.current !== null) {
          clearTimeout(confirmTimeoutRef.current);
        }
        setPendingConfirm(action);
        confirmTimeoutRef.current = window.setTimeout(() => {
          setPendingConfirm(null);
          confirmTimeoutRef.current = null;
        }, 3000);
      }
    },
    [pendingConfirm]
  );

  const parseAllSamples = useCallback(async () => {
    const validSamples = samples.filter(s => s.text.trim());
    if (validSamples.length === 0 || !matchRules.trim()) {
      return;
    }

    setResults(prev => {
      const next = { ...prev };
      samples.forEach(s => {
        if (s.text.trim()) {
          next[s.id] = { ...next[s.id], isLoading: true };
        }
      });
      return next;
    });

    const promises = samples.map(async (sample) => {
      if (!sample.text.trim()) return;
      
      try {
        const response = await axios.post('/api/parse', {
          sample: sample.text,
          match_rules: matchRules,
          support_rules: supportRules || null
        });
        
        setResults(prev => ({
          ...prev,
          [sample.id]: {
            isLoading: false,
            parsed: response.data.parsed,
            matched_rule: response.data.matched_rule,
          }
        }));
      } catch (err: any) {
        setResults(prev => ({
          ...prev,
          [sample.id]: {
            isLoading: false,
            error: err.response?.data?.error || err.message
          }
        }));
      }
    });

    await Promise.all(promises);
  }, [samples, matchRules, supportRules]);

  useEffect(() => {
    if (currentTab !== 'test') return;
    
    if (lastRequestTimer.current) {
      clearTimeout(lastRequestTimer.current);
    }

    lastRequestTimer.current = window.setTimeout(() => {
      parseAllSamples();
    }, 600);

    return () => {
      if (lastRequestTimer.current) clearTimeout(lastRequestTimer.current);
    };
  }, [samples, matchRules, supportRules, parseAllSamples, currentTab]);

  const addSample = () => {
    setSamples([...samples, { id: generateId(), text: '' }]);
  };

  const updateSample = (id: string, value: string) => {
    setSamples(samples.map(s => s.id === id ? { ...s, text: value } : s));
  };

  const removeSample = (id: string) => {
    const next = samples.filter(s => s.id !== id);
    setSamples(next);
    setResults(prev => {
      const nextRes = { ...prev };
      delete nextRes[id];
      return nextRes;
    });
  };

  const clearSession = () => {
    requestConfirm({ type: 'clear-session' }, () => {
      setSessionName('');
      setMatchRules('');
      setSupportRules('');
      setSamples([{ id: generateId(), text: '' }]);
      setResults({});
      setCurrentSessionId(generateId());
      showToast('Session cleared');
    });
  };

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
      } catch (err) {
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
          integrations.forEach((integration: any) => {
            const pipeline = integration.pipeline;
            if (pipeline && Array.isArray(pipeline.processors)) {
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
      } catch (err) {
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

  const escapeHCLString = (str: string) => {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
  };

  const exportAsTerraform = () => {
    const toHCLBlock = (line: string) => {
      const { name, pattern } = parseRuleLine(line);
      return `    {
      name    = "${escapeHCLString(name)}"
      pattern = "${escapeHCLString(pattern)}"
    }`;
    };

    const rulesList = matchRules
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)
      .map(toHCLBlock)
      .join(',\n');

    const supportRulesList = supportRules
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)
      .map(toHCLBlock)
      .join(',\n');

    const hcl = `{
  id_prefix   = ""
  log_sources = []
  rules = [
${rulesList}
  ]
  support_rules = [
${supportRulesList}
  ]
}`;

    navigator.clipboard.writeText(hcl).then(() => {
      showToast('Terraform configuration copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy: ', err);
      showToast('Failed to copy to clipboard');
    });
  };

  const isClearSessionPending = pendingConfirm?.type === 'clear-session';
  const isClearHistoryPending = pendingConfirm?.type === 'clear-history';
  const pendingDeleteId = pendingConfirm?.type === 'delete-item' ? pendingConfirm.id : null;

  return {
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
  };
};
