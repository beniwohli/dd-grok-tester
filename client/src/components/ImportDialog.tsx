import { useState, useEffect, useRef } from 'react';
import type { DDImportCandidate } from '../types';

interface ImportDialogProps {
  candidates: DDImportCandidate[];
  onConfirm: (selected: DDImportCandidate[]) => void;
  onCancel: () => void;
}

export const ImportDialog = ({ candidates, onConfirm, onCancel }: ImportDialogProps) => {
  const [query, setQuery] = useState('');
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(
    () => new Set(candidates.map(c => c.key))
  );
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the search field as soon as the dialog mounts.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filtered = query.trim()
    ? candidates.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.matchRules.toLowerCase().includes(query.toLowerCase())
      )
    : candidates;

  const allFilteredChecked = filtered.length > 0 && filtered.every(c => checkedKeys.has(c.key));

  const toggleOne = (key: string) => {
    setCheckedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setCheckedKeys(prev => {
      const next = new Set(prev);
      if (allFilteredChecked) {
        filtered.forEach(c => next.delete(c.key));
      } else {
        filtered.forEach(c => next.add(c.key));
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(candidates.filter(c => checkedKeys.has(c.key)));
  };

  const checkedCount = candidates.filter(c => checkedKeys.has(c.key)).length;

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()} role="dialog">
        <div className="dialog-header">
          <span className="dialog-title">Import Datadog integrations</span>
          <span className="dialog-subtitle">{candidates.length} grok processors found</span>
        </div>

        <div className="dialog-search">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by name or rule pattern…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="dialog-list-header">
          <label className="dialog-check-row dialog-check-all">
            <input
              type="checkbox"
              checked={allFilteredChecked}
              onChange={toggleAllFiltered}
            />
            <span>{allFilteredChecked ? 'Deselect all' : 'Select all'}{query ? ' matching' : ''}</span>
            <span className="dialog-count">{filtered.length} shown</span>
          </label>
        </div>

        <div className="dialog-list">
          {filtered.length === 0 ? (
            <div className="dialog-empty">No processors match "{query}"</div>
          ) : (
            filtered.map(c => (
              <label key={c.key} className="dialog-check-row">
                <input
                  type="checkbox"
                  checked={checkedKeys.has(c.key)}
                  onChange={() => toggleOne(c.key)}
                />
                <span className="dialog-item-name">{c.name || <em>Unnamed</em>}</span>
                <span className="dialog-item-meta">
                  {c.matchRules.split('\n').filter(Boolean).length} rule(s)
                  {c.samples.length > 0 && ` · ${c.samples.length} sample(s)`}
                </span>
              </label>
            ))
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={checkedCount === 0}
          >
            Import {checkedCount > 0 ? checkedCount : ''} session{checkedCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
