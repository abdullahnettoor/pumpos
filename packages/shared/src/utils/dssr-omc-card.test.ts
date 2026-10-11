import { describe, expect, it } from 'vitest';
import { readDssrOmcCard } from './dssr-omc-card.js';

describe('readDssrOmcCard', () => {
  it('reads the total and slip count of a snapshot that carries the field', () => {
    expect(readDssrOmcCard({ omcCard: { total: 2000, count: 1 } })).toEqual({
      total: 2000,
      count: 1,
    });
  });
  it('is null for a snapshot frozen before the field existed', () => {
    expect(readDssrOmcCard({ credit: { total: 5 } })).toBeNull();
    expect(readDssrOmcCard(undefined)).toBeNull();
    expect(readDssrOmcCard({})).toBeNull();
  });
  it('is null for a day without OMC Card Sales', () => {
    expect(readDssrOmcCard({ omcCard: { total: 0, count: 0 } })).toBeNull();
  });
  it('tolerates numeric strings and garbage', () => {
    expect(readDssrOmcCard({ omcCard: { total: '750.5', count: '2' } })).toEqual({
      total: 750.5,
      count: 2,
    });
    expect(readDssrOmcCard({ omcCard: { total: 'x' } })).toBeNull();
  });
});
