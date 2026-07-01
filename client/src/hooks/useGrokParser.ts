import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { generateId } from '../utils';
import type { Sample, ParseResult, TabId } from '../types';

interface UseGrokParserParams {
  currentTab: TabId;
}

export const useGrokParser = ({ currentTab }: UseGrokParserParams) => {
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return localStorage.getItem('dd-grok-session-id') || generateId();
  });

  const [sessionName, setSessionName] = useState<string>(() => {
    return localStorage.getItem('dd-grok-session-name') || '';
  });

  const [samples, setSamples] = useState<Sample[]>(() => {
    const saved = localStorage.getItem('dd-grok-samples-v2');
    if (saved) return JSON.parse(saved);
    return [{ id: generateId(), text: '' }];
  });
  
  const [matchRules, setMatchRules] = useState(() => {
    return localStorage.getItem('dd-grok-match-rules') || '';
  });
  
  const [supportRules, setSupportRules] = useState(() => {
    return localStorage.getItem('dd-grok-support-rules') || '';
  });

  const [results, setResults] = useState<Record<string, ParseResult>>({});
  const lastRequestTimer = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const persistTimeoutRef = useRef<number | null>(null);

  // Sync session inputs to localStorage
  useEffect(() => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = window.setTimeout(() => {
      localStorage.setItem('dd-grok-session-id', currentSessionId);
      localStorage.setItem('dd-grok-session-name', sessionName);
      localStorage.setItem('dd-grok-samples-v2', JSON.stringify(samples));
      localStorage.setItem('dd-grok-match-rules', matchRules);
      localStorage.setItem('dd-grok-support-rules', supportRules);
    }, 300);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [currentSessionId, sessionName, samples, matchRules, supportRules]);

  // Clean up in-flight requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const parseAllSamples = useCallback(async () => {
    const validSamples = samples.filter(s => s.text.trim());
    if (validSamples.length === 0 || !matchRules.trim()) {
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setResults(prev => {
      const next = { ...prev };
      validSamples.forEach(s => {
        next[s.id] = { ...next[s.id], isLoading: true };
      });
      return next;
    });

    try {
      const response = await axios.post('/api/parse', {
        samples: validSamples.map(s => s.text),
        match_rules: matchRules,
        support_rules: supportRules || null
      }, {
        signal: controller.signal
      });
      
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }

      const resultsData = response.data.results;
      
      setResults(prev => {
        const next = { ...prev };
        validSamples.forEach((sample, index) => {
          next[sample.id] = {
            isLoading: false,
            parsed: resultsData[index]?.parsed,
            matched_rule: resultsData[index]?.matched_rule,
          };
        });
        return next;
      });
    } catch (err) {
      if (axios.isCancel(err)) {
        return;
      }

      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }

      setResults(prev => {
        const next = { ...prev };
        validSamples.forEach(sample => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const e = err as any;
          next[sample.id] = {
            isLoading: false,
            error: e.response?.data?.error || e.message || 'Error parsing sample'
          };
        });
        return next;
      });
    }
  }, [samples, matchRules, supportRules]);

  // Handle debounced auto-parsing
  useEffect(() => {
    if (currentTab !== 'test') return;
    
    if (lastRequestTimer.current) {
      clearTimeout(lastRequestTimer.current);
    }

    lastRequestTimer.current = window.setTimeout(() => {
      parseAllSamples();
    }, 600);

    return () => {
      if (lastRequestTimer.current) clearTimeout(lastRequestTimer.current);
    };
  }, [samples, matchRules, supportRules, parseAllSamples, currentTab]);

  const addSample = () => {
    setSamples([...samples, { id: generateId(), text: '' }]);
  };

  const updateSample = (id: string, value: string) => {
    setSamples(samples.map(s => s.id === id ? { ...s, text: value } : s));
  };

  const removeSample = (id: string) => {
    const next = samples.filter(s => s.id !== id);
    setSamples(next);
    setResults(prev => {
      const nextRes = { ...prev };
      delete nextRes[id];
      return nextRes;
    });
  };

  return {
    currentSessionId,
    setCurrentSessionId,
    sessionName,
    setSessionName,
    samples,
    setSamples,
    matchRules,
    setMatchRules,
    supportRules,
    setSupportRules,
    results,
    setResults,
    addSample,
    updateSample,
    removeSample,
    parseAllSamples,
  };
};
