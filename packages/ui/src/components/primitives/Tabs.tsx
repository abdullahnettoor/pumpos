import React, { useRef } from 'react';

export interface TabItem {
  id: string;
  label: string;
  /** Optional leading icon (e.g. a lucide element sized ~13px). */
  icon?: React.ReactNode;
  /** Optional trailing adornment (count pill, status badge, etc.). */
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /** Visual size. `sm` is used for in-panel/secondary tab strips. */
  size?: 'md' | 'sm';
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

/**
 * Accessible, consistent tab strip. Replaces the bespoke `borderBottom` button
 * rows each screen used to hand-roll. Controlled: the parent owns `activeId`.
 * Keyboard: ←/→ move between enabled tabs, Home/End jump to first/last.
 */
export const Tabs: React.FC<TabsProps> = ({ tabs, activeId, onChange, size = 'md', className, style, ...rest }) => {
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

  const padding = size === 'sm' ? '7px 12px' : '10px 16px';
  const fontSize = size === 'sm' ? '12px' : '13px';

  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      onKeyDown={handleKeyDown}
      className={className}
      style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-soft)', overflowX: 'auto', ...style }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
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
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding,
              fontSize,
              fontWeight: active ? 600 : 500,
              whiteSpace: 'nowrap',
              background: 'transparent',
              border: 'none',
              borderBottom: active ? '2px solid var(--brand-primary)' : '2px solid transparent',
              marginBottom: '-1px',
              color: tab.disabled ? 'var(--text-faint)' : active ? 'var(--brand-primary)' : 'var(--text-muted)',
              cursor: tab.disabled ? 'not-allowed' : 'pointer',
              transition: 'color 0.15s ease, border-color 0.15s ease',
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
};
