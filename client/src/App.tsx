import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Plus, Trash2, AlertCircle, CheckCircle2, Tag, Save, History as HistoryIcon, Play, Eraser, CheckCircle, Download, Upload, Code } from 'lucide-react';
import './App.css';

interface Sample {
  id: string;
  text: string;
}

interface ParseResult {
  parsed?: any;
  matched_rule?: string;
  error?: string;
  isLoading: boolean;
}

interface HistoryItem {
  id: string;
  timestamp: number;
  matchRules: string;
  supportRules: string;
  samples: Sample[];
}

const generateId = () => Math.random().toString(36).substr(2, 9);

function App() {
  const [currentTab, setCurrentTab] = useState<'test' | 'history'>('test');
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return localStorage.getItem('dd-grok-session-id') || generateId();
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

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Persist current session state
  useEffect(() => {
    localStorage.setItem('dd-grok-session-id', currentSessionId);
    localStorage.setItem('dd-grok-samples-v2', JSON.stringify(samples));
    localStorage.setItem('dd-grok-match-rules', matchRules);
    localStorage.setItem('dd-grok-support-rules', supportRules);
  }, [currentSessionId, samples, matchRules, supportRules]);

  // Persist history
  useEffect(() => {
    localStorage.setItem('dd-grok-history', JSON.stringify(history));
  }, [history]);

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
    if (window.confirm('Are you sure you want to clear the current session? Unsaved changes will be lost.')) {
      setMatchRules('');
      setSupportRules('');
      setSamples([{ id: generateId(), text: '' }]);
      setResults({});
      setCurrentSessionId(generateId());
      showToast('Session cleared');
    }
  };

  const saveToHistory = () => {
    const existingIndex = history.findIndex(item => item.id === currentSessionId);
    
    const sessionData = {
      id: currentSessionId,
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
    setMatchRules(item.matchRules);
    setSupportRules(item.supportRules);
    setSamples(item.samples);
    setResults({});
    setCurrentTab('test');
    showToast('Session loaded');
  };

  const deleteFromHistory = (id: string) => {
    setHistory(history.filter(item => item.id !== id));
    showToast('Session deleted from history');
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

  const escapeHCLString = (str: string) => {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
  };

  const exportAsTerraform = () => {
    const rulesList = matchRules.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0).map((line: string) => {
      const firstSpaceIdx = line.search(/\s/);
      const name = firstSpaceIdx !== -1 ? line.substring(0, firstSpaceIdx) : 'rule';
      const pattern = firstSpaceIdx !== -1 ? line.substring(firstSpaceIdx).trim() : line;
      return `    {
      name    = "${escapeHCLString(name)}"
      pattern = "${escapeHCLString(pattern)}"
    }`;
    }).join(',\n');

    const supportRulesList = supportRules.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0).map((line: string) => {
      const firstSpaceIdx = line.search(/\s/);
      const name = firstSpaceIdx !== -1 ? line.substring(0, firstSpaceIdx) : 'rule';
      const pattern = firstSpaceIdx !== -1 ? line.substring(firstSpaceIdx).trim() : line;
      return `    {
      name    = "${escapeHCLString(name)}"
      pattern = "${escapeHCLString(pattern)}"
    }`;
    }).join(',\n');

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
      </div>

      {currentTab === 'test' ? (
        <>
          <div className="card">
            <div className="section-title">
              Rules
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-outline" onClick={clearSession}>
                  <Eraser size={16} /> Clear
                </button>
                <button className="btn btn-primary" onClick={saveToHistory}>
                  <Save size={16} /> Save Session
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label className="label-text">Match Rules (RULE_NAME PATTERN, one per line)</label>
                <textarea 
                  value={matchRules} 
                  onChange={(e) => setMatchRules(e.target.value)}
                  placeholder="e.g. common %{IP:client_ip} ..."
                />
              </div>
              <div>
                <label className="label-text">Support Rules (Optional, e.g. RULE_NAME PATTERN)</label>
                <textarea 
                  value={supportRules} 
                  onChange={(e) => setSupportRules(e.target.value)}
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
                        <pre style={{ margin: 0 }}>{JSON.stringify(results[sample.id].parsed, null, 2)}</pre>
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
      ) : (
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
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  accept=".json" 
                  onChange={importHistory}
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
                      {item.matchRules.split('\n')[0] || 'No rules'} 
                      {item.matchRules.split('\n').length > 1 ? ' ...' : ''}
                      <span style={{ margin: '0 8px', color: '#e2e8f0' }}>|</span>
                      {item.samples.length} sample(s)
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-outline" onClick={() => loadFromHistory(item)}>
                      Load
                    </button>
                    <button className="btn btn-danger" style={{ border: 'none' }} onClick={() => deleteFromHistory(item.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
