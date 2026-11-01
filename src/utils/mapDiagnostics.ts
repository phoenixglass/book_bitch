/**
 * Breadcrumbs for the Structural Map, so a crash that kills the tab (which no
 * error boundary can catch) still leaves a record of how far the map got and
 * how big the project was. Only counts and sizes are recorded, never titles
 * or text. localStorage lives in the browser process, so the record survives
 * the tab itself crashing ("Aw, Snap") or being killed while frozen.
 *
 * The record stays "open" while the map is mounted. Unmounting or leaving the
 * page closes it, so a record still open at the next load means the map was
 * on screen when the tab died.
 */

const KEY = 'book_bitch.mapDiag';

export interface MapDiag {
  /** Last step reached: opening → collected → rows → indexed → rendering → painted. */
  stage: string;
  open: boolean;
  openedAt: number;
  view?: string;
  layers?: string[];
  zoom?: number;
  order?: string;
  matrix?: string;
  scenes?: number;
  contentMB?: number;
  maxSceneMB?: number;
  images?: number;
  embeddedImageMB?: number;
  values?: Record<string, number>;
  ms?: Record<string, number>;
}

let current: MapDiag | null = null;
let lastClosed: MapDiag | null = null;

function write() {
  if (!current) return;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage unavailable */ }
}

export function mapDiagOpen(base: Partial<MapDiag>) {
  current = { stage: 'opening', open: true, openedAt: Date.now(), ...base };
  write();
}

export function mapDiagIsOpen(): boolean {
  return current !== null;
}

/** Re-open the record just closed, keeping what it had collected. */
export function mapDiagReopen(fallback: Partial<MapDiag>) {
  current = lastClosed ? { ...lastClosed, open: true } : { stage: 'opening', open: true, openedAt: Date.now(), ...fallback };
  lastClosed = null;
  write();
}

export function mapCrumb(patch: Partial<MapDiag>) {
  if (!current) return;
  current = { ...current, ...patch, ms: { ...current.ms, ...patch.ms } };
  write();
}

/**
 * Run one step of the map's data pipeline and record how long it took. The
 * timing only goes into the diagnostic record; it never affects output.
 */
export function timedStep<T>(stage: string, fn: () => T, details?: (result: T) => Partial<MapDiag>): T {
  const t = performance.now();
  const result = fn();
  mapCrumb({ stage, ...details?.(result), ms: { [stage]: Math.round(performance.now() - t) } });
  return result;
}

export function mapDiagClose() {
  if (!current) return;
  current = { ...current, open: false };
  write();
  lastClosed = current;
  current = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', mapDiagClose);
  // A hidden tab can be discarded by the browser without any unload event;
  // that isn't a crash, so the record is paused while hidden.
  document.addEventListener('visibilitychange', () => {
    if (!current) return;
    current = { ...current, open: document.visibilityState !== 'hidden' };
    write();
  });
}

/**
 * The previous map session if it never closed, i.e. the tab died with the map
 * on screen. Reading it marks it consumed so it's reported once.
 */
export function takeUnfinishedMapDiag(): MapDiag | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as MapDiag;
    if (!d.open) return null;
    localStorage.setItem(KEY, JSON.stringify({ ...d, open: false }));
    return d;
  } catch {
    return null;
  }
}

/** Sizes of the scene HTML, counted cheaply (no parsing). */
export function contentStats(contents: string[]) {
  let total = 0;
  let max = 0;
  let images = 0;
  let embedded = 0;
  for (const c of contents) {
    if (typeof c !== 'string') continue;
    total += c.length;
    if (c.length > max) max = c.length;
    let i = c.indexOf('<img');
    while (i !== -1) { images++; i = c.indexOf('<img', i + 4); }
    let j = c.indexOf('data:image');
    while (j !== -1) {
      const end = c.indexOf('"', j);
      embedded += (end === -1 ? c.length : end) - j;
      j = c.indexOf('data:image', j + 10);
    }
  }
  const mb = (n: number) => Math.round((n / 1e6) * 100) / 100;
  return { contentMB: mb(total), maxSceneMB: mb(max), images, embeddedImageMB: mb(embedded) };
}

/** One line per fact, for the "copy details" text. */
export function formatMapDiag(d: MapDiag): string {
  const lines = [
    `Last step: ${d.stage}`,
    `View: ${d.view ?? '?'}${d.view === 'matrix' ? ` (${d.matrix ?? '?'})` : ''}, order: ${d.order ?? '?'}, column width: ${d.zoom ?? '?'}`,
    `Layers: ${(d.layers ?? []).join(', ') || 'none'}`,
    `Scenes: ${d.scenes ?? '?'}`,
    `Text: ${d.contentMB ?? '?'} MB total, biggest scene ${d.maxSceneMB ?? '?'} MB`,
    `Images: ${d.images ?? '?'} (${d.embeddedImageMB ?? '?'} MB embedded in scenes)`,
    `Values: ${d.values ? Object.entries(d.values).map(([k, v]) => `${k} ${v}`).join(', ') : '?'}`,
    `Timings (ms): ${d.ms ? Object.entries(d.ms).map(([k, v]) => `${k} ${v}`).join(', ') : '?'}`,
  ];
  return lines.join('\n');
}
