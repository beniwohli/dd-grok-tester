import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterAll, afterEach, beforeAll } from 'vitest';
import { useGrokSession } from '../useGrokSession';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.post('/api/parse', async ({ request }) => {
    const body = await request.json() as any;
    if (body.sample === 'match') {
      return HttpResponse.json({
        parsed: { key: 'value' },
        matched_rule: 'rule1',
      });
    }
    return HttpResponse.json({
      error: 'No match',
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

describe('useGrokSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('loads initial state from localStorage', () => {
    localStorage.setItem('dd-grok-match-rules', 'my rules');
    const { result } = renderHook(() => useGrokSession());
    expect(result.current.matchRules).toBe('my rules');
  });

  it('manages samples', () => {
    const { result } = renderHook(() => useGrokSession());
    
    act(() => {
      result.current.addSample();
    });
    expect(result.current.samples.length).toBe(2);

    const firstSampleId = result.current.samples[0].id;
    act(() => {
      result.current.updateSample(firstSampleId, 'new text');
    });
    expect(result.current.samples[0].text).toBe('new text');

    act(() => {
      result.current.removeSample(firstSampleId);
    });
    expect(result.current.samples.length).toBe(1);
    expect(result.current.samples[0].id).not.toBe(firstSampleId);
  });

  it('debounces and parses samples', async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => useGrokSession());
    
    act(() => {
      result.current.setMatchRules('rule1 pattern');
      result.current.updateSample(result.current.samples[0].id, 'match');
    });

    // Wait for debounce and API call
    await waitFor(() => {
      const sampleId = result.current.samples[0].id;
      return expect(result.current.results[sampleId]?.parsed).toEqual({ key: 'value' });
    }, { timeout: 2000 });
  });

  it('manages history', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGrokSession());
    
    act(() => {
      result.current.setSessionName('Test Session');
    });
    
    act(() => {
      result.current.saveToHistory();
    });
    
    expect(result.current.history.length).toBe(1);
    expect(result.current.history[0].name).toBe('Test Session');

    act(() => {
      result.current.clearSession(); // First click
      vi.advanceTimersByTime(3100); // Wait past 3s auto-cancel
    });
    
    expect(result.current.sessionName).toBe('Test Session'); // Still there because it auto-cancelled

    act(() => {
      result.current.clearSession(); // First click again
    });
    act(() => {
      result.current.clearSession(); // Second click
    });

    expect(result.current.sessionName).toBe('');
  });
});
