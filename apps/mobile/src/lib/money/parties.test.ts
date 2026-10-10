import { describe, expect, it } from 'vitest';
import {
  limitTone,
  matchName,
  overLimitCount,
  owing,
  sortByBalance,
  standing,
  totalOwed,
} from './parties.js';

const c = (name: string, currentBalance: number, creditLimit?: number | null) => ({
  id: name,
  name,
  currentBalance,
  creditLimit,
});

describe('standing against the credit limit', () => {
  it('is over when the balance passes the limit, with how far and the percent', () => {
    const s = standing(c('KTC', 214600, 200000));
    expect(s).toMatchObject({ state: 'over', overBy: 14600, usedPct: 107, room: 0 });
  });

  it('is not over at exactly the limit: near, 100%', () => {
    expect(standing(c('A', 100000, 100000))).toMatchObject({ state: 'near', usedPct: 100 });
  });

  it('never rounds an over-limit customer down to 100%', () => {
    expect(standing(c('A', 100400, 100000))).toMatchObject({ state: 'over', usedPct: 101 });
  });

  it('is near from 80% up to the limit, under below it, with the room left', () => {
    expect(standing(c('A', 80000, 100000))).toMatchObject({
      state: 'near',
      usedPct: 80,
      room: 20000,
    });
    expect(standing(c('B', 79000, 100000))).toMatchObject({ state: 'under', usedPct: 79 });
  });

  it('is under, without a percent, when no limit is set (0 or null)', () => {
    expect(standing(c('A', 5000, 0))).toMatchObject({ state: 'under', limit: null, usedPct: null });
    expect(standing(c('B', 5000, null))).toMatchObject({ state: 'under', limit: null });
  });

  it('is an advance when the balance is negative and settled at zero', () => {
    expect(standing(c('A', -1200, 100000))).toMatchObject({ state: 'advance', balance: -1200 });
    expect(standing(c('B', 0, 100000))).toMatchObject({ state: 'settled' });
    expect(standing(c('C', 0.001, 100000))).toMatchObject({ state: 'settled' });
  });

  it('reads string balances and limits from the API', () => {
    expect(
      standing({ currentBalance: '150000.00', creditLimit: '200000.00' } as never),
    ).toMatchObject({ state: 'under', usedPct: 75 });
  });
});

describe('limitTone', () => {
  it('is accent under 80%, warn at 80–100%, bad over 100%', () => {
    expect(limitTone(79)).toBe('accent');
    expect(limitTone(80)).toBe('warn');
    expect(limitTone(100)).toBe('warn');
    expect(limitTone(101)).toBe('bad');
  });
});

describe('list figures', () => {
  const customers = [c('Calicut Cabs', 61400, 100000), c('KTC', 214600, 200000), c('Zed', 0)];
  const advance = c('Prepaid', -5000);

  it('totals what is owed and ignores advances', () => {
    expect(totalOwed([...customers, advance])).toBe(276000);
  });

  it('keeps only parties that owe', () => {
    expect(owing([...customers, advance]).map((p) => p.name)).toEqual(['Calicut Cabs', 'KTC']);
  });

  it('sorts by balance, largest first, ties by name', () => {
    const sorted = sortByBalance([c('B', 10), c('A', 10), c('C', 50), advance]);
    expect(sorted.map((p) => p.name)).toEqual(['C', 'A', 'B', 'Prepaid']);
  });

  it('matches names case-insensitively and keeps everyone on a blank query', () => {
    expect(matchName(customers, ' ktc ').map((p) => p.name)).toEqual(['KTC']);
    expect(matchName(customers, '')).toHaveLength(3);
  });

  it('counts customers over their limit', () => {
    expect(overLimitCount(customers)).toBe(1);
  });
});
