import { describe, expect, it } from 'vitest';
import {
  LEGACY_ROUTES,
  NAV_GROUPS,
  NAV_PAGES,
  ROUTES,
  accountRoute,
  navTarget,
  pageRoute,
  parseAccountRoute,
  parseShiftCloseRoute,
  resolveRoute,
  shiftCloseRoute,
} from './routes.js';
import { CONCEPT_ICON } from '../pump-ds/icon/concepts.js';
import { ICON_REGISTRY } from '../pump-ds/icon/registry.js';

describe('routes (#540)', () => {
  it('every page route is in the sidebar, in exactly one group', () => {
    const grouped = NAV_GROUPS.flatMap((g) => g.paths);
    for (const path of Object.values(ROUTES)) {
      expect(NAV_PAGES.map((p) => p.path)).toContain(path);
      expect(grouped.filter((p) => p === path)).toHaveLength(1);
    }
  });

  it('sidebar groups are Operate · Parties · Books · Insight · Setup', () => {
    expect(NAV_GROUPS.map((g) => g.heading)).toEqual([
      'Operate',
      'Parties',
      'Books',
      'Insight',
      'Setup',
    ]);
  });

  it('page labels are sentence case', () => {
    for (const { label } of NAV_PAGES) {
      expect(label.slice(1)).toBe(label.slice(1).toLowerCase());
    }
  });

  it('renamed routes resolve to a current page; current routes resolve to themselves', () => {
    expect(resolveRoute('/purchases')).toBe('/suppliers');
    for (const target of Object.values(LEGACY_ROUTES)) {
      expect(Object.values(ROUTES)).toContain(target);
    }
    for (const path of Object.values(ROUTES)) expect(resolveRoute(path)).toBe(path);
    expect(resolveRoute('/design-system')).toBe('/design-system');
  });
});

describe('concept → icon map (#540)', () => {
  it('every concept names a registered icon', () => {
    for (const icon of Object.values(CONCEPT_ICON)) expect(ICON_REGISTRY).toHaveProperty(icon);
  });

  it('the same concept reads the same glyph across pages', () => {
    // Shared tab concepts are one key each, so Tanks (Inventory, Station),
    // Products (Pricing, Station), Decantations (Inventory, Reports) and
    // Daily cash book / Ledgers match by construction. Pin the agreed glyphs.
    expect(CONCEPT_ICON.tanks).toBe('tank');
    expect(CONCEPT_ICON.products).toBe('package');
    expect(CONCEPT_ICON.decantations).toBe('truck');
    expect(CONCEPT_ICON['by-category']).toBe('pie');
    expect(CONCEPT_ICON.collections).toBe(CONCEPT_ICON.payments);
  });
});

describe("an account's route (#576)", () => {
  it('names the account, and its period only when it has one', () => {
    expect(accountRoute('sbi')).toBe('/accounts/sbi');
    expect(accountRoute('a b/c')).toBe('/accounts/a%20b%2Fc');
    expect(accountRoute('sbi', { from: '2026-09-01', to: '2026-09-30' })).toBe(
      '/accounts/sbi?from=2026-09-01&to=2026-09-30',
    );
  });

  it('reads back what it wrote', () => {
    expect(parseAccountRoute(accountRoute('a b/c'))).toEqual({ accountId: 'a b/c', range: null });
    expect(
      parseAccountRoute(accountRoute('sbi', { from: '2026-09-01', to: '2026-09-30' })),
    ).toEqual({ accountId: 'sbi', range: { from: '2026-09-01', to: '2026-09-30' } });
  });

  it.each([
    ['/accounts/sbi?from=2026-09-30&to=2026-09-01', 'out of order'],
    ['/accounts/sbi?from=2026-09-01', 'half a period'],
    ['/accounts/sbi?from=yesterday&to=2026-09-01', 'not a date'],
    ['/accounts/sbi?from=2026-02-01&to=2026-02-31', 'a date that does not exist'],
    ['/accounts/sbi?from=2026-13-01&to=2026-13-02', 'a month that does not exist'],
  ])('drops a period that is %s (%s)', (path) => {
    expect(parseAccountRoute(path)).toEqual({ accountId: 'sbi', range: null });
  });

  it.each(['/accounts', '/accounts/', '/accounts/sbi/extra', '/customers/sbi', '/accounts/%E0%A4'])(
    '%s is not an account route',
    (path) => {
      expect(parseAccountRoute(path)).toBeNull();
    },
  );

  it('belongs to the Accounts page, for the shell and the sidebar', () => {
    expect(pageRoute('/accounts/sbi?from=2026-09-01&to=2026-09-30')).toBe(ROUTES.accounts);
    expect(pageRoute('/accounts')).toBe(ROUTES.accounts);
    expect(pageRoute('/setup/station')).toBe(ROUTES.station);
    expect(pageRoute('/design-system')).toBe('/design-system');
  });

  it('{ openAccountId } is a navigation to the route, and keeps any other intent', () => {
    expect(navTarget(ROUTES.accounts, { openAccountId: 'sbi' })).toEqual({
      path: '/accounts/sbi',
      intent: null,
    });
    expect(navTarget(ROUTES.reports, { openReportsTab: 'gst' })).toEqual({
      path: ROUTES.reports,
      intent: { openReportsTab: 'gst' },
    });
    expect(navTarget(ROUTES.shifts)).toEqual({ path: ROUTES.shifts, intent: null });
  });
});

describe("a shift's Close shift route (#534)", () => {
  it('names the shift, and the step past the first', () => {
    expect(shiftCloseRoute('sh-1')).toBe('/shifts/sh-1/close');
    expect(shiftCloseRoute('sh-1', 'readings')).toBe('/shifts/sh-1/close');
    expect(shiftCloseRoute('sh-1', 'cash')).toBe('/shifts/sh-1/close?step=cash');
    expect(shiftCloseRoute('a/b', 'done')).toBe('/shifts/a%2Fb/close?step=done');
  });

  it('reads back the shift and step, an unknown step as the first', () => {
    expect(parseShiftCloseRoute('/shifts/sh-1/close?step=handovers')).toEqual({
      shiftId: 'sh-1',
      step: 'handovers',
    });
    expect(parseShiftCloseRoute('/shifts/sh-1/close?step=nope')).toEqual({
      shiftId: 'sh-1',
      step: 'readings',
    });
    expect(parseShiftCloseRoute(shiftCloseRoute('a/b', 'done'))).toEqual({
      shiftId: 'a/b',
      step: 'done',
    });
  });

  it('is not any other path, and belongs to the Shifts page', () => {
    expect(parseShiftCloseRoute('/shifts')).toBeNull();
    expect(parseShiftCloseRoute('/shifts/sh-1')).toBeNull();
    expect(parseShiftCloseRoute('/accounts/sh-1/close')).toBeNull();
    expect(pageRoute('/shifts/sh-1/close?step=cash')).toBe(ROUTES.shifts);
  });
});
