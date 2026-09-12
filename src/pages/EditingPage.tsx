import React, { useEffect, useMemo, useState } from 'react';
import { Workspace } from '../components/Workspace';
import { useDocumentEditor } from '../hooks/useDocumentEditor';
import { getEditingSession, setEditingSession, clearEditingSession, setPendingFile } from '../state/editorSession';
import { navigate } from '../router/useRoute';
import { parseFile } from '../adapters';
import { guessHeaderRow, buildSchema } from '../engine/headerDetection';
import { createDefaultConfig } from '../engine/config';
import { usePageMeta } from '../hooks/usePageMeta';
import { PAGE_META } from '../seo/pageMeta';
import { Modal } from '../components/Modal';
import { recordFileHistory } from '../state/history';

export function EditingPage({ filename }: { filename: string }) {
  usePageMeta(PAGE_META['/editing']);
  const stored = useMemo(() => getEditingSession(), []);

  const editor = useDocumentEditor(stored ? { document: stored.document, baseline: stored.baseline } : {});
  const { session, raw, config, report, reportProcessing, hasCopiedCell } = editor;
  const [lastFile, setLastFile] = useState<File | null>(stored?.file ?? null);
  const [pendingAction, setPendingAction] = useState<'reset' | 'home' | 'replace' | 'refresh' | 'back' | null>(null);
  const [pendingReplaceFile, setPendingReplaceFile] = useState<File | null>(null);
  const internalNavigationRef = React.useRef(false);

  useEffect(() => {
    if (stored) setEditingSession(session.state, stored.baseline, lastFile);
  }, [session.state, stored, lastFile]);

  useEffect(() => {
    if (lastFile && editor.hasDataChanges) {
      const ext = lastFile.name.toLowerCase().split('.').pop();
      recordFileHistory({ fileName:lastFile.name, fileSize:lastFile.size, fileType:(['csv','json','xlsx','xls'].includes(ext||'') ? ext : 'unknown') as any }, 'edited');
    }
  }, [lastFile, editor.hasDataChanges]);

  const columnRawIndex = useMemo(() => {
    const schema = buildSchema(raw, config.headerRowIndex);
    return Object.fromEntries(schema.columns.map(c => [c.key, c.index]));
  }, [raw, config.headerRowIndex]);

  const handleSwitchSheet = async (sheetName: string) => {
    if (!lastFile) return;
    try {
      const dataset = await parseFile(lastFile, { sheetName });
      const header = guessHeaderRow(dataset.rows);
      const schema = buildSchema(dataset, header);
      const next = createDefaultConfig(schema, dataset.meta.fileName);
      session.replaceAll({ raw: dataset, config: next });
      setEditingSession({ raw: dataset, config: next }, { raw: dataset, config: next }, lastFile);
    } catch { /* Workspace surfaces operational errors through its existing UI. */ }
  };

  const performReplace = (file: File) => {
    internalNavigationRef.current = true;
    setPendingFile(file);
    setPendingReplaceFile(null);
    setPendingAction(null);
    navigate('/workspace');
  };


  const performHome = () => {
    internalNavigationRef.current = true;
    clearEditingSession();
    setPendingAction(null);
    navigate('/');
  };

  const performRefresh = () => {
    setPendingAction(null);
    window.location.reload();
  };

  const performBack = () => {
    internalNavigationRef.current = true;
    setPendingAction(null);
    setPendingReplaceFile(null);
    if (lastFile) setPendingFile(lastFile);
    navigate('/workspace');
  };

  const handleHome = () => {
    if (editor.hasDataChanges) {
      setPendingAction('home');
      return;
    }
    performHome();
  };

  const handleBack = () => {
    if (editor.hasDataChanges) {
      setPendingAction('back');
      return;
    }
    performBack();
  };

  const handleReset = () => {
    if (editor.hasDataChanges) setPendingAction('reset');
  };


  // Browser refresh/close is controlled by the browser, so its lifecycle
  // confirmation must use beforeunload. Keyboard refresh (Ctrl/Cmd+R, F5) can
  // use the same global React modal as other destructive navigation actions.
  useEffect(() => {
    if (!editor.hasDataChanges) return;
    const guardRefresh = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const guardRefreshShortcut = (event: KeyboardEvent) => {
      const refreshKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r';
      const f5 = event.key === 'F5';
      if (!refreshKey && !f5) return;
      event.preventDefault();
      setPendingAction('refresh');
    };
    window.addEventListener('beforeunload', guardRefresh);
    window.addEventListener('keydown', guardRefreshShortcut);
    return () => {
      window.removeEventListener('beforeunload', guardRefresh);
      window.removeEventListener('keydown', guardRefreshShortcut);
    };
  }, [editor.hasDataChanges]);

  // Keep one history checkpoint so a real browser Back can be intercepted
  // while the document is dirty. Internal SPA navigation is explicitly marked
  // so its synthetic popstate event is never mistaken for browser Back.
  const dirtyRef = React.useRef(editor.hasDataChanges);
  dirtyRef.current = editor.hasDataChanges;
  const editingPathRef = React.useRef(typeof window === 'undefined' ? '' : window.location.pathname);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.history.pushState({ ...window.history.state, __docbitEditingGuard: true }, '', window.location.href);
    const handlePopState = () => {
      if (internalNavigationRef.current) {
        internalNavigationRef.current = false;
        return;
      }
      if (!dirtyRef.current) return;
      window.history.pushState({ ...window.history.state, __docbitEditingGuard: true }, '', editingPathRef.current);
      setPendingAction('back');
    };
    window.addEventListener('popstate', handlePopState, true);
    return () => window.removeEventListener('popstate', handlePopState, true);
  }, []);

  if (!stored) {
    return <div className="min-h-screen bg-paper-50 flex items-center justify-center px-5"><div className="rounded-2xl border border-ink-200 bg-white p-6 text-center shadow-panel"><h1 className="text-lg font-semibold text-ink-900">Editing session not found</h1><p className="mt-2 text-sm text-ink-600/70">Open a file from the DocBit home page to start editing.</p><button type="button" onClick={handleHome} className="mt-5 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white">Go home</button></div></div>;
  }

  const pendingTitle = pendingAction === 'reset' ? 'Reset document' : pendingAction === 'replace' ? 'Replace file' : pendingAction === 'refresh' ? 'Refresh editor' : 'Leave editor';
  const pendingDescription = pendingAction === 'reset'
    ? 'Your changes will be discarded and the document will return to the original uploaded file.'
    : pendingAction === 'replace'
    ? 'Your current changes will be discarded and replaced with the selected file.'
    : pendingAction === 'refresh'
    ? 'Refreshing will discard your current changes and reload the original saved editor state.'
    : 'Your current changes will be discarded and you will leave the editor.';

  const confirmPendingAction = () => {
    if (pendingAction === 'reset') {
      editor.resetToBaseline();
      setPendingAction(null);
      return;
    }
    if (pendingAction === 'replace' && pendingReplaceFile) {
      performReplace(pendingReplaceFile);
      return;
    }
    if (pendingAction === 'refresh') {
      performRefresh();
      return;
    }
    if (pendingAction === 'back') {
      performBack();
      return;
    }
    if (pendingAction === 'home') {
      performHome();
    }
  };

  return <>
    <Workspace
    raw={raw}
    config={config}
    report={report}
    reportProcessing={reportProcessing}
    update={editor.updateConfig}
    onHeaderRowChange={editor.handleHeaderRowChange}
    onSwitchSheet={handleSwitchSheet}
    onBack={handleBack}
    onReset={handleReset}
    canReset={editor.hasDataChanges}
    onUndo={session.undo}
    onRedo={session.redo}
    canUndo={session.canUndo}
    canRedo={session.canRedo}
    onEvaluateTypeChange={editor.evaluateTypeChange}
    onCommitTypeChange={editor.commitTypeChange}
    onApplyColumnChanges={editor.applyColumnChanges}
    onImportColumnData={editor.handleImportColumnData}
    onValidateColumnImport={editor.validateImportColumnData}
    onGetColumnImportTargets={editor.getColumnImportTargets}
    onEditCell={editor.handleEditCell}
    onRemoveRows={editor.handleRemoveRows}
    onAddRow={editor.handleAddRow}
    onAddColumn={editor.handleAddColumn}
    onDeleteColumn={editor.handleDeleteColumn}
    onCopyCell={editor.handleCopyCell}
    onPasteCell={editor.handlePasteCell}
    onAddCell={editor.handleAddCell}
    onDeleteCell={editor.handleDeleteCell}
    onInsertCellBoundary={editor.handleInsertCellBoundary}
    hasCopiedCell={hasCopiedCell}
    onCopyRows={editor.handleCopyRows}
    onCutRows={editor.handleCutRows}
    onPasteRows={editor.handlePasteRows}
    onImportRows={editor.handleImportRows}
    backOnRight={false}
  />

    <Modal
      open={pendingAction !== null}
      title={pendingTitle}
      description={pendingDescription}
      onClose={() => { setPendingAction(null); setPendingReplaceFile(null); }}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setPendingAction(null); setPendingReplaceFile(null); }} className="modal-cancel-button">Cancel</button>
          <button type="button" onClick={confirmPendingAction} className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1D4ED8]">
            {pendingAction === 'reset' ? 'Reset' : pendingAction === 'replace' ? 'Replace' : pendingAction === 'refresh' ? 'Refresh' : 'Leave'}
          </button>
        </div>
      }
    >
      <div className="rounded-xl border border-ink-200 bg-paper-50 p-3 text-xs leading-5 text-ink-700">
        This confirmation appears because the original uploaded document has unsaved changes.
      </div>
    </Modal>
  </>
}
