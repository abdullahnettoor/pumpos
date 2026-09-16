import React, { forwardRef, type ReactNode } from 'react';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '../lib/cn.js';

/**
 * Menu — styled wrapper over Radix DropdownMenu. Replaces the legacy bespoke
 * `Menu`/`Popover` which used `position: absolute` inside overflow containers
 * (clipped, no collision handling). Radix gives us a portal, focus trap,
 * collision-aware positioning, full keyboard nav, and typeahead for free.
 *
 * Composable, shadcn-style. Use for the top bar's + New, notifications, and
 * user menus, and for row-action menus across screens.
 *
 *   <Menu>
 *     <MenuTrigger asChild><Button>Open</Button></MenuTrigger>
 *     <MenuContent align="end">
 *       <MenuLabel>Create</MenuLabel>
 *       <MenuItem icon={<Plus/>} shortcut="E" onSelect={...}>Expense</MenuItem>
 *       <MenuSeparator/>
 *       <MenuItem tone="danger" icon={<LogOut/>}>Log out</MenuItem>
 *     </MenuContent>
 *   </Menu>
 */

export const Menu = RadixMenu.Root;
export const MenuTrigger = RadixMenu.Trigger;
export const MenuGroup = RadixMenu.Group;

/**
 * How long after the menu opens a *pointer* click is treated as the tail of the
 * click that opened it rather than a selection.
 *
 * A menu can render directly under the cursor (the top bar's business-day pill
 * is the worst case: `align="start"` puts the first item a few pixels below the
 * trigger). A normal-speed click is pointerdown → open → pointerup on whatever
 * is now beneath the cursor, so the first item fires and the operator is
 * navigated away having never seen the menu. Radix guards Select this way; its
 * DropdownMenu does not.
 */
const POINTER_SELECT_GRACE_MS = 250;

/**
 * Is this pointer click the tail of the one that opened the menu?
 *
 * Exported as a pure function because the behaviour it guards is a timing rule,
 * not a rendering one — and Radix's menu content cannot be driven open under
 * jsdom, so this is the seam the regression test uses.
 */
export function isMenuOpeningClick(
  openedAtMs: number,
  nowMs: number = Date.now(),
  graceMs: number = POINTER_SELECT_GRACE_MS,
): boolean {
  return nowMs >= openedAtMs && nowMs - openedAtMs < graceMs;
}

/** Timestamp of the current content's mount; null outside a MenuContent. */
const MenuOpenedAtContext = React.createContext<React.MutableRefObject<number> | null>(null);

export interface MenuContentProps extends React.ComponentPropsWithoutRef<typeof RadixMenu.Content> {
  /** Portal container; defaults to document.body. */
  container?: HTMLElement | null;
}

export const MenuContent = forwardRef<React.ElementRef<typeof RadixMenu.Content>, MenuContentProps>(
  function MenuContent(
    { className, sideOffset = 6, align = 'start', container, children, ...props },
    ref,
  ) {
    // Mount == open, so the first render of the content is the open instant.
    const openedAt = React.useRef(Date.now());
    return (
      <RadixMenu.Portal container={container ?? undefined}>
        <RadixMenu.Content
          ref={ref}
          sideOffset={sideOffset}
          align={align}
          className={cn(
            'z-50 min-w-[220px] overflow-hidden rounded-card border border-border-soft bg-surface py-1',
            'shadow-[0_8px_24px_rgba(24,32,26,0.12)]',
            className,
          )}
          {...props}
        >
          <MenuOpenedAtContext.Provider value={openedAt}>{children}</MenuOpenedAtContext.Provider>
        </RadixMenu.Content>
      </RadixMenu.Portal>
    );
  },
);

export interface MenuItemProps extends Omit<
  React.ComponentPropsWithoutRef<typeof RadixMenu.Item>,
  'children'
> {
  icon?: ReactNode;
  /** Right-aligned keyboard shortcut hint. */
  shortcut?: string;
  tone?: 'default' | 'danger';
  children: ReactNode;
}

export const MenuItem = forwardRef<React.ElementRef<typeof RadixMenu.Item>, MenuItemProps>(
  function MenuItem(
    { className, icon, shortcut, tone = 'default', children, onClick, ...props },
    ref,
  ) {
    const openedAt = React.useContext(MenuOpenedAtContext);
    /**
     * Swallow the click that merely finished opening the menu. Radix composes
     * the consumer handler ahead of its own and skips its select when the event
     * is default-prevented, so this suppresses the selection while leaving the
     * menu open. Keyboard selection goes through `onSelect` and is untouched.
     */
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      if (openedAt && isMenuOpeningClick(openedAt.current)) {
        event.preventDefault();
      }
    };
    return (
      <RadixMenu.Item
        ref={ref}
        onClick={handleClick}
        className={cn(
          'flex cursor-pointer select-none items-center gap-2.5 px-3 py-1.5 text-[13px] outline-none',
          'data-[highlighted]:bg-surface-alt data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
          tone === 'danger' ? 'text-danger-fg' : 'text-ink-default',
          className,
        )}
        {...props}
      >
        {icon && (
          <span
            className={cn(
              'inline-flex size-4 items-center justify-center [&_svg]:size-4',
              tone === 'danger' ? 'text-danger-fg' : 'text-ink-muted',
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <span className="flex-1">{children}</span>
        {shortcut && (
          <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border-strong border-b-2 bg-surface px-1 font-mono text-[10px] font-medium text-ink-strong">
            {shortcut}
          </kbd>
        )}
      </RadixMenu.Item>
    );
  },
);

export const MenuSeparator = forwardRef<
  React.ElementRef<typeof RadixMenu.Separator>,
  React.ComponentPropsWithoutRef<typeof RadixMenu.Separator>
>(function MenuSeparator({ className, ...props }, ref) {
  return (
    <RadixMenu.Separator
      ref={ref}
      className={cn('my-1 h-px bg-border-soft', className)}
      {...props}
    />
  );
});

export const MenuLabel = forwardRef<
  React.ElementRef<typeof RadixMenu.Label>,
  React.ComponentPropsWithoutRef<typeof RadixMenu.Label>
>(function MenuLabel({ className, ...props }, ref) {
  return (
    <RadixMenu.Label
      ref={ref}
      className={cn(
        'px-3 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint',
        className,
      )}
      {...props}
    />
  );
});
