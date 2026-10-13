import { describe, expect, it } from 'vitest';
import { LEGACY_ROUTES, NAV_GROUPS, NAV_PAGES, ROUTES, resolveRoute } from './routes.js';
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
