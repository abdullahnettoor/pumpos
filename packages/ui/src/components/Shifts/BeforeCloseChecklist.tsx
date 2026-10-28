import React from 'react';
import { Button, Icon, Panel } from '../../pump-ds/index.js';
import { cn } from '../../pump-ds/lib/cn.js';
import type { CheckAction, CheckItem, CheckState } from './liveShiftModel.js';

export interface BeforeCloseChecklistProps {
  items: CheckItem[];
  /** Follow an item's link; omit the close link where the role cannot close. */
  onAction: (action: CheckAction) => void;
  canClose: boolean;
}

const MARK: Record<CheckState, React.ReactNode> = {
  done: (
    <span className="inline-flex size-[18px] items-center justify-center text-success-fg">
      <Icon name="check-circle" size="sm" aria-hidden="true" />
    </span>
  ),
  warn: (
    <span className="inline-flex size-[18px] items-center justify-center text-warning-fg">
      <Icon name="alert-circle" size="sm" aria-hidden="true" />
    </span>
  ),
  pending: (
    <span className="inline-flex size-[18px] items-center justify-center" aria-hidden="true">
      <span className="size-3.5 rounded-full border-[1.5px] border-ink-faint" />
    </span>
  ),
};

const STATE_WORD: Record<CheckState, string> = {
  done: 'Done',
  warn: 'Needs a look',
  pending: 'Not yet',
};

/**
 * Live shift → Before close (#533): what has to be true before the shift is
 * closed. Each item is done, needs a look (amber, a problem only) or not yet,
 * and links to where it is fixed: a Drawer's Handover, or the close flow for
 * the office cash count.
 */
export const BeforeCloseChecklist: React.FC<BeforeCloseChecklistProps> = ({
  items,
  onAction,
  canClose,
}) => {
  const done = items.filter((i) => i.state === 'done').length;
  // One link per destination: three items waiting on the same Handover link
  // to it once, on the first of them.
  const seen = new Set<string>();
  const linkOf = (item: CheckItem): CheckAction | null => {
    const action = item.action?.kind === 'close' && !canClose ? null : item.action;
    if (!action || item.state === 'done') return null;
    const key = action.kind === 'close' ? 'close' : action.groupKey;
    if (seen.has(key)) return null;
    seen.add(key);
    return action;
  };
  return (
    <Panel
      title="Before close"
      action={
        <span className="text-[12px] text-ink-muted">
          {done} of {items.length} done
        </span>
      }
    >
      <ul className="flex flex-col gap-2.5" aria-label="Before close">
        {items.map((item) => {
          const action = linkOf(item);
          return (
            <li key={item.id} className="flex items-start gap-2.5 text-[13px]">
              {MARK[item.state]}
              <span className="sr-only">{STATE_WORD[item.state]}:</span>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-ink-strong">{item.label}</span>
                  <span
                    className={cn(
                      'shrink-0 text-[12px]',
                      item.state === 'warn' ? 'text-warning-fg' : 'text-ink-muted',
                    )}
                  >
                    {item.meta}
                  </span>
                </div>
                {action && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="-ml-2.5 self-start text-brand"
                    rightIcon={<Icon name="chevron-right" size="xs" aria-hidden="true" />}
                    onClick={() => onAction(action)}
                  >
                    {action.label}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};
