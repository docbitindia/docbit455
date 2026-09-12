import React from 'react';
import { StepChecklist, type ChecklistStep } from './StepChecklist';
import { FileTypeIcon, fileTypeFromName } from './FileTypeIcon';

export const ANALYSIS_STEPS: ChecklistStep[] = [
  { id: 'read', label: 'Reading file' },
  { id: 'structure', label: 'Understanding structure' },
  { id: 'header', label: 'Detecting header row' },
  { id: 'columns', label: 'Analyzing columns' },
  { id: 'quality', label: 'Checking data quality' },
  { id: 'workspace', label: 'Preparing editor' }
];

interface Props {
  fileName: string;
  activeIndex: number;
}

export function AnalysisSequence({ fileName, activeIndex }: Props) {
  return (
    <div className="max-w-sm w-full mx-auto animate-fade-in">
      <div className="rounded-2xl border border-ink-200 bg-white shadow-panel px-6 py-7">
        <div className="mb-2 flex items-center gap-2 min-w-0"><FileTypeIcon type={fileTypeFromName(fileName)} size={22} /><p className="text-xs font-medium text-ink-600/50 truncate">{fileName}</p></div>
        <h2 className="font-display text-lg text-ink-900 mb-5">Understanding your file…</h2>
        <StepChecklist steps={ANALYSIS_STEPS} activeIndex={activeIndex} complete={false} />
      </div>
    </div>
  );
}
