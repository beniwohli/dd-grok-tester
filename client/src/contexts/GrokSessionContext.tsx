import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useGrokSession } from '../hooks/useGrokSession';

type GrokSessionContextValue = ReturnType<typeof useGrokSession>;

const GrokSessionContext = createContext<GrokSessionContextValue | null>(null);

export function GrokSessionProvider({ children }: { children: ReactNode }) {
  const session = useGrokSession();
  return <GrokSessionContext.Provider value={session}>{children}</GrokSessionContext.Provider>;
}

export function useGrokSessionContext(): GrokSessionContextValue {
  const ctx = useContext(GrokSessionContext);
  if (!ctx) throw new Error('useGrokSessionContext must be used within GrokSessionProvider');
  return ctx;
}
