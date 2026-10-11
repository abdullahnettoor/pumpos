import { useMemo, useState } from 'react';
import { businessDateSettings, resolveEntryDate, type Station } from '@pump/shared';
import {
  DEFAULT_RANGE,
  resolveRange,
  widenRange,
  type DateRange,
  type RangeChoice,
} from '../../lib/money/statementRange.js';
import { useNow } from '../../lib/useNow.js';

export interface StatementRangeState {
  /** Today in the station's timezone (`YYYY-MM-DD`): "this month" is this date's month. */
  today: string;
  choice: RangeChoice;
  /** The dates the choice covers: what the screen reads and the PDF prints. */
  range: DateRange;
  choose: (choice: RangeChoice) => void;
  /** One month further back ("Earlier months"); a custom range stays as picked. */
  widen: () => void;
}

/**
 * Which range a party page's Statement covers: this month until the owner picks
 * another (Filter) or asks for an earlier month. One state per page, read by the
 * on-screen statement AND the Share / Download PDF, so both always show the same
 * range. "Today" is the station's calendar date, so the month follows its clock.
 */
export function useStatementRange(station: Station | null | undefined): StatementRangeState {
  const { timeZone } = businessDateSettings(station?.settings);
  const now = useNow(60 * 60_000);
  const today = resolveEntryDate({ now: new Date(now), timeZone });
  const [choice, setChoice] = useState<RangeChoice>(DEFAULT_RANGE);
  const range = useMemo(() => resolveRange(choice, today), [choice, today]);
  return { today, choice, range, choose: setChoice, widen: () => setChoice(widenRange) };
}
