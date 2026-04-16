import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../App';

// Mock Prism and components that use it if necessary
vi.mock('../components/GrokEditor', () => ({
  GrokEditor: ({ value, onChange, placeholder }: any) => (
    <textarea 
      data-testid="grok-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}));

describe('App', () => {
  it('renders the main title', () => {
    render(<App />);
    expect(screen.getByText('Datadog Grok Tester')).toBeInTheDocument();
  });

  it('switches tabs', () => {
    render(<App />);
    
    const historyTab = screen.getByText('History');
    fireEvent.click(historyTab);
    expect(screen.getByText('Actions')).toBeInTheDocument();

    const docsTab = screen.getByText('Docs');
    fireEvent.click(docsTab);
    expect(screen.getByText(/Datadog Grok Tester Documentation/i)).toBeInTheDocument();

    const testTab = screen.getByText('Test');
    fireEvent.click(testTab);
    expect(screen.getByText('Rules')).toBeInTheDocument();
  });

  it('can enter rules and add samples', () => {
    render(<App />);
    
    // First editor is Match Rules
    const editors = screen.getAllByTestId('grok-editor');
    fireEvent.change(editors[0], { target: { value: 'rule1 %{DATA:data}' } });
    
    const sampleInput = screen.getByPlaceholderText('Enter log line...');
    fireEvent.change(sampleInput, { target: { value: 'my log line' } });
    
    expect(screen.getByText('Add Sample')).toBeInTheDocument();
  });
});
