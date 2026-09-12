import { useCallback, useMemo, useRef, useState } from 'react';
import type { CellValue, RawDataset, DataType } from '../types/dataset';
import type { ReportConfig, RowRange, ColumnDisplaySettings } from '../types/report';
import type { DocumentState } from '../types/document';
import { buildSchema } from '../engine/headerDetection';
import { remapColumnsForNewSchema, normalizeReportConfig } from '../engine/config';
import { defaultColumnSettings } from '../engine/config';
import { prepareColumnImport, convertColumnValue, type ColumnImportMode } from '../engine/columnImport';
import { evaluateColumnTypeConversion, convertColumnValues, type BooleanMapping, type ConversionEvaluation } from '../engine/typeConversion';
import { useProcessedReport } from './useProcessedReport';
import { makeId } from '../utils/id';
import { insertBlankCell } from '../utils/cellShift';
import { useHistory } from './useReportHistory';
import { useToast } from './useToast';

const EMPTY_CONFIG: ReportConfig = {
  revision: 0, headerRowIndex: 0, excludedRanges: [], columns: [],
  filterGroup: { id: 'fg_empty', logic: 'AND', conditions: [] }, sorts: [],
  group: { columnKey: null, aggregates: [] }, calculations: [],
  design: { fileName: 'extracted_data', showSummary: true, density: 'comfortable', branding: { logoUrl: 'https://res.cloudinary.com/dlesei0kn/image/upload/v1787478477/file_000000005a44820885c9d29411b18ee4_rsbyqc.png', title: 'DocBit Data Report', subtitle: 'Prepared data overview', phone: '', email: '', link: '', theme: '#2563EB', bottomText: 'Generated with DocBit', iconUrls: ['/file-icons/excel.svg', '/file-icons/csv.svg', '/file-icons/json.svg'] } }
};
const EMPTY_RAW: RawDataset = { id: 'ds_empty', meta: { fileName: '', fileType: 'csv', fileSize: 0, importedAt: '' }, rows: [], columnCount: 0 };
const EMPTY_SESSION: DocumentState = { raw: EMPTY_RAW, config: EMPTY_CONFIG };

export interface DocumentEditorInitial {
  document?: DocumentState;
  baseline?: DocumentState | null;
}

