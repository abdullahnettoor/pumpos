import { describe, expect, it } from 'vitest';
import { TAB_DEFS, tabsForRole } from './tabs.js';

describe('tabsForRole', () => {
  it('Owner gets every tab in dock order', () => {
    expect(tabsForRole('Owner', false)).toEqual(['home', 'shifts', 'reports', 'money', 'insights']);
  });
  it('Manager has no Home', () => {
    expect(tabsForRole('Manager', false)).toEqual(['shifts', 'reports', 'money', 'insights']);
  });
  it('Accountant gets Reports and Money only', () => {
    expect(tabsForRole('Accountant', false)).toEqual(['reports', 'money']);
  });
  it('Staff has no tabs, and Attendant uses its own shell', () => {
    expect(tabsForRole('Staff', false)).toEqual([]);
    expect(tabsForRole('Attendant', true)).toEqual([]);
  });
  it('has no handover tab: the handover is reached from a card on Home', () => {
    expect(TAB_DEFS.map((t) => t.key)).toEqual(['home', 'shifts', 'reports', 'money', 'insights']);
    expect(tabsForRole('Owner', true)).toEqual(tabsForRole('Owner', false));
  });
  it('a Manager, Accountant or Staff member on a Dispenser Unit gets Home for the handover card', () => {
    expect(tabsForRole('Manager', true)).toEqual([
      'home',
      'shifts',
      'reports',
      'money',
      'insights',
    ]);
    expect(tabsForRole('Accountant', true)).toEqual(['home', 'reports', 'money']);
    expect(tabsForRole('Staff', true)).toEqual(['home']);
  });
  it('no role, no tabs', () => {
    expect(tabsForRole(null, false)).toEqual([]);
  });
});
