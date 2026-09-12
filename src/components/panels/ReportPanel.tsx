import React from 'react';
import { FileOutput, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { DatasetSchema, RawDataset } from '../../types/dataset';
import type { ProcessedReport } from '../../types/processed';
import type { ReportConfig } from '../../types/report';
import { navigate } from '../../router/useRoute';

export function ReportPanel({ raw, schema, report, config, update }: { raw: RawDataset; schema: DatasetSchema; report: ProcessedReport; config: ReportConfig; update: (updater: (prev: ReportConfig) => ReportConfig) => void }) {
  return <div className="space-y-4">
    <section className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white shadow-sm">
      <div className="p-4">
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><FileOutput size={18}/></div><div><p className="text-sm font-semibold text-slate-900">Generate Report</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Turn the analyzed result into a clean, print-ready report without changing the working dataset.</p></div></div>
        <div className="mt-4 grid grid-cols-2 gap-2"><Metric label="Rows" value={report.stats.finalRowCount.toLocaleString()}/><Metric label="Columns" value={String(report.stats.selectedColumnCount)}/><Metric label="Filters" value={String(report.stats.activeFilterCount)}/><Metric label="Calculations" value={String(config.calculations.length)}/></div>
        <button type="button" onClick={() => navigate('/report')} disabled={report.stats.finalRowCount === 0} className="btn-primary mt-4 w-full justify-center"><FileOutput size={15}/> Customize & generate</button>
      </div>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-3.5"><div className="flex items-center gap-2 text-xs font-semibold text-slate-800"><SlidersHorizontal size={15} className="text-blue-600"/> Uses current editor configuration</div><p className="mt-2 text-[11px] leading-5 text-slate-500">Columns, filters, sorting, grouping and calculations are inherited from the current result. Branding and report presentation are customized separately.</p></section>
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5"><div className="flex items-center gap-2 text-xs font-semibold text-emerald-800"><ShieldCheck size={15}/> Source remains unchanged</div><p className="mt-1.5 text-[11px] leading-5 text-emerald-700/80">Generating a report does not mutate your original uploaded data.</p></section>
  </div>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-blue-100 bg-white/80 p-2.5"><p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{value}</p></div>}
