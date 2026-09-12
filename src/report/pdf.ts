import type { ProcessedReport } from '../types/processed';
import type { RawDataset } from '../types/dataset';
import type { ReportBranding } from '../types/report';
import { displayCell } from '../utils/format';

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 34;
const HEADER_H = 82;
const FOOTER_H = 24;
const ROW_H = 18;
const HEAD_H = 28;
const MAX_ROWS = 25000;
const MAX_COLS_PER_PAGE = 9;

type PdfObject = { body: string | Uint8Array; stream?: Uint8Array };

function escPdf(value: unknown): string {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\uffff]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
  return text;
}
function rgb(hex: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0.145, 0.388, 0.922];
  return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255);
}
function textCmd(x: number, y: number, size: number, text: string, color = [0.1, 0.13, 0.2]) {
  return `${color[0]} ${color[1]} ${color[2]} rg BT /F1 ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escPdf(text)}) Tj ET`;
}
function rectCmd(x: number, y: number, w: number, h: number, fill: number[]) {
  return `${fill[0]} ${fill[1]} ${fill[2]} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`;
}
function lineCmd(x1: number, y1: number, x2: number, y2: number, color = [0.88,0.9,0.93]) {
  return `${color[0]} ${color[1]} ${color[2]} RG 0.5 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`;
}

async function logoJpeg(url: string): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = objectUrl;
      });
      const scale = Math.min(1, 900 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d'); if (!ctx) return null;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.88).split(',')[1];
      const binary = atob(data); const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { bytes, width: canvas.width, height: canvas.height };
    } finally { URL.revokeObjectURL(objectUrl); }
  } catch { return null; }
}

function columnChunks(columns: ProcessedReport['columns']) {
  const chunks: ProcessedReport['columns'][] = [];
  for (let i = 0; i < columns.length; i += MAX_COLS_PER_PAGE) chunks.push(columns.slice(i, i + MAX_COLS_PER_PAGE));
  return chunks;
}

