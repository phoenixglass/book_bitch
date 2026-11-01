import { useAppStore } from '../store/appStore';
import type { ViewMode } from '../types';

/**
 * Breaks "crashes the moment it loads" loops.
 *
 * The current view is persisted, so a view that freezes or kills the tab
 * (too much to draw, a runaway loop: things no error boundary can catch)
 * gets reopened on every reload. This records, outside the app's own state,
 * that a session is running and which view it's on, with a heartbeat while
 * the page is responsive. A clean exit (tab closed, page hidden) marks it
 * finished. If the next load finds a session that stopped responding soon
 * after it started, it opens in the Editor instead and says which view it
 * was on.
 */

const KEY = 'book_bitch.bootGuard';
const HEARTBEAT_MS = 3000;
/** A session that dies this soon after loading counts as a failed load. */
const FAILED_LOAD_WINDOW_MS = 45_000;

interface Record_ {
  state: 'running' | 'clean';
  startedAt: number;
  lastAlive: number;
  view?: string;
  area?: string;
}

function read(): Record_ | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record_) : null;
  } catch {
    return null;
  }
}

function write(r: Record_) {
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage unavailable */ }
}

export interface FailedLoad {
  view: string;
  area: string;
}

let failed: FailedLoad | null = null;

const listeners = new Set<(f: FailedLoad | null) => void>();

/** The previous load, if it froze or crashed shortly after starting. */
export function previousFailedLoad(): FailedLoad | null {
  return failed;
}

/** Called when recovery settles (after saved state has loaded). Returns an unsubscribe. */
export function onFailedLoad(cb: (f: FailedLoad | null) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function startBootGuard() {
  const prev = read();
  if (prev?.state === 'running' && prev.lastAlive - prev.startedAt < FAILED_LOAD_WINDOW_MS) {
    failed = { view: prev.view ?? 'unknown', area: prev.area ?? 'unknown' };
  }

  const now = Date.now();
  const rec: Record_ = { state: 'running', startedAt: now, lastAlive: now };
  write(rec);

  // Fall back before anything renders the persisted view. Name the view the
  // app was about to reopen: it's what caused the loop, and it's more reliable
  // than our own record, whose last writes a hard-killed browser may not have
  // flushed to disk.
  const recover = () => {
    if (!failed) return;
    const s = useAppStore.getState();
    failed = { view: s.viewMode, area: s.area };
    useAppStore.setState({ viewMode: 'editor' as ViewMode, area: 'manuscript' });
    listeners.forEach((cb) => cb(failed));
  };
  if (useAppStore.persist.hasHydrated()) recover();
  else {
    const unsub = useAppStore.persist.onFinishHydration(() => { unsub(); recover(); });
  }

  // Note the view the moment it changes: a freeze stops the heartbeat, so
  // this has to be written before the heavy render begins.
  const note = () => {
    const s = useAppStore.getState();
    if (s.viewMode !== rec.view || s.area !== rec.area) {
      rec.view = s.viewMode;
      rec.area = s.area;
      write(rec);
    }
  };
  note();
  useAppStore.subscribe(note);

  const beat = () => {
    if (rec.state !== 'running') return;
    rec.lastAlive = Date.now();
    write(rec);
  };
  setInterval(beat, HEARTBEAT_MS);

  const markClean = () => { rec.state = 'clean'; write(rec); };
  window.addEventListener('pagehide', markClean);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') markClean();
    else {
      // Back in view: a fresh window, so a later freeze counts as a failed load.
      const t = Date.now();
      rec.state = 'running';
      rec.startedAt = t;
      rec.lastAlive = t;
      write(rec);
    }
  });
}
