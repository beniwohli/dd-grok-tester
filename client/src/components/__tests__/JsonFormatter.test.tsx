import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { JsonFormatter } from '../JsonFormatter';

describe('JsonFormatter', () => {
  it('renders strings with green color', () => {
    render(<JsonFormatter data="hello" />);
    const span = screen.getByText('"hello"');
    expect(span).toHaveClass('json-string');
  });

  it('renders numbers with orange color', () => {
    render(<JsonFormatter data={42} />);
    const span = screen.getByText('42');
    expect(span).toHaveClass('json-number');
  });

  it('renders booleans with orange color', () => {
    render(<JsonFormatter data={true} />);
    const span = screen.getByText('true');
    expect(span).toHaveClass('json-boolean');
  });

  it('renders null with muted color', () => {
    render(<JsonFormatter data={null} />);
    const span = screen.getByText('null');
    expect(span).toHaveClass('json-null');
  });

  it('detects and formats timestamps', () => {
    const timestamp = 1713200000000; // Some time in 2024
    render(<JsonFormatter data={timestamp} />);
    const span = screen.getByText(String(timestamp));
    expect(span).toHaveClass('timestamp-val');
    expect(span).toHaveAttribute('data-iso');
  });

  it('renders arrays recursively', () => {
    render(<JsonFormatter data={["a", 1]} />);
    expect(screen.getByText('"a"')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText((content) => content.startsWith('['))).toBeInTheDocument();
    expect(screen.getByText((content) => content.endsWith(']'))).toBeInTheDocument();
  });

  it('renders objects recursively', () => {
    render(<JsonFormatter data={{ key: "value" }} />);
    expect(screen.getByText('"key"')).toHaveClass('json-key');
    expect(screen.getByText('"value"')).toHaveClass('json-string');
    expect(screen.getByText((content) => content.startsWith('{'))).toBeInTheDocument();
    expect(screen.getByText((content) => content.endsWith('}'))).toBeInTheDocument();
  });
});
