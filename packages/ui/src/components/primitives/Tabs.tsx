import React, { useRef } from 'react';

/**
 * Tone used by the numeric count pill and the text `tag` on a tab.
 * Falls through to the same `--state-*-bg` / `--state-*-fg` pairing used
 * across the rest of the design system.
 */
export type TabTone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export interface TabTag {
  /** Short text like "NEW", "BETA", "PRO". Kept uppercase visually. */
  label: string;
  tone?: TabTone;
}

export interface TabItem {
  id: string;
  label: string;
  /** Leading icon (usually a lucide element sized ~14px). Rendered inline. */
  icon?: React.ReactNode;
  /**
   * Numeric badge → renders as a small count pill (uses `--tone`).
   * ReactNode → rendered as-is (advanced / custom badges).
   */
  badge?: React.ReactNode;
  /** Short caps tag next to the label — "NEW" / "BETA" / "PRO" style. */
  tag?: TabTag;
  /** Overrides the tone used by the count pill AND the tag. Default `brand`. */
  tone?: TabTone;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /** Visual size. `sm` is used for in-panel/secondary tab strips. */
  size?: 'md' | 'sm';
  /**
   * Visual style. All variants share the same keyboard behavior, ARIA roles,
   * and roving focus contract; only the paint layer changes.
   *
   * - `pill` (default): the historical PumpOS look — brand-tinted active
   *   label with a 2px brand underline. Zero regression for existing sites.
   * - `underline`: operator-panel look (Cloudflare / HPE dashboards). Ink
   *   label, 3px brand underline with a rounded top, tighter chrome.
   *   For dense section rails on data-heavy screens.
   * - `card`: folder-tab look — the active tab is a raised surface with
   *   rounded top corners that visually merges with the panel below. For
   *   settings / setup / wizard surfaces where each tab is a "section".
   */
  variant?: 'pill' | 'underline' | 'card';
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

/**
 * Accessible, consistent tab strip. Controlled: the parent owns `activeId`.
 * Keyboard: ←/→ move between enabled tabs, Home/End jump to first/last;
 * inactive tabs get `tabIndex={-1}` so Tab lands on the active one only.
 */
export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeId,
  onChange,
  size = 'md',
  variant = 'pill',
  className,
  style,
  ...rest
}) => {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = tabs.filter((t) => !t.disabled);

  const focusAndSelect = (id: string) => {
    onChange(id);
    // Move focus after the parent re-renders.
    requestAnimationFrame(() => refs.current[id]?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const idx = enabled.findIndex((t) => t.id === activeId);
    let next = idx;
    if (e.key === 'ArrowLeft') next = idx <= 0 ? enabled.length - 1 : idx - 1;
    else if (e.key === 'ArrowRight') next = idx >= enabled.length - 1 ? 0 : idx + 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    const target = enabled[next];
    if (target) focusAndSelect(target.id);
  };

  const rootClass = [
    'pump-tabs',
    `pump-tabs--${variant}`,
    `pump-tabs--${size}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      onKeyDown={handleKeyDown}
      className={rootClass}
      style={style}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const tone: TabTone = tab.tone ?? 'brand';
        return (
          <button
            key={tab.id}
            ref={(el) => { refs.current[tab.id] = el; }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={`pump-tab${active ? ' pump-tab--active' : ''}`}
          >
            {tab.icon && <span className="pump-tab__icon" aria-hidden="true">{tab.icon}</span>}
            <span className="pump-tab__label">{tab.label}</span>
            {tab.tag && (
              <span
                className={`pump-tab__tag pump-tab__tag--${tab.tag.tone ?? tone}`}
                aria-label={tab.tag.label}
              >
                {tab.tag.label}
              </span>
            )}
            {typeof tab.badge === 'number' ? (
              <span
                className={`pump-tab__count pump-tab__count--${tone}${active ? ' pump-tab__count--active' : ''}`}
              >
                {tab.badge}
              </span>
            ) : (
              tab.badge
            )}
          </button>
        );
      })}
    </div>
  );
};


