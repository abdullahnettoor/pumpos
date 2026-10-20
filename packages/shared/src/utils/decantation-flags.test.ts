import { describe, expect, it } from 'vite-plus/test';
import { computeDecantationFlags } from './decantation-flags.js';

const base = { densityToleranceKgM3: 3, settlingTimeMinutes: 30 };
const codes = (r: ReturnType<typeof computeDecantationFlags>) => r.flags.map((f) => f.code);

describe('computeDecantationFlags', () => {
  it('flags density beyond tolerance only when invoice density is known', () => {
    expect(
      codes(
        computeDecantationFlags({
          ...base,
          lines: [{ id: 'l', roDensity: 745, invoiceDensity: 741 }],
        }),
      ),
    ).toEqual(['DENSITY_OUT_OF_TOLERANCE']);
    expect(
      codes(
        computeDecantationFlags({
          ...base,
          lines: [{ id: 'l', roDensity: 744, invoiceDensity: 741 }],
        }),
      ),
    ).toEqual([]);
    expect(
      codes(computeDecantationFlags({ ...base, lines: [{ id: 'l', roDensity: 800 }] })),
    ).toEqual([]);
  });

  it('flags a short or unsealed tanker and un-emptied chambers once unloading ended', () => {
    const r = computeDecantationFlags({
      ...base,
      lines: [],
      chambersChecked: true,
      unloadEndedAt: '2026-01-01T10:00:00Z',
      chambers: [
        { chamberNo: 1, mark: 'SHORT', emptied: true },
        { chamberNo: 2, sealOk: false, emptied: false },
      ],
    });
    expect(codes(r)).toEqual(['TANKER_SHORT', 'CHAMBER_NOT_EMPTIED']);
    const open = computeDecantationFlags({
      ...base,
      lines: [],
      chambers: [{ chamberNo: 1, emptied: false }],
    });
    expect(codes(open)).toEqual([]);
  });

  it('flags an after dip taken inside the settling time', () => {
    const line = (at: string) => ({ id: 'l', afterDipAt: at });
    const end = '2026-01-01T10:00:00Z';
    expect(
      codes(
        computeDecantationFlags({
          ...base,
          unloadEndedAt: end,
          lines: [line('2026-01-01T10:20:00Z')],
        }),
      ),
    ).toEqual(['EARLY_AFTER_DIP']);
    expect(
      codes(
        computeDecantationFlags({
          ...base,
          unloadEndedAt: end,
          lines: [line('2026-01-01T10:30:00Z')],
        }),
      ),
    ).toEqual([]);
  });

  it('warns, never flags, on excess and capacity mismatch', () => {
    const r = computeDecantationFlags({
      ...base,
      lines: [],
      invoiceQuantity: 12000,
      chambers: [
        { chamberNo: 1, mark: 'EXCESS', capacityL: 4000 },
        { chamberNo: 2, capacityL: 4000 },
      ],
    });
    expect(r.flags).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toEqual(['CHAMBER_EXCESS', 'CHAMBER_CAPACITY_MISMATCH']);
  });
});
