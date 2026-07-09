import { useState, useRef, useEffect } from 'react';

interface ImportTerraformDialogProps {
  onConfirm: (hcl: string) => void;
  onCancel: () => void;
}

export const ImportTerraformDialog = ({ onConfirm, onCancel }: ImportTerraformDialogProps) => {
  const [hcl, setHcl] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const TITLE_ID = 'tf-import-dialog-title';

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleConfirm = () => {
    onConfirm(hcl);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setHcl(text);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onCancel();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog dialog--wide"
        ref={dialogRef}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        onKeyDown={handleKeyDown}
      >
        <div className="dialog-header">
          <span id={TITLE_ID} className="dialog-title">Import Terraform (.tfvars)</span>
          <span className="dialog-subtitle">Paste your Datadog Terraform configuration</span>
        </div>

        <div className="dialog-body">
          <textarea
            ref={textareaRef}
            className="terraform-hcl-input"
            placeholder="Paste HCL here..."
            value={hcl}
            onChange={e => setHcl(e.target.value)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".tf,.tfvars,.hcl"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button
            className="btn btn-outline btn-file-select"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose file…
          </button>
        </div>

        <div className="dialog-footer">
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
