import { useEffect, useState } from 'react';
import { resolveBusinessDate } from '@pump/shared';

export function useStationBusinessDate(timeZone?: string, dayStartsAt?: string): string {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return resolveBusinessDate({ now, timeZone, dayStartsAt });
}
