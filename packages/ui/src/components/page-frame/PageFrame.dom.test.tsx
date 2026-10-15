// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PageFrame } from './PageFrame.js';
import { NAV_PAGES, ROUTES } from '../../nav-intent/routes.js';
import { Tabs } from '../../pump-ds/tabs/index.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
      <PageFrame route={ROUTES.reports} title="DSR · 9 Oct">
        content
      </PageFrame>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('DSR · 9 Oct');
  });

  const customerTabs = (
    <Tabs
      aria-label="Customers"
      activeId="a"
      onChange={() => {}}
      tabs={[
        { id: 'a', label: 'Customers', concept: 'customers' },
        { id: 'b', label: 'Collections', concept: 'collections' },
      ]}
    />
  );

  it('places title, tabs with the actions, toolbar and content in a fixed order (#604)', () => {
    const { container } = render(
      <PageFrame
        route={ROUTES.customers}
        subtitle="23 credit customers"
        actions={<button type="button">Add customer</button>}
        tabs={customerTabs}
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
    expect(before(subtitle, tabs)).toBe(true);
    expect(before(tabs, action)).toBe(true);
    expect(before(action, toolbar)).toBe(true);
    expect(before(toolbar, content)).toBe(true);
    // A tabbed page's actions ride on the tab row, which sticks; the title
    // and subtitle scroll away.
    const row = container.querySelector('[data-page-frame-slot="tabs"]')!;
    expect(row.contains(tabs)).toBe(true);
    expect(row.contains(action)).toBe(true);
    expect(row.getAttribute('class')).toMatch(/(^|\s)sticky(\s|$)/);
    expect(row.contains(title)).toBe(false);
    expect(action.closest('header')).toBeNull();
    // The toolbar and the content do not stick.
    expect(toolbar.closest('.sticky')).toBeNull();
    expect(content.closest('.sticky')).toBeNull();
  });

  it('keeps the actions on the title row of a page without tabs, and sticks nothing', () => {
    const { container } = render(
      <PageFrame route={ROUTES.accounts} actions={<button type="button">Add account</button>}>
        content
      </PageFrame>,
    );
    const title = screen.getByRole('heading', { level: 1 });
    const action = screen.getByRole('button', { name: 'Add account' });
    expect(action.closest('header')).toBe(title.closest('header'));
    expect(container.querySelector('.sticky')).toBeNull();
  });

  it('a detail page names its parent in the back slot: a link top-left, above the title (#576)', () => {
    const onClick = vi.fn();
    render(
      <PageFrame
        route={ROUTES.accounts}
        title="SBI Current"
        back={{ label: 'Accounts', href: '#/accounts', onClick }}
        actions={<button type="button">Add entry</button>}
      >
        content
      </PageFrame>,
    );
    const link = screen.getByRole('link', { name: 'Back to Accounts' });
    expect(link.textContent).toBe('Accounts');
    const title = screen.getByRole('heading', { level: 1 });
    expect(link.getAttribute('href')).toBe('#/accounts');
    expect(before(link, title)).toBe(true);
    // In the title's column, left of the actions, not on a row of its own.
    expect(link.closest('header')).toBe(title.closest('header'));
    expect(title.parentElement!.contains(link)).toBe(true);
    expect(before(link, screen.getByRole('button', { name: 'Add entry' }))).toBe(true);
    // A plain click navigates in-app; a modified click is the browser's.
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { ctrlKey: true });
    expect(onClick).toHaveBeenCalledTimes(1);
    // 12px, the smallest text the app shows.
    expect(link.getAttribute('class')).toMatch(/text-\[12px\]/);
  });

  it('has no back link unless a page asks for one', () => {
    const { container } = render(<PageFrame route={ROUTES.accounts}>content</PageFrame>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('[data-page-header-slot="back"]')).toBeNull();
  });

  it('renders no empty slot wrappers when a page has no tabs or toolbar', () => {
    const { container } = render(<PageFrame route={ROUTES.dashboard}>content</PageFrame>);
    expect(container.querySelector('[data-page-frame-slot="tabs"]')).toBeNull();
    expect(container.querySelector('[data-page-frame-slot="toolbar"]')).toBeNull();
  });

  it('warns in dev when a route has no sidebar label and no title is given', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PageFrame route={'/not-a-page' as never}>content</PageFrame>);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/\/not-a-page.*title/));
  });

  it('takes a title for a page outside the sidebar, without a route', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PageFrame title="Design system">content</PageFrame>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Design system');
    expect(error).not.toHaveBeenCalled();
  });
});
