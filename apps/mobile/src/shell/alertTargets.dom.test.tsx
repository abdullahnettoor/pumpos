// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Station } from '@pump/shared';
import type { MobileAlert } from '../lib/alerts.js';

const feed = vi.hoisted(() => ({ decantations: [] as unknown[] }));
vi.mock('@pump/ui', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDecantations: () => ({ data: feed.decantations, isLoading: false }),
}));
vi.mock('../screens/decantation/FinishUnloadingPage.js', () => ({
  FinishUnloadingPage: () => <p>Finish unloading page</p>,
}));
vi.mock('../screens/decantation/DecantationDetailPage.js', () => ({
  DecantationDetailPage: (p: { decantationId: string }) => (
    <p>Decantation detail {p.decantationId}</p>
  ),
}));
vi.mock('../screens/decantation/DecantationsListPage.js', () => ({
  DecantationsListPage: () => <p>Decantations list</p>,
}));
vi.mock('../screens/density/DensityPage.js', () => ({ DensityPage: () => <p>Density Today</p> }));

const { ShellContext } = await import('./context.js');
const { NavProvider, useNav } = await import('./nav.js');
const { stackOf } = await import('./navStack.js');
const { useAlertOpener } = await import('./useAlertOpener.js');
const { DecantationsAttentionTarget } = await import('./decantationTarget.js');

const station = { id: 'st-1', name: 'Highway Fuels', settings: {} } as unknown as Station;
const alert = (id: string, action: MobileAlert['action'], category: MobileAlert['category']) =>
  ({ id, severity: 'warning', category, title: id, action }) as MobileAlert;

const alerts = [
  alert('draft', { kind: 'decantation', decantationId: 'd-draft' }, 'decantation'),
  alert('pending', { kind: 'decantation', decantationId: 'd-pending' }, 'decantation'),
  alert('density', { kind: 'density' }, 'density'),
];

const Stage: React.FC = () => {
  const n = useNav();
  const open = useAlertOpener(station);
  const stack = stackOf({ active: n.active, stacks: n.stacks, visited: [...n.visited] }, 'home');
  const top = stack[stack.length - 1];
  return top ? (
    <>{top.element}</>
  ) : (
    <>
      {alerts.map((a) => (
        <button key={a.id} onClick={open(a) ?? undefined}>
          {a.id}
        </button>
      ))}
    </>
  );
};

const mount = () =>
  render(
    <ShellContext.Provider
      value={{ station, stationName: 'x', userName: 'A', role: 'Manager', openAccount: () => {} }}
    >
      <NavProvider tabs={['home', 'reports']}>
        <Stage />
      </NavProvider>
    </ShellContext.Provider>,
  );

afterEach(() => {
  cleanup();
  feed.decantations = [];
});

describe('attention row targets', () => {
  it('opens Finish unloading for a draft, Decantation detail for others, Density Today for density', () => {
    feed.decantations = [
      { id: 'd-draft', status: 'DRAFT', lines: [] },
      { id: 'd-pending', status: 'PENDING_MEASUREMENT', lines: [] },
    ];
    for (const [row, text] of [
      ['draft', 'Finish unloading page'],
      ['pending', 'Decantation detail d-pending'],
      ['density', 'Density Today'],
    ] as const) {
      mount();
      fireEvent.click(screen.getByRole('button', { name: row }));
      expect(screen.getByText(text)).toBeTruthy();
      cleanup();
    }
  });
});

describe('DecantationsAttentionTarget', () => {
  const renderTarget = (id?: string) =>
    render(
      <ShellContext.Provider
        value={{ station, stationName: 'x', userName: 'A', role: 'Manager', openAccount: () => {} }}
      >
        <DecantationsAttentionTarget decantationId={id} />
      </ShellContext.Provider>,
    );

  it('shows the list without an id, and a message for an unknown Decantation', () => {
    renderTarget();
    expect(screen.getByText('Decantations list')).toBeTruthy();
    cleanup();
    renderTarget('missing');
    expect(screen.getByText('This Decantation is not available.')).toBeTruthy();
  });

  it('routes a draft to Finish unloading and a settled visit to its detail', () => {
    feed.decantations = [
      { id: 'a', status: 'DRAFT', lines: [] },
      { id: 'b', status: 'MEASURED', lines: [] },
    ];
    renderTarget('a');
    expect(screen.getByText('Finish unloading page')).toBeTruthy();
    cleanup();
    renderTarget('b');
    expect(screen.getByText('Decantation detail b')).toBeTruthy();
  });
});
