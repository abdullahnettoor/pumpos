// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PageFrame } from './PageFrame.js';
import { NAV_PAGES, ROUTES } from '../../nav-intent/routes.js';
import { Tabs } from '../../pump-ds/tabs/index.js';

afterEach(cleanup);

const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('PageFrame', () => {
  it.each(NAV_PAGES.map((p) => [p.path, p.label]))(
    '%s is titled with its sidebar label, %s',
    (path, label) => {
      render(<PageFrame route={path}>content</PageFrame>);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(label);
    },
  );

  it('takes an explicit title over the nav label', () => {
    render(
      <PageFrame route={ROUTES.reports} title="DSSR · 9 Oct">
        content
      </PageFrame>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('DSSR · 9 Oct');
  });

  it('places title, actions, tabs, toolbar and content in a fixed order', () => {
    render(
      <PageFrame
        route={ROUTES.customers}
        subtitle="23 credit customers"
        actions={<button type="button">Add customer</button>}
        tabs={
          <Tabs
            aria-label="Customers"
            activeId="a"
            onChange={() => {}}
            tabs={[
              { id: 'a', label: 'Customers', concept: 'customers' },
              { id: 'b', label: 'Collections', concept: 'collections' },
            ]}
          />
        }
        toolbar={<input aria-label="Search customers" />}
      >
        <p>Customer table</p>
      </PageFrame>,
    );
    const title = screen.getByRole('heading', { level: 1 });
    const subtitle = screen.getByText('23 credit customers');
    const action = screen.getByRole('button', { name: 'Add customer' });
    const tabs = screen.getByRole('tablist', { name: 'Customers' });
    const toolbar = screen.getByRole('textbox', { name: 'Search customers' });
    const content = screen.getByText('Customer table');

    expect(before(title, subtitle)).toBe(true);
    expect(before(subtitle, action)).toBe(true);
    expect(before(action, tabs)).toBe(true);
    expect(before(tabs, toolbar)).toBe(true);
    expect(before(toolbar, content)).toBe(true);
    // Actions sit on the title row, not under it.
    expect(action.closest('header')).toBe(title.closest('header'));
    expect(tabs.closest('header')).toBeNull();
  });

  it('renders no empty slot wrappers when a page has no tabs or toolbar', () => {
    const { container } = render(<PageFrame route={ROUTES.dashboard}>content</PageFrame>);
    expect(container.querySelector('[data-page-frame-slot="tabs"]')).toBeNull();
    expect(container.querySelector('[data-page-frame-slot="toolbar"]')).toBeNull();
  });
});
