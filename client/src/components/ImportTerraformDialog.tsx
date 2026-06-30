import { useState, useRef, useEffect } from 'react';

interface ImportTerraformDialogProps {
  onConfirm: (hcl: string) => void;
  onCancel: () => void;
}

export const ImportTerraformDialog = ({ onConfirm, onCancel }: ImportTerraformDialogProps) => {
  const [hcl, setHcl] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleConfirm = () => {
    onConfirm(hcl);
  };

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()} role="dialog" style={{ maxWidth: '600px' }}>
        <div className="dialog-header">
          <span className="dialog-title">Import Terraform (.tfvars)</span>
          <span className="dialog-subtitle">Paste your Datadog Terraform configuration</span>
        </div>

        <div className="dialog-search" style={{ padding: '0 1rem', marginTop: '1rem' }}>
          <textarea
            ref={textareaRef}
            placeholder="Paste HCL here..."
            value={hcl}
            onChange={e => setHcl(e.target.value)}
            style={{ 
              width: '100%', 
              height: '250px', 
              fontFamily: 'monospace',
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-color)',
              color: 'var(--text-color)',
              resize: 'vertical'
            }}
          />
        </div>

        <div className="dialog-footer" style={{ marginTop: '1rem' }}>
          <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!hcl.trim()}
          >
            Import Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
