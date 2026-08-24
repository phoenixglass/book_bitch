import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { createEditorExtensions } from '../lib/editorExtensions';
import { useAppStore } from '../store/appStore';

interface EditorProps {
  itemId: string;
  content: string;
  compositionMode?: boolean;
}

const BB_ITEM_TYPE = 'application/x-bb-item';
const BB_TYPE_KEY = 'text/x-bb-type';

function setDragDataForText(
  e: React.DragEvent,
  text: string,
) {
  e.dataTransfer.setData(BB_ITEM_TYPE, JSON.stringify({ type: 'text', content: text }));
  e.dataTransfer.setData(`${BB_TYPE_KEY}-text`, '1');
  e.dataTransfer.setData('text/plain', text);
  e.dataTransfer.effectAllowed = 'copy';
}

type EditorInstance = ReturnType<typeof useEditor>;

// Only rendered while the cursor is inside a table.
const TABLE_BTNS = [
  { label: '+Row', title: 'Add row below', cmd: (e: EditorInstance) => e?.chain().focus().addRowAfter().run() },
  { label: '+Col', title: 'Add column after', cmd: (e: EditorInstance) => e?.chain().focus().addColumnAfter().run() },
  { label: '−Row', title: 'Delete row', cmd: (e: EditorInstance) => e?.chain().focus().deleteRow().run() },
  { label: '−Col', title: 'Delete column', cmd: (e: EditorInstance) => e?.chain().focus().deleteColumn().run() },
  { label: '⌫▦', title: 'Delete table', cmd: (e: EditorInstance) => e?.chain().focus().deleteTable().run() },
];

const TOOLBAR_BTNS = [
  { label: 'B', title: 'Bold', cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleBold().run(), active: (e: ReturnType<typeof useEditor>) => e?.isActive('bold') ?? false, style: 'font-bold' },
  { label: 'I', title: 'Italic', cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleItalic().run(), active: (e: ReturnType<typeof useEditor>) => e?.isActive('italic') ?? false, style: 'italic' },
  { label: 'S', title: 'Strikethrough', cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleStrike().run(), active: (e: ReturnType<typeof useEditor>) => e?.isActive('strike') ?? false, style: 'line-through' },
];

