import { useEffect, useState } from 'react';
import { businessDateSettings, resolveBusinessDate } from '@pump/shared';

export interface StationClock {
  /** The current instant, refreshed every 30s. */
  now: Date;
  /** Station IANA timezone (platform default when the station has none). */
  timeZone: string;
  /** Day Start "HH:MM" (platform default when unset). */
  dayStartsAt: string;
  /** Sales-day date: rolled back before Day Start. */
  businessDate: string;
  /** Station-timezone calendar date, Day Start never applies (ADR 0005). */
  entryDate: string;
}

/**
 * The single read of a station's clock: `{ timezone, business_day_starts_at }`
 * from `station.settings` (shared `businessDateSettings` supplies the one set
 * of defaults) plus a shared 30s `now`. Mount it once per surface (the
 * dashboard frame, the app shell) and pass the result down; never re-read
 * settings or run another ticker per card.
 */
export function useStationClock(settings: unknown): StationClock {
  const { timeZone, dayStartsAt } = businessDateSettings(settings);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return {
    now,
    timeZone,
    dayStartsAt,
    businessDate: resolveBusinessDate({ now, timeZone, dayStartsAt }),
    entryDate: resolveBusinessDate({ now, timeZone, dayStartsAt: '00:00' }),
  };
}

/**
 * The current business date only. Ticks every minute but holds the date string
 * in state, so React bails out of re-rendering until the date actually changes
 * (the shell needs the date, not a ticking clock).
 */
export function useStationBusinessDate(settings: unknown): string {
  const { timeZone, dayStartsAt } = businessDateSettings(settings);
  const [date, setDate] = useState(() =>
    resolveBusinessDate({ now: new Date(), timeZone, dayStartsAt }),
  );
  useEffect(() => {
    const tick = () => setDate(resolveBusinessDate({ now: new Date(), timeZone, dayStartsAt }));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [timeZone, dayStartsAt]);
  return date;
}
