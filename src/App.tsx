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
import { TrashView } from './components/TrashView';
import { GlobalSearch } from './components/GlobalSearch';
import { ReferencePane } from './components/ReferencePane';
import { AIPanel } from './components/AIPanel';
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
              {!compositionMode && !isMobile && <Binder />}

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
              {!compositionMode && !isMobile && inspectorOpen && <Inspector />}

              {/* Style Check panel — desktop only, editor view */}
              {!compositionMode && !isMobile && styleCheckOpen && viewMode === 'editor' && <StyleCheckPanel />}
            </>
          )}

          {/* Non-manuscript areas */}
          {area === 'fragments' && <FragmentsView />}
          {area === 'omitted' && <OmittedView />}
          {area === 'notebook' && <NotebookView />}
          {area === 'codex' && <CodexView />}
          {area === 'questions' && <QuestionsView />}
          {area === 'moodboard' && <MoodboardView />}
          {area === 'research' && <ResearchView />}
          {area === 'revision' && <RevisionPassesView />}
          {area === 'history' && <HistoryView />}
          {area === 'trash' && <TrashView />}

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
