import type React from 'react';
import { Download, Upload, Trash2 } from 'lucide-react';
import type { HistoryItem } from '../types';

interface HistoryTabProps {
  history: HistoryItem[];
  exportHistory: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  importHistory: (e: React.ChangeEvent<HTMLInputElement>) => void;
  ddIntegrationInputRef: React.RefObject<HTMLInputElement | null>;
  importDatadogIntegrations: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clearHistory: () => void;
  isClearHistoryPending: boolean;
  currentSessionId: string;
  loadFromHistory: (item: HistoryItem) => void;
  pendingDeleteId: string | null;
  deleteFromHistory: (id: string) => void;
}

export const HistoryTab = ({
  history,
  exportHistory,
  fileInputRef,
  importHistory,
  ddIntegrationInputRef,
  importDatadogIntegrations,
  clearHistory,
  isClearHistoryPending,
  currentSessionId,
  loadFromHistory,
  pendingDeleteId,
  deleteFromHistory,
}: HistoryTabProps) => {
  return (
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
  );
};
