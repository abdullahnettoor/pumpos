import { describe, expect, it } from 'vite-plus/test';
import {
  buildSaveBody,
  decantationFormSchema,
  decantationToFormValues,
  emptyChamber,
  emptyDecantationForm,
  emptyLine,
  isoToLocalTime,
  liveFlags,
  localTimeToIso,
  withoutLine,
  type DecantationFormContext,
} from './decantationForm.js';
import type { DecantationView } from '@pump/shared';

const TZ = 'Asia/Kolkata';
const ctx: DecantationFormContext = {
  stationId: 'st-1',
  timeZone: TZ,
  tanks: [
    { id: 't-ms', productId: 'p-ms' },
    { id: 't-hsd', productId: 'p-hsd' },
  ],
  invoiceDensityByProduct: { 'p-hsd': 830 },
  invoiceQtyByProduct: { 'p-hsd': 12000 },
  settings: { densityToleranceKgM3: 3, settlingTimeMinutes: 30 },
};

const base = () => {
  const v = emptyDecantationForm('2026-10-11');
  v.tankerNumber = 'KL-07-CB-4412';
  v.lines = [{ ...emptyLine('t-hsd'), beforeDip: '4000' }];
  return v;
};

describe('station-time conversion', () => {
  it('converts a station-local time to an instant and back', () => {
    expect(localTimeToIso('2026-10-11', '14:30', TZ)).toBe('2026-10-11T09:00:00.000Z');
    expect(isoToLocalTime('2026-10-11T09:00:00.000Z', TZ)).toBe('14:30');
    expect(localTimeToIso('2026-10-11', '', TZ)).toBeUndefined();
  });
});

describe('decantationFormSchema', () => {
  it('requires a tanker number and a tank on every line', () => {
    const v = base();
    v.tankerNumber = ' ';
    v.lines[0].tankId = '';
    const r = decantationFormSchema.safeParse(v);
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('tankerNumber');
    expect(paths).toContain('lines.0.tankId');
  });
  it('rejects non-numeric quantities but allows blanks', () => {
    const v = base();
    v.lines[0].roDensity = 'abc';
    expect(decantationFormSchema.safeParse(v).success).toBe(false);
    v.lines[0].roDensity = '';
    expect(decantationFormSchema.safeParse(v).success).toBe(true);
  });
});

describe('buildSaveBody', () => {
  it('maps lines, derives invoice density from the linked purchase and sends links', () => {
    const v = base();
    v.lines[0].roDensity = '834';
    v.links = { 'p-hsd': 'pur-1', 'p-ms': '' };
    const body = buildSaveBody(v, ctx, { draft: false });
    expect(body).toMatchObject({
      stationId: 'st-1',
      tankerNumber: 'KL-07-CB-4412',
      chambersChecked: false,
      invoiceQuantity: 12000,
      links: [{ productId: 'p-hsd', purchaseId: 'pur-1' }],
    });
    expect(body.lines[0]).toMatchObject({ tankId: 't-hsd', beforeDip: 4000, roDensity: 834 });
    expect(body.lines[0].invoiceDensity).toBe(830);
    expect(body.draft).toBeUndefined();
    expect(body.chambers).toBeUndefined();
  });

  it('only sends the after dip when the line is measured now', () => {
    const v = base();
    v.lines[0].afterDip = '10000';
    v.lines[0].salesDuring = '50';
    expect(buildSaveBody(v, ctx, { draft: false }).lines[0].afterDip).toBeUndefined();
    v.lines[0].doAfterDip = true;
    v.lines[0].afterDipTime = '15:10';
    const line = buildSaveBody(v, ctx, { draft: false }).lines[0];
    expect(line).toMatchObject({ afterDip: 10000, salesDuring: 50 });
    expect(line.afterDipAt).toBe('2026-10-11T09:40:00.000Z');
  });

  it('sends chambers only behind the checkbox, with the Into tank line', () => {
    const v = base();
    v.lines.push({ ...emptyLine('t-ms'), beforeDip: '1000' });
    v.chambers = [
      { ...emptyChamber(1), capacity: '4000', mark: 'SHORT', sealOk: false, dipMm: '12' },
    ];
    expect(buildSaveBody(v, ctx, { draft: false }).chambers).toBeUndefined();
    v.checkChambers = true;
    const body = buildSaveBody(v, ctx, { draft: true });
    expect(body.chambersChecked).toBe(true);
    expect(body.draft).toBe(true);
    expect(body.chambers).toEqual([
      expect.objectContaining({
        chamberNo: 1,
        capacityL: 4000,
        mark: 'SHORT',
        sealOk: false,
        dipMm: 12,
        tankLineIndex: 1,
      }),
    ]);
  });
});

