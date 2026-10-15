import { useEffect, useRef } from 'react';

/**
 * Opens a tab's "add" drawer when the Station page's Add ▾ menu asks for it
 * (#537). `request` is a fresh number per menu pick (undefined otherwise);
 * `onHandled` lets the page clear it, so revisiting the tab never reopens it.
 */
export function useCreateRequest(
  request: number | undefined,
  open: () => void,
  onHandled?: () => void,
) {
  const latest = useRef({ open, onHandled });
  useEffect(() => {
    latest.current = { open, onHandled };
  });
  useEffect(() => {
    if (request === undefined) return;
    latest.current.open();
    latest.current.onHandled?.();
  }, [request]);
}

/** The props a Station tab takes to open its add drawer from the page menu. */
export interface CreateRequestProps {
  createRequest?: number;
  onCreateHandled?: () => void;
}
