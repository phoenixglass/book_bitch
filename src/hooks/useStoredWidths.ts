import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A set of pixel widths remembered in this browser (localStorage), e.g. the
 * Outline's column widths or a sidebar's width. Storage can be unavailable
 * (private mode, blocked site data), so every read and write is guarded and
 * the defaults are always a valid fallback.
 */
export function useStoredWidths<K extends string>(
  storageKey: string,
  defaults: Record<K, number>,
  limits: Partial<Record<K, { min?: number; max?: number }>> = {},
) {
  const clamp = useCallback(
    (key: K, value: number) => {
      const { min = 40, max = 2000 } = limits[key] ?? {};
      return Math.round(Math.min(max, Math.max(min, value)));
    },
    // limits is expected to be a static object literal per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [widths, setWidths] = useState<Record<K, number>>(() => {
    const result = { ...defaults };
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Record<K, unknown>>;
        for (const key of Object.keys(defaults) as K[]) {
          const v = saved[key];
          if (typeof v === 'number' && Number.isFinite(v)) result[key] = clamp(key, v);
        }
      }
    } catch {
      /* storage unavailable or corrupt — use defaults */
    }
    return result;
  });

  const latest = useRef(widths);
  useEffect(() => {
    latest.current = widths;
  }, [widths]);

  const setWidth = useCallback(
    (key: K, value: number) => {
      setWidths((prev) => {
        const next = clamp(key, value);
        return prev[key] === next ? prev : { ...prev, [key]: next };
      });
    },
    [clamp],
  );

  // Persist when a drag finishes rather than on every pointer move.
  const save = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(latest.current));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const reset = useCallback(
    (key: K) => {
      setWidths((prev) => ({ ...prev, [key]: defaults[key] }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { widths, setWidth, save, reset, latest };
}
