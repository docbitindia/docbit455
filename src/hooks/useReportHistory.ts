import { useCallback, useMemo, useRef, useState } from 'react';

const MAX_HISTORY = 100;

/**
 * Generic undo/redo history over any state shape. DocBit uses this for a
 * single combined session (raw dataset + report config) so one Undo/Redo
 * pair covers both configuration changes (filters, sorts, columns...) and
 * live data edits made directly in the preview table — they're the same
 * timeline from the user's point of view.
 */
export function useHistory<T>(initial: T) {
  const [state, setStateInternal] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, forceRender] = useState(0);

  const update = useCallback((updater: (prev: T) => T, opts?: { skipHistory?: boolean }) => {
    setStateInternal((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      if (!opts?.skipHistory) {
        // History entries must never share mutable object graphs with the live
        // document. The application state is JSON-compatible, so structuredClone
        // gives us a safe immutable transaction boundary without introducing a
        // second document model.
        const snapshot = typeof structuredClone === 'function'
          ? structuredClone(prev)
          : JSON.parse(JSON.stringify(prev)) as T;
        past.current.push(snapshot);
        if (past.current.length > MAX_HISTORY) past.current.shift();
        future.current = [];
      }
      return next;
    });
  }, []);

  const replaceAll = useCallback((next: T) => {
    past.current = [];
    future.current = [];
    setStateInternal(next);
  }, []);

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    setStateInternal((current) => {
      const prev = past.current.pop()!;
      const currentSnapshot = typeof structuredClone === 'function' ? structuredClone(current) : JSON.parse(JSON.stringify(current)) as T;
      future.current.push(currentSnapshot);
      return prev;
    });
    forceRender((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    setStateInternal((current) => {
      const next = future.current.pop()!;
      const currentSnapshot = typeof structuredClone === 'function' ? structuredClone(current) : JSON.parse(JSON.stringify(current)) as T;
      past.current.push(currentSnapshot);
      return next;
    });
    forceRender((n) => n + 1);
  }, []);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  return useMemo(
    () => ({ state, update, replaceAll, undo, redo, canUndo, canRedo }),
    [state, update, replaceAll, undo, redo, canUndo, canRedo]
  );
}
