import { useEffect, useRef, useState } from 'react';

/** Polls `fetcher` every `intervalMs`, restarting whenever `deps` change. */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, deps: unknown[]): T | null {
  const [data, setData] = useState<T | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let disposed = false;
    const tick = () => {
      fetcherRef.current()
        .then((result) => {
          if (!disposed) setData(result);
        })
        .catch(() => undefined);
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return data;
}
