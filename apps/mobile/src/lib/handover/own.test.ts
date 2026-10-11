import { describe, expect, it } from 'vitest';
import type { AssignedDu, MyAssignment } from './model.js';
import { deriveOwnHandover } from './own.js';

const TZ = 'Asia/Kolkata';

const du = (over: Partial<AssignedDu> = {}): AssignedDu => ({
  duId: 'du-2',
  duName: 'DU2',
  nozzles: [],
  terminals: [],
  ...over,
});

const assignment = (dus: AssignedDu[], shift: MyAssignment['shift'] = {}): MyAssignment => ({
  userId: 'u1',
  station: { id: 'st-1', name: 'Highway Fuels' },
  shift: { id: 's2', templateName: 'Shift 2', openedAt: '2026-10-09T08:30:00.000Z', ...shift },
  dispenserUnits: dus,
});

const slip = (id: string) => ({
  id,
  customerId: 'c1',
  customerName: 'KTC',
  vehicleId: null,
  productId: null,
  productName: null,
  quantity: null,
  unitPrice: null,
  amount: 100,
  notes: null,
});

const saved = (variance: string, createdAt = '2026-10-09T12:10:00.000Z') =>
  ({
    cashHandedOver: '1000',
    cardHandedOver: '0',
    upiHandedOver: '0',
    creditHandedOver: '0',
    expectedSales: '1000',
    openingFloat: '0',
    cashDrops: '0',
    varianceAmount: variance,
    createdAt,
  }) as AssignedDu['handover'];

describe('deriveOwnHandover', () => {
  it('is null without an assignment or without a Dispenser Unit', () => {
    expect(deriveOwnHandover(null, TZ)).toBeNull();
    expect(deriveOwnHandover(undefined, TZ)).toBeNull();
    expect(deriveOwnHandover(assignment([]), TZ)).toBeNull();
    expect(deriveOwnHandover({ ...assignment([du()]), dispenserUnits: undefined }, TZ)).toBeNull();
  });

  it('names the DU and the Shift', () => {
    const own = deriveOwnHandover(assignment([du()]), TZ)!;
    expect(own.title).toBe('Your handover · DU2');
    expect(own.shiftName).toBe('Shift 2');
    expect(own.openedAt).toBe('2026-10-09T08:30:00.000Z');
  });

  it('lists every DU of a multi-DU Shift', () => {
    const own = deriveOwnHandover(assignment([du(), du({ duId: 'du-3', duName: 'DU3' })]), TZ)!;
    expect(own.title).toBe('Your handover · DU2, DU3');
  });

  it('not saved: says so, with the credit slips recorded so far (OMC card sales are not credit slips)', () => {
    const none = deriveOwnHandover(assignment([du()]), TZ)!;
    expect(none.saved).toBe(false);
    expect(none.status).toBe('Not saved yet');

    const some = deriveOwnHandover(
      assignment([du({ creditSales: [slip('a'), slip('b')], omcSales: [slip('c')] })]),
      TZ,
    )!;
    expect(some.status).toBe('Not saved yet · 2 credit slips');

    const onlyCards = deriveOwnHandover(assignment([du({ omcSales: [slip('c')] })]), TZ)!;
    expect(onlyCards.status).toBe('Not saved yet');

    const one = deriveOwnHandover(assignment([du({ creditSales: [slip('a')] })]), TZ)!;
    expect(one.status).toBe('Not saved yet · 1 credit slip');
  });

  it('saved and balanced: the save time and Balanced', () => {
    const own = deriveOwnHandover(assignment([du({ handover: saved('0') })]), TZ)!;
    expect(own.saved).toBe(true);
    expect(own.status).toMatch(/^Saved \d{1,2}:\d{2} [ap]m · Balanced$/);
  });

  it('reads the save time in the station timezone, not the device one', () => {
    const dus = [du({ handover: saved('0', '2026-10-09T12:10:00.000Z') })];
    expect(deriveOwnHandover(assignment(dus), 'Asia/Kolkata')!.status).toBe(
      'Saved 5:40 pm · Balanced',
    );
    expect(deriveOwnHandover(assignment(dus), 'UTC')!.status).toBe('Saved 12:10 pm · Balanced');
  });

  it('saved with a shortage or an overage: the signed amount', () => {
    const short = deriveOwnHandover(assignment([du({ handover: saved('-340') })]), TZ)!;
    expect(short.status).toMatch(/ · −₹340$/);
    const over = deriveOwnHandover(assignment([du({ handover: saved('120') })]), TZ)!;
    expect(over.status).toMatch(/ · \+₹120$/);
  });

  it('several DUs: saved only when every DU is, variances summed', () => {
    const both = deriveOwnHandover(
      assignment([
        du({ handover: saved('-100') }),
        du({ duId: 'du-3', duName: 'DU3', handover: saved('-240') }),
      ]),
      TZ,
    )!;
    expect(both.saved).toBe(true);
    expect(both.status).toMatch(/ · −₹340$/);

    const partly = deriveOwnHandover(
      assignment([du({ handover: saved('0') }), du({ duId: 'du-3', duName: 'DU3' })]),
      TZ,
    )!;
    expect(partly.saved).toBe(false);
    expect(partly.status).toBe('1 of 2 DUs saved');
  });
});
