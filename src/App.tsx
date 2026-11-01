import { useState, useEffect, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { SideNav } from './components/SideNav';
import { MobileBottomNav } from './components/MobileBottomNav';
import { useIsMobile } from './hooks/useIsMobile';
import { Binder } from './components/Binder';
import { RichEditor } from './components/RichEditor';
import { Corkboard } from './components/Corkboard';
import { Outline } from './components/Outline';
import { Inspector } from './components/Inspector';
import { StyleCheckPanel } from './components/StyleCheckPanel';
import { CompileDialog } from './components/CompileDialog';
import { SceneCards } from './components/SceneCards';
import { TimelineView } from './components/TimelineView';
import { DashboardView } from './components/DashboardView';
import { StructuralMap } from './components/StructuralMap';
import { FragmentsView } from './components/FragmentsView';
import { OmittedView } from './components/OmittedView';
import { NotebookView } from './components/NotebookView';
import { CodexView } from './components/CodexView';
import { QuestionsView } from './components/QuestionsView';
import { MoodboardView } from './components/MoodboardView';
import { ResearchView } from './components/ResearchView';
import { HistoryView } from './components/HistoryView';
import { RevisionPassesView } from './components/RevisionPassesView';
import { ManuscriptAssemblyView } from './components/ManuscriptAssemblyView';
import { TrashView } from './components/TrashView';
import { GlobalSearch } from './components/GlobalSearch';
import { ReferencePane } from './components/ReferencePane';
import { AIPanel } from './components/AIPanel';
import { ErrorBoundary, PaneError } from './components/ErrorBoundary';
import type { ViewMode } from './types';
import { onFailedLoad, previousFailedLoad, type FailedLoad } from './utils/bootGuard';
import { formatMapDiag } from './utils/mapDiagnostics';

const VIEW_NAMES: Record<ViewMode, string> = {
  editor: 'Editor', corkboard: 'Corkboard', outline: 'Outline', 'scene-cards': 'Scene Cards',
  timeline: 'Timeline', dashboard: 'Dashboard', 'structural-map': 'Structural Map',
};
import { useAppStore, findItem } from './store/appStore';

function App() {
  const {
    binder,
    selectedId,
    viewMode,
    compositionMode,
    setCompositionMode,
    inspectorOpen,
    area,
    splitScreenOpen,
    searchOpen,
    setSearchOpen,
    aiPanelOpen,
    styleCheckOpen,
  } = useAppStore();

  const [compileOpen, setCompileOpen] = useState(false);
  const [mobileBinderOpen, setMobileBinderOpen] = useState(false);
  const [failedLoad, setFailedLoad] = useState(previousFailedLoad);
  useEffect(() => onFailedLoad(setFailedLoad), []);
  const isMobile = useIsMobile();

  const selectedItem = selectedId ? findItem(binder, selectedId) : null;

  // Close binder drawer when a document is selected on mobile
  const prevSelectedId = useRef(selectedId);
  useEffect(() => {
    if (isMobile && selectedId !== prevSelectedId.current) {
      setMobileBinderOpen(false);
      prevSelectedId.current = selectedId;
    }
  }, [selectedId, isMobile]);

  // Ctrl+K opens global search
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setSearchOpen]);

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-gray-200">
      {/* Top toolbar */}
      <Toolbar onOpenBinder={isMobile ? () => setMobileBinderOpen(true) : undefined} />

      {failedLoad && <FailedLoadBar failed={failedLoad} onDismiss={() => setFailedLoad(null)} />}

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left icon nav — desktop only */}
        {!compositionMode && !isMobile && <SideNav />}

        {/* Content area — all views */}
        <div className="flex flex-1 overflow-hidden">

          {/* Manuscript area */}
          {area === 'manuscript' && (
            <>
              {/* Binder sidebar — desktop inline, mobile drawer */}
              {!compositionMode && !isMobile && <Binder resizable />}

              {/* Mobile binder drawer */}
              {!compositionMode && isMobile && mobileBinderOpen && (
                <div className="fixed inset-0 z-50 flex">
                  <div className="w-72 h-full bg-[#0d1117] border-r border-[#0f3460] overflow-y-auto flex flex-col">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[#0f3460] shrink-0">
                      <span className="text-sm font-semibold text-gray-300">Binder</span>
                      <button
                        onClick={() => setMobileBinderOpen(false)}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <Binder />
                    </div>
                  </div>
                  <div
                    className="flex-1 bg-black/60"
                    onClick={() => setMobileBinderOpen(false)}
                  />
                </div>
              )}

              {/* Compile button strip */}
              {!compositionMode && (
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex items-center px-3 py-1 bg-[#0d1117] border-b border-[#0f3460] shrink-0">
                    <button
                      onClick={() => setCompileOpen(true)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] px-2 py-1 rounded transition-colors"
                    >
                      📦 Compile & Export
                    </button>
                  </div>

                  {/* Editor + optional reference pane */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Center editor / view */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* A view that crashes shows its error here; the toolbar and binder
                          keep working, so you can switch away instead of being stuck. */}
                      <ErrorBoundary
                        resetKey={`${viewMode}:${viewMode === 'editor' ? selectedItem?.id ?? '' : ''}`}
                        fallback={(error, reset) => <PaneError name={VIEW_NAMES[viewMode] ?? 'This view'} error={error} reset={reset} />}
                      >
                      {viewMode === 'editor' && selectedItem?.type === 'document' && (
                        <RichEditor
                          key={selectedItem.id}
                          itemId={selectedItem.id}
                          content={selectedItem.content}
                          compositionMode={compositionMode}
                        />
                      )}

                      {viewMode === 'editor' && !selectedItem && (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-600 px-6 text-center">
                          <div className="text-6xl mb-4">✍️</div>
                          <p className="text-xl mb-2">Book Bitch</p>
                          {isMobile ? (
                            <button
                              onClick={() => setMobileBinderOpen(true)}
                              className="mt-3 px-4 py-2 bg-[#6b46c1] text-white rounded-lg text-sm hover:bg-[#7c3aed] transition-colors"
                            >
                              ☰ Open Binder
                            </button>
                          ) : (
                            <p className="text-sm">Select a document from the binder to start writing.</p>
                          )}
                        </div>
                      )}

                      {viewMode === 'editor' && selectedItem?.type === 'folder' && (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                          <div className="text-5xl mb-4">📁</div>
                          <p className="text-xl mb-2">{selectedItem.title}</p>
                          <p className="text-sm">Select a document inside this folder.</p>
                        </div>
                      )}

                      {viewMode === 'corkboard' && <Corkboard />}
                      {viewMode === 'outline' && <Outline />}
                      {viewMode === 'scene-cards' && <SceneCards />}
                      {viewMode === 'timeline' && <TimelineView />}
                      {viewMode === 'dashboard' && <DashboardView />}
                      {viewMode === 'structural-map' && <StructuralMap />}
                      </ErrorBoundary>
                    </div>

                    {/* Reference pane (split-screen) */}
                    {splitScreenOpen && viewMode === 'editor' && <ReferencePane />}
                  </div>
                </div>
              )}

              {/* Composition (focus) mode — full screen editor */}
              {compositionMode && selectedItem?.type === 'document' && (
                <RichEditor
                  key={selectedItem.id}
                  itemId={selectedItem.id}
                  content={selectedItem.content}
                  compositionMode={compositionMode}
                />
              )}

              {/* Inspector — desktop only */}
              {!compositionMode && !isMobile && inspectorOpen && (
                <ErrorBoundary
                  resetKey={selectedItem?.id ?? ''}
                  fallback={(error, reset) => (
                    <div className="w-72 shrink-0 border-l border-[#0f3460] overflow-auto">
                      <PaneError name="Inspector" error={error} reset={reset} />
                    </div>
                  )}
                >
                  <Inspector />
                </ErrorBoundary>
              )}

              {/* Style Check panel — desktop only, editor view */}
              {!compositionMode && !isMobile && styleCheckOpen && viewMode === 'editor' && <StyleCheckPanel />}
            </>
          )}

          {/* Non-manuscript areas */}
          <ErrorBoundary resetKey={area} fallback={(error, reset) => <PaneError name="This section" error={error} reset={reset} />}>
          {area === 'fragments' && <FragmentsView />}
          {area === 'omitted' && <OmittedView />}
          {area === 'notebook' && <NotebookView />}
          {area === 'codex' && <CodexView />}
          {area === 'questions' && <QuestionsView />}
          {area === 'moodboard' && <MoodboardView />}
          {area === 'research' && <ResearchView />}
          {area === 'revision' && <RevisionPassesView />}
          {area === 'assembly' && <ManuscriptAssemblyView />}
          {area === 'history' && <HistoryView />}
          {area === 'trash' && <TrashView />}
          </ErrorBoundary>

          {/* AI Panel — desktop only */}
          {!compositionMode && !isMobile && aiPanelOpen && <AIPanel />}
        </div>
      </div>

      {/* Mobile bottom navigation */}
      {isMobile && !compositionMode && <MobileBottomNav />}

      {/* Composition mode exit button */}
      {compositionMode && (
        <button
          onClick={() => setCompositionMode(false)}
          className="fixed top-4 right-4 z-[200] px-3 py-1.5 bg-[#1a1a3e]/80 text-gray-400 hover:text-white rounded-lg text-xs border border-[#2d3748] transition-colors"
        >
          ✕ Exit Focus
        </button>
      )}

      {/* Global search overlay */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}

      {/* Compile dialog */}
      {compileOpen && <CompileDialog onClose={() => setCompileOpen(false)} />}
    </div>
  );
}

