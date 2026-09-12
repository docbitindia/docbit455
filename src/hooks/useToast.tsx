import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export type ToastKind = 'info' | 'success' | 'error';

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  push: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const AUTO_DISMISS_MS = 3000;
const SWIPE_DISMISS_PX = 72;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    counter.current += 1;
    const id = `toast_${counter.current}`;
    setToasts((prev) => [...prev, { id, kind, message }]);
    const timer = setTimeout(() => {
      timers.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
    timers.current.set(id, timer);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        className="fixed z-[100] flex flex-col gap-2 items-end"
        style={{
          bottom: 'calc(var(--safe-bottom) + 16px)',
          right: 'calc(var(--safe-right) + 16px)',
          left: 'calc(var(--safe-left) + 16px)'
        }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [entered, setEntered] = useState(false);
  const startX = useRef<number | null>(null);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    startX.current = e.clientX;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    setOffset(e.clientX - startX.current);
  };

  const endDrag = () => {
    if (startX.current === null) return;
    startX.current = null;
    setDragging(false);
    if (Math.abs(offset) > SWIPE_DISMISS_PX) {
      // Swiped far enough — finish the gesture by flying the toast the
      // rest of the way off, then remove it.
      setLeaving(true);
      setOffset(offset > 0 ? 480 : -480);
      window.setTimeout(() => onDismiss(toast.id), 160);
    } else {
      setOffset(0);
    }
  };

  const opacity = leaving ? 0 : entered ? Math.max(0, 1 - Math.abs(offset) / 220) : 0;

  return (
    <div
      role="status"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={[
        'max-w-sm w-full sm:w-auto rounded-lg px-4 py-3 text-sm shadow-panel border ml-auto select-none cursor-grab active:cursor-grabbing',
        'bg-signal-100 border-signal-500/30 text-signal-600'
      ].join(' ')}
      style={{
        transform: `translateY(${entered ? 0 : 6}px) translateX(${offset}px)`,
        opacity,
        transition: dragging ? 'none' : 'transform 200ms ease-out, opacity 200ms ease-out',
        touchAction: 'pan-y'
      }}
    >
      {toast.message}
    </div>
  );
}
