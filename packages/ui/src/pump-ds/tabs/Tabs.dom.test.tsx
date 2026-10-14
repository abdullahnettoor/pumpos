// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Tabs, type TabItem } from './Tabs.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const station: TabItem[] = [
  { id: 'general', label: 'General', concept: 'general' },
  { id: 'branding', label: 'Branding', concept: 'branding' },
  { id: 'tanks', label: 'Tanks', concept: 'tanks' },
];

function Controlled({ tabs = station, initial = 'general' }) {
  const [active, setActive] = useState(initial);
  return <Tabs aria-label="Station" tabs={tabs} activeId={active} onChange={setActive} />;
}

const selected = () =>
  screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true');

describe('pump-ds Tabs', () => {
  it('is a named tablist; only the active tab is selected and reachable by Tab', () => {
    render(<Controlled />);
    const list = screen.getByRole('tablist', { name: 'Station' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['General', 'Branding', 'Tanks']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it('arrow keys move the selection, wrapping; Home and End jump to the ends', () => {
    render(<Controlled />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(selected()?.textContent).toBe('Branding');
    fireEvent.keyDown(list, { key: 'End' });
    expect(selected()?.textContent).toBe('Tanks');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(selected()?.textContent).toBe('General');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(selected()?.textContent).toBe('Tanks');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(selected()?.textContent).toBe('General');
  });

  it('skips disabled tabs and ignores clicks on them', () => {
    render(
      <Controlled
        tabs={[
          { id: 'a', label: 'A', concept: 'general' },
          { id: 'b', label: 'B', concept: 'rules', disabled: true },
          { id: 'c', label: 'C', concept: 'tanks' },
        ]}
        initial="a"
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(selected()?.textContent).toBe('A');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(selected()?.textContent).toBe('C');
  });

  it("shows each tab's concept icon, the same glyph the concept has everywhere", () => {
    render(<Controlled />);
    const lucide = (name: string) =>
      screen.getByRole('tab', { name }).querySelector('svg')?.getAttribute('class');
    expect(lucide('Branding')).toContain('lucide-palette');
    expect(lucide('Tanks')).toContain('lucide-');
    expect(lucide('General')).toContain('size-3.5'); // 14px
  });

  it('takes icons only from a concept, never a free icon node', () => {
    render(
      <Tabs
        aria-label="Demo"
        activeId="a"
        onChange={() => {}}
        // @ts-expect-error a tab's icon comes from its concept (one icon per concept)
        tabs={[{ id: 'a', label: 'A', icon: <svg data-testid="a-icon" /> }]}
      />,
    );
    expect(screen.queryByTestId('a-icon')).toBeNull();
  });

  it('rejects a bar that mixes tabs with and without icons (dev warning)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Tabs
        aria-label="Mixed"
        activeId="a"
        onChange={() => {}}
        tabs={[
          { id: 'a', label: 'A', concept: 'tanks' },
          { id: 'b', label: 'B' },
        ]}
      />,
    );
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/Mixed.*every tab or none/));
  });

  it('accepts a bar with no icons at all', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Tabs
        aria-label="Plain"
        activeId="a"
        onChange={() => {}}
        tabs={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]}
      />,
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('shows a numeric badge as a count beside the label', () => {
    render(
      <Tabs
        aria-label="Org"
        activeId="a"
        onChange={() => {}}
        tabs={[
          { id: 'a', label: 'Stations', concept: 'stations', badge: 3 },
          { id: 'b', label: 'Team', concept: 'team' },
        ]}
      />,
    );
    expect(screen.getByRole('tab', { name: /Stations/ }).textContent).toBe('Stations3');
  });

  it('shows a text badge as a status chip in the tab tone', () => {
    render(
      <Tabs
        aria-label="Shift views"
        activeId="b"
        onChange={() => {}}
        tabs={[
          { id: 'a', label: 'Live shift', concept: 'live-shift', badge: 'Open', tone: 'success' },
          { id: 'b', label: 'History', concept: 'history' },
        ]}
      />,
    );
    const chip = screen.getByText('Open').closest('span[class*="rounded-chip"]');
    expect(chip?.className).toContain('text-success-fg');
    expect(chip?.getAttribute('style')).toBeNull();
  });
});
