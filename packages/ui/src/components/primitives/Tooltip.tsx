import React from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { cn } from '../../pump-ds/lib/cn.js';

export interface TooltipProps {
  /** Text shown in the floating bubble. */
  content: React.ReactNode;
  /** Preferred side; it flips when there is no room there. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
  /** Keeps the trigger mounted (so it keeps focus) but never shows the bubble. */
  disabled?: boolean;
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

const prevent = (event: React.SyntheticEvent) => event.preventDefault();

/**
 * Radix's Trigger opens only through onPointerMove and onFocus (each wrapped in
 * composeEventHandlers, which skips Radix's handler when ours calls
 * preventDefault). onPointerDown only closes, so it is left alone and the
 * trigger keeps normal pointer focus. Controlled `open={false}` alone is not
 * enough: Radix still calls the provider's onOpen and dispatches `tooltip.open`.
 */
const SUPPRESS_OPEN = {
  onPointerMove: prevent,
  onFocus: prevent,
};

const isKeyboardFocused = (el: Element | null): boolean => {
  if (!el) return false;
  try {
    return el.matches(':focus-visible');
  } catch {
    return document.activeElement === el;
  }
};

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
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  placement = 'top',
  children,
  disabled = false,
}) => {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  if (disabled && open) setOpen(false);

  React.useEffect(() => {
    if (!disabled && isKeyboardFocused(triggerRef.current)) setOpen(true);
  }, [disabled]);

  // Residual: a hover open whose 150ms delay was already running when `disabled`
  // flipped may still fire Radix's `tooltip.open` and dismiss another open tooltip.
  return (
    <RadixTooltip.Root
      open={open && !disabled}
      onOpenChange={(next) => {
        if (!disabled || !next) setOpen(next);
      }}
    >
      <RadixTooltip.Trigger asChild ref={triggerRef} {...(disabled ? SUPPRESS_OPEN : undefined)}>
        {children}
      </RadixTooltip.Trigger>
      {!disabled && (
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
      )}
    </RadixTooltip.Root>
  );
};