describe('liveFlags', () => {
  it('reuses the shared flag rules: density, short tanker, not emptied, early after dip', () => {
    const v = base();
    v.lines[0].roDensity = '836';
    v.links = { 'p-hsd': 'pur-1' };
    v.checkChambers = true;
    v.chambers = [{ ...emptyChamber(0), mark: 'SHORT', emptied: false }];
    v.unloadEnd = '14:00';
    v.lines[0].doAfterDip = true;
    v.lines[0].afterDip = '9000';
    v.lines[0].afterDipTime = '14:10';
    const { flags } = liveFlags(v, ctx);
    expect(flags.map((f) => f.code).sort()).toEqual([
      'CHAMBER_NOT_EMPTIED',
      'DENSITY_OUT_OF_TOLERANCE',
      'EARLY_AFTER_DIP',
      'TANKER_SHORT',
    ]);
  });
  it('is quiet when nothing is off', () => {
    const v = base();
    v.lines[0].roDensity = '831';
    v.links = { 'p-hsd': 'pur-1' };
    expect(liveFlags(v, ctx).flags).toEqual([]);
  });
});

describe('decantationToFormValues', () => {
  it('round-trips a saved Decantation including links and chambers', () => {
    const d: DecantationView = {
      id: 'd1',
      stationId: 'st-1',
      businessDayId: 'bd',
      businessDate: '2026-10-11',
      documentNumber: 'DEC-1',
      tankerNumber: 'KL-1',
      driverName: 'Ravi',
      unloadStartedAt: '2026-10-11T08:00:00.000Z',
      unloadEndedAt: '2026-10-11T09:00:00.000Z',
      chambersChecked: true,
      status: 'PENDING_MEASUREMENT',
      flags: [],
      notes: null,
      createdAt: '',
      updatedAt: '',
      lines: [
        {
          id: 'l1',
          tankId: 't-hsd',
          productId: 'p-hsd',
          beforeDip: 4000,
          beforeDipAt: null,
          observedDensity: null,
          observedTempC: null,
          roDensity: 831.5,
          afterDip: null,
          afterDipAt: null,
          salesDuring: 0,
          receivedQty: null,
          status: 'PENDING_MEASUREMENT',
        },
      ],
      chambers: [
        {
          id: 'c1',
          tankLineId: 'l1',
          chamberNo: 1,
          capacityL: 6000,
          sealOk: true,
          mark: 'OK',
          dipMm: null,
          emptied: true,
        },
      ],
      links: [
        {
          productId: 'p-hsd',
          purchaseId: 'pur-1',
          invoiceNumber: 'INV-9',
          supplierName: 'IOCL',
          invoiceQty: 6000,
          invoiceDensity: 830,
          receivedQty: null,
          varianceQty: null,
          varianceComputedAt: null,
        },
      ],
    };
    const v = decantationToFormValues(d, TZ);
    expect(v).toMatchObject({
      tankerNumber: 'KL-1',
      driverName: 'Ravi',
      unloadStart: '13:30',
      unloadEnd: '14:30',
      checkChambers: true,
      links: { 'p-hsd': 'pur-1' },
    });
    expect(v.lines[0]).toMatchObject({
      id: 'l1',
      tankId: 't-hsd',
      beforeDip: '4000',
      roDensity: '831.5',
    });
    expect(v.chambers[0]).toMatchObject({
      capacity: '6000',
      lineIndex: 0,
      mark: 'OK',
      emptied: true,
    });
  });
});

describe('withoutLine', () => {
  const form = () => ({
    ...emptyDecantationForm('2026-03-15'),
    lines: [emptyLine('a'), emptyLine('b'), emptyLine('c')],
    chambers: [emptyChamber(0), emptyChamber(1), emptyChamber(2)],
  });

  it('unassigns chambers on the removed line (never -1) and shifts later ones', () => {
    const next = withoutLine(form(), 1);
    expect(next.lines.map((l) => l.tankId)).toEqual(['a', 'c']);
    expect(next.chambers.map((c) => c.lineIndex)).toEqual([0, null, 1]);
  });

  it('keeps at least one tank line', () => {
    const single = { ...form(), lines: [emptyLine('a')], chambers: [emptyChamber(0)] };
    expect(withoutLine(single, 0)).toBe(single);
  });

  it('sends an unassigned chamber without a tank line index', () => {
    const body = buildSaveBody(
      { ...withoutLine(form(), 1), checkChambers: true },
      { ...ctx, tanks: [{ id: 'a', productId: 'p' }] },
      { draft: false },
    );
    expect(body.chambers?.map((c) => c.tankLineIndex)).toEqual([0, undefined, 1]);
  });
});
