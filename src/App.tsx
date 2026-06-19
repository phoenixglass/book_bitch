import { useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { Binder } from './components/Binder';
import { RichEditor } from './components/RichEditor';
import { Corkboard } from './components/Corkboard';
import { Outline } from './components/Outline';
import { Inspector } from './components/Inspector';
import { CompileDialog } from './components/CompileDialog';
import { useAppStore } from './store/appStore';
import type { BinderItem } from './types';

function findItem(
  items: BinderItem[],
  id: string,
): BinderItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const found = findItem(item.children, id);
    if (found) return found;
  }
  return null;
}

function App() {
  const {
    binder,
    selectedId,
    viewMode,
    compositionMode,
    setCompositionMode,
    inspectorOpen,
  } = useAppStore();

  const [compileOpen, setCompileOpen] = useState(false);

  const selectedItem = selectedId ? findItem(binder, selectedId) : null;

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-gray-200">
      {/* Top toolbar */}
      <Toolbar />

      {/* Compile button row */}
      {!compositionMode && (
        <div className="flex items-center px-3 py-1 bg-[#0d1117] border-b border-[#0f3460] shrink-0">
          <button
            onClick={() => setCompileOpen(true)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] px-2 py-1 rounded transition-colors"
          >
            📦 Compile & Export
          </button>
        </div>
      )}

      {/* Main workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Binder sidebar */}
        {!compositionMode && <Binder />}

        {/* Center pane */}
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
              <p className="text-sm">
                Select a document from the binder to start writing.
              </p>
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
        </div>

        {/* Inspector */}
        {!compositionMode && inspectorOpen && <Inspector />}
      </div>

      {/* Composition mode overlay exit button */}
      {compositionMode && (
        <button
          onClick={() => setCompositionMode(false)}
          className="fixed top-4 right-4 z-[200] px-3 py-1.5 bg-[#1a1a3e]/80 text-gray-400 hover:text-white rounded-lg text-xs border border-[#2d3748] transition-colors"
        >
          ✕ Exit Focus
        </button>
      )}

      {/* Compile dialog */}
      {compileOpen && <CompileDialog onClose={() => setCompileOpen(false)} />}
    </div>
  );
}

export default App;

