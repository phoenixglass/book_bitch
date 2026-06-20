import { useState, useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { SideNav } from './components/SideNav';
import { Binder } from './components/Binder';
import { RichEditor } from './components/RichEditor';
import { Corkboard } from './components/Corkboard';
import { Outline } from './components/Outline';
import { Inspector } from './components/Inspector';
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
import { HistoryView } from './components/HistoryView';
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
  } = useAppStore();

  const [compileOpen, setCompileOpen] = useState(false);

  const selectedItem = selectedId ? findItem(binder, selectedId) : null;

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
      <Toolbar />

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left icon nav (always visible, hidden in composition mode) */}
        {!compositionMode && <SideNav />}

        {/* Content area — all views */}
        <div className="flex flex-1 overflow-hidden">

          {/* Manuscript area */}
          {area === 'manuscript' && (
            <>
              {/* Binder sidebar */}
              {!compositionMode && <Binder />}

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
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                          <div className="text-6xl mb-4">✍️</div>
                          <p className="text-xl mb-2">Book Bitch</p>
                          <p className="text-sm">Select a document from the binder to start writing.</p>
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

              {/* Inspector */}
              {!compositionMode && inspectorOpen && <Inspector />}
            </>
          )}

          {/* Non-manuscript areas */}
          {area === 'fragments' && <FragmentsView />}
          {area === 'omitted' && <OmittedView />}
          {area === 'notebook' && <NotebookView />}
          {area === 'codex' && <CodexView />}
          {area === 'questions' && <QuestionsView />}
          {area === 'moodboard' && <MoodboardView />}
          {area === 'history' && <HistoryView />}
          {area === 'trash' && <TrashView />}

          {/* AI Panel — available in all areas */}
          {!compositionMode && aiPanelOpen && <AIPanel />}
        </div>
      </div>

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
