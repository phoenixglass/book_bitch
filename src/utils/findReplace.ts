// Global find & replace across the whole binder tree. Pure functions, no store
// dependency, so they can be used for both a live match preview and the actual
// replace-all mutation.

import type { BinderItem, FindReplaceField, FindReplaceOptions } from '../types';
import { stripHtml } from './textStats';

const DEFAULT_FIELDS: Record<FindReplaceField, boolean> = {
  content: true,
  title: false,
  synopsis: false,
  notes: false,
};

const FIELD_ORDER: FindReplaceField[] = ['content', 'title', 'synopsis', 'notes'];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSearchRegex(searchTerm: string, options: FindReplaceOptions = {}): RegExp | null {
  if (!searchTerm) return null;
  const escaped = escapeRegex(searchTerm);
  const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
  try {
    return new RegExp(pattern, options.caseSensitive ? 'g' : 'gi');
  } catch {
    return null;
  }
}

function resolveFields(options: FindReplaceOptions): Record<FindReplaceField, boolean> {
  return { ...DEFAULT_FIELDS, ...options.fields };
}

function snippetAround(text: string, matchText: string, pad = 40): string {
  const idx = text.toLowerCase().indexOf(matchText.toLowerCase());
  if (idx === -1) return text.slice(0, pad * 2);
  const start = Math.max(0, idx - pad);
  const end = Math.min(text.length, idx + matchText.length + pad);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export interface BinderMatch {
  id: string;
  title: string;
  field: FindReplaceField;
  count: number;
  snippet: string;
}

export function findMatchesInBinder(
  items: BinderItem[],
  searchTerm: string,
  options: FindReplaceOptions = {},
): BinderMatch[] {
  const builtRegex = buildSearchRegex(searchTerm, options);
  if (!builtRegex) return [];
  const regex: RegExp = builtRegex;
  const fields = resolveFields(options);
  const results: BinderMatch[] = [];

  function walk(list: BinderItem[]) {
    for (const item of list) {
      if (item.id === 'trash') continue;
      for (const field of FIELD_ORDER) {
        if (!fields[field]) continue;
        const raw = item[field] ?? '';
        const matches = raw.match(regex);
        if (matches && matches.length > 0) {
          const displayText = field === 'content' ? stripHtml(raw) : raw;
          results.push({
            id: item.id,
            title: item.title,
            field,
            count: matches.length,
            snippet: snippetAround(displayText, matches[0]),
          });
        }
      }
      if (item.children.length) walk(item.children);
    }
  }
  walk(items);
  return results;
}

export function replaceInBinder(
  items: BinderItem[],
  searchTerm: string,
  replaceTerm: string,
  options: FindReplaceOptions = {},
): { items: BinderItem[]; totalReplacements: number } {
  const builtRegex = buildSearchRegex(searchTerm, options);
  if (!builtRegex) return { items, totalReplacements: 0 };
  const regex: RegExp = builtRegex;
  const fields = resolveFields(options);
  let totalReplacements = 0;

  function walk(list: BinderItem[]): BinderItem[] {
    return list.map((item) => {
      if (item.id === 'trash') return item;
      let patch: Partial<BinderItem> | null = null;
      for (const field of FIELD_ORDER) {
        if (!fields[field]) continue;
        const raw = item[field] ?? '';
        const matches = raw.match(regex);
        if (matches && matches.length > 0) {
          totalReplacements += matches.length;
          patch = { ...(patch ?? {}), [field]: raw.replace(regex, replaceTerm) };
        }
      }
      const newChildren = item.children.length ? walk(item.children) : item.children;
      if (patch || newChildren !== item.children) {
        return { ...item, ...(patch ?? {}), children: newChildren, updatedAt: Date.now() };
      }
      return item;
    });
  }

  const newItems = walk(items);
  return { items: newItems, totalReplacements };
}

// Replace within a single item's field — used for "replace in this document only".
export function replaceInSingleItem(
  item: BinderItem,
  searchTerm: string,
  replaceTerm: string,
  options: FindReplaceOptions = {},
): Partial<BinderItem> {
  const builtRegex = buildSearchRegex(searchTerm, options);
  if (!builtRegex) return {};
  const regex: RegExp = builtRegex;
  const fields = resolveFields(options);
  let patch: Partial<BinderItem> = {};
  for (const field of FIELD_ORDER) {
    if (!fields[field]) continue;
    const raw = item[field] ?? '';
    if (raw.match(regex)) {
      patch = { ...patch, [field]: raw.replace(regex, replaceTerm) };
    }
  }
  return patch;
}
