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
      <div className="dialog dialog--wide" onClick={e => e.stopPropagation()} role="dialog">
        <div className="dialog-header">
          <span className="dialog-title">Import Terraform (.tfvars)</span>
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
