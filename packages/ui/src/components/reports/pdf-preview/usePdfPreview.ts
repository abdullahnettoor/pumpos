import { useEffect, useRef, useState, type ReactElement } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../query/hooks.js';
import type { PdfPageImage } from '../../../services/reports/pdfRaster.js';

export type { PdfPageImage };

/** A short, stable fingerprint of a preview's inputs (a logo data URL can be long). */
export function previewFingerprint(input: unknown): string {
  const text = JSON.stringify(input) ?? '';
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 33) ^ c;
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}:${text.length}`;
}

/** The input as it was `ms` ago: the first value at once, then the last of a burst. */
function useDebounced<T>(value: T, key: string, ms: number): { value: T; key: string } {
  const [current, setCurrent] = useState({ value, key });
  // The latest value for its key; a re-render with the same key restarts nothing.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  useEffect(() => {
    if (key === current.key) return;
    const id = setTimeout(() => setCurrent({ value: latest.current, key }), ms);
    return () => clearTimeout(id);
  }, [key, ms, current.key]);
  return current;
}

/** Thrown for a drawing nobody waits for any more; TanStack reverts the query. */
const superseded = () => new DOMException('The preview changed before it was drawn', 'AbortError');

/**
 * One drawing at a time: the PDF engine is not safe to run concurrently (a
 * second document laid out while the first loads its fonts fails), and three
 * template cards ask at once. A queued drawing whose query was cancelled —
 * superseded by a newer input, or its preview closed — is skipped when its
 * turn comes, so a burst of changes draws the first and the last only.
 */
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
  const start = () => (signal.aborted ? Promise.reject(superseded()) : task());
  const run = queue.then(start, start);
  queue = run.catch(() => undefined);
  return run;
}

export interface PdfPreviewOptions {
  /** CSS width the pages are shown at. */
  width: number;
  /** Draw at most this many pages (a thumbnail needs one). */
  maxPages?: number;
  /** Wait this long after the last change before drawing again. */
  debounceMs?: number;
  /**
   * Keep drawn pages cached after the preview closes (card thumbnails, which
   * return often). Off for a drawer: its pages are dropped once it closes.
   */
  keepCached?: boolean;
}

/**
 * Draws a react-pdf document to page images, through the same renderer the
 * PDF export uses (#605). While the inputs change (a toggle, a keystroke) the
 * previous pages stay on screen (`isPlaceholderData`) and the new ones replace
 * them once drawn, a short debounce after the last change. Cached briefly and
 * never persisted: it is drawn on this device, not read from the server.
 */
export function usePdfPreview<T>(
  kind: string,
  input: T,
  build: (input: T) => Promise<ReactElement>,
  { width, maxPages = Infinity, debounceMs = 250, keepCached = true }: PdfPreviewOptions,
) {
  const debounced = useDebounced(input, previewFingerprint(input), debounceMs);
  const pages = Number.isFinite(maxPages) ? maxPages : 0;
  return useQuery<PdfPageImage[]>({
    queryKey: queryKeys.pdfPreview(kind, debounced.key, width, pages),
    // Reading `signal` lets TanStack cancel a drawing whose key was replaced
    // or whose preview unmounted; the queue then skips it.
    queryFn: ({ signal }) =>
      oneAtATime(signal, async () => {
        const [{ renderPdf }, { rasterizePdf }, element] = await Promise.all([
          import('../../../services/exportPdf.js'),
          import('../../../services/reports/pdfRaster.js'),
          build(debounced.value),
        ]);
        const bytes = await renderPdf(element);
        if (signal.aborted) throw superseded();
        return rasterizePdf(bytes, { width, maxPages, signal });
      }),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    // A closed drawer's pages go at once; card thumbnails stay a while.
    gcTime: keepCached ? 2 * 60_000 : 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
