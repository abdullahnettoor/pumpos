// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Radix's menu popup loops forever in jsdom, so the menu renders open and
// inline; the items ExportMenu composes, and their callbacks, are under test.
// Radix supplies the keyboard model (↑/↓, Enter, Escape, focus return).
vi.mock('../menu/Menu.js', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Menu: Pass,
    MenuTrigger: Pass,
    MenuContent: ({ children }: { children?: React.ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    MenuItem: ({ children, onSelect }: { children?: React.ReactNode; onSelect?: () => void }) => (
      <div role="menuitem" tabIndex={-1} onClick={() => onSelect?.()}>
        {children}
      </div>
    ),
  };
});

const { ExportMenu } = await import('./ExportMenu.js');

describe('ExportMenu', () => {
  afterEach(cleanup);

  it('is one secondary Export button with PDF, Excel (CSV) and Print, each wired', () => {
    const onPdf = vi.fn();
    const onCsv = vi.fn();
    const onPrint = vi.fn();
    render(<ExportMenu onPdf={onPdf} onCsv={onCsv} onPrint={onPrint} />);
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'PDF',
      'Excel (CSV)',
      'Print',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excel (CSV)' }));
    expect(onCsv).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Print' }));
    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(onPdf).not.toHaveBeenCalled();
  });

  it('leaves out an item whose callback is not passed', () => {
    render(<ExportMenu onPrint={vi.fn()} />);
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Print']);
  });

  it('renders nothing with no callbacks', () => {
    const { container } = render(<ExportMenu />);
    expect(container.innerHTML).toBe('');
  });
});
