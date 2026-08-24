import { Extension } from '@tiptap/core';
import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';

// Block-level formatting that importers write as inline CSS. ProseMirror
// discards any attribute the schema doesn't declare, so without this an
// imported paragraph's own indentation is thrown away the moment the document
// is opened and then written back stripped by the next keystroke — the
// manuscript-wide defaults from Editor Settings silently replace whatever the
// author had set in the source document.
const PRESERVED_BLOCK_STYLES = [
  { name: 'textIndent', css: 'text-indent' },
  { name: 'marginLeft', css: 'margin-left' },
  { name: 'textAlign', css: 'text-align' },
] as const;

export const PreservedBlockStyles = Extension.create({
  name: 'preservedBlockStyles',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'listItem', 'blockquote'],
        attributes: Object.fromEntries(
          PRESERVED_BLOCK_STYLES.map(({ name, css }) => [
            name,
            {
              default: null,
              parseHTML: (element: HTMLElement) =>
                element.style.getPropertyValue(css) || null,
              renderHTML: (attributes: Record<string, string | null>) =>
                attributes[name] ? { style: `${css}: ${attributes[name]}` } : {},
            },
          ]),
        ),
      },
    ];
  },
});

/**
 * The extension set shared by every rich-text surface in the app. Both editors
 * must load the same one: content written in one is opened in the other, and
 * any node missing from the schema is deleted on load rather than left alone.
 */
export function createEditorExtensions(): Extensions {
  return [
    StarterKit,
    Highlight,
    TextStyle,
    Color,
    TaskList,
    TaskItem.configure({ nested: true }),
    CharacterCount,
    // Imported spreadsheets, CSVs and Google Docs tables all arrive as HTML
    // tables; without these they were silently flattened into a run of text.
    TableKit.configure({ table: { resizable: true } }),
    // Images imported from .docx are uploaded to Storage and referenced by URL.
    // They stay inline so an imported <p><img></p> keeps its paragraph rather
    // than leaving an empty one behind. Base64 is allowed not to invite new
    // data URIs but because documents imported before Storage uploads existed
    // still carry them, and the schema rejecting them would silently delete
    // someone's only copy of the image (see utils/migrateInlineImages).
    Image.configure({ inline: true, allowBase64: true }),
    PreservedBlockStyles,
  ];
}
