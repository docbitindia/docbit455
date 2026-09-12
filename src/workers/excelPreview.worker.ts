import * as XLSX from 'xlsx';

type Message = { file: File; preferredSheet?: string };
const post = (payload: any) => self.postMessage(payload);

function normalizeRows(aoa: unknown[][]) {
  let columnCount = 0;
  for (const row of aoa) columnCount = Math.max(columnCount, Array.isArray(row) ? row.length : 0);
  const rows = aoa.map(row => {
    const out = new Array(columnCount).fill(null);
    if (Array.isArray(row)) for (let i=0;i<row.length;i++) out[i] = toCell(row[i]);
    return out;
  });
  while (rows.length && rows[rows.length-1].every(v => v === null)) rows.pop();
  return { rows, columnCount };
}
function toCell(v: unknown) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v);
}
function readSheet(wb:XLSX.WorkBook, name:string) {
  const sheet=wb.Sheets[name];
  let aoa = XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null,blankrows:true}) as unknown[][];
  for (const range of sheet['!merges'] ?? []) {
    const topLeft=aoa[range.s.r]?.[range.s.c] ?? null;
    for(let r=range.s.r;r<=range.e.r;r++){
      if(!aoa[r]) aoa[r]=[];
      for(let c=range.s.c;c<=range.e.c;c++){
        if(r===range.s.r&&c===range.s.c) continue;
        if(aoa[r][c]===null||aoa[r][c]===undefined||aoa[r][c]==='') aoa[r][c]=topLeft;
      }
    }
  }
  return normalizeRows(aoa);
}
self.onmessage = async (event: MessageEvent<Message>) => {
  const {file,preferredSheet}=event.data;
  try {
    post({type:'progress',progress:3,stage:'Reading workbook'});
    const buffer=await file.arrayBuffer();
    post({type:'progress',progress:18,stage:'Opening workbook'});
    const wb=XLSX.read(buffer,{type:'array',cellDates:true,raw:true});
    const names=wb.SheetNames.filter((n: string)=>wb.Sheets[n]?.['!ref']);
    if(!names.length) throw new Error('No readable sheets were found in this workbook.');
    let selected=preferredSheet&&names.includes(preferredSheet)?preferredSheet:names[0];
    if(!preferredSheet&&names.length>1){
      let bestScore=-1;
      for(let i=0;i<names.length;i++){
        const ref=wb.Sheets[names[i]]['!ref']; let cells=0;
        if(ref){const r=XLSX.utils.decode_range(ref);cells=(r.e.r-r.s.r+1)*(r.e.c-r.s.c+1);}
        const score=cells;
        if(score>bestScore){bestScore=score;selected=names[i];}
        post({type:'progress',progress:20+Math.round((i+1)/names.length*20),stage:'Selecting data sheet'});
      }
    }
    const {rows,columnCount}=readSheet(wb,selected);
    if(!rows.length) throw new Error('This spreadsheet does not contain any rows of data.');
    post({type:'progress',progress:96,stage:'Finalizing rows'});
    post({type:'complete',result:{rows,columnCount,sheetName:selected,sheetNames:names}});
  } catch(error) {
    post({type:'error',message:error instanceof Error?error.message:'This Excel file could not be opened.'});
  }
};
