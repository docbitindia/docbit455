import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from './Modal';

export interface GlobalSelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function GlobalSelect<T extends string = string>({
  value,
  options,
  children,
  onChange,
  className = '',
  title = 'Select an option',
  description,
  disabled = false,
  compact = false,
}: {
  value: T;
  options?: GlobalSelectOption<T>[];
  children?: React.ReactNode;
  onChange: (value: T) => void;
  className?: string;
  title?: string;
  description?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const childOptions = React.Children.toArray(children).flatMap((child: React.ReactNode) => {
    if (!React.isValidElement(child)) return [];
    const props = child.props as { value?: T; children?: React.ReactNode; disabled?: boolean };
    return [{ value: props.value as T, label: typeof props.children === 'string' || typeof props.children === 'number' ? String(props.children) : String(props.value ?? ''), disabled: props.disabled }];
  });
  const resolvedOptions = options ?? childOptions;
  const selected = resolvedOptions.find((option) => option.value === value);
  const triggerClass = className || (compact
    ? 'w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-xs text-ink-900 outline-none transition-colors hover:border-ink-300'
    : 'input');

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`${triggerClass} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="min-w-0 truncate">{selected?.label ?? value}</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        size="sm"
      >
        <div className="grid gap-2">
          {resolvedOptions.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${active ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{option.label}</span>
                  {option.description && <span className="mt-0.5 block text-xs text-slate-400">{option.description}</span>}
                </span>
                {active && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
