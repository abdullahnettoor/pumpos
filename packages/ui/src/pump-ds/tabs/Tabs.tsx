import React, { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn.js';
import { scrollToReveal, tabsOverflow, type TabsOverflow } from './overflow.js';
import { ConceptIcon } from '../icon/ConceptIcon.js';
import type { Concept } from '../icon/concepts.js';
import type { ChipTone } from '../chip/Chip.js';
import { StatusChip } from '../chip/StatusChip.js';
import { STATUS_MAP, type PumpStatus } from '../chip/status-map.js';

/** Fill of a tab's count pill when the tab is active. */
export type TabTone = ChipTone;

export interface TabItem {
  id: string;
  label: string;
  /**
   * The tab's concept: its icon comes from `CONCEPT_ICON`, so "Tanks" shows
   * the same glyph here as in the sidebar, the Reports list and ⌘K. There
   * is no free icon prop: a new subject gets a concept in `CONCEPT_ICON`.
   */
  concept?: Concept;
  /**
   * A number renders as a count pill. A status key (`'open'`) renders as the
   * canonical `StatusChip`, so the word and its colour match every other
   * "Open". Anything else is a node rendered as given.
   */
  badge?: number | PumpStatus | React.ReactElement;
  /** Count pill fill on the active tab (default `brand`). */
  tone?: TabTone;
  disabled?: boolean;
}

export interface TabsProps {
  /**
   * Links tabs to their panels: each tab gets `aria-controls` pointing at the
   * panel spread with `tabPanelProps(id, tab.id)`. Without it, no tab claims a panel.
   */
  id?: string;
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  'aria-label': string;
  className?: string;
}

/** Active count pill: a solid tone fill with its paired `text-on-*`. */
const COUNT_ACTIVE: Record<TabTone, string> = {
  brand: 'bg-brand text-on-brand',
  info: 'bg-info-fg text-on-info',
  success: 'bg-success-fg text-on-success',
  warning: 'bg-warning-fg text-on-warning',
  danger: 'bg-danger-fg text-on-danger',
  neutral: 'bg-ink-strong text-on-neutral',
};

const hasIcon = (tab: TabItem) => tab.concept != null;

const tabId = (barId: string, id: string) => `${barId}-tab-${id}`;
const panelId = (barId: string, id: string) => `${barId}-panel-${id}`;

/** Props for the panel a tab controls; spread on the panel element. */
export const tabPanelProps = (barId: string, id: string) => ({
  role: 'tabpanel' as const,
  id: panelId(barId, id),
  'aria-labelledby': tabId(barId, id),
});

const isStatus = (badge: TabItem['badge']): badge is PumpStatus =>
  typeof badge === 'string' && badge in STATUS_MAP;

/** Index of the tab a navigation key moves to, or -1 for any other key. */
const keyTarget = (key: string, at: number, last: number): number => {
  switch (key) {
    case 'ArrowRight':
      return at >= last ? 0 : at + 1;
    case 'ArrowLeft':
      return at <= 0 ? last : at - 1;
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return -1;
  }
};

/**
 * Page-level tab bar (#523), the look of the Dashboard baseline: 13px labels,
 * a 2px brand underline on the active tab, a 14px muted icon that turns brand
 * when active.
 *
 * Icons go on every tab or none: a bar that mixes the two is rejected with a
 * dev warning. Segmented switches inside a section use `SegmentedControl`,
 * not this.
 *
 * Controlled: the parent owns `activeId`. ←/→ move between enabled tabs
 * (wrapping), Home/End jump to the ends; only the active tab is in the Tab
 * order.
 */
/** Edge fades that say "more tabs this way" (#604). */
const FADE: Record<string, string> = {
  none: '',
  start: '[mask-image:linear-gradient(to_right,transparent,black_24px)]',
  end: '[mask-image:linear-gradient(to_left,transparent,black_24px)]',
  both: '[mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]',
};

export const Tabs: React.FC<TabsProps> = ({
  id: barId,
  tabs,
  activeId,
  onChange,
  className,
  'aria-label': ariaLabel,
}) => {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<TabsOverflow>({ start: false, end: false });
  const enabled = tabs.filter((t) => !t.disabled);

  // A bar wider than its row scrolls sideways (#604): fade the ends that hide
  // tabs, and keep the active tab in view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () =>
      setOverflow((prev) => {
        const next = tabsOverflow(list);
        return prev.start === next.start && prev.end === next.end ? prev : next;
      });
    update();
    list.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(list);
    return () => {
      list.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [tabs.length]);

  useEffect(() => {
    const list = listRef.current;
    const tab = refs.current[activeId];
    if (!list || !tab) return;
    // Horizontal only: scrollIntoView would also scroll the page.
    const to = scrollToReveal(list, tab);
    if (to !== null) list.scrollLeft = to;
  }, [activeId]);
  const withIcons = tabs.filter(hasIcon).length;

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (withIcons > 0 && withIcons < tabs.length) {
      console.error(
        `[Tabs] "${ariaLabel}" has icons on ${withIcons} of ${tabs.length} tabs. ` +
          'Icons go on every tab or none.',
      );
    }
  }, [ariaLabel, withIcons, tabs.length]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const to = keyTarget(
      event.key,
      enabled.findIndex((t) => t.id === activeId),
      enabled.length - 1,
    );
    if (to < 0) return;
    event.preventDefault();
    const target = enabled[to];
    if (!target || target.id === activeId) return;
    onChange(target.id);
    // Move focus once the parent has re-rendered the new active tab.
    requestAnimationFrame(() => refs.current[target.id]?.focus());
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      data-overflow-start={overflow.start || undefined}
      data-overflow-end={overflow.end || undefined}
      className={cn(
        'flex gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none]',
        'shadow-[inset_0_-1px_0_var(--border-soft)]',
        FADE[overflow.start ? (overflow.end ? 'both' : 'start') : overflow.end ? 'end' : 'none'],
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={barId ? tabId(barId, tab.id) : undefined}
            aria-controls={barId ? panelId(barId, tab.id) : undefined}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && !active && onChange(tab.id)}
            className={cn(
              'group inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors',
              'focus-visible:rounded-t focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
              'disabled:cursor-not-allowed disabled:text-ink-faint',
              active
                ? 'border-brand font-semibold text-ink-strong'
                : 'border-transparent font-medium text-ink-muted hover:text-ink-strong',
            )}
          >
            {hasIcon(tab) && (
              <span
                data-tab-icon=""
                aria-hidden="true"
                className={cn(
                  'inline-flex items-center [&_svg]:size-3.5',
                  active ? 'text-brand' : 'text-ink-faint',
                )}
              >
                {tab.concept && <ConceptIcon concept={tab.concept} size="xs" />}
              </span>
            )}
            <span data-tab-label="">{tab.label}</span>
            {typeof tab.badge === 'number' ? (
              <span
                className={cn(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-chip px-1.5 font-mono text-[10px] font-semibold leading-none',
                  active ? COUNT_ACTIVE[tab.tone ?? 'brand'] : 'bg-surface-alt text-ink-muted',
                )}
              >
                {tab.badge}
              </span>
            ) : isStatus(tab.badge) ? (
              <StatusChip size="xs" status={tab.badge} />
            ) : (
              (tab.badge ?? null)
            )}
          </button>
        );
      })}
    </div>
  );
};
