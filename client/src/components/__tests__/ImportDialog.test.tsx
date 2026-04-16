import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ImportDialog } from '../ImportDialog';
import type { DDImportCandidate } from '../../types';

const mockCandidates: DDImportCandidate[] = [
  {
    key: 'pipeline1-0',
    name: 'Pipeline 1',
    matchRules: 'rule1 pattern1',
    supportRules: '',
    samples: [{ id: '1', text: 'sample 1' }],
  },
  {
    key: 'pipeline2-0',
    name: 'Pipeline 2',
    matchRules: 'rule2 pattern2',
    supportRules: '',
    samples: [],
  },
];

describe('ImportDialog', () => {
  it('renders all candidates initially', () => {
    render(
      <ImportDialog
        candidates={mockCandidates}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText('Pipeline 1')).toBeInTheDocument();
    expect(screen.getByText('Pipeline 2')).toBeInTheDocument();
    expect(screen.getByText('2 grok processors found')).toBeInTheDocument();
  });

  it('filters candidates based on query', () => {
    render(
      <ImportDialog
        candidates={mockCandidates}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const searchInput = screen.getByPlaceholderText(/Search by name/);
    fireEvent.change(searchInput, { target: { value: 'Pipeline 1' } });
    
    expect(screen.getByText('Pipeline 1')).toBeInTheDocument();
    expect(screen.queryByText('Pipeline 2')).not.toBeInTheDocument();
  });

  it('toggles individual checkboxes', () => {
    const onConfirm = vi.fn();
    render(
      <ImportDialog
        candidates={mockCandidates}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    
    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is "Select all", subsequent are candidates
    fireEvent.click(checkboxes[1]); // Uncheck Pipeline 1
    
    const importButton = screen.getByText(/Import 1 session/);
    fireEvent.click(importButton);
    
    expect(onConfirm).toHaveBeenCalledWith([mockCandidates[1]]);
  });

  it('toggles "Select all" checkbox', () => {
    const onConfirm = vi.fn();
    render(
      <ImportDialog
        candidates={mockCandidates}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    
    // Initially "Deselect all" because all are checked
    const selectAll = screen.getByText(/all/i).closest('label')!;
    fireEvent.click(selectAll); // Uncheck all
    
    expect(screen.getByText(/Import session/)).toBeDisabled();
    
    fireEvent.click(selectAll); // Check all
    fireEvent.click(screen.getByText(/Import 2 sessions/));
    
    expect(onConfirm).toHaveBeenCalledWith(mockCandidates);
  });

  it('calls onCancel when clicking backdrop', () => {
    const onCancel = vi.fn();
    render(
      <ImportDialog
        candidates={mockCandidates}
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    
    // The backdrop is the parent of the dialog
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onCancel).toHaveBeenCalled();
  });
});
