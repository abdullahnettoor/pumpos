/**
 * THROWAWAY: replaces window.fetch for calls to the PumpOS API with fixture
 * data. `{ success: true, data }`, as the API answers. `?fail=1` makes every
 * report call answer HTTP 500 (the access document still loads, so the
 * attendant tab stays visible); `?fail=all` fails that too.
 */
import * as fx from './fixtures';

type Handler = (q: URLSearchParams, m: RegExpMatchArray) => unknown;

const ROUTES: [RegExp, Handler][] = [
  [/^\/access$/, () => fx.ACCESS],
  [/^\/session$/, () => ({ user: { id: 'u-owner', role: 'Owner', name: 'Thomas Mathew' } })],
  [/^\/setup\/stations$/, () => [fx.STATION]],
  [/^\/setup\/products$/, () => fx.PRODUCTS],
  [/^\/shifts\/status$/, () => fx.shiftStatus()],
  [/^\/dssr\/daily\/range$/, (q) => fx.dssrRange(q.get('from')!, q.get('to')!)],
  [/^\/dssr\/daily\/preview$/, (q) => fx.dssrPreview(q.get('date')!)],
  [/^\/dssr\/daily$/, (q) => fx.dssrPreview(q.get('date')!)],
  [/^\/dssr\/profit-loss$/, (q) => fx.profitLoss(q.get('from')!, q.get('to')!)],
  [
    /^\/reports\/attendant-handovers$/,
    (q) => fx.attendantReport(q.get('from')!, q.get('to')!, q.get('attendantId')),
  ],
  [/^\/reports\/decantations$/, (q) => fx.decantationReport(q.get('from')!, q.get('to')!)],
  [/^\/transactions\/customers$/, () => fx.customers()],
  [/^\/transactions\/suppliers$/, () => fx.suppliers()],
  [/^\/transactions\/customers\/([^/]+)\/ledger$/, (_q, m) => fx.customerLedger(m[1])],
  [/^\/transactions\/suppliers\/([^/]+)\/ledger$/, (_q, m) => fx.supplierRows(m[1])],
  [/^\/transactions\/money-movements$/, (q) => fx.moneyMovements(q.get('from'), q.get('to'))],
  [/^\/finance\/movements$/, (q) => fx.financeMovements(q.get('from'), q.get('to'))],
  [/^\/transactions\/sales$/, (q) => fx.sales(q.get('from'), q.get('to'))],
  [/^\/transactions\/invoices$/, () => []],
  [
    /^\/transactions\/sales\/tax-register$/,
    (q) => fx.salesTaxRegister(q.get('from'), q.get('to')),
  ],
  [
    /^\/transactions\/purchases\/gst-register$/,
    (q) => fx.purchaseGst(q.get('from'), q.get('to')),
  ],
  [/^\/transactions\/income\/gst-register$/, (q) => fx.incomeGst(q.get('from'), q.get('to'))],
  [/^\/transactions\/expenses$/, () => fx.allExpenses()],
  [/^\/transactions\/expense-categories$/, () => fx.EXPENSE_CATEGORIES],
  [/^\/transactions\/income$/, () => fx.allIncome()],
  [/^\/transactions\/income-categories$/, () => fx.INCOME_CATEGORIES],
];

const API = /^https?:\/\/[^/]+\/api(\/.*)$/;

export function installFetchStub(fail: 'none' | 'reports' | 'all') {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const match = API.exec(href);
    if (!match) return realFetch(input as any, init);
    const url = new URL(href);
    const path = url.pathname.replace(/^\/api/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const json = (status: number, body: unknown) =>
      new Promise<Response>((resolve) =>
        // A short delay, so loading states are real but brief.
        setTimeout(
          () =>
            resolve(
              new Response(JSON.stringify(body), {
                status,
                headers: { 'Content-Type': 'application/json' },
              }),
            ),
          120,
        ),
      );

    if (fail === 'all' || (fail === 'reports' && path !== '/access')) {
      return json(500, { success: false, error: { code: 'INTERNAL', message: 'Server error' } });
    }
    for (const [re, handler] of ROUTES) {
      const m = path.match(re);
      if (m && method === 'GET') {
        try {
          return json(200, { success: true, data: handler(url.searchParams, m) });
        } catch (e) {
          console.error('[harness] fixture threw for', method, path, e);
          return json(500, { success: false, error: { code: 'INTERNAL', message: String(e) } });
        }
      }
    }
    console.warn('[harness] unmatched API call', method, href);
    return json(200, { success: true, data: [] });
  };
}
