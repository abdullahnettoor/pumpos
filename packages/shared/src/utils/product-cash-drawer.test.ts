import { describe, expect, it } from 'vite-plus/test';
import { drawerProductCash, productCashDrawer, productCashOwner } from './product-cash-drawer.js';

const du = (duId: string, duCode: string | null, duName = duCode ?? duId) => ({
  duId,
  duCode,
  duName,
});

describe('productCashDrawer', () => {
  it('is the only DU of a single-DU attendant', () => {
    expect(productCashDrawer([du('a', 'DU-3')])).toBe('a');
  });

  it('is the first DU by code, in natural order', () => {
    expect(productCashDrawer([du('ten', 'DU-10'), du('two', 'DU-2'), du('one', 'DU-1')])).toBe(
      'one',
    );
    expect(productCashDrawer([du('ten', 'DU-10'), du('two', 'DU-2')])).toBe('two');
  });

  it('does not depend on the order the assignments arrive in', () => {
    const list = [du('x', 'DU-2'), du('y', 'DU-1'), du('z', 'DU-12')];
    expect(productCashDrawer(list)).toBe('y');
    expect(productCashDrawer([...list].reverse())).toBe('y');
  });

  it('breaks a code tie by name, then by id', () => {
    expect(productCashDrawer([du('a', 'DU-1', 'Pump B'), du('b', 'DU-1', 'Pump A')])).toBe('b');
    expect(productCashDrawer([du('b', 'DU-1', 'Pump'), du('a', 'DU-1', 'Pump')])).toBe('a');
    expect(productCashDrawer([du('a', 'DU-1', 'Pump'), du('b', 'DU-1', 'Pump')])).toBe('a');
  });

  it('orders by name when a DU has no code', () => {
    expect(productCashDrawer([du('a', null, 'Pump 2'), du('b', null, 'Pump 1')])).toBe('b');
  });

  it('is null for staff with no DU', () => {
    expect(productCashDrawer([])).toBeNull();
    expect(productCashDrawer([{ duId: null, duCode: null }])).toBeNull();
  });

  it('skips an assignment with no DU', () => {
    expect(productCashDrawer([{ duId: null, duCode: 'DU-0' }, du('a', 'DU-5')])).toBe('a');
  });

  it('returns the owning assignment for labelling', () => {
    const owner = du('one', 'DU-1');
    expect(productCashOwner([du('two', 'DU-2'), owner])).toBe(owner);
  });
});

describe('drawerProductCash', () => {
  const assignments = [du('du2', 'DU-2'), du('du1', 'DU-1')];

  it('counts all the product cash in the owning Drawer, none in the others', () => {
    expect(drawerProductCash({ assignments, duId: 'du1', productCash: 800 })).toBe(800);
    expect(drawerProductCash({ assignments, duId: 'du2', productCash: 800 })).toBe(0);
  });

  it('leaves a single-DU attendant unchanged', () => {
    expect(
      drawerProductCash({ assignments: [du('du1', 'DU-1')], duId: 'du1', productCash: 800 }),
    ).toBe(800);
  });
});