export async function buildReportPdf(raw: RawDataset, report: ProcessedReport, branding: ReportBranding): Promise<Blob> {
  const columns = report.columns;
  const rows = report.rows.slice(0, MAX_ROWS);
  const chunks = columnChunks(columns);
  const accent = rgb(branding.theme);
  const logo = await logoJpeg(branding.logoUrl);
  const objects: PdfObject[] = [];
  const pages: number[] = [];
  const pageContents: string[] = [];
  const pageImages: Array<{ bytes: Uint8Array; width: number; height: number } | null> = [];

  const rowsPerPage = Math.max(1, Math.floor((PAGE_H - MARGIN - HEADER_H - FOOTER_H - HEAD_H) / ROW_H));
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const colWidths = chunk.map(c => Math.max(55, c.settings.width));
    const total = colWidths.reduce((a,b)=>a+b,0);
    const available = PAGE_W - MARGIN * 2;
    const scale = Math.min(1, available / total);
    const widths = colWidths.map(w => w * scale);
    for (let start = 0; start < rows.length || (start === 0 && rows.length === 0); start += rowsPerPage) {
      const pageRows = rows.slice(start, start + rowsPerPage);
      const commands: string[] = [];
      commands.push(textCmd(MARGIN, PAGE_H - MARGIN - 12, 18, branding.title || 'DocBit Data Report', [0.05,0.08,0.14]));
      commands.push(textCmd(MARGIN, PAGE_H - MARGIN - 30, 9, branding.subtitle || 'Prepared data overview', [0.39,0.45,0.53]));
      commands.push(`${accent[0]} ${accent[1]} ${accent[2]} rg ${MARGIN} ${PAGE_H - MARGIN - 48} ${PAGE_W - MARGIN*2} 3 re f`);
      if (ci === 0 && start === 0) {
        commands.push(textCmd(MARGIN, PAGE_H - MARGIN - 68, 8, `${raw.meta.fileName} · ${report.stats.finalRowCount.toLocaleString()} rows · ${columns.length} columns`, [0.39,0.45,0.53]));
        if (report.summaries.length) commands.push(textCmd(MARGIN, PAGE_H - MARGIN - 78, 7, report.summaries.map(s => `${s.label}: ${s.displayValue}`).join(' · ').slice(0, 130), [0.32,0.38,0.46]));
      } else {
        commands.push(textCmd(MARGIN, PAGE_H - MARGIN - 68, 8, `Columns ${ci*MAX_COLS_PER_PAGE+1}–${Math.min(columns.length,(ci+1)*MAX_COLS_PER_PAGE)} · Rows ${start+1}–${Math.min(rows.length,start+pageRows.length)}`, [0.39,0.45,0.53]));
      }
      let x = MARGIN; const headerY = PAGE_H - MARGIN - HEADER_H;
      commands.push(rectCmd(MARGIN, headerY - HEAD_H + 2, widths.reduce((a,b)=>a+b,0), HEAD_H, accent));
      chunk.forEach((col, i) => { commands.push(textCmd(x + 5, headerY - 15, 7.5, col.displayName.slice(0, 34), [1,1,1])); x += widths[i]; });
      pageRows.forEach((row, ri) => {
        const y = headerY - HEAD_H - (ri + 1) * ROW_H;
        if (ri % 2 === 1) commands.push(rectCmd(MARGIN, y, widths.reduce((a,b)=>a+b,0), ROW_H, [0.975,0.98,0.985]));
        x = MARGIN;
        chunk.forEach((col, i) => {
          const idx = columns.findIndex(c => c.key === col.key);
          const value = displayCell(row.values[idx], col.dataType, col.settings) || '—';
          commands.push(textCmd(x + 5, y + 5, 7, value.slice(0, Math.max(8, Math.floor(widths[i]/4.4))), [0.12,0.16,0.22]));
          commands.push(lineCmd(x, y, x, y + ROW_H)); x += widths[i];
        });
        commands.push(lineCmd(MARGIN, y, x, y));
      });
      commands.push(textCmd(MARGIN, 14, 7.5, `${branding.bottomText || 'Generated with DocBit'} · Page ${pageContents.length + 1}`, [0.39,0.45,0.53]));
      if (rows.length > MAX_ROWS) commands.push(textCmd(PAGE_W - 250, 14, 7.5, `PDF includes first ${MAX_ROWS.toLocaleString()} rows`, [0.65,0.3,0.1]));
      pageContents.push(commands.join('\n')); pageImages.push(ci === 0 && start === 0 ? logo : null);
      if (rows.length === 0) break;
    }
  }

  const catalogId = 1, pagesId = 2, fontId = 3;
  objects[catalogId] = { body: '' }; objects[pagesId] = { body: '' }; objects[fontId] = { body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' };
  for (let i=0;i<pageContents.length;i++) {
    const image = pageImages[i]; let imageId = 0;
    if (image) { imageId = objects.length; objects.push({ body: `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>`, stream: image.bytes }); }
    const content = pageContents[i] + (image ? `\nq 120 0 0 ${120*image.height/image.width} ${PAGE_W-MARGIN-120} ${PAGE_H-MARGIN-55-image.height*120/image.width} cm /Im${i} Do Q` : '');
    const contentBytes = new TextEncoder().encode(content);
    const contentId = objects.length; objects.push({ body: `<< /Length ${contentBytes.length} >>`, stream: contentBytes });
    const pageId = objects.length; const resources = `/Font << /F1 ${fontId} 0 R >>${image ? ` /XObject << /Im${i} ${imageId} 0 R >>` : ''}`;
    objects.push({ body: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << ${resources} >> /Contents ${contentId} 0 R >>` }); pages.push(pageId);
  }
  objects[catalogId] = { body: `<< /Type /Catalog /Pages ${pagesId} 0 R >>` };
  objects[pagesId] = { body: `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map(id=>`${id} 0 R`).join(' ')}] >>` };

  const chunksOut: Uint8Array[] = [new TextEncoder().encode('%PDF-1.4\n%âãÏÓ\n')]; const offsets: number[] = [0]; let offset = chunksOut[0].length;
  for (let i=1;i<objects.length;i++) {
    const object = objects[i];
    if (!object) continue;
    offsets[i]=offset;
    if (object.stream) {
      const head = new TextEncoder().encode(`${i} 0 obj\n${object.body}\nstream\n`); const tail = new TextEncoder().encode('\nendstream\nendobj\n'); chunksOut.push(head); offset += head.length; chunksOut.push(object.stream); offset += object.stream.length; chunksOut.push(tail); offset += tail.length;
    } else {
      const bytes = new TextEncoder().encode(`${i} 0 obj\n${object.body}\nendobj\n`); chunksOut.push(bytes); offset += bytes.length;
    }
  }
  const xrefOffset = offset; let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`; for(let i=1;i<objects.length;i++) xref += `${String(offsets[i]).padStart(10,'0')} 00000 n \n`; xref += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunksOut.push(new TextEncoder().encode(xref));
  return new Blob(chunksOut, { type: 'application/pdf' });
}
