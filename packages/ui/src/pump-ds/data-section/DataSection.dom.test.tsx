// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataSection, type SectionQuery } from './DataSection.js';

const q = (over: Partial<SectionQuery> = {}): SectionQuery => ({
  isPending: false,
  isError: false,
  refetch: vi.fn(),
  ...over,
});

afterEach(cleanup);

const section = () => document.querySelector('[data-state]')!;

describe('DataSection', () => {
  it('pending: a skeleton sized like the body, no content', () => {
    render(
      <DataSection title="Sales" query={q({ isPending: true })} placeholderHeight={120}>
        <span>body</span>
      </DataSection>,
    );
    const skeleton = screen.getByLabelText('Loading sales');
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    expect(skeleton.style.height).toBe('120px');
    expect(screen.queryByText('body')).toBeNull();
    expect(section().getAttribute('data-state')).toBe('loading');
  });

  it('error: "Couldn\'t load <title> · Retry" and Retry refetches only the failed queries', () => {
    const okQ = q();
    const bad1 = q({ isError: true });
    const bad2 = q({ isError: true });
    render(
      <DataSection title="Sales" query={[okQ, bad1, bad2]} placeholderHeight={80}>
        <span>body</span>
      </DataSection>,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load sales ·/);
    expect(screen.queryByText('body')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(bad1.refetch).toHaveBeenCalledTimes(1);
    expect(bad2.refetch).toHaveBeenCalledTimes(1);
    expect(okQ.refetch).not.toHaveBeenCalled();
  });

  it('error wins over pending, and never shows the empty state', () => {
    render(
      <DataSection
        title="Sales"
        query={[q({ isPending: true }), q({ isError: true })]}
        isEmpty
        empty={<span>nothing yet</span>}
        placeholderHeight={80}
      >
        <span>body</span>
      </DataSection>,
    );
    expect(section().getAttribute('data-state')).toBe('error');
    expect(screen.queryByText('nothing yet')).toBeNull();
    expect(screen.queryByLabelText('Loading sales')).toBeNull();
  });

  it('error without a refetch: message only, no Retry', () => {
    render(
      <DataSection title="Sales" query={{ isPending: false, isError: true }} placeholderHeight={80}>
        <span>body</span>
      </DataSection>,
    );
    expect(screen.getByText(/Couldn't load sales/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('success + empty: the empty state, not the content', () => {
    render(
      <DataSection
        title="Sales"
        query={q()}
        isEmpty
        empty={<span>nothing yet</span>}
        placeholderHeight={80}
      >
        <span>body</span>
      </DataSection>,
    );
    expect(screen.getByText('nothing yet')).toBeTruthy();
    expect(screen.queryByText('body')).toBeNull();
    expect(section().getAttribute('data-state')).toBe('empty');
  });

  it('success + data: the content', () => {
    render(
      <DataSection
        title="Sales"
        query={[q(), q()]}
        isEmpty={false}
        empty={<span>nothing yet</span>}
        placeholderHeight={80}
      >
        <span>body</span>
      </DataSection>,
    );
    expect(screen.getByText('body')).toBeTruthy();
    expect(screen.queryByText('nothing yet')).toBeNull();
    expect(section().getAttribute('data-state')).toBe('ready');
  });

  it('no queries: renders the content straight away', () => {
    render(
      <DataSection title="Sales" placeholderHeight={80}>
        <span>body</span>
      </DataSection>,
    );
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('gated off: renders nothing (its queries are disabled by the caller)', () => {
    const { container } = render(
      <DataSection
        title="Sales"
        enabled={false}
        query={q({ isPending: true })}
        placeholderHeight={80}
      >
        <span>body</span>
      </DataSection>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('card shape frames every state in a Panel; bare shape adds no frame', () => {
    const { rerender } = render(
      <DataSection title="Sales" query={q({ isError: true })} placeholderHeight={80}>
        <span>body</span>
      </DataSection>,
    );
    expect(section().className).toMatch(/rounded-card/);
    rerender(
      <DataSection title="Sales" shape="bare" query={q({ isError: true })} placeholderHeight={80}>
        <span>body</span>
      </DataSection>,
    );
    expect(section().className).not.toMatch(/rounded-card/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('frameWhenReady=false: framed placeholder/error, unframed content', () => {
    const { rerender } = render(
      <DataSection
        title="Fuels"
        frameWhenReady={false}
        query={q({ isPending: true })}
        placeholderHeight={80}
      >
        <span>body</span>
      </DataSection>,
    );
    expect(section().className).toMatch(/rounded-card/);
    rerender(
      <DataSection title="Fuels" frameWhenReady={false} query={q()} placeholderHeight={80}>
        <span>body</span>
      </DataSection>,
    );
    expect(section().className).not.toMatch(/rounded-card/);
  });

  it('passes data attributes through to the root', () => {
    render(
      <DataSection title="Sales" data-dashboard-card="money" query={q()} placeholderHeight={80}>
        <span>body</span>
      </DataSection>,
    );
    expect(section().getAttribute('data-dashboard-card')).toBe('money');
  });
});
