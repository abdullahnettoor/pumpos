// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ShiftControlBar } from '../Shifts/ShiftControlBar.js';
import { Drawer } from '../Drawer.js';
import { Step3FuelsCatalog } from './OnboardingSteps/Step3FuelsCatalog.js';
import { Step5Dispensers } from './OnboardingSteps/Step5Dispensers.js';
import type { OnboardingDraft } from '@pump/shared';

afterEach(cleanup);

describe('Action Icons migration', () => {
  it('Drawer renders canonical close Icon without inline SVG lines', () => {
    render(
      <Drawer isOpen={true} onClose={vi.fn()} title="Test Drawer">
        <div>Drawer Body</div>
      </Drawer>,
    );

    const closeBtn = screen.getByRole('button', { name: 'Close Drawer' });
    expect(closeBtn).toBeTruthy();

    const svg = closeBtn.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.classList.contains('lucide-x')).toBe(true);
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('ShiftControlBar renders Begin Close with arrow-right icon and clean text without unicode arrow', () => {
    const dummyShift = {
      templateName: 'Morning Shift',
      openedAt: new Date(Date.now() - 3600000).toISOString(),
      openingCash: 5000,
      businessDate: '2026-09-16',
      scheduledStartTime: '06:00',
      scheduledEndTime: '14:00',
    };

    render(
      <ShiftControlBar
        activeShift={dummyShift}
        shiftTotals={{
          cashCollections: 0,
          cashExpenses: 0,
          cardCollections: 0,
          upiCollections: 0,
          creditSales: 0,
          expenseCount: 0,
        }}
        handoversCompleted={0}
        handoversAssigned={0}
        quickActions={[]}
        onCloseShiftClick={vi.fn()}
        isPreparingClose={false}
        currentBusinessDate="2026-09-16"
      />,
    );

    const closeBtn = screen.getByRole('button', { name: /Begin Close/i });
    expect(closeBtn).toBeTruthy();
    // Raw unicode arrow glyph "→" must NOT be in the button text content
    expect(closeBtn.textContent).not.toContain('→');
    expect(closeBtn.textContent).toContain('Begin Close');

    const svg = closeBtn.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.classList.contains('lucide-arrow-right')).toBe(true);
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('Step3FuelsCatalog renders quick add fuel buttons with canonical plus Icon and clean text', () => {
    const mockDraft: OnboardingDraft = {
      station: { name: 'Test Station' } as any,
      businessRules: {} as any,
      products: [],
      tanks: [],
      dispensers: [],
      nozzles: [],
      shiftTemplates: [],
      paymentTerminals: [],
    };

    render(
      <Step3FuelsCatalog
        draft={mockDraft}
        hasQuickMs={false}
        hasQuickHsd={false}
        handleQuickFuel={vi.fn()}
        onAddProduct={vi.fn()}
        onEditProduct={vi.fn()}
        onRemoveProduct={vi.fn()}
        panelStyle={{}}
      />,
    );

    const msBtn = screen.getByRole('button', { name: /Petrol \(MS\)/i });
    const hsdBtn = screen.getByRole('button', { name: /Diesel \(HSD\)/i });

    expect(msBtn.textContent).not.toContain('+');
    expect(msBtn.textContent).toContain('Petrol (MS)');
    expect(msBtn.querySelector('svg')?.classList.contains('lucide-plus')).toBe(true);

    expect(hsdBtn.textContent).not.toContain('+');
    expect(hsdBtn.textContent).toContain('Diesel (HSD)');
    expect(hsdBtn.querySelector('svg')?.classList.contains('lucide-plus')).toBe(true);
  });

  it('Step5Dispensers renders dual and quad buttons with canonical plus Icon and clean text', () => {
    const mockDraft: OnboardingDraft = {
      station: { name: 'Test Station' } as any,
      businessRules: {} as any,
      products: [],
      tanks: [],
      dispensers: [],
      nozzles: [],
      shiftTemplates: [],
      paymentTerminals: [],
    };

    render(
      <Step5Dispensers
        draft={mockDraft}
        onAddDualDispenser={vi.fn()}
        onAddQuadDispenser={vi.fn()}
        onAddCustomDispenser={vi.fn()}
        onManageDispenser={vi.fn()}
        onRemoveDispenser={vi.fn()}
        panelStyle={{}}
      />,
    );

    const dualBtn = screen.getByRole('button', { name: /Add Dual \(2 Nozzles\)/i });
    const quadBtn = screen.getByRole('button', { name: /Add Quad \(4 Nozzles\)/i });

    expect(dualBtn.textContent).not.toContain('+');
    expect(dualBtn.textContent).toContain('Add Dual (2 Nozzles)');
    expect(dualBtn.querySelector('svg')?.classList.contains('lucide-plus')).toBe(true);

    expect(quadBtn.textContent).not.toContain('+');
    expect(quadBtn.textContent).toContain('Add Quad (4 Nozzles)');
    expect(quadBtn.querySelector('svg')?.classList.contains('lucide-plus')).toBe(true);
  });
});
