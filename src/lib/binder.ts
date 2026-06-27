import type { BinderItem, Fragment, OmittedMaterial, NotebookEntry } from '../types';

// ─── Full Binder Traversal ────────────────────────────────────────────────────
//
// The "Observations" project is represented by the manuscript binder tree plus
// the separate Fragments / Omitted / Notebook collections. Codex generation and
// other whole-project analysis must be able to walk the FULL binder — every
// chapter/item, in binder order, including nested items — without silently
// stopping after the first few. This module centralises that traversal so every
// caller behaves identically.
//
// Root folders in the binder tree carry well-known ids:
//   - 'manuscript' : the real manuscript (chapters/items)
//   - 'research'   : research material (excluded by default)
//   - 'trash'      : deleted items (ALWAYS excluded unless explicitly requested)

export interface BinderContentItem {
  id: string;
  title: string;
  text: string;        // raw HTML content
  source: 'manuscript' | 'research' | 'fragment' | 'omitted' | 'notebook';
  depth: number;       // nesting depth within its tree
  wordCount: number;
}

export interface GetFullBinderOptions {
  includeManuscript?: boolean;        // default true
  includeResearch?: boolean;          // default false
  includeFragments?: boolean;         // default false
  includeOmittedMaterial?: boolean;   // default false
  includeNotebook?: boolean;          // default false  (private notes)
  includePrivateNotes?: boolean;      // default false  (notebook entries flagged isPrivate)
  includeTrash?: boolean;             // default false  (NEVER unless explicitly requested)
  maxItems?: number;                  // optional hard cap (disclosed in UI when set)
  maxCharacters?: number;             // optional hard cap (disclosed in UI when set)
}

export interface FullBinderResult {
  items: BinderContentItem[];
  stats: {
    itemCount: number;
    wordCount: number;
    charCount: number;
    emptySkipped: number;
    includedSources: string[];
    excludedSources: string[];
    capped: boolean;          // true if maxItems / maxCharacters dropped content
  };
}

const ROOT_TRASH = 'trash';
const ROOT_RESEARCH = 'research';

function stripHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(html: string): number {
  const t = stripHTML(html);
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

/**
 * Walk a manuscript binder subtree in order, collecting every document with
 * content. Preserves binder order and records nesting depth. Never descends
 * into the trash root.
 */
function walkTree(
  items: BinderItem[],
  source: 'manuscript' | 'research',
  depth: number,
  out: BinderContentItem[],
  onEmpty: () => void,
  includeTrash: boolean,
): void {
  for (const item of items) {
    if (!includeTrash && item.id === ROOT_TRASH) continue;
    if (item.type === 'document') {
      const text = item.content ?? '';
      if (stripHTML(text).length === 0) {
        onEmpty();
      } else {
        out.push({
          id: item.id,
          title: item.title || 'Untitled',
          text,
          source,
          depth,
          wordCount: wordCount(text),
        });
      }
    }
    if (item.children?.length) {
      walkTree(item.children, source, depth + 1, out, onEmpty, includeTrash);
    }
  }
}

export interface BinderSources {
  binder: BinderItem[];
  fragments?: Fragment[];
  omittedMaterial?: OmittedMaterial[];
  notebookEntries?: NotebookEntry[];
}

/**
 * Retrieve all relevant manuscript items/chapters across the full binder.
 *
 * Defaults: manuscript only. Fragments, omitted material, research, notebook,
 * private notes and trash are all excluded unless explicitly opted in.
 *
 * Handles arbitrarily large binders without silently stopping — callers are
 * responsible for chunking the returned items for AI requests. maxItems /
 * maxCharacters caps are honoured only when provided (and the UI discloses
 * them); by default nothing is dropped.
 */
export function getFullBinderContent(
  sources: BinderSources,
  options: GetFullBinderOptions = {},
): FullBinderResult {
  const {
    includeManuscript = true,
    includeResearch = false,
    includeFragments = false,
    includeOmittedMaterial = false,
    includeNotebook = false,
    includePrivateNotes = false,
    includeTrash = false,
    maxItems,
    maxCharacters,
  } = options;

  const items: BinderContentItem[] = [];
  let emptySkipped = 0;
  const onEmpty = () => { emptySkipped += 1; };
  const includedSources: string[] = [];
  const excludedSources: string[] = [];

  const roots = sources.binder ?? [];

  if (includeManuscript) {
    includedSources.push('Manuscript');
    const manuscriptRoots = roots.filter(
      (r) => r.id !== ROOT_TRASH && r.id !== ROOT_RESEARCH,
    );
    walkTree(manuscriptRoots, 'manuscript', 0, items, onEmpty, includeTrash);
  } else {
    excludedSources.push('Manuscript');
  }

  if (includeResearch) {
    includedSources.push('Research');
    const researchRoot = roots.find((r) => r.id === ROOT_RESEARCH);
    if (researchRoot) {
      walkTree(researchRoot.children ?? [], 'research', 0, items, onEmpty, includeTrash);
    }
  } else {
    excludedSources.push('Research');
  }

  if (includeFragments && sources.fragments) {
    includedSources.push('Fragments');
    for (const f of sources.fragments) {
      if (f.trashedAt) continue;
      if (stripHTML(f.content ?? '').length === 0) { emptySkipped += 1; continue; }
      items.push({
        id: f.id,
        title: f.title || 'Untitled fragment',
        text: f.content,
        source: 'fragment',
        depth: 0,
        wordCount: wordCount(f.content),
      });
    }
  } else {
    excludedSources.push('Fragments');
  }

  if (includeOmittedMaterial && sources.omittedMaterial) {
    includedSources.push('Omitted material');
    for (const o of sources.omittedMaterial) {
      if (o.trashedAt) continue;
      if (stripHTML(o.content ?? '').length === 0) { emptySkipped += 1; continue; }
      items.push({
        id: o.id,
        title: o.title || 'Untitled omitted',
        text: o.content,
        source: 'omitted',
        depth: 0,
        wordCount: wordCount(o.content),
      });
    }
  } else {
    excludedSources.push('Omitted material');
  }

  if (includeNotebook && sources.notebookEntries) {
    includedSources.push('Notebook');
    for (const n of sources.notebookEntries) {
      if (n.archived) continue;
      if (n.isPrivate && !includePrivateNotes) continue;
      if (stripHTML(n.content ?? '').length === 0) { emptySkipped += 1; continue; }
      items.push({
        id: n.id,
        title: n.title || 'Untitled note',
        text: n.content,
        source: 'notebook',
        depth: 0,
        wordCount: wordCount(n.content),
      });
    }
  } else {
    excludedSources.push('Notebook');
  }

  // Optional, disclosed caps. Default behaviour drops nothing.
  let capped = false;
  let capped$items = items;
  if (typeof maxItems === 'number' && capped$items.length > maxItems) {
    capped$items = capped$items.slice(0, maxItems);
    capped = true;
  }
  if (typeof maxCharacters === 'number') {
    const kept: BinderContentItem[] = [];
    let total = 0;
    for (const it of capped$items) {
      if (total + it.text.length > maxCharacters && kept.length > 0) { capped = true; break; }
      kept.push(it);
      total += it.text.length;
    }
    capped$items = kept;
  }

  const finalItems = capped$items;
  const charCount = finalItems.reduce((sum, it) => sum + it.text.length, 0);
  const totalWords = finalItems.reduce((sum, it) => sum + it.wordCount, 0);

  return {
    items: finalItems,
    stats: {
      itemCount: finalItems.length,
      wordCount: totalWords,
      charCount,
      emptySkipped,
      includedSources,
      excludedSources,
      capped,
    },
  };
}