export default App;

/** Shown after a session froze or crashed; for the map, with copyable details. */
function FailedLoadBar({ failed, onDismiss }: { failed: FailedLoad; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const details = failed.mapDiag ? formatMapDiag(failed.mapDiag) : null;
  const where = failed.area === 'manuscript' && failed.view in VIEW_NAMES
    ? <> while showing the <b>{VIEW_NAMES[failed.view as ViewMode]}</b></>
    : failed.area !== 'unknown' ? <> (section: <b>{failed.area}</b>)</> : null;
  return (
    <div className="px-4 py-2 bg-amber-900/40 border-b border-amber-600/40 text-xs text-amber-100 shrink-0">
      <div className="flex items-start gap-3">
        <span className="flex-1">
          Book Bitch crashed or froze last time{where}, so it opened in the Editor instead. Your writing is safe.
          {details && ' The details below are counts and sizes only, no text from your book.'}
        </span>
        {details && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(details).then(() => setCopied(true), () => setCopied(false));
            }}
            className="text-amber-300 hover:text-white font-semibold"
          >
            {copied ? 'Copied ✓' : 'Copy details'}
          </button>
        )}
        <button onClick={onDismiss} className="text-amber-300 hover:text-white">Dismiss</button>
      </div>
      {details && (
        <pre className="mt-2 p-2 bg-black/30 rounded text-[11px] text-amber-50 whitespace-pre-wrap select-all">{details}</pre>
      )}
    </div>
  );
}
