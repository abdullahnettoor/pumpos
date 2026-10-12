import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Tracks an element's content width with a ResizeObserver. Returns 0 until
 * measured. Tests stub it with `stubContainerWidth` (../testing).
 */
export function useContainerWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      setWidth(typeof w === 'number' ? w : el.getBoundingClientRect().width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
