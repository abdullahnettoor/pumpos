// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { cleanup, render } from '@testing-library/react';
import { ListRow } from './ListRow.js';
import { SectionLabel } from './SectionLabel.js';
import { StatusBadge } from './StatusBadge.js';

afterEach(cleanup);

/** Slot containers are semibold for sans text; mono children must resolve to 500 (#711). */
const slotOf = (el: Element) => el.closest('.font-semibold')!;

describe('mono figures in semibold slots', () => {
  it('ListRow `end` slot forces .num and .font-mono children to 500', () => {
    const { getByText } = render(
      <ListRow
        title="t"
        end={
          <>
            <span className="num">1</span>
            <span className="font-mono">2</span>
          </>
        }
      />,
    );
    for (const t of ['1', '2']) {
      const cls = slotOf(getByText(t)).className;
      expect(cls).toContain('[&_.num]:font-medium');
      expect(cls).toContain('[&_.font-mono]:font-medium');
    }
  });

  it('SectionLabel `right` slot forces .num and .font-mono children to 500', () => {
    const { getByText } = render(
      <SectionLabel
        right={
          <>
            <span className="num">1</span>
            <span className="font-mono">2</span>
          </>
        }
      >
        x
      </SectionLabel>,
    );
    for (const t of ['1', '2']) {
      const cls = slotOf(getByText(t)).className;
      expect(cls).toContain('[&_.num]:font-medium');
      expect(cls).toContain('[&_.font-mono]:font-medium');
    }
  });

  it('StatusBadge is bold for sans and medium only for a figure', () => {
    const { getByText } = render(
      <>
        <StatusBadge tone="good">Balanced</StatusBadge>
        <StatusBadge tone="good" num>
          +₹120
        </StatusBadge>
      </>,
    );
    const badge = (t: string) => getByText(t).closest('[class*="text-xs"]')!.className;
    expect(badge('Balanced')).toContain('font-bold');
    expect(badge('+₹120')).toMatch(/num font-medium/);
    expect(badge('+₹120')).not.toContain('font-bold');
  });
});
