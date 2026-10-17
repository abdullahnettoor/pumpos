// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '../../../test/renderWithProviders.js';

/**
 * The preview's drawing queue (#615 review): a burst of changes draws the
 * first and the last only, and closing a drawer cancels its queued work and
 * drops its pages.
 */

/** Each drawing the renderer is asked for, held until the test releases it. */
const renders = vi.hoisted(() => ({
  started: [] as string[],
  release: [] as (() => void)[],
}));
vi.mock('../../../services/exportPdf.js', () => ({
  renderPdf: (element: { props: { label: string } }) => {
    renders.started.push(element.props.label);
    return new Promise<Uint8Array>((resolve) =>
      renders.release.push(() => resolve(new Uint8Array([37]))),
    );
  },
}));
vi.mock('../../../services/reports/pdfRaster.js', () => ({
  rasterizePdf: async () => [{ src: 'data:image/png;base64,AA==', width: 10, height: 10 }],
}));

const { usePdfPreview } = await import('./usePdfPreview.js');

afterEach(() => {
  cleanup();
  renders.started = [];
  renders.release = [];
});

const Doc: React.FC<{ label: string }> = () => null;
const build = async (label: string) => <Doc label={label} />;

const Preview: React.FC<{ label: string; keepCached?: boolean }> = ({ label, keepCached }) => {
  const q = usePdfPreview('test-preview', label, build, {
    width: 100,
    debounceMs: 5,
    keepCached,
  });
  return <span data-testid="pages">{q.data?.length ?? 0}</span>;
};

const releaseAll = () => {
  for (const r of renders.release.splice(0)) r();
};

describe('usePdfPreview queue (#615 review)', () => {
  it('a burst of changes draws the first and the last, skipping the superseded ones', async () => {
    const client = createTestQueryClient();
    const view = render(
      <QueryClientProvider client={client}>
        <Preview label="a" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(renders.started).toEqual(['a']));
    // While "a" draws, "b" queues, then "c" supersedes it.
    view.rerender(
      <QueryClientProvider client={client}>
        <Preview label="b" />
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    view.rerender(
      <QueryClientProvider client={client}>
        <Preview label="c" />
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    releaseAll();
    await waitFor(() => expect(renders.started).toEqual(['a', 'c']));
    releaseAll();
    await waitFor(() => expect(view.getByTestId('pages').textContent).toBe('1'));
  });

  it('closing a drawer cancels its queued drawing and drops its pages', async () => {
    const client = createTestQueryClient();
    const cached = () => client.getQueryCache().findAll({ queryKey: ['pdf-preview'] });
    const view = render(
      <QueryClientProvider client={client}>
        <Preview label="a" keepCached={false} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(renders.started).toEqual(['a']));
    view.rerender(
      <QueryClientProvider client={client}>
        <Preview label="b" keepCached={false} />
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    view.unmount();
    releaseAll();
    await new Promise((r) => setTimeout(r, 30));
    // "b" never drew, and nothing of the drawer stays cached.
    expect(renders.started).toEqual(['a']);
    await waitFor(() => expect(cached()).toHaveLength(0));
  });

  it('keeps a card thumbnail cached after it closes', async () => {
    const client = createTestQueryClient();
    const view = render(
      <QueryClientProvider client={client}>
        <Preview label="a" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(renders.started).toEqual(['a']));
    releaseAll();
    await waitFor(() => expect(view.getByTestId('pages').textContent).toBe('1'));
    view.unmount();
    await new Promise((r) => setTimeout(r, 30));
    expect(client.getQueryCache().findAll({ queryKey: ['pdf-preview'] })).toHaveLength(1);
  });
});