export function useDocumentEditor(initial: DocumentEditorInitial = {}) {
  const toast = useToast();
  const initialDocument = initial.document ? { ...initial.document, config: normalizeReportConfig(initial.document.config) } : EMPTY_SESSION;
  const session = useHistory<DocumentState>(initialDocument);
  const originalSessionRef = useRef<DocumentState | null>(initial.baseline ?? (initial.document ? initial.document : null));
  const raw = session.state.raw;
  const config = session.state.config;
  const { report, processing: reportProcessing } = useProcessedReport(raw, config);
  // Every editor mutation increments config.revision. Avoid serializing the
  // entire dataset on every render: JSON.stringify() becomes an O(n) main-thread
  // pause on large imports and was a major source of "frozen" interaction.
  const hasDataChanges = useMemo(() => {
    const baseline = originalSessionRef.current;
    return !!baseline && session.state.config.revision !== baseline.config.revision;
  }, [session.state.config.revision]);
  const lastFileRef = useRef<File | null>(null);

  const updateConfig = useCallback((updater: (prev: ReportConfig) => ReportConfig) => {
    session.update(prev => ({ ...prev, config: { ...updater(prev.config), revision: (prev.config.revision ?? 0) + 1 } }));
  }, [session.update]);
  const updateRaw = useCallback((updater: (prev: RawDataset) => RawDataset) => {
    session.update(prev => ({ ...prev, raw: updater(prev.raw), config: { ...prev.config, revision: (prev.config.revision ?? 0) + 1 } }));
  }, [session.update]);

  const evaluateTypeChange = useCallback((columnKey: string, targetType: DataType): ConversionEvaluation | null => {
    const schema = buildSchema(raw, config.headerRowIndex);
    return evaluateColumnTypeConversion(raw, schema, columnKey, targetType);
  }, [raw, config.headerRowIndex]);

  const commitTypeChange = useCallback((columnKey: string, targetType: DataType, mappings: BooleanMapping[] = []) => {
    const schema = buildSchema(raw, config.headerRowIndex);
    const evaluation = evaluateColumnTypeConversion(raw, schema, columnKey, targetType);
    if (evaluation.status === 'unsupported') return { ok: false, error: evaluation.reason ?? 'Conversion is not safe.' };
    const result = convertColumnValues(raw, schema, columnKey, targetType, mappings.length ? mappings : evaluation.mappings);
    if (result.error) return { ok: false, error: result.error };
    session.update(prev => ({ ...prev, raw: result.raw, config: { ...prev.config, revision: (prev.config.revision ?? 0) + 1, columns: prev.config.columns.map(c => c.key === columnKey ? { ...c, type: targetType, settings: { ...defaultColumnSettings(targetType), width: c.settings.width } } : c) } }));
    return { ok: true as const };
  }, [raw, config.headerRowIndex, session.update]);

  const applyColumnChanges = useCallback((columnKey: string, displayName: string, settings: ColumnDisplaySettings, targetType: DataType, mappings: BooleanMapping[] = [], visible = true) => {
    const schema = buildSchema(raw, config.headerRowIndex);
    const current = config.columns.find(c => c.key === columnKey);
    if (!current) return { ok: false, error: 'Column not found.' };
    let nextRaw = raw;
    if (targetType !== current.type) {
      const evaluation = evaluateColumnTypeConversion(raw, schema, columnKey, targetType);
      if (evaluation.status === 'unsupported') return { ok: false, error: `${evaluation.reason ?? 'This conversion is unsafe.'} No data was changed.` };
      if (evaluation.status === 'mapping-required' && mappings.some(m => m.target === null)) return { ok: false, error: `Boolean mapping is incomplete for: ${mappings.filter(m => m.target === null).map(m => m.source).join(', ')}` };
      const converted = convertColumnValues(raw, schema, columnKey, targetType, mappings.length ? mappings : evaluation.mappings);
      if (converted.error) return { ok: false, error: converted.error };
      nextRaw = converted.raw;
    }
    session.update(prev => ({ ...prev, raw: nextRaw, config: { ...prev.config, revision: (prev.config.revision ?? 0) + 1, columns: prev.config.columns.map(c => c.key === columnKey ? { ...c, displayName, visible, type: targetType, settings: { ...defaultColumnSettings(targetType), ...settings, width: settings.width || c.settings.width } } : c) } }));
    return { ok: true as const };
  }, [raw, config.headerRowIndex, config.columns, session.update]);

  const getColumnImportTargets = useCallback((columnKey: string, mode: ColumnImportMode) => {
    const schema = buildSchema(raw, config.headerRowIndex);
    const column = schema.columns.find(c => c.key === columnKey);
    if (!column) return [];
    const structural = new Set(schema.structuralGroups.map(g => g.sourceIndex));
    const rows: { sourceIndex: number; empty: boolean }[] = [];
    for (let i = schema.dataStartIndex; i < schema.dataEndIndex; i += 1) {
      const sourceIndex = i + 1;
      if (structural.has(sourceIndex)) continue;
      const value = raw.rows[i]?.[column.index] ?? null;
      rows.push({ sourceIndex, empty: value === null || String(value).trim() === '' });
    }
    return mode === 'fill-empty' ? rows.filter(r => r.empty).map(r => r.sourceIndex) : rows.map(r => r.sourceIndex);
  }, [raw, config.headerRowIndex]);

  const validateImportColumnData = useCallback((columnKey: string, values: CellValue[], mode: ColumnImportMode) => {
    const schema = buildSchema(raw, config.headerRowIndex);
    const prepared = prepareColumnImport(raw, schema, columnKey, values, mode);
    return prepared.ok ? { ok: true as const, plan: prepared.plan } : prepared;
  }, [raw, config.headerRowIndex]);
  const handleImportColumnData = useCallback((columnKey: string, values: CellValue[], mode: ColumnImportMode) => {
    const schema = buildSchema(raw, config.headerRowIndex);
    const prepared = prepareColumnImport(raw, schema, columnKey, values, mode);
    if (!prepared.ok) return prepared;
    session.update(prev => {
      const rows = prev.raw.rows.map(r => [...r]);
      const column = buildSchema(prev.raw, prev.config.headerRowIndex).columns.find(c => c.key === columnKey);
      if (!column) return prev;
      for (const a of prepared.plan.assignments) {
        if (rows[a.sourceIndex - 1]) rows[a.sourceIndex - 1][column.index] = a.value;
      }
      return { ...prev, raw: { ...prev.raw, rows }, config: { ...prev.config, revision: (prev.config.revision ?? 0) + 1 } };
    });
    return { ok: true as const };
  }, [raw, config.headerRowIndex, session.update]);

  const handleHeaderRowChange = useCallback((index: number) => {
    updateConfig(prev => {
      const newSchema = buildSchema(session.state.raw, index);
      const valid = new Set(newSchema.columns.map(c => c.key));
      return { ...prev, headerRowIndex: index, columns: remapColumnsForNewSchema(prev.columns, newSchema), sorts: prev.sorts.filter(s => valid.has(s.columnKey)), filterGroup: { ...prev.filterGroup, conditions: prev.filterGroup.conditions.filter(c => valid.has(c.columnKey)) }, group: { ...prev.group, columnKey: prev.group.columnKey && valid.has(prev.group.columnKey) ? prev.group.columnKey : null, aggregates: prev.group.aggregates.filter(a => !a.columnKey || valid.has(a.columnKey)) }, calculations: prev.calculations.filter(a => !a.columnKey || valid.has(a.columnKey)) };
    });
  }, [session.state.raw, updateConfig]);

  const handleEditCell = useCallback((sourceIndex: number, columnIndex: number, newValue: CellValue) => {
    const rowIdx = sourceIndex - 1;
    if (rowIdx < 0 || rowIdx >= raw.rows.length) return;
    if (raw.rows[rowIdx]?.[columnIndex] === newValue) return;
    updateRaw(prev => { const rows = prev.rows.map(r => [...r]); if (!rows[rowIdx]) return prev; rows[rowIdx][columnIndex] = newValue; return { ...prev, rows }; });
  }, [raw.rows, updateRaw]);

  const handleAddRow = useCallback(() => {
    if (raw.rows.length >= 250000) { toast.push('This dataset is approaching the browser safety threshold. Remove unused rows or continue with a smaller working set.', 'warning'); return; }
    let added = false;
    session.update(prev => {
      const schema = buildSchema(prev.raw, prev.config.headerRowIndex);
      const width = Math.max(prev.raw.columnCount, schema.columns.length);
      const rows = prev.raw.rows.map(r => [...r]);
      const insertAt = Math.max(schema.dataStartIndex, Math.min(schema.dataEndIndex, rows.length));
      const blank = Array.from({ length: width }, () => null as CellValue);
      rows.splice(insertAt, 0, blank);
      const shifted = (prev.raw.manualBlankRows ?? []).map(i => i >= insertAt + 1 ? i + 1 : i);
      const manualBlankRows = [...shifted, insertAt + 1].sort((a, b) => a - b);
      added = true;
      return { ...prev, raw: { ...prev.raw, rows, columnCount: width, manualBlankRows }, config: { ...prev.config, revision: (prev.config.revision ?? 0) + 1 } };
    });
    if (added) toast.push('Blank row added.', 'success');
  }, [session.update, toast, raw.rows.length]);

  const handleAddColumn = useCallback((afterColumnKey?: string | null, options?: { name: string; type: DataType }) => {
    session.update(prev => {
      const schema = buildSchema(prev.raw, prev.config.headerRowIndex); const width = Math.max(prev.raw.columnCount, schema.columns.length);
      const ids = [...(prev.raw.columnIds ?? schema.columns.map(c => c.key))]; while (ids.length < width) ids.push(makeId('col'));
      const found = typeof afterColumnKey === 'string' ? schema.columns.findIndex(c => c.key === afterColumnKey) : -1;
      const insertAt = afterColumnKey === null ? 0 : found >= 0 ? found + 1 : width;
      const rows = prev.raw.rows.map(r => { const next = [...r]; while (next.length < width) next.push(null); next.splice(insertAt, 0, null); return next; });
      const header = [...(rows[prev.config.headerRowIndex] ?? [])]; while (header.length < width + 1) header.push(null);
      const name = options?.name?.trim() || `Column ${width + 1}`; header[insertAt] = name; rows[prev.config.headerRowIndex] = header;
      const newId = makeId('col'); const columnIds = [...ids]; columnIds.splice(insertAt, 0, newId);
      const columns = prev.config.columns.slice().sort((a,b) => a.order-b.order).map(c => ({...c})); columns.forEach((c,i) => { c.order = i >= insertAt ? i + 1 : i; });
      columns.splice(insertAt, 0, { key: newId, visible: true, displayName: name, order: insertAt, type: options?.type ?? 'string', settings: defaultColumnSettings(options?.type ?? 'string') });
      return { ...prev, raw: { ...prev.raw, rows, columnCount: width + 1, columnIds }, config: { ...prev.config, columns, revision: (prev.config.revision ?? 0) + 1 } };
    });
    toast.push('Column added.', 'success');
  }, [session.update, toast]);

  const handleDeleteColumn = useCallback((columnKey: string) => {
    session.update(prev => { const schema = buildSchema(prev.raw, prev.config.headerRowIndex); const col = schema.columns.find(c => c.key === columnKey); if (!col) return prev; const rows = prev.raw.rows.map(r => { const n=[...r]; n.splice(col.index,1); return n; }); const ids=[...(prev.raw.columnIds ?? [])]; ids.splice(col.index,1); return { ...prev, raw:{...prev.raw,rows,columnIds:ids,columnCount:Math.max(0,prev.raw.columnCount-1)}, config:{...prev.config, columns:prev.config.columns.filter(c=>c.key!==columnKey).map((c,i)=>({...c,order:i})), sorts:prev.config.sorts.filter(s=>s.columnKey!==columnKey), filterGroup:{...prev.config.filterGroup,conditions:prev.config.filterGroup.conditions.filter(c=>c.columnKey!==columnKey)}, group:prev.config.group.columnKey===columnKey?{...prev.config.group,columnKey:null}:prev.config.group, calculations:prev.config.calculations.filter(c=>c.columnKey!==columnKey), revision:(prev.config.revision??0)+1} }; });
    toast.push('Column deleted.', 'success');
  }, [session.update, toast]);

  const clipboardCellRef = useRef<{ value: CellValue; sourceIndex: number; columnKey: string } | null>(null);
  const [hasCopiedCell, setHasCopiedCell] = useState(false);
  const handleCopyCell = useCallback(async (sourceIndex: number, columnKey: string) => {
    const schema = buildSchema(raw, config.headerRowIndex);
    const col = schema.columns.find(c => c.key === columnKey);
    if (!col) return;
    const value = raw.rows[sourceIndex - 1]?.[col.index] ?? null;
    // Keep an application-owned copy so Paste remains deterministic even when
    // the browser clipboard changes between Copy and Paste.
    clipboardCellRef.current = { value, sourceIndex, columnKey };
    setHasCopiedCell(true);
    try { await navigator.clipboard?.writeText(value == null ? '' : String(value)); } catch { /* native clipboard is optional */ }
  }, [raw, config.headerRowIndex]);

  const handlePasteCell = useCallback(async (sourceIndex: number, columnKey: string, mode: 'replace' | 'insert-before' | 'insert-after' = 'replace') => {
    const schema = buildSchema(raw, config.headerRowIndex);
    const col = schema.columns.find(c => c.key === columnKey);
    if (!col) return;

    // Prefer the last cell copied inside DocBit. External clipboard text is a
    // fallback only when there is no DocBit cell copy available.
    let value: CellValue | undefined = clipboardCellRef.current?.value;
    if (value === undefined) {
      try {
        const text = await navigator.clipboard?.readText();
        if (text !== undefined) value = text;
      } catch { /* browser may deny clipboard reads */ }
    }
    if (value === undefined) { toast.push('Copy a cell first, then paste it here.', 'warning'); return; }

    const converted = convertColumnValue(value, col.dataType);
    if (converted.error) {
      toast.push(`This value cannot be pasted into ${col.displayName}: ${converted.error}. No data was changed.`, 'error');
      return;
    }
    const normalized = converted.value ?? null;

    if (mode === 'replace') {
      // Replace means exactly that: update only the selected cell. It must
      // never call the structural insertion helper or change row positions.
      const rowIdx = sourceIndex - 1;
      if (rowIdx < 0 || rowIdx >= raw.rows.length) {
        toast.push('The selected cell is no longer available.', 'warning');
        return;
      }
      const currentValue = raw.rows[rowIdx]?.[col.index] ?? null;
      if (currentValue === normalized) {
        toast.push('The selected cell already contains this value.', 'info');
        return;
      }
      updateRaw(prev => {
        const rows = prev.rows.map(r => [...r]);
        if (!rows[rowIdx]) return prev;
        rows[rowIdx][col.index] = normalized;
        return { ...prev, rows };
      });
      toast.push('Cell value replaced.', 'success');
      return;
    }

    session.update(prev => {
      const s = buildSchema(prev.raw, prev.config.headerRowIndex);
      const target = s.columns.find(c => c.key === columnKey);
      if (!target) return prev;
      const dataIndexes: number[] = [];
      const structural = new Set(s.structuralGroups.map(g => g.sourceIndex - 1));
      for (let i = s.dataStartIndex; i < s.dataEndIndex; i += 1) if (!structural.has(i)) dataIndexes.push(i);
      const selectedRaw = sourceIndex - 1;
      const position = dataIndexes.indexOf(selectedRaw);
      if (position < 0) return prev;
      // Both insert-before and insert-after are structural insertions that
      // move the existing tail downward. The only difference is the position
      // of the newly-created empty slot relative to the selected cell.
      const direction = mode === 'insert-before' ? 'top' : 'bottom';
      const result = insertBlankCell(prev.raw.rows, dataIndexes, position, target.index, direction, s.dataEndIndex);
      if (result.insertedRawIndex < 0) return prev;
      const rows = result.rows.map(r => [...r]);
      while (rows[result.insertedRawIndex].length <= target.index) rows[result.insertedRawIndex].push(null);
      rows[result.insertedRawIndex][target.index] = normalized;
      return { ...prev, raw: { ...prev.raw, rows }, config: { ...prev.config, revision: (prev.config.revision ?? 0) + 1 } };
    });
    toast.push(mode === 'insert-before' ? 'Cell inserted before and pasted.' : 'Cell inserted after and pasted.', 'success');
  }, [raw, config.headerRowIndex, handleEditCell, session.update, toast]);

  const handleAddCell = useCallback((sourceIndex:number,columnKey:string,position:'before'|'after'='before')=>{
    const schema=buildSchema(raw,config.headerRowIndex);
    const col=schema.columns.find(c=>c.key===columnKey);
    if(!col) return;
    let changed=false;
    session.update(prev=>{
      const current=buildSchema(prev.raw,prev.config.headerRowIndex);
      const target=current.columns.find(c=>c.key===columnKey);
      if(!target) return prev;
      const structural=new Set(current.structuralGroups.map(g=>g.sourceIndex-1));
      const dataIndexes:number[]=[];
      for(let i=current.dataStartIndex;i<current.dataEndIndex;i+=1) if(!structural.has(i)) dataIndexes.push(i);
      const positionIndex=dataIndexes.indexOf(sourceIndex-1);
      if(positionIndex<0) return prev;
      const direction: 'top'|'bottom'=position==='before'?'top':'bottom';
      const result=insertBlankCell(prev.raw.rows,dataIndexes,positionIndex,target.index,direction,current.dataEndIndex);
      changed=true;
      return {...prev,raw:{...prev.raw,rows:result.rows},config:{...prev.config,revision:(prev.config.revision??0)+1}};
    });
    if(changed) toast.push(position==='before'?'Blank cell inserted before.':'Blank cell inserted after.','success');
  },[raw,config.headerRowIndex,session.update,toast]);

  const handleDeleteCell = useCallback((sourceIndex:number,columnKey:string)=>{
    const schema=buildSchema(raw,config.headerRowIndex); const col=schema.columns.find(c=>c.key===columnKey); if(!col)return;
    session.update(prev=>{
      const s=buildSchema(prev.raw,prev.config.headerRowIndex); const target=s.columns.find(c=>c.key===columnKey); if(!target)return prev;
      const idx=sourceIndex-1; if(idx<0||idx>=prev.raw.rows.length)return prev;
      const rows=prev.raw.rows.map(r=>[...r]);
      for(let r=idx;r<rows.length-1;r++) rows[r][target.index]=rows[r+1]?.[target.index] ?? null;
      rows[rows.length-1][target.index]=null;
      return {...prev,raw:{...prev.raw,rows},config:{...prev.config,revision:(prev.config.revision??0)+1}};
    });
    toast.push('Cell deleted and values below moved up.','success');
  },[raw,config.headerRowIndex,session.update,toast]);

  const handleInsertCellBoundary = useCallback((sourceIndex:number,columnKey:string,direction:'top'|'bottom')=>{
    const schema=buildSchema(raw,config.headerRowIndex);
    const col=schema.columns.find(c=>c.key===columnKey);
    if(!col) return;

    let outcome:{changed:boolean;discarded:CellValue}= { changed:false, discarded:null };
    session.update(prev=>{
      const currentSchema=buildSchema(prev.raw,prev.config.headerRowIndex);
      const target=currentSchema.columns.find(c=>c.key===columnKey);
      if(!target) return prev;

      // Work only on real data records in stable document order. Group/title/
      // metadata rows are structural and must never be shifted or overwritten.
      const structuralRows=new Set(currentSchema.structuralGroups.map(g=>g.sourceIndex-1));
      const dataRowIndexes:number[]=[];
      for(let i=currentSchema.dataStartIndex;i<currentSchema.dataEndIndex;i+=1){
        if(!structuralRows.has(i)) dataRowIndexes.push(i);
      }

      const selectedRawIndex=sourceIndex-1;
      const dataPosition=dataRowIndexes.indexOf(selectedRawIndex);
      if(dataPosition<0) return prev;

      const result=insertBlankCell(prev.raw.rows,dataRowIndexes,dataPosition,target.index,direction,currentSchema.dataEndIndex);
      outcome={changed:true,discarded:result.discardedValue};
      const manualBlankRows = [...(prev.raw.manualBlankRows ?? [])];
      if (result.extended && result.insertedRawIndex >= 0) manualBlankRows.push(result.insertedRawIndex + 1);
      return {
        ...prev,
        raw:{...prev.raw,rows:result.rows,manualBlankRows:manualBlankRows.sort((a,b)=>a-b)},
        config:{...prev.config,revision:(prev.config.revision??0)+1}
      };
    });

    if(!outcome.changed){
      toast.push('This cell cannot be inserted here.','warning');
      return;
    }
    const discarded = outcome.discarded !== null && outcome.discarded !== undefined && String(outcome.discarded).trim() !== '';
    if(discarded){
      toast.push(
        direction==='top'
          ? 'Empty cell inserted above. Existing values were preserved by extending the data area.'
          : 'Empty cell inserted below. Existing values were preserved by extending the data area.',
        'success'
      );
    } else {
      toast.push(
        direction==='top'
          ? 'Empty cell inserted above. The selected cell and values below moved down one position.'
          : 'Empty cell inserted below. Values below the selected cell moved down one position.',
        'success'
      );
    }
  },[raw,config.headerRowIndex,session.update,toast]);

  const handleRemoveRows = useCallback((ranges: RowRange[]) => { if(!ranges.length)return; session.update(prev=>({...prev,config:{...prev.config,excludedRanges:[...prev.config.excludedRanges,...ranges],revision:(prev.config.revision??0)+1}})); },[session.update]);
  const handleCopyRows = useCallback(async()=>{const selected=(window as any).__docbitSelectedRows as number[]|undefined;if(!selected?.length){toast.push('Select rows first.','warning');return;}const schema=buildSchema(raw,config.headerRowIndex);const text=selected.map(i=>raw.rows[i-1]?.slice(0,schema.columns.length).map(v=>v==null?'':String(v)).join('\t')).join('\n');try{await navigator.clipboard?.writeText(text);toast.push(`${selected.length} row${selected.length===1?'':'s'} copied.`,'success');}catch{toast.push('Clipboard access was blocked by the browser.','error');}},[raw,config.headerRowIndex,toast]);
  const handleCutRows = useCallback(async()=>{await handleCopyRows();const selected=(window as any).__docbitSelectedRows as number[]|undefined;if(selected?.length)handleRemoveRows(selected.map(i=>({id:makeId('range'),start:i,end:i})));},[handleCopyRows,handleRemoveRows]);
  const handlePasteRows = useCallback(async()=>{try{const text=await navigator.clipboard.readText();if(!text.trim()){toast.push('Clipboard is empty.','warning');return;}const incoming=text.split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));if(raw.rows.length+incoming.length>250000){toast.push('This import exceeds the browser safety threshold for a single working dataset.','error');return;}session.update(prev=>{const schema=buildSchema(prev.raw,prev.config.headerRowIndex);const rows=prev.raw.rows.map(r=>[...r]);const width=Math.max(prev.raw.columnCount,schema.columns.length,...incoming.map(r=>r.length));const at=schema.dataEndIndex;incoming.forEach((r,i)=>rows.splice(at+i,0,[...r,...Array(Math.max(0,width-r.length)).fill(null)]));return {...prev,raw:{...prev.raw,rows,columnCount:width},config:{...prev.config,revision:(prev.config.revision??0)+1}}});toast.push(`${incoming.length} row${incoming.length===1?'':'s'} pasted.`,'success');}catch{toast.push('Clipboard access was blocked by the browser.','error');}},[session.update,toast,raw.rows.length]);
  const handleImportRows = useCallback((text:string)=>{const incoming=text.split(/\r?\n/).filter(Boolean).map(l=>l.split(/\t|,/));if(!incoming.length)return{ok:false,error:'The file contains no data rows.'};if(raw.rows.length+incoming.length>250000)return{ok:false,error:'This import exceeds the browser safety threshold for a single working dataset.'};session.update(prev=>{const schema=buildSchema(prev.raw,prev.config.headerRowIndex);const rows=prev.raw.rows.map(r=>[...r]);const width=Math.max(prev.raw.columnCount,schema.columns.length,...incoming.map(r=>r.length));incoming.forEach((r,i)=>rows.splice(schema.dataEndIndex+i,0,[...r,...Array(Math.max(0,width-r.length)).fill(null)]));return {...prev,raw:{...prev.raw,rows,columnCount:width},config:{...prev.config,revision:(prev.config.revision??0)+1}}});return{ok:true as const,count:incoming.length};},[session.update,config.headerRowIndex,raw.rows.length]);
  const markSaved = useCallback(() => { originalSessionRef.current = session.state; }, [session.state]);

  const resetToBaseline = useCallback(()=>{const b=originalSessionRef.current;if(!b)return;session.update(()=>b);toast.push('Document reset to its original state.','info');},[session.update,toast]);

  return { session, raw, config, report, reportProcessing, hasDataChanges, updateConfig, updateRaw, evaluateTypeChange, commitTypeChange, applyColumnChanges, validateImportColumnData, handleImportColumnData, handleHeaderRowChange, handleEditCell, handleAddRow, handleAddColumn, handleDeleteColumn, handleCopyCell, handlePasteCell, getColumnImportTargets, handleAddCell, handleDeleteCell, handleInsertCellBoundary, handleRemoveRows, handleCopyRows, handleCutRows, handlePasteRows, handleImportRows, resetToBaseline, markSaved, lastFileRef, hasCopiedCell };
}
