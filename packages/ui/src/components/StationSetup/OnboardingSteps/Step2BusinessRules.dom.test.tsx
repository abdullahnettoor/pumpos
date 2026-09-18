/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyOnboardingDraft } from '../onboardingDraft.js';
import { Step2BusinessRules } from './Step2BusinessRules.js';

afterEach(cleanup);

const noop = () => {};

/** The schedule grid is the one auto-fill `minmax(...)` track on the step. */
const scheduleGrid = (container: HTMLElement): HTMLElement => {
  const grid = Array.from(container.querySelectorAll<HTMLElement>('div')).find((el) =>
    el.style.gridTemplateColumns.includes('minmax'),
  );
  if (!grid) throw new Error('schedule grid not found');
  return grid;
};

/** Only the 14 per-day open/close controls, not the lone business-day-start field. */
const scheduleTimeInputs = (container: HTMLElement): HTMLInputElement[] =>
  Array.from(scheduleGrid(container).querySelectorAll<HTMLInputElement>('input[type="time"]'));

/**
 * The onboarding shell renders this step inside a narrow panel. Native
 * `<input type="time">` controls carry an intrinsic minimum width that, without
 * an explicit `min-width: 0`, refuses to shrink and pushes the close-time
 * control across its day card into the neighbouring one (#134). jsdom does not
 * lay pixels out, so we cannot measure overlap directly — instead we pin the CSS
 * contract that lets each control shrink to its card: every time input, and the
 * flex wrapper holding it, must be shrinkable (`min-width: 0`) and
 * border-box-sized so `width: 100%` includes its padding.
 */
const renderStep = (isTwentyFourSeven: boolean) => {
  const base = createEmptyOnboardingDraft();
  const draft = {
    ...base,
    businessRules: {
      ...base.businessRules,
      operatingSchedule: {
        ...base.businessRules.operatingSchedule,
        isTwentyFourSeven,
      },
    },
  };
  return render(
    <Step2BusinessRules
      draft={draft}
      updateDraft={noop}
      syncTwentyFourSeven={noop}
      panelStyle={{}}
      fieldLabelStyle={{}}
      inputStyle={{}}
    />,
  );
};

describe('Step2BusinessRules keeps schedule time controls inside their day card', () => {
  it.each([
    ['scheduled', false],
    ['disabled 24/7', true],
  ])('lets every time control shrink to its card in the %s state', (_label, isTwentyFourSeven) => {
    const { container } = renderStep(isTwentyFourSeven);

    const timeInputs = scheduleTimeInputs(container);

    // Seven day cards, each with an open and a close control.
    expect(timeInputs).toHaveLength(14);

    for (const input of timeInputs) {
      expect(input.style.minWidth).toBe('0');
      expect(input.style.boxSizing).toBe('border-box');
      expect(input.style.width).toBe('100%');

      // The flex column wrapping the control must also be allowed to shrink,
      // otherwise the input's intrinsic width still forces the card open.
      const wrapper = input.parentElement as HTMLElement;
      expect(wrapper.style.minWidth).toBe('0');
    }
  });

  it('uses a card track that can pack below the intrinsic control width', () => {
    const { container } = renderStep(false);
    const grid = scheduleGrid(container);
    expect(grid.style.display).toBe('grid');
    const match = grid.style.gridTemplateColumns.match(/minmax\((\d+)px/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThanOrEqual(160);
  });

  it('scopes containment styling to real time controls, not every field', () => {
    const { container } = renderStep(false);
    // The business-day-start field is a lone time input outside the grid; make
    // sure the grid still owns exactly the fourteen schedule controls.
    const gridInputs = scheduleTimeInputs(container);
    expect(gridInputs).toHaveLength(14);
    // ...and there is a further time control on the step that we deliberately
    // left outside the grid.
    const allTimeInputs = container.querySelectorAll('input[type="time"]');
    expect(allTimeInputs.length).toBeGreaterThan(gridInputs.length);
  });
});
