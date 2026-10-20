// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { DataSection, type SectionQuery } from './DataSection.js';

const q = (over: Partial<SectionQuery> = {}): SectionQuery => ({
  isPending: false,
  isError: false,
  fetchStatus: 'idle',
  refetch: vi.fn(),
  ...over,
});
/** A query with a request in flight. */
const fetching = (over: Partial<SectionQuery> = {}) =>
  q({ isPending: true, fetchStatus: 'fetching', ...over });

afterEach(cleanup);

const section = () => document.querySelector('[data-state]')!;

describe('DataSection', () => {
  it('pending: a skeleton sized like the body, no content', () => {
    render(
      <DataSection title="Sales" query={fetching()} placeholderHeight={120}>
        <span>body</span>
      </DataSection>,
    );
    const skeleton = screen.getByRole('status', { name: 'Loading sales' });
    expect(skeleton.style.height).toBe('120px');
    expect(section().getAttribute('aria-busy')).toBe('true');
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
        query={[fetching(), q({ isError: true })]}
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

  it('error: an acronym in the title keeps its capitals (#532)', () => {
    render(
      <DataSection title="The DSR" query={q({ isError: true })} placeholderHeight={80}>
        <span>body</span>
      </DataSection>,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/^Couldn't load the DSR ·/);
  });

  it('error without a refetch: message only, no Retry', () => {
    render(
      <DataSection
        title="Sales"
        query={{ isPending: false, isError: true, fetchStatus: 'idle' }}
        placeholderHeight={80}
      >
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
      <DataSection title="Sales" enabled={false} query={fetching()} placeholderHeight={80}>
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

  it('shape="cards": framed placeholder/error, unframed content', () => {
    const { rerender } = render(
      <DataSection title="Fuels" shape="cards" query={fetching()} placeholderHeight={80}>
        <span>body</span>
      </DataSection>,
    );
    expect(section().className).toMatch(/rounded-card/);
    rerender(
      <DataSection title="Fuels" shape="cards" query={q()} placeholderHeight={80}>
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

  it('bare shape: the skeleton is sized exactly, with no extra padding', () => {
    render(
      <DataSection title="Sales" shape="bare" query={fetching()} placeholderHeight={90}>
        <span>body</span>
      </DataSection>,
    );
    expect(section().className).not.toMatch(/p-4/);
    expect(screen.getByRole('status').style.height).toBe('90px');
  });

  describe('fetch status', () => {
    it('a disabled query (pending, idle) shows no endless skeleton', () => {
      const { container } = render(
        <DataSection
          title="Sales"
          query={q({ isPending: true, fetchStatus: 'idle' })}
          isEmpty
          empty={<span>nothing yet</span>}
          placeholderHeight={80}
        >
          <span>body</span>
        </DataSection>,
      );
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByText('nothing yet')).toBeNull();
      expect(container.innerHTML).toBe('');
    });

    it('not yet requested with enabled passed true: the placeholder', () => {
      render(
        <DataSection
          title="Sales"
          enabled
          query={q({ isPending: true, fetchStatus: 'idle' })}
          placeholderHeight={80}
        >
          <span>body</span>
        </DataSection>,
      );
      expect(screen.getByLabelText('Loading sales')).toBeTruthy();
    });

    it('a query paused offline stays loading, never the empty state', () => {
      render(
        <DataSection
          title="Sales"
          query={q({ isPending: true, fetchStatus: 'paused' })}
          isEmpty
          empty={<span>nothing yet</span>}
          placeholderHeight={80}
        >
          <span>body</span>
        </DataSection>,
      );
      expect(section().getAttribute('data-state')).toBe('loading');
      expect(screen.getByLabelText('Loading sales')).toBeTruthy();
      expect(screen.queryByText('nothing yet')).toBeNull();
    });

    it('a paused query that already has data shows the content', () => {
      render(
        <DataSection
          title="Sales"
          query={q({ isPending: false, fetchStatus: 'paused' })}
          placeholderHeight={80}
        >
          <span>body</span>
        </DataSection>,
      );
      expect(screen.getByText('body')).toBeTruthy();
    });
  });

  describe('access refusals', () => {
    const refusal = (code: string, status: number, message: string) =>
      Object.assign(new Error(message), { code, status });

    it.each([
      ['FORBIDDEN', 403],
      ['CAPABILITY_NOT_ENTITLED', 403],
      ['SUBSCRIPTION_RESTRICTED', 403],
      ['ORGANIZATION_SUSPENDED', 403],
      ['LIMIT_REACHED', 409],
    ])('%s: the refusal message, no Retry', (code, status) => {
      render(
        <DataSection
          title="Sales"
          query={q({ isError: true, error: refusal(code, status, `Refused: ${code}`) })}
          isEmpty
          empty={<span>nothing yet</span>}
          placeholderHeight={80}
        >
          <span>body</span>
        </DataSection>,
      );
      expect(section().getAttribute('data-state')).toBe('refused');
      expect(screen.getByRole('alert').textContent).toBe(`Refused: ${code}`);
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      expect(screen.queryByText('nothing yet')).toBeNull();
    });

    it('a bare 403 with no message falls back to a plain sentence', () => {
      render(
        <DataSection
          title="Sales"
          query={q({ isError: true, error: { status: 403 } })}
          placeholderHeight={80}
        >
          <span>body</span>
        </DataSection>,
      );
      expect(screen.getByRole('alert').textContent).toBe("You don't have access to sales.");
    });

    it('network/server errors keep Retry', () => {
      const net = q({
        isError: true,
        error: Object.assign(new Error('x'), { code: 'NETWORK_ERROR' }),
      });
      const srv = q({ isError: true, error: Object.assign(new Error('x'), { status: 500 }) });
      render(
        <DataSection title="Sales" query={[net, srv]} placeholderHeight={80}>
          <span>body</span>
        </DataSection>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(net.refetch).toHaveBeenCalledTimes(1);
      expect(srv.refetch).toHaveBeenCalledTimes(1);
    });

    it('mixed: the generic error, Retry only for the genuine fault', () => {
      const refused = q({ isError: true, error: refusal('FORBIDDEN', 403, 'Managers only.') });
      const fault = q({ isError: true, error: Object.assign(new Error('x'), { status: 502 }) });
      render(
        <DataSection title="Sales" query={[refused, fault]} placeholderHeight={80}>
          <span>body</span>
        </DataSection>,
      );
      // Never the refusal beside a Retry: it would read as "retrying may grant access".
      expect(section().getAttribute('data-state')).toBe('error');
      expect(screen.getByRole('alert').textContent).toBe("Couldn't load sales ·Retry");
      expect(screen.queryByText(/Managers only/)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(fault.refetch).toHaveBeenCalledTimes(1);
      expect(refused.refetch).not.toHaveBeenCalled();
    });

    it('several refusals and nothing else: the refusal message, no Retry', () => {
      const a = q({ isError: true, error: refusal('FORBIDDEN', 403, 'Managers only.') });
      const b = q({ isError: true, error: refusal('CAPABILITY_NOT_ENTITLED', 403, 'Upgrade.') });
      render(
        <DataSection title="Sales" query={[a, b]} placeholderHeight={80}>
          <span>body</span>
        </DataSection>,
      );
      expect(section().getAttribute('data-state')).toBe('refused');
      expect(screen.getByRole('alert').textContent).toBe('Managers only.');
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    });
  });
});
