import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  size = 'md'
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousTouch = document.body.style.touchAction;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlTouch = document.documentElement.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.touchAction = 'none';
    return () => { document.body.style.overflow = previousOverflow; document.body.style.touchAction = previousTouch; document.documentElement.style.overflow = previousHtmlOverflow; document.documentElement.style.touchAction = previousHtmlTouch; };
  }, [open, onClose]);
  if (!open) return null;
  const width = size === 'sm' ? 'min(440px, calc(100vw - 24px))' : size === 'lg' ? 'min(720px, calc(100vw - 24px))' : 'min(560px, calc(100vw - 24px))';
  const modal = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-ink-950/35 p-3 sm:p-6" role="dialog" aria-modal="true" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex max-h-[88vh] min-h-0 flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl" style={{ width }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e1e4df] bg-white px-4 py-3">
          <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-ink-900">{title}</h2>{description && <p className="mt-0.5 text-[11px] leading-4 text-ink-600/60">{description}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-paper-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto thin-scroll bg-[#f7f8f6] p-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-ink-100 bg-white px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
}
