import React, { useEffect, useState } from 'react';
import { Activity, Clock3, FileText, Trash2 } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { usePageMeta } from '../hooks/usePageMeta';
import { PAGE_META } from '../seo/pageMeta';
import { clearFileHistory, listFileHistory, type FileHistoryEntry } from '../state/history';
import { formatFileSize } from '../utils/format';

const statusCopy: Record<FileHistoryEntry['status'], string> = { opened:'Opened', edited:'Edited', exported:'Exported', reported:'Report generated' };
export function HistoryPage(){
  usePageMeta(PAGE_META['/history']); const [items,setItems]=useState<FileHistoryEntry[]>([]);
  useEffect(()=>setItems(listFileHistory()),[]);
  return <AppShell><div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-7 sm:py-9">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-blue-600"><Activity size={15}/><p className="text-xs font-semibold">Activity</p></div><h1 className="mt-1 text-3xl font-semibold tracking-[-.035em]">History</h1><p className="mt-2 text-sm text-slate-500">A lightweight record of files and report activity in this browser.</p></div>{items.length>0&&<button className="btn-secondary self-start sm:self-auto" onClick={()=>{clearFileHistory();setItems([]);}}><Trash2 size={15}/>Clear history</button>}</div>
    <div className="mt-7 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      {items.length===0?<div className="px-6 py-16 text-center"><Clock3 className="mx-auto text-slate-300" size={30}/><p className="mt-3 text-sm font-semibold text-slate-600">No activity yet</p><p className="mt-1 text-xs text-slate-400">Open a file from Workspace to start building your local activity trail.</p></div>:<><div className="hidden grid-cols-[minmax(0,1fr)_150px_150px] border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400 sm:grid"><span>File</span><span>Activity</span><span>Time</span></div><div className="divide-y divide-slate-100">{items.map(item=><div key={item.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_150px_150px] sm:items-center sm:px-5"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><FileText size={18}/></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.fileName}</p><p className="mt-0.5 text-[10px] text-slate-400">{item.fileType.toUpperCase()} · {formatFileSize(item.fileSize)}</p></div></div><span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{statusCopy[item.status]}</span><span className="text-[10px] text-slate-400">{new Date(item.openedAt).toLocaleString()}</span></div>)}</div></>}
    </div><p className="mt-3 text-[10px] leading-5 text-slate-400">History is intentionally local to this browser. It does not claim that source files are stored in the cloud.</p>
  </div></AppShell>;
}
