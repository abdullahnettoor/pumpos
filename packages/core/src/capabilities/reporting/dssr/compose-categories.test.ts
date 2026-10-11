import { describe, expect, it } from 'vitest';
import { composeDssr } from './compose.js';
import type { DssrSaleItem, DssrSourceData } from './ports.js';

const item = (productId: string, quantity: number, revenue: number): DssrSaleItem =>
  ({ productId, quantity, revenue }) as DssrSaleItem;

const source = (overrides: Partial<DssrSourceData> = {}): DssrSourceData => ({
  shiftSummaries: [],
  purchases: [],
  sales: [],
  creditSales: [],
  omcCardSales: [],
  stockVariances: [],
  saleItems: [],
  products: {},
  nozzles: {},
  ...overrides,
});

const merch = (d: any) => d.pnl.byProduct.filter((r: any) => r.kind === 'merchandise');

describe('composeDssr product categories (#392)', () => {
  const products = {
    oil: { name: 'Engine Oil', code: 'EO', unit: 'Pc', costBasis: 400, productType: 'LUBRICANT' },
    grease: { name: 'Grease', code: 'GR', unit: 'Pc', costBasis: 100, productType: 'LUBRICANT' },
    boost: { name: 'Fuel Booster', code: 'FB', unit: 'Pc', costBasis: 50, productType: 'ADDITIVE' },
    mat: { name: 'Floor Mat', code: 'FM', unit: 'Pc', costBasis: 200, productType: 'ACCESSORY' },
    wash: { name: 'Car Wash', code: 'CW', unit: 'Pc', costBasis: 0, productType: 'SERVICE' },
  };

  it('freezes each product line with its product type', () => {
    const d = composeDssr(
      source({
        products,
        saleItems: [
          item('oil', 2, 1680),
          item('grease', 1, 250),
          item('boost', 3, 450),
          item('mat', 1, 400),
          item('wash', 4, 800),
        ],
      }),
    ) as any;
    const types = Object.fromEntries(merch(d).map((r: any) => [r.productId, r.productType]));
    expect(types).toEqual({
      oil: 'LUBRICANT',
      grease: 'LUBRICANT',
      boost: 'ADDITIVE',
      mat: 'ACCESSORY',
      wash: 'SERVICE',
    });
  });

  it('aggregates a product once however many sale lines it has, keeping one line shape', () => {
    const d = composeDssr(
      source({
        products,
        saleItems: [item('oil', 2, 1680), item('oil', 1, 840), item('boost', 1, 150)],
      }),
    ) as any;
    const lines = merch(d);
    expect(lines).toHaveLength(2);
    const oil = lines.find((r: any) => r.productId === 'oil');
    expect(oil).toMatchObject({ quantity: 3, revenue: 2520, productType: 'LUBRICANT' });
    expect(lines.reduce((s: number, r: any) => s + r.revenue, 0)).toBe(2670);
  });

  it('records a null productType for a product the catalogue no longer resolves', () => {
    const d = composeDssr(source({ products, saleItems: [item('gone', 1, 99)] })) as any;
    const [line] = merch(d);
    expect(line).toMatchObject({ name: 'Unknown', revenue: 99 });
    expect(line).toMatchObject({ productType: null });
  });

  it('records a null productType when the source carries none (the pre-#392 reader shape)', () => {
    const d = composeDssr(
      source({
        products: { oil: { name: 'Engine Oil', code: 'EO', unit: 'Pc', costBasis: 400 } },
        saleItems: [item('oil', 1, 840)],
      }),
    ) as any;
    expect(merch(d)[0]).toMatchObject({ productType: null });
  });

  it('does not tag fuel rows', () => {
    const d = composeDssr(
      source({
        products: { ...products, ms: { name: 'Petrol', code: 'MS', unit: 'L', costBasis: 88 } },
        shiftSummaries: [
          {
            shiftId: 's1',
            shiftSequence: 1,
            snapshot: {
              totalNetVolume: 10,
              totalFuelSalesValue: 1000,
              readings: [
                {
                  nozzleId: 'n1',
                  productId: 'ms',
                  grossVolume: 10,
                  netVolume: 10,
                  salesValue: 1000,
                },
              ],
            },
          },
        ],
        nozzles: { n1: 'N1' },
      }),
    ) as any;
    const fuel = d.pnl.byProduct.filter((r: any) => r.kind === 'fuel');
    expect(fuel).toHaveLength(1);
    expect(fuel[0]).not.toHaveProperty('productType');
  });
});
