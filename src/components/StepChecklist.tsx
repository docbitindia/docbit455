import React from 'react';

export interface ChecklistStep {
  id: string;
  label: string;
}

interface Props {
  steps: ChecklistStep[];
  /** index of the step currently in progress; steps before it are done */
  activeIndex: number;
  /** true once every step has finished */
  complete: boolean;
}

export function StepChecklist({ steps, activeIndex, complete }: Props) {
  return (
    <ul className="space-y-2.5">
      {steps.map((step, i) => {
        const isDone = complete || i < activeIndex;
        const isActive = !complete && i === activeIndex;
        return (
          <li key={step.id} className="flex items-center gap-3 text-sm">
            <span
              className={[
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-200',
                isDone
                  ? 'bg-signal-500 text-white'
                  : isActive
                  ? 'border-2 border-signal-500'
                  : 'border-2 border-ink-200'
              ].join(' ')}
            >
              {isDone ? (
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5l3.2 3.2L13 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : isActive ? (
                <span className="h-2 w-2 rounded-full bg-signal-500 animate-pulse" />
              ) : null}
            </span>
            <span
              className={[
                'transition-colors duration-200',
                isDone ? 'text-ink-900' : isActive ? 'text-ink-900 font-medium' : 'text-ink-600/40'
              ].join(' ')}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
