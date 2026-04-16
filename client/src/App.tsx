import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Plus, Trash2, AlertCircle, CheckCircle2, Tag, Save, History as HistoryIcon, Play, Eraser, CheckCircle, Download, Upload, Code, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';

import docsContent from './Docs.md?raw';
import type { Sample, ParseResult, HistoryItem, DDImportCandidate } from './types';
import { generateId, parseRuleLine } from './utils';
import { JsonFormatter } from './components/JsonFormatter';
import { ImportDialog } from './components/ImportDialog';
import { GrokEditor } from './components/GrokEditor';

// Discriminated union describing which destructive action is awaiting confirmation.
type PendingConfirm =
  | { type: 'clear-session' }
  | { type: 'clear-history' }
  | { type: 'delete-item'; id: string };

function App() {
  const [currentTab, setCurrentTab] = useState<'test' | 'history' | 'docs'>('test');
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ddIntegrationInputRef = useRef<HTMLInputElement>(null);

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
            error: response.data.error
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
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    if (event.target) event.target.value = '';
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
        <>
          <div className="card">
            <div className="section-title">
              Rules
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`btn ${isClearSessionPending ? 'btn-danger' : 'btn-outline'}`}
                  onClick={clearSession}
                  style={isClearSessionPending ? { border: '1px solid var(--error-color)' } : undefined}
                >
                  <Eraser size={16} />
                  {isClearSessionPending ? 'Click again to confirm' : 'Clear'}
                </button>
                <button className="btn btn-primary" onClick={saveToHistory}>
                  <Save size={16} /> Save Session
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label className="label-text">Session Name (Optional)</label>
                <input 
                  type="text" 
                  value={sessionName} 
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g. KyotoTycoon"
                  style={{ marginBottom: '0.5rem' }}
                />
              </div>
              <div>
                <label className="label-text">Match Rules (RULE_NAME PATTERN, one per line)</label>
                <GrokEditor 
                  value={matchRules} 
                  onChange={setMatchRules}
                  placeholder="e.g. common %{IP:client_ip} ..."
                />
              </div>
              <div>
                <label className="label-text">Support Rules (Optional, e.g. RULE_NAME PATTERN)</label>
                <GrokEditor 
                  value={supportRules} 
                  onChange={setSupportRules}
                  placeholder="e.g. MY_RULE %{DIGIT}"
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="section-title">
              Log Samples
              <button className="btn btn-outline" onClick={addSample}>
                <Plus size={16} /> Add Sample
              </button>
            </div>
            
            {samples.map((sample) => (
              <div key={sample.id} className="sample-row">
                <div className="sample-header">
                  <input 
                    type="text" 
                    value={sample.text} 
                    onChange={(e) => updateSample(sample.id, e.target.value)}
                    placeholder="Enter log line..."
                  />
                  {samples.length > 1 && (
                    <button className="btn btn-danger" onClick={() => removeSample(sample.id)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                {results[sample.id] && sample.text.trim() && (
                  <div className="result-container" style={{ opacity: results[sample.id].isLoading ? 0.6 : 1 }}>
                    {results[sample.id].isLoading && (
                      <div className="loading-indicator">Parsing...</div>
                    )}
                    
                    {results[sample.id].error ? (
                      <div className="result-error">
                        <AlertCircle size={14} style={{ marginRight: '4px' }} />
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{results[sample.id].error}</pre>
                      </div>
                    ) : results[sample.id].parsed ? (
                      <div>
                        <div style={{ color: '#4ade80', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={14} /> Parsed Successfully
                          </div>
                          {results[sample.id].matched_rule && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#334155', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: '#cbd5e1' }}>
                              <Tag size={10} /> {results[sample.id].matched_rule}
                            </div>
                          )}
                        </div>
                        <pre style={{ margin: 0 }}>
                          <JsonFormatter data={results[sample.id].parsed} />
                        </pre>
                      </div>
                    ) : (
                      <div className="result-error">
                        <AlertCircle size={14} style={{ marginRight: '4px' }} />
                        No match
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <button className="btn btn-outline" onClick={exportAsTerraform} style={{ width: '100%', justifyContent: 'center', padding: '1rem' }}>
              <Code size={18} /> Export as Terraform (.tfvars)
            </button>
          </div>
        </>
      )}

      {currentTab === 'history' && (
        <>
          <div className="card">
            <div className="section-title">
              Actions
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-outline" onClick={exportHistory}>
                  <Download size={16} /> Export JSON
                </button>
                <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} /> Import JSON
                </button>
                <button className="btn btn-outline" onClick={() => ddIntegrationInputRef.current?.click()}>
                  <Upload size={16} /> Import Datadog Integrations
                </button>
                <button
                  className="btn btn-danger"
                  style={{ border: '1px solid var(--error-color)' }}
                  onClick={clearHistory}
                >
                  <Trash2 size={16} />
                  {isClearHistoryPending ? 'Click again to confirm' : 'Clear History'}
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  accept=".json" 
                  onChange={importHistory}
                />
                <input 
                  type="file" 
                  ref={ddIntegrationInputRef} 
                  style={{ display: 'none' }} 
                  accept=".json" 
                  onChange={importDatadogIntegrations}
                />
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: 0 }}>
            {history.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No saved sessions yet.
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="history-item">
                  <div className="history-info">
                    <div className="history-date">
                      {new Date(item.timestamp).toLocaleString()}
                      {item.id === currentSessionId && (
                        <span style={{ marginLeft: '8px', backgroundColor: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>ACTIVE</span>
                      )}
                    </div>
                    <div className="history-summary">
                      {item.name ? (
                        <strong style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-color)' }}>
                          {item.name}
                        </strong>
                      ) : null}
                      <div style={{ color: 'var(--text-muted)' }}>
                        {item.matchRules.split('\n')[0] || 'No rules'} 
                        {item.matchRules.split('\n').length > 1 ? ' ...' : ''}
                        <span style={{ margin: '0 8px', color: '#e2e8f0' }}>|</span>
                        {item.samples.length} sample(s)
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-outline" onClick={() => loadFromHistory(item)}>
                      Load
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ border: pendingDeleteId === item.id ? '1px solid var(--error-color)' : 'none' }}
                      onClick={() => deleteFromHistory(item.id)}
                    >
                      {pendingDeleteId === item.id
                        ? <><Trash2 size={16} /> Confirm?</>
                        : <Trash2 size={16} />
                      }
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
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
