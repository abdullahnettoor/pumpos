import { describe, expect, it } from 'vitest';
import { tabsForRole } from './tabs.js';

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
  it('a user assigned to a Dispenser Unit gets My handover last', () => {
    expect(tabsForRole('Manager', true)).toEqual([
      'shifts',
      'reports',
      'money',
      'insights',
      'handover',
    ]);
    expect(tabsForRole('Staff', true)).toEqual(['handover']);
  });
  it('no role, no tabs', () => {
    expect(tabsForRole(null, false)).toEqual([]);
  });
});
