import React from 'react';

interface Props {
  onBack: () => void; onReset: () => void; canReset: boolean;
  onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
  backOnRight?: boolean;
}
export function TopBar({onBack,onReset,canReset,onUndo,onRedo,canUndo,canRedo,backOnRight=false}:Props){return <header className="flex items-center justify-between gap-3 border-b border-[#e1e4df] bg-white px-3 sm:px-5" style={{paddingTop:'calc(var(--safe-top) + 8px)',paddingBottom:8}}>
 <div>{!backOnRight&&<button type="button" onClick={onBack} className="focus-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-ink-700 hover:bg-paper-100">← <span>Back</span></button>}</div>
 <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
  <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo" className="focus-ring h-7 w-7 rounded-md text-ink-600 hover:bg-paper-100 disabled:opacity-30">↶</button>
  <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo" className="focus-ring h-7 w-7 rounded-md text-ink-600 hover:bg-paper-100 disabled:opacity-30">↷</button>
  <div className="w-px h-5 bg-ink-200 mx-0.5 sm:mx-1"/>
  <button type="button" onClick={onReset} disabled={!canReset} className="focus-ring inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium text-ink-600 hover:bg-paper-100 disabled:opacity-30">Reset</button>
  {backOnRight&&<button type="button" onClick={onBack} className="focus-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-ink-700 hover:bg-paper-100">Back →</button>}
 </div></header>}
