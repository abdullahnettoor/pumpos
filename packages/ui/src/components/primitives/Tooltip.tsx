import React from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { cn } from '../../pump-ds/lib/cn.js';

export interface TooltipProps {
  /** Text shown in the floating bubble. */
  content: React.ReactNode;
  /** Preferred side; it flips when there is no room there. */
  placement?: 'top' | 'bottom';
  children: React.ReactElement;
}

/** Hover delay before a tooltip shows, in ms. Focus shows it at once. */
export const TOOLTIP_DELAY_MS = 150;

/**
 * The one Tooltip provider (#603 review): mounted once around each app (and in
 * `renderWithProviders`), so every `Tooltip` and `InfoTip` shares the delay
 * and the "skip the delay when moving between tips" timing. A tooltip outside
 * it throws, as Radix does.
 */
export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RadixTooltip.Provider delayDuration={TOOLTIP_DELAY_MS} skipDelayDuration={300}>
    {children}
  </RadixTooltip.Provider>
);

/**
 * The bubble shared by `Tooltip` and `InfoTip` (#603): portalled to the body,
 * above drawers, and kept inside the window (it flips to the other side and
 * shifts along the edge rather than running off-screen).
 */
export const TOOLTIP_BUBBLE =
  'z-[1100] rounded-[6px] bg-ink-strong text-on-neutral shadow-(--shadow-tooltip)';

/**
 * Hover / focus tooltip. Wrap a single interactive element; the bubble shows
 * above (default) or below on hover and keyboard focus, and is wired through
 * `aria-describedby` for screen readers. Prefer it over bare `title=""`
 * attributes for anything the user needs to read.
 *
 * Built on Radix Tooltip (#603): the bubble is portalled with collision
 * handling, so a trigger at the window's edge keeps its bubble on screen.
 * Needs the app's `TooltipProvider`.
 */
export const Tooltip: React.FC<TooltipProps> = ({ content, placement = 'top', children }) => (
  <RadixTooltip.Root>
    <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        side={placement}
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          TOOLTIP_BUBBLE,
          'pointer-events-none whitespace-nowrap px-2 py-1 text-[12px] font-medium leading-[1.4]',
        )}
      >
        {content}
      </RadixTooltip.Content>
    </RadixTooltip.Portal>
  </RadixTooltip.Root>
);
