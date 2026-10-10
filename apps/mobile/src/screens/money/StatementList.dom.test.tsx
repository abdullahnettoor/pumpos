// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Statement } from '../../lib/money/statement.js';
import { StatementList } from './StatementList.js';

afterEach(cleanup);

const statement: Statement = {
  months: [
    {
      key: '2026-10',
      label: 'October 2026',
      entries: [
        { key: 'a', label: 'Credit Sale', meta: '9 Oct', detail: null, delta: 5000, balance: 5000 },
        {
          key: 'b',
          label: 'Collection',
          meta: '10 Oct',
          detail: null,
          delta: -2000,
          balance: 3000,
        },
      ],
    },
  ],
  shown: 2,
  total: 2,
  hasMore: false,
  closingBalance: 3000,
  reconciled: true,
};

const rowOf = (label: string) => screen.getByText(label).closest('li') as HTMLElement;

describe('StatementList sign badge', () => {
  it('draws the sign as an SVG icon, not a text glyph', () => {
    render(<StatementList statement={statement} onLoadMore={() => {}} />);
    for (const label of ['Credit Sale', 'Collection']) {
      const badge = rowOf(label).querySelector('[data-sign]') as HTMLElement;
      expect(badge.querySelector('svg')).toBeTruthy();
      expect(badge.textContent).toBe('');
    }
  });

  it('colours an entry that raises the balance amber and one that reduces it green', () => {
    render(<StatementList statement={statement} onLoadMore={() => {}} />);
    const raises = rowOf('Credit Sale');
    const badge = raises.querySelector('[data-sign="raises"]') as HTMLElement;
    expect(badge.className).toMatch(/bg-warn-soft/);
    expect(badge.className).toMatch(/text-warn-fg/);
    expect(raises.querySelector('p.num')!.className).toMatch(/text-warn-fg/);

    const reduces = rowOf('Collection');
    const green = reduces.querySelector('[data-sign="reduces"]') as HTMLElement;
    expect(green.className).toMatch(/bg-good-soft/);
    expect(green.className).toMatch(/text-good/);
    expect(reduces.querySelector('p.num')!.className).toMatch(/text-good/);
  });
});
