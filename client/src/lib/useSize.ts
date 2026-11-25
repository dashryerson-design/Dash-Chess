import { useCallback, useEffect, useRef, useState } from 'react';

/** Measures an element. Uses a callback ref so it works even when the element mounts after the first render. */
export function useElementSize<T extends HTMLElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    const measure = (w: number, h: number) =>
      setSize((s) => (Math.abs(s.width - w) < 1 && Math.abs(s.height - h) < 1 ? s : { width: w, height: h }));
    const r = el.getBoundingClientRect();
    measure(r.width, r.height);
    ro.current = new ResizeObserver(([e]) => measure(e.contentRect.width, e.contentRect.height));
    ro.current.observe(el);
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);
  return [ref, size] as const;
}
