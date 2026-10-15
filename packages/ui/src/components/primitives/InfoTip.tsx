import React, { useRef, useState } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { Info } from 'lucide-react';
import { cn } from '../../pump-ds/lib/cn.js';
import { TOOLTIP_BUBBLE, TOOLTIP_DELAY_MS } from './Tooltip.js';

export interface InfoTipProps {
  /** The explanation shown in the bubble. May wrap over several lines. */
  children: React.ReactNode;
  /** Accessible name for the icon button, e.g. "About customer sales". */
  label: string;
  /** Preferred side; it flips when there is no room there. */
  placement?: 'top' | 'bottom';
}

/**
 * An (i) icon that reveals helper text, so long explainers don't push a form
 * down (#303). Unlike `Tooltip` it works without a mouse: it opens on hover and
 * keyboard focus, a tap/click toggles it (touch screens have no hover), and
 * Escape or a click outside closes it. The text wraps, so it suits a paragraph.
 *
 * Built on Radix Tooltip (#603): the bubble is portalled and stays inside the
 * window, so a tip at the right end of a control bar no longer runs off-screen.
 */
export const InfoTip: React.FC<InfoTipProps> = ({ children, label, placement = 'bottom' }) => {
  // Hover and focus, as Radix reports them.
  const [shown, setShown] = useState(false);
  // Tapped or clicked open: stays until a second tap, Escape or a click outside.
  const [pinned, setPinned] = useState(false);
  const open = shown || pinned;
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <RadixTooltip.Provider delayDuration={TOOLTIP_DELAY_MS}>
      <RadixTooltip.Root open={open} onOpenChange={setShown}>
        <RadixTooltip.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={label}
            aria-expanded={open}
            onClick={() => setPinned((p) => !p)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setPinned(false);
                setShown(false);
              }
            }}
            className={cn(
              'inline-flex cursor-pointer rounded-full border-none bg-transparent p-0.5 align-middle text-ink-faint',
              'hover:text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
            )}
          >
            <Info size={13} aria-hidden="true" />
          </button>
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={placement}
            align="start"
            sideOffset={6}
            collisionPadding={8}
            onEscapeKeyDown={() => setPinned(false)}
            onPointerDownOutside={(e) => {
              // A tap on the icon itself toggles through its click.
              if (triggerRef.current?.contains(e.target as Node)) {
                e.preventDefault();
                return;
              }
              setPinned(false);
            }}
            className={cn(
              TOOLTIP_BUBBLE,
              'w-max max-w-[280px] whitespace-normal px-2.5 py-2 text-[12px] font-normal normal-case leading-[1.45] tracking-normal',
            )}
          >
            {children}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
};
