import { describe, expect, it } from 'vitest';
import {
  balanceState,
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
    expect(s).toMatchObject({ state: 'over', tone: 'bad', overBy: 14600, usedPct: 107, room: 0 });
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

describe('limit bands (state and bar tone come from one ratio)', () => {
  const at = (pct: number) => standing(c('A', pct * 1000, 100000));

  it.each([
    [79, 'under', 'accent', 79],
    [79.6, 'under', 'accent', 79],
    [80, 'near', 'warn', 80],
    [99.6, 'near', 'warn', 99],
    [100, 'near', 'warn', 100],
    [100.4, 'over', 'bad', 101],
    [107.3, 'over', 'bad', 107],
  ] as const)('%s%% of the limit is %s with a %s bar, shown as %s%%', (pct, state, tone, shown) => {
    expect(at(pct)).toMatchObject({ state, tone, usedPct: shown });
  });

  it('has no bar tone without a limit or when nothing is owed', () => {
    expect(standing(c('A', 5000, null)).tone).toBeNull();
    expect(standing(c('B', 0, 100000)).tone).toBeNull();
    expect(standing(c('C', -5, 100000)).tone).toBeNull();
  });
});

describe('balanceState', () => {
  it('splits owes / advance / settled, treating paise dust as settled', () => {
    expect(balanceState(10)).toBe('owes');
    expect(balanceState(-10)).toBe('advance');
    expect(balanceState(0)).toBe('settled');
    expect(balanceState(0.004)).toBe('settled');
    expect(balanceState(-0.004)).toBe('settled');
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
