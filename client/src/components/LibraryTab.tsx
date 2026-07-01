import { useState, useRef, useEffect } from 'react';
import { Download, Upload, Trash2, ChevronDown } from 'lucide-react';
import type { HistoryItem } from '../types';

interface LibraryTabProps {
  history: HistoryItem[];
  exportHistory: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  importHistory: (e: React.ChangeEvent<HTMLInputElement>) => void;
  ddIntegrationInputRef: React.RefObject<HTMLInputElement | null>;
  importDatadogIntegrations: (e: React.ChangeEvent<HTMLInputElement>) => void;
  openTerraformImport: () => void;
  clearHistory: () => void;
  isClearHistoryPending: boolean;
  currentSessionId: string;
  loadFromHistory: (item: HistoryItem) => void;
  pendingDeleteId: string | null;
  deleteFromHistory: (id: string) => void;
}

export const LibraryTab = ({
  history,
  exportHistory,
  fileInputRef,
  importHistory,
  ddIntegrationInputRef,
  importDatadogIntegrations,
  openTerraformImport,
  clearHistory,
  isClearHistoryPending,
  currentSessionId,
  loadFromHistory,
  pendingDeleteId,
  deleteFromHistory,
}: LibraryTabProps) => {
  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsImportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <div className="card">
        <div className="section-title">
          Actions
          <div className="section-actions">
            <button className="btn btn-outline" onClick={exportHistory}>
              <Download size={16} /> Export JSON
            </button>
            <div className="dropdown" ref={dropdownRef}>
              <button 
                className="btn btn-outline" 
                onClick={() => setIsImportDropdownOpen(!isImportDropdownOpen)}
              >
                <Upload size={16} /> Import... <ChevronDown size={14} className="icon-ml" />
              </button>
              {isImportDropdownOpen && (
                <div className="dropdown-menu">
                  <button 
                    className="dropdown-item" 
                    onClick={() => { fileInputRef.current?.click(); setIsImportDropdownOpen(false); }}
                  >
                    Import JSON
                  </button>
                  <button 
                    className="dropdown-item" 
                    onClick={() => { ddIntegrationInputRef.current?.click(); setIsImportDropdownOpen(false); }}
                  >
                    Import Datadog Integrations
                  </button>
                  <button 
                    className="dropdown-item" 
                    onClick={() => { openTerraformImport(); setIsImportDropdownOpen(false); }}
                  >
                    Import Terraform (.tfvars)
                  </button>
                </div>
              )}
            </div>
            <button
              className="btn btn-danger btn-danger--outlined"
              onClick={clearHistory}
            >
              <Trash2 size={16} />
              {isClearHistoryPending ? 'Click again to confirm' : 'Clear Library'}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden-file-input" 
              accept=".json" 
              onChange={importHistory}
            />
            <input 
              type="file" 
              ref={ddIntegrationInputRef} 
              className="hidden-file-input" 
              accept=".json" 
              onChange={importDatadogIntegrations}
            />
          </div>
        </div>
      </div>
      <div className="card card--flush">
        {history.length === 0 ? (
          <div className="empty-state">
            No saved sessions yet.
          </div>
        ) : (
          history.map((item) => (
            <div key={item.id} className="history-item">
              <div className="history-info">
                <div className="history-date">
                  {new Date(item.timestamp).toLocaleString()}
                  {item.id === currentSessionId && (
                    <span className="active-badge">ACTIVE</span>
                  )}
                </div>
                <div className="history-summary">
                  {item.name ? (
                    <strong className="history-name">{item.name}</strong>
                  ) : null}
                  <div className="history-meta">
                    {item.matchRules.split('\n')[0] || 'No rules'} 
                    {item.matchRules.split('\n').length > 1 ? ' ...' : ''}
                    <span className="history-separator">|</span>
                    {item.samples.length} sample(s)
                  </div>
                </div>
              </div>
              <div className="history-actions">
                <button className="btn btn-outline" onClick={() => loadFromHistory(item)}>
                  Load
                </button>
                <button
                  className={`btn btn-danger${pendingDeleteId === item.id ? ' btn-danger--outlined' : ''}`}
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
