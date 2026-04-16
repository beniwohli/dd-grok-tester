import { Plus, Trash2, AlertCircle, CheckCircle2, Tag, Save, Eraser, Code } from 'lucide-react';
import { GrokEditor } from './GrokEditor';
import { JsonFormatter } from './JsonFormatter';
import type { Sample, ParseResult } from '../types';

interface TestTabProps {
  isClearSessionPending: boolean;
  clearSession: () => void;
  saveToHistory: () => void;
  sessionName: string;
  setSessionName: (name: string) => void;
  matchRules: string;
  setMatchRules: (rules: string) => void;
  supportRules: string;
  setSupportRules: (rules: string) => void;
  samples: Sample[];
  addSample: () => void;
  updateSample: (id: string, value: string) => void;
  removeSample: (id: string) => void;
  results: Record<string, ParseResult>;
  exportAsTerraform: () => void;
}

export const TestTab = ({
  isClearSessionPending,
  clearSession,
  saveToHistory,
  sessionName,
  setSessionName,
  matchRules,
  setMatchRules,
  supportRules,
  setSupportRules,
  samples,
  addSample,
  updateSample,
  removeSample,
  results,
  exportAsTerraform,
}: TestTabProps) => {
  return (
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
  );
};
