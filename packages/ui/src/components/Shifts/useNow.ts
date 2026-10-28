import { useEffect, useState } from 'react';

/** The clock, read every 30 s: it decides Live vs Past scheduled end, Pending vs due. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
