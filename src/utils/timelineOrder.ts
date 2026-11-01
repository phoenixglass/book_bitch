import type { BinderItem, SceneMetadata, SceneOrder } from '../types';

type SceneMeta = Partial<SceneMetadata> | undefined;

/**
 * Flattens the binder into a list of scene documents, in binder order.
 * Trash is always skipped; callers that need to exclude Research (or any
 * other root folder) should filter the top-level items before calling.
 */
export function collectScenes(items: BinderItem[]): BinderItem[] {
  const scenes: BinderItem[] = [];
  for (const item of items) {
    if (item.id === 'trash') continue;
    if (item.type === 'document') scenes.push(item);
    if (item.children?.length) scenes.push(...collectScenes(item.children));
  }
  return scenes;
}

/**
 * Parses a timeline date string into a comparable numeric key (yyyymmdd).
 * Accepts `yyyy-mm-dd`, `yyyy-mm`, `mm/dd/yyyy`, `mm/yyyy`, and free text
 * that `Date.parse` understands (e.g. "August 31, 2024").
 */
export function parseTimelineDate(dateStr?: string): number | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();

  // yyyy-mm-dd or yyyy-mm
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const month = parseInt(iso[2], 10);
    const day = iso[3] ? parseInt(iso[3], 10) : 0;
    return year * 10000 + month * 100 + day;
  }

  const parts = trimmed.split('/');
  if (parts.length === 3) {
    // mm/dd/yyyy
    const year = parseInt(parts[2], 10);
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day))
      return year * 10000 + month * 100 + day;
  } else if (parts.length === 2) {
    // mm/yyyy
    const year = parseInt(parts[1], 10);
    const month = parseInt(parts[0], 10);
    if (!isNaN(year) && !isNaN(month))
      return year * 10000 + month * 100;
  }

  // fallback for free text like "August 31, 2024"
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  return null;
}

/** Scenes with no parseable date sort after everything that has one. */
export function chronologicalDateKey(meta: SceneMeta): number {
  const specific = parseTimelineDate(meta?.timelineSpecificDate);
  if (specific !== null) return specific;
  const clue = parseTimelineDate(meta?.timelineDateStart);
  if (clue !== null) return clue;
  return Number.MAX_SAFE_INTEGER;
}

/** True when a scene has enough metadata to be placed on the chronological timeline. */
export function hasChronologicalPlacement(scene: BinderItem): boolean {
  const meta = scene.sceneMetadata;
  return !!(meta?.timelineSpecificDate || meta?.timelineDateStart || meta?.chronologicalOrder);
}

/**
 * Sorts scenes the same way the Timeline view displays them. The sort is
 * stable, so scenes that share a sort key keep their binder order and
 * unplaced scenes fall to the end.
 */
export function sortScenes(scenes: BinderItem[], order: SceneOrder): BinderItem[] {
  return [...scenes].sort((a, b) => {
    if (order === 'manuscript') {
      const ma = a.sceneMetadata?.manuscriptOrder ?? 9999;
      const mb = b.sceneMetadata?.manuscriptOrder ?? 9999;
      return ma - mb;
    }
    const da = chronologicalDateKey(a.sceneMetadata);
    const db = chronologicalDateKey(b.sceneMetadata);
    if (da !== db) return da - db;
    const ca = a.sceneMetadata?.chronologicalOrder ?? 9999;
    const cb = b.sceneMetadata?.chronologicalOrder ?? 9999;
    return ca - cb;
  });
}

/**
 * Human-readable date label for a scene, matching the Timeline view's left
 * gutter: a specific date when set, otherwise the date range, with `~`
 * appended when the placement is marked uncertain.
 */
export function formatTimelineDate(meta: SceneMeta): string | null {
  if (!meta) return null;
  const uncertain = meta.timelineUncertain ? ' ~' : '';
  if (meta.timelineSpecificDate) return `${meta.timelineSpecificDate}${uncertain}`;
  if (meta.timelineDateStart) {
    const end = meta.timelineDateEnd ? ` – ${meta.timelineDateEnd}` : '';
    return `${meta.timelineDateStart}${end}${uncertain}`;
  }
  return null;
}
