import { useState, useEffect, useCallback, useRef } from 'react';

export type PendingConfirm =
  | { type: 'clear-session' }
  | { type: 'clear-history' }
  | { type: 'delete-item'; id: string };

export const useConfirmActions = () => {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const confirmTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current !== null) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  const requestConfirm = useCallback(
    (action: PendingConfirm, onConfirmed: () => void): void => {
      const isSamePending =
        pendingConfirm !== null &&
        pendingConfirm.type === action.type &&
        (action.type !== 'delete-item' ||
          (pendingConfirm.type === 'delete-item' && pendingConfirm.id === action.id));

      if (isSamePending) {
        if (confirmTimeoutRef.current !== null) {
          clearTimeout(confirmTimeoutRef.current);
          confirmTimeoutRef.current = null;
        }
        setPendingConfirm(null);
        onConfirmed();
      } else {
        if (confirmTimeoutRef.current !== null) {
          clearTimeout(confirmTimeoutRef.current);
        }
        setPendingConfirm(action);
        confirmTimeoutRef.current = window.setTimeout(() => {
          setPendingConfirm(null);
          confirmTimeoutRef.current = null;
        }, 3000);
      }
    },
    [pendingConfirm]
  );

  const isClearSessionPending = pendingConfirm?.type === 'clear-session';
  const isClearHistoryPending = pendingConfirm?.type === 'clear-history';
  const pendingDeleteId = pendingConfirm?.type === 'delete-item' ? pendingConfirm.id : null;

  return {
    pendingConfirm,
    setPendingConfirm,
    requestConfirm,
    isClearSessionPending,
    isClearHistoryPending,
    pendingDeleteId,
  };
};
