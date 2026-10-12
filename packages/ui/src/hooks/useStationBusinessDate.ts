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

/** Today's Entry Date: the station-timezone calendar date, Day Start never applies (ADR 0005). */
export function useStationEntryDate(timeZone?: string): string {
  return useStationBusinessDate(timeZone, '00:00');
}
