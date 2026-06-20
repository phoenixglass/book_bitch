import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';

interface WritingEditorProps {
  itemId: string;
  content: string;
  onChange: (html: string) => void;
}

export function WritingEditor({ itemId, content, onChange }: WritingEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      TextStyle,
      Color,
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
    ],
    content,
    onUpdate({ editor: e }) {
      onChange(e.getHTML());
    },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content || '');
    }
    // itemId intentional: re-sync when switching items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, content]);

  const wordCount = editor?.storage.characterCount?.words() ?? 0;

  const btns = [
    {
      label: 'B',
      title: 'Bold',
      cmd: () => editor?.chain().focus().toggleBold().run(),
      active: () => editor?.isActive('bold') ?? false,
      cls: 'font-bold',
    },
    {
      label: 'I',
      title: 'Italic',
      cmd: () => editor?.chain().focus().toggleItalic().run(),
      active: () => editor?.isActive('italic') ?? false,
      cls: 'italic',
    },
    {
      label: 'S̶',
      title: 'Strikethrough',
      cmd: () => editor?.chain().focus().toggleStrike().run(),
      active: () => editor?.isActive('strike') ?? false,
      cls: 'line-through',
    },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-1 bg-[#1a1a2e] border-b border-[#0f3460] shrink-0">
        {btns.map((btn) => (
          <button
            key={btn.label}
            onMouseDown={(e) => {
              e.preventDefault();
              btn.cmd();
            }}
            title={btn.title}
            className={`w-6 h-6 rounded text-xs flex items-center justify-center transition-colors ${btn.cls} ${
              btn.active()
                ? 'bg-[#6b46c1] text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
            }`}
          >
            {btn.label}
          </button>
        ))}
        <span className="mx-1 text-gray-600">|</span>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleHeading({ level: 1 }).run();
          }}
          className={`px-1.5 h-6 rounded text-xs transition-colors ${
            editor?.isActive('heading', { level: 1 })
              ? 'bg-[#6b46c1] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
          }`}
        >
          H1
        </button>
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            editor?.chain().focus().toggleHeading({ level: 2 }).run();
          }}
          className={`px-1.5 h-6 rounded text-xs transition-colors ${
            editor?.isActive('heading', { level: 2 })
              ? 'bg-[#6b46c1] text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
          }`}
        >
          H2
        </button>
        <div className="ml-auto text-xs text-gray-600">{wordCount.toLocaleString()} words</div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <EditorContent
          editor={editor}
          className="writing-editor-content h-full p-4"
        />
      </div>
    </div>
  );
}
