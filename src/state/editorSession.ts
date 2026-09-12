import type { DocumentState } from '../types/document';

let pendingFile: File | null = null;
let editingDocument: DocumentState | null = null;
let editingBaseline: DocumentState | null = null;
let editingFile: File | null = null;

export function setPendingFile(file: File) { pendingFile = file; }
export function takePendingFile(): File | null { const file = pendingFile; pendingFile = null; return file; }
export function setEditingSession(document: DocumentState, baseline: DocumentState | null, file: File | null) {
  editingDocument = document; editingBaseline = baseline; editingFile = file;
}
export function getEditingSession() {
  if (!editingDocument) return null;
  return { document: editingDocument, baseline: editingBaseline, file: editingFile };
}
export function clearEditingSession() { editingDocument = null; editingBaseline = null; editingFile = null; }
