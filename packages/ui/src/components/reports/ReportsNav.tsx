import React from 'react';
import { cn } from '../../pump-ds/lib/cn.js';
import { ConceptIcon, Icon, type Concept } from '../../pump-ds/icon/index.js';

export interface ReportsNavItem<T extends string> {
  id: T;
  label: string;
  concept: Concept;
  /** A gated report the Organization does not have: a lock in place of its icon (#605). */
  locked?: boolean;
}

export interface ReportsNavGroup<T extends string> {
  heading: string;
  items: ReportsNavItem<T>[];
}

/**
 * Reports sub-navigation (#540): a grouped list beside the report, in place of
 * a flat row of tabs. Same row style as the sidebar. Groups with no visible
 * items are dropped.
 */
export function ReportsNav<T extends string>({
  groups,
  activeId,
  onChange,
}: {
  groups: ReportsNavGroup<T>[];
  activeId: T;
  onChange: (id: T) => void;
}) {
  return (
    <nav aria-label="Reports" className="flex flex-col gap-0.5 border-r border-border-soft pr-2.5">
      {groups
        .filter((g) => g.items.length > 0)
        .map((group, gi) => (
          <div key={group.heading} className={gi > 0 ? 'mt-4' : ''}>
            <div className="px-2.5 pb-1.5 font-mono text-[12px] font-medium uppercase tracking-wider text-ink-faint">
              {group.heading}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onChange(item.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-button px-3 py-2 text-left text-[13px] transition-colors',
                      active
                        ? 'bg-info-bg font-semibold text-info-fg'
                        : 'font-medium text-ink-default hover:bg-surface-alt hover:text-ink-strong',
                    )}
                  >
                    <span
                      className={cn(
                        'flex items-center',
                        active ? 'text-info-fg' : 'text-ink-muted',
                      )}
                    >
                      {item.locked ? (
                        <Icon name="lock" size="sm" aria-label="Locked" />
                      ) : (
                        <ConceptIcon concept={item.concept} size="sm" />
                      )}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
    </nav>
  );
}
