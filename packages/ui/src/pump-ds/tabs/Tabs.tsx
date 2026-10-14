import React, { useEffect, useRef, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn.js';
import { ConceptIcon } from '../icon/ConceptIcon.js';
import type { Concept } from '../icon/concepts.js';
import { Chip } from '../chip/Chip.js';

/** Tone of a tab's badge: the count pill's fill when active, a text chip's tone always. */
export type TabTone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export interface TabItem {
  id: string;
  label: string;
  /**
   * The tab's concept: its icon comes from `CONCEPT_ICON`, so "Tanks" shows
   * the same glyph here as in the sidebar, the Reports list and ⌘K. There
   * is no free icon prop: a new subject gets a concept in `CONCEPT_ICON`.
   */
  concept?: Concept;
  /** A number renders as a count pill; text ("Open") as a status chip. */
  badge?: number | string;
  /** Count pill fill on the active tab (default `brand`); text chip tone (default `neutral`). */
  tone?: TabTone;
  disabled?: boolean;
}

export interface TabsProps {
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
export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeId,
  onChange,
  className,
  'aria-label': ariaLabel,
}) => {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = tabs.filter((t) => !t.disabled);
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
    const last = enabled.length - 1;
    const at = enabled.findIndex((t) => t.id === activeId);
    const to =
      event.key === 'ArrowRight'
        ? at >= last
          ? 0
          : at + 1
        : event.key === 'ArrowLeft'
          ? at <= 0
            ? last
            : at - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
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
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        'flex gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none]',
        'shadow-[inset_0_-1px_0_var(--border-soft)]',
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
            ) : tab.badge ? (
              <Chip size="xs" tone={tab.tone ?? 'neutral'}>
                {tab.badge}
              </Chip>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
