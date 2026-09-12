import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Check, FileDown, FileText, ImagePlus, Palette, Table2 } from 'lucide-react';
import type { DatasetSchema, RawDataset } from '../types/dataset';
import type { ProcessedReport } from '../types/processed';
import type { ReportConfig, ReportBranding } from '../types/report';
import { Modal } from './Modal';
import { displayCell } from '../utils/format';
import { buildReportPdf } from '../report/pdf';
import { recordFileHistory } from '../state/history';

const TABS = [
  ['overview', 'Overview', BarChart3], ['data', 'Data', Table2], ['branding', 'Branding', Palette]
] as const;
interface Props { open:boolean; onClose:()=>void; raw:RawDataset; schema:DatasetSchema; report:ProcessedReport; config:ReportConfig; update:(updater:(prev:ReportConfig)=>ReportConfig)=>void; }

export function ReportGeneratorModal({open,onClose,raw,schema,report,config,update}:Props){
  const [tab,setTab]=useState<'overview'|'data'|'branding'>('overview');
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState<string|null>(null);
  const branding=config.design.branding;
  const updateBranding=(patch:Partial<ReportBranding>)=>update(prev=>({...prev,design:{...prev.design,branding:{...prev.design.branding,...patch}}}));
  const visibleColumns=useMemo(()=>report.columns,[report.columns]);
  useEffect(()=>{ if(open){setTab('overview');setMessage(null);} },[open]);
  const generate=async()=>{
    if(!report.stats.finalRowCount || busy)return;
    setBusy(true);setMessage(null);
    try{
      const blob=await buildReportPdf(raw,report,branding);
      const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${(branding.title||raw.meta.fileName||'docbit-report').replace(/[^a-z0-9._-]+/gi,'-').replace(/-+/g,'-')}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000);
      recordFileHistory({fileName:raw.meta.fileName,fileSize:raw.meta.fileSize,fileType:raw.meta.fileType},'reported');
      setMessage('PDF generated and downloaded.');
    }catch(error){setMessage(error instanceof Error?error.message:'The PDF could not be generated.');}
    finally{setBusy(false);}
  };
  return <Modal open={open} onClose={onClose} title="Generate report" description="Create a separate PDF report from the current data view. Editor export remains Excel, CSV or JSON." size="lg" footer={<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0 text-[10px] leading-4 text-slate-500">Landscape A4 · paginated table · current columns, filters, sorting, grouping and calculations.</div><button type="button" onClick={generate} disabled={busy||report.stats.finalRowCount===0} className="btn-primary justify-center"><FileDown size={15}/>{busy?'Generating PDF…':'Generate PDF'}</button></div>}>
    <div className="grid gap-4 lg:grid-cols-[170px_1fr]">
      <nav className="h-fit rounded-xl border border-slate-200 bg-white p-1.5">{TABS.map(([id,label,Icon])=><button key={id} type="button" onClick={()=>setTab(id as typeof tab)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold ${tab===id?'bg-blue-50 text-blue-700':'text-slate-600 hover:bg-slate-50'}`}><Icon size={15}/>{label}</button>)}</nav>
      <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
        {message&&<div className={`mb-4 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${message.startsWith('PDF generated')?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-rose-200 bg-rose-50 text-rose-800'}`}><Check size={15}/>{message}</div>}
        {tab==='overview'&&<div className="space-y-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Rows',report.stats.finalRowCount.toLocaleString()],['Columns',String(report.stats.selectedColumnCount)],['Filters',String(report.stats.activeFilterCount)],['Groups',String(report.groups?.length??0)]].map(([a,b])=><div key={a} className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-400">{a}</p><p className="mt-1 text-lg font-bold text-slate-900">{b}</p></div>)}</div><div className="space-y-2 text-xs">{[['Source',raw.meta.fileName],['Columns',visibleColumns.map(c=>c.displayName).join(', ')||'None'],['Filters',config.filterGroup.conditions.length?`${config.filterGroup.conditions.length} active condition(s)`:'None'],['Sort',config.sorts.length?`${config.sorts.length} rule(s)`:'None'],['Group',config.group.columnKey?(schema.columns.find(c=>c.key===config.group.columnKey)?.originalName||'Configured'):'None'],['Calculate',config.calculations.length?`${config.calculations.length} calculation(s)`:'None']].map(([a,b])=><div key={a} className="grid grid-cols-[80px_1fr] gap-3 rounded-lg border border-slate-100 p-2.5"><span className="font-semibold text-slate-800">{a}</span><span className="min-w-0 break-words text-slate-500">{b}</span></div>)}</div></div>}
        {tab==='data'&&<div><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold">Report data preview</p><p className="mt-1 text-[11px] text-slate-500">This preview uses the same configured view that will be written to the PDF.</p></div><span className="text-[10px] font-semibold text-slate-400">First 8 rows</span></div><div className="max-h-[360px] overflow-auto rounded-lg border border-slate-200"><table className="min-w-full text-[10px]"><thead className="sticky top-0 z-10 bg-slate-50"><tr>{report.columns.map(c=><th key={c.key} className="whitespace-nowrap px-2 py-2 text-left font-semibold text-slate-600">{c.displayName}</th>)}</tr></thead><tbody>{report.rows.slice(0,8).map(r=><tr key={r.id} className="border-t border-slate-100">{report.columns.map((c,i)=><td key={c.key} className="max-w-[180px] truncate px-2 py-2 text-slate-600">{displayCell(r.values[i],c.dataType,c.settings)||'—'}</td>)}</tr>)}</tbody></table></div></div>}
        {tab==='branding'&&<div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Logo URL" value={branding.logoUrl} onChange={v=>updateBranding({logoUrl:v})} placeholder="https://…"/><Field label="Report title" value={branding.title} onChange={v=>updateBranding({title:v})}/><Field label="Subtitle" value={branding.subtitle} onChange={v=>updateBranding({subtitle:v})}/><Field label="Phone" value={branding.phone} onChange={v=>updateBranding({phone:v})}/><Field label="Email" value={branding.email} onChange={v=>updateBranding({email:v})}/><Field label="Link" value={branding.link} onChange={v=>updateBranding({link:v})}/><Field label="Footer text" value={branding.bottomText} onChange={v=>updateBranding({bottomText:v})}/><label className="grid gap-1.5 text-[11px] font-semibold text-slate-600"><span>Theme color</span><div className="flex gap-2"><input type="color" value={/^#[0-9a-f]{6}$/i.test(branding.theme)?branding.theme:'#2563EB'} onChange={e=>updateBranding({theme:e.target.value})} className="h-9 w-12 rounded-lg border border-slate-200 bg-white p-1"/><input value={branding.theme} onChange={e=>updateBranding({theme:e.target.value})} className="input flex-1"/></div></label></div><label className="grid gap-1.5 text-[11px] font-semibold text-slate-600"><span>Custom logo file</span><div className="flex items-center gap-2"><input type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-xs" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>2*1024*1024){setMessage('Logo must be 2 MB or smaller.');return;}const reader=new FileReader();reader.onload=()=>updateBranding({logoUrl:String(reader.result)});reader.readAsDataURL(file);}}/><ImagePlus size={16} className="shrink-0 text-slate-400"/></div></label><div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] leading-5 text-blue-900/75">The default DocBit logo and Excel/CSV/JSON project icons are used automatically when no custom branding is supplied.</div></div>}
      </div>
    </div>
  </Modal>;
}
function Field({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string}){return <label className="grid gap-1.5 text-[11px] font-semibold text-slate-600"><span>{label}</span><input value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)} className="input"/></label>}
