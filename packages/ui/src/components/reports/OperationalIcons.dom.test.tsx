// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CategoryManagerDrawer } from '../expenses/CategoryManagerDrawer.js';
import { MerchandiseSaleEntryForm } from '../transactions/MerchandiseSaleEntryForm.js';
import { ToastProvider } from '../primitives/ToastProvider.js';
import { EmptyState, Button, Icon } from '../../pump-ds/index.js';

afterEach(cleanup);

describe('Operational Icons consolidation', () => {
  it('CategoryManagerDrawer renders canonical plus, pencil, and tag icons', () => {
    const categories = [{ id: 'cat-1', name: 'Office Supplies', isDefault: false }];

    render(
      <ToastProvider>
        <CategoryManagerDrawer
          isOpen={true}
          onClose={vi.fn()}
          categories={categories}
          onChanged={vi.fn()}
          canManage={true}
        />
      </ToastProvider>,
    );

    const addBtn = screen.getByRole('button', { name: /^Add$/i });
    expect(addBtn).toBeTruthy();
    const addSvg = addBtn.querySelector('svg');
    expect(addSvg?.classList.contains('lucide-plus')).toBe(true);
    expect(addSvg?.getAttribute('aria-hidden')).toBe('true');

    const editBtn = screen.getByRole('button', { name: /Rename/i });
    expect(editBtn).toBeTruthy();
    const editSvg = editBtn.querySelector('svg');
    expect(editSvg?.classList.contains('lucide-pencil')).toBe(true);
    expect(editSvg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('MerchandiseSaleEntryForm renders canonical plus and trash icons', () => {
    render(
      <MerchandiseSaleEntryForm
        shiftOptions={[{ id: 'shift-1', label: 'Shift 1' }]}
        products={[{ id: 'prod-1', name: 'Engine Oil', sellingPrice: 350, currentStock: 10 }]}
        customers={[]}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const addItemBtn = screen.getByRole('button', { name: /Add item/i });
    expect(addItemBtn).toBeTruthy();
    const plusSvg = addItemBtn.querySelector('svg');
    expect(plusSvg?.classList.contains('lucide-plus')).toBe(true);
    expect(plusSvg?.getAttribute('aria-hidden')).toBe('true');

    const removeBtn = screen.getByRole('button', { name: /Remove line/i });
    expect(removeBtn).toBeTruthy();
    const trashSvg = removeBtn.querySelector('svg');
    expect(trashSvg?.classList.contains('lucide-trash-2')).toBe(true);
    expect(trashSvg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('EmptyState renders canonical domain Icon with standardized size md token', () => {
    const { container } = render(
      <EmptyState
        compact
        icon={<Icon name="ledger" size="md" />}
        title="Select a ledger"
        description="Pick an entity and period."
      />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.classList.contains('lucide-book-open')).toBe(true);
    expect(svg?.classList.contains('size-[18px]')).toBe(true);
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('Button renders canonical download Icon with standardized size sm token', () => {
    render(
      <Button variant="secondary" size="sm" leftIcon={<Icon name="download" size="sm" />}>
        Download PDF
      </Button>,
    );

    const btn = screen.getByRole('button', { name: /Download PDF/i });
    const svg = btn.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.classList.contains('lucide-download')).toBe(true);
    expect(svg?.classList.contains('size-4')).toBe(true);
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