export function RichEditor({ itemId, content, compositionMode }: EditorProps) {
  const { updateItem, takeSnapshot, editorSettings } = useAppStore();
  const proseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = proseRef.current;
    if (!el) return;
    const s = editorSettings;
    const ptToPx = (pt: number) => `${(pt * 4) / 3}px`;
    el.style.setProperty('--ms-font-family', s.fontFamily);
    el.style.setProperty('--ms-font-size', ptToPx(s.fontSize));
    el.style.setProperty('--ms-line-height', String(s.lineHeight));
    el.style.setProperty('--ms-first-line-indent', `${s.firstLineIndent}in`);
    el.style.setProperty('--ms-para-before', ptToPx(s.paragraphSpacingBefore));
    el.style.setProperty('--ms-para-after', ptToPx(s.paragraphSpacingAfter));
    el.style.setProperty('--ms-text-align', s.textAlign);
    el.style.setProperty('--ms-page-width', `${s.pageWidth}px`);
    el.style.setProperty('--ms-page-bg', s.pageBackground);
    el.style.setProperty('--ms-text-color', s.textColor);
  }, [editorSettings]);

  const editor = useEditor({
    extensions: createEditorExtensions(),
    content,
    onUpdate({ editor }) {
      updateItem(itemId, { content: editor.getHTML() });
    },
    editorProps: {
      attributes: {
        class: compositionMode ? 'composition-editor' : '',
      },
      transformPastedHTML(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
          el.style.removeProperty('color');
          el.style.removeProperty('background-color');
          el.style.removeProperty('background');
          if (!el.getAttribute('style')) el.removeAttribute('style');
        });
        doc.querySelectorAll('[color]').forEach((el) => el.removeAttribute('color'));
        return doc.body.innerHTML;
      },
    },
  });

  // Sync editor when item changes or when content changes externally (e.g. snapshot restore)
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  // content is intentional dep: snapshot restores change content without changing itemId
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, content]);

  const wordCount = editor?.storage.characterCount?.words() ?? 0;

  const handleEditorDragStart = (e: React.DragEvent) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (selectedText.trim()) {
      setDragDataForText(e, selectedText);
    }
  };

  return (
    <div
      className={`flex flex-col h-full ${
        compositionMode ? 'composition-mode' : ''
      }`}
    >
      {/* Formatting toolbar */}
      <div
        className={`flex items-center gap-1 px-3 py-1 shrink-0 ${
          compositionMode
            ? 'bg-[#0d0d1f] border-b border-[#1a1a3e]'
            : 'bg-[#1a1a2e] border-b border-[#0f3460]'
        }`}
      >
        {TOOLBAR_BTNS.map((btn) => (
            <button
              key={btn.label}
              onMouseDown={(e) => {
                e.preventDefault();
                btn.cmd(editor);
              }}
              title={btn.title}
              className={`w-7 h-7 rounded text-xs transition-colors ${
                btn.active(editor)
                  ? 'bg-[#6b46c1] text-white'
                  : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
              } ${btn.style}`}
            >
              {btn.label}
            </button>
          ))}

        <div className="w-px h-5 bg-[#0f3460] mx-1" />

        {/* Headings */}
        {[1, 2, 3].map((level) => (
          <button
            key={level}
            onMouseDown={(e) => {
              e.preventDefault();
              editor
                ?.chain()
                .focus()
                .toggleHeading({ level: level as 1 | 2 | 3 })
                .run();
            }}
            title={`Heading ${level}`}
            className={`w-7 h-7 rounded text-xs transition-colors ${
              editor?.isActive('heading', { level })
                ? 'bg-[#6b46c1] text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
            }`}
          >
            H{level}
          </button>
        ))}

        <div className="w-px h-5 bg-[#0f3460] mx-1" />

        {/* Lists */}
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleBulletList().run();
          }}
          title="Bullet list"
          className={`w-7 h-7 rounded text-xs transition-colors ${
            editor?.isActive('bulletList')
              ? 'bg-[#6b46c1] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
          }`}
        >
          •≡
        </button>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleOrderedList().run();
          }}
          title="Numbered list"
          className={`w-7 h-7 rounded text-xs transition-colors ${
            editor?.isActive('orderedList')
              ? 'bg-[#6b46c1] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
          }`}
        >
          1≡
        </button>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleTaskList().run();
          }}
          title="Task list"
          className={`w-7 h-7 rounded text-xs transition-colors ${
            editor?.isActive('taskList')
              ? 'bg-[#6b46c1] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
          }`}
        >
          ☑
        </button>

        <div className="w-px h-5 bg-[#0f3460] mx-1" />

        {/* Table */}
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run();
          }}
          title="Insert table"
          className="w-7 h-7 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
        >
          ▦
        </button>
        {editor?.isActive('table') && (
          <>
            {TABLE_BTNS.map((btn) => (
              <button
                key={btn.title}
                onMouseDown={(e) => {
                  e.preventDefault();
                  btn.cmd(editor);
                }}
                title={btn.title}
                className="px-1.5 h-7 rounded text-[11px] whitespace-nowrap text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
              >
                {btn.label}
              </button>
            ))}
          </>
        )}

        <div className="w-px h-5 bg-[#0f3460] mx-1" />

        {/* Block formats */}
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleBlockquote().run();
          }}
          title="Blockquote"
          className={`w-7 h-7 rounded text-xs transition-colors ${
            editor?.isActive('blockquote')
              ? 'bg-[#6b46c1] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
          }`}
        >
          "
        </button>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleCode().run();
          }}
          title="Inline code"
          className={`w-7 h-7 rounded text-xs font-mono transition-colors ${
            editor?.isActive('code')
              ? 'bg-[#6b46c1] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
          }`}
        >
          {'</>'}
        </button>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleHighlight().run();
          }}
          title="Highlight"
          className={`w-7 h-7 rounded text-xs transition-colors ${
            editor?.isActive('highlight')
              ? 'bg-[#6b46c1] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
          }`}
        >
          🖍
        </button>

        <div className="w-px h-5 bg-[#0f3460] mx-1" />

        <button
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().undo().run();
          }}
          title="Undo"
          className="w-7 h-7 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
        >
          ↩
        </button>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().redo().run();
          }}
          title="Redo"
          className="w-7 h-7 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
        >
          ↪
        </button>

        <div className="flex-1" />

        {/* Word count */}
        <span className="text-xs text-gray-500">{wordCount} words</span>

        {/* Snapshot button */}
        <button
          onClick={() => {
            const label = prompt('Snapshot label (optional):') ?? '';
            takeSnapshot(itemId, label);
          }}
          title="Take snapshot"
          className="ml-2 text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] px-2 py-1 rounded transition-colors"
        >
          📸 Snapshot
        </button>
      </div>

      {/* Editor area */}
      <div ref={proseRef} className="manuscript-prose flex-1 overflow-y-auto" onDragStart={handleEditorDragStart}>
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}
