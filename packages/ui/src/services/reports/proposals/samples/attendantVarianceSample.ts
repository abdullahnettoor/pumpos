import type { AttendantVarianceData, AttendantVarianceGroup } from '../attendantVarianceDoc.js';
import { ATTENDANTS, PERIOD } from './common.js';
import { OCT_SHIFTS } from './month.js';

const drawers = OCT_SHIFTS.flatMap((s) =>
  s.drawers.map((d) => ({ date: s.date, shift: s.label, ...d })),
);

const attendants: AttendantVarianceGroup[] = ATTENDANTS.map((name) => {
  const own = drawers.filter((d) => d.attendant === name);
  return {
    attendant: name,
    shifts: own.length,
    lines: own
      .filter((d) => d.variance !== 0)
      .map((d) => ({
        date: d.date,
        shift: d.shift,
        du: d.du,
        expected: d.expected,
        declared: d.declared,
        variance: d.variance,
      })),
  };
});

export const ATTENDANT_VARIANCE_SAMPLE: AttendantVarianceData = {
  filters: { period: PERIOD, attendant: 'All', du: 'All', nonZeroOnly: 'Yes (detail)' },
  attendants,
};
