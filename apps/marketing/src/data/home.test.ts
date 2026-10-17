import { describe, expect, it } from 'vitest';
import { faqs, planFeatures, plans, SCALE_DISCOUNT_LINE } from './home';

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

describe('pricing table data', () => {
  it('lists exactly Core, Pro and Pro+ with the agreed prices', () => {
    expect(plans.map((p) => [p.name, p.price.monthly, p.price.yearly])).toEqual([
      ['Core', 999, 9990],
      ['Pro', 1599, 15990],
      ['Pro+', 2099, 20990],
    ]);
  });

  it('puts every feature row on a listed plan', () => {
    const levels = plans.map((p) => p.level);
    for (const f of planFeatures) expect(levels).toContain(f.included);
  });

  it('places features per plan', () => {
    const at = (name: string) => planFeatures.find((f) => f.name === name)?.included;
    expect(at('Custom permissions')).toBe('pro-plus');
    expect(at('Attendant Handover Report')).toBe('pro-plus');
    expect(at('Several stations under one login')).toBe('pro');
    expect(at('Reports across stations')).toBe('pro');
    expect(at('Logins: 3 on Core, 10 on Pro, unlimited on Pro+')).toBe('core');
  });

  it('states the Scale discount as one line', () => {
    expect(SCALE_DISCOUNT_LINE).toBe('Each additional station 20% off on Pro and Pro+. 10+ stations: talk to us.');
  });

  it('keeps the cost FAQ in step with the table', () => {
    const answer = faqs.find(([q]) => q.startsWith('What does it cost'))?.[1] ?? '';
    for (const p of plans) {
      expect(answer).toContain(inr(p.price.monthly));
      expect(answer).toContain(inr(p.price.yearly));
    }
    expect(answer).not.toMatch(/Scale/);
  });
});
