import React, { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { Button } from '../button/index.js';
import { Icon } from '../icon/index.js';
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuLabel,
} from '../menu/index.js';

/**
 * TopBar — the app-shell top bar. Composes pump-ds primitives into the real,
 * wired header: sidebar toggle · brand · station name · global search trigger
 * (⌘K) · + New · notifications · user menu.
 *
 * Ambient status (business day, sync, past-open-day warnings) lives in the
 * bottom `StatusBar`, not here — the top bar carries navigation and actions
 * only, and never wraps.
 *
 * Fully controlled/data-driven so AppShell can wire it to real state without
 * the TopBar knowing about routing, queries, or auth.
 */

export interface QuickCreateAction {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

export interface NotificationItem {
  id: string;
  tone: 'danger' | 'warning' | 'info';
  icon?: ReactNode;
  title: string;
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface UserMenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

export interface BusinessDayOption {
  /** Business date, YYYY-MM-DD. */
  date: string;
  /** Human label (e.g. "Mon, 12 May"). */
  label: string;
  status?: 'open' | 'closed';
  openShiftCount?: number;
  closedShiftCount?: number;
  lastActivityAt?: string;
}

export interface TopBarProps {
  /** Callback to toggle sidebar collapse. Omit if shell is not collapsible. */
  onToggleSidebar?: () => void;
  /** Brand wordmark or logo. Defaults to "PumpOS". */
  brand?: ReactNode;
  /** Active station name, shown as quiet text next to the brand. */
  stationName?: string;
  /** Global search click/shortcut handler. Opens command palette. */
  onOpenSearch?: () => void;
  /** Search button placeholder text. Defaults to "Search customers, suppliers, products…". */
  searchPlaceholder?: string;
  /** Quick-create actions shown in the "+ New" menu. */
  quickCreate?: QuickCreateAction[];
  /** Notification items. Empty array hides the badge. */
  notifications?: NotificationItem[];
  /** User initials for the avatar button. */
  userInitials?: string;
  /** User display name. */
  userName?: string;
  /** User role name (e.g. "Owner", "Manager"). */
  userRole?: string;
  /** User menu actions (Profile, Settings, Log out). */
  userMenu?: UserMenuAction[];
  /**
   * Desktop only (#117): makes this bar double as the window's title bar —
   * empty areas drag the window, double-click zooms, and space is reserved on
   * the platform's control side. `null`/omitted on the web, where the browser
   * supplies its own chrome and this bar renders exactly as before.
   */
  titleBar?: TitleBarIntegration | null;
  className?: string;
}

/** Native window commands, wired by the desktop shell. */
export interface WindowControlCommands {
  minimize: () => void | Promise<void>;
  toggleMaximize: () => void | Promise<void>;
  close: () => void | Promise<void>;
}

/** The subset of the desktop title-bar contract this pure component needs. */
export interface TitleBarIntegration {
  controlsSide: 'left' | 'right';
  /**
   * Space (px) to reserve on `controlsSide` for controls the OS paints over
   * this bar. Zero where the app draws its own, which take real layout space.
   */
  controlsInset: number;
  maximized: boolean;
  /** Non-null on undecorated windows, where the app draws the buttons. */
  controls: WindowControlCommands | null;
}

const IS_MAC =
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/** Below this bar width the centered search would collide with the side
 *  clusters, so it collapses to an icon button in the right cluster. */
const SEARCH_COLLAPSE_WIDTH = 900;

/**
 * Track a container's width via ResizeObserver so the search trigger can be
 * true-centered when there's room and collapse to an icon when there isn't.
 * Starts optimistic (wide) so the full search renders on first paint and only
 * collapses if the box is genuinely narrow.
 */
function useContainerWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === 'number') setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const IconBtn = forwardRef<
  HTMLButtonElement,
  // `aria-label` is required, not optional: this control never renders text, so
  // without one it reaches a screen reader as an anonymous "button".
  React.ButtonHTMLAttributes<HTMLButtonElement> & { badge?: number; 'aria-label': string }
>(function IconBtn({ className, children, badge, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'relative inline-flex size-8 items-center justify-center rounded-button text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink-strong',
        className,
      )}
      {...props}
    >
      {children}
      {badge != null && badge > 0 && (
        <span className="absolute right-1 top-1 inline-flex min-w-[14px] items-center justify-center rounded-full bg-danger-fg px-1 text-[9px] font-bold leading-[14px] text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
});

/**
 * Window buttons for undecorated (Windows/Linux) windows. macOS keeps its
 * native traffic lights — there `controls` is null and only the inset applies.
 *
 * The glyphs are OS window-chrome conventions rather than app iconography, so
 * they are drawn here instead of going through the product icon registry.
 *
 * None of these carry a drag-region attribute, so Tauri never starts a window
 * drag from them; a click is a click.
 */
const WindowControls: React.FC<{
  controls: WindowControlCommands;
  maximized: boolean;
}> = ({ controls, maximized }) => {
  const btn =
    'inline-flex h-8 w-11 items-center justify-center text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink-strong';
  return (
    <div className="-mr-3 ml-1 flex items-center self-stretch">
      <button
        type="button"
        aria-label="Minimise window"
        onClick={() => void controls.minimize()}
        className={btn}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={maximized ? 'Restore window' : 'Maximise window'}
        onClick={() => void controls.toggleMaximize()}
        className={btn}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          aria-hidden="true"
        >
          {maximized ? (
            <>
              <rect x="0.5" y="2.5" width="7" height="7" />
              <path d="M2.5 2.5V0.5h7v7h-2" />
            </>
          ) : (
            <rect x="0.5" y="0.5" width="9" height="9" />
          )}
        </svg>
      </button>
      <button
        type="button"
        aria-label="Close window"
        onClick={() => void controls.close()}
        className={cn(btn, 'hover:bg-danger-fg hover:text-white')}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
};

export const TopBar: React.FC<TopBarProps> = ({
  onToggleSidebar,
  brand,
  stationName,
  onOpenSearch,
  searchPlaceholder = 'Search customers, suppliers, products\u2026',
  quickCreate = [],
  notifications = [],
  userInitials,
  userName,
  userRole,
  userMenu = [],
  titleBar = null,
  className,
}) => {
  const notifCount = notifications.length;
  const [barRef, barWidth] = useContainerWidth<HTMLDivElement>();
  const searchCollapsed = barWidth < SEARCH_COLLAPSE_WIDTH;

  // On desktop this bar IS the window title bar. `data-tauri-drag-region` makes
  // the bar's own surface drag the window (and double-click zoom it); Tauri only
  // acts when the event target itself carries the attribute, so every control
  // nested inside stays clickable without opting out one by one.
  const dragRegion = titleBar ? { 'data-tauri-drag-region': true } : {};

  //
  // The inset keeps the platform's window controls from ever overlapping the
  // app's own. It is only needed where the OS paints its controls OVER the bar
  // (macOS traffic lights, on the left); where the app draws them itself they
  // occupy real layout space and need no reserved padding. A 0 inset falls back
  // to the bar's normal horizontal padding rather than collapsing it.
  const inset = titleBar?.controlsInset || undefined;
  const leadingInset = titleBar?.controlsSide === 'left' ? inset : undefined;
  const trailingInset = titleBar?.controlsSide === 'right' ? inset : undefined;

  return (
    <div
      ref={barRef}
      {...dragRegion}
      style={{ paddingLeft: leadingInset, paddingRight: trailingInset }}
      className={cn(
        'relative flex h-12 items-center gap-2 border-b border-border-soft bg-surface px-3',
        titleBar && 'cursor-default select-none',
        className,
      )}
    >
      {onToggleSidebar && (
        <IconBtn onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <Icon name="menu" size="md" />
        </IconBtn>
      )}

      {brand && (
        <div
          className={cn(
            'select-none pl-0.5 pr-1 text-[15px] font-bold tracking-[-0.01em] text-brand',
            // Tauri only drags when the event target itself carries the
            // attribute, so a graphical brand would become the target and kill
            // the drag over the very element people reach for. The slot is
            // decorative: let the pointer through to the bar, which has it.
            titleBar && 'pointer-events-none',
          )}
        >
          {brand}
        </div>
      )}

      {stationName && (
        <>
          <div className="mx-0.5 h-4 w-px bg-border-soft" />
          <span
            data-testid="topbar-station"
            className={cn(
              'select-none truncate text-[12.5px] font-medium text-ink-default',
              titleBar && 'pointer-events-none',
            )}
            title={stationName}
          >
            {stationName}
          </span>
        </>
      )}

      {/* Global search trigger. True-centered at 50% of the bar when there's
          room; collapses to an icon button in the right cluster below
          SEARCH_COLLAPSE_WIDTH so it never collides with the side clusters. */}
      {!searchCollapsed && (
        <button
          onClick={onOpenSearch}
          aria-label="Search"
          className="group absolute left-1/2 top-1/2 flex h-8 w-[min(420px,38vw)] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-button border border-border-soft bg-canvas px-3 text-[12.5px] text-ink-muted transition-colors hover:border-border-strong focus:outline-none focus-visible:outline-none focus-visible:border-border-strong"
        >
          <Icon name="search" size="sm" />
          <span className="flex-1 truncate text-left">{searchPlaceholder}</span>
          <span className="flex items-center gap-0.5">
            <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border-strong border-b-2 bg-surface px-1 font-mono text-[10px] font-medium text-ink-strong">
              {IS_MAC ? <Icon name="command" size="xs" className="size-2.5" /> : 'Ctrl'}
            </kbd>
            <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border-strong border-b-2 bg-surface px-1 font-mono text-[10px] font-medium text-ink-strong">
              K
            </kbd>
          </span>
        </button>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {searchCollapsed && (
          <IconBtn onClick={onOpenSearch} aria-label="Search">
            <Icon name="search" size="md" />
          </IconBtn>
        )}

        {quickCreate.length > 0 && (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="primary" size="sm" leftIcon={<Icon name="plus" size="xs" />}>
                New
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuLabel>Create</MenuLabel>
              {quickCreate.map((a) => (
                <MenuItem key={a.id} icon={a.icon} shortcut={a.shortcut} onSelect={a.onSelect}>
                  {a.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}

        {/* Notifications */}
        <Menu>
          <MenuTrigger asChild>
            <IconBtn aria-label={`Notifications (${notifCount})`} badge={notifCount}>
              <Icon name="bell" size="md" />
            </IconBtn>
          </MenuTrigger>
          <MenuContent align="end" className="w-[320px] py-0">
            <div className="flex items-center justify-between border-b border-border-soft px-3 py-2.5">
              <span className="text-[12px] font-semibold text-ink-strong">Notifications</span>
              {notifCount > 0 && (
                <span className="inline-flex items-center rounded-chip bg-danger-bg px-1.5 py-0.5 text-[10px] font-medium text-danger-fg">
                  {notifCount} new
                </span>
              )}
            </div>
            {notifCount === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] text-ink-muted">
                Nothing needs attention.
              </div>
            ) : (
              <div className="divide-y divide-border-soft">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={n.onAction}
                    className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-alt"
                  >
                    <span
                      className={cn(
                        'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5',
                        n.tone === 'danger'
                          ? 'bg-danger-bg text-danger-fg'
                          : n.tone === 'warning'
                            ? 'bg-warning-bg text-warning-fg'
                            : 'bg-info-bg text-info-fg',
                      )}
                    >
                      {n.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-medium text-ink-strong">
                        {n.title}
                      </span>
                      {n.meta && <span className="block text-[11px] text-ink-muted">{n.meta}</span>}
                    </span>
                    {n.actionLabel && (
                      <span className="shrink-0 self-center font-mono text-[10px] uppercase tracking-wide text-brand">
                        {n.actionLabel}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </MenuContent>
        </Menu>

        <div className="mx-0.5 h-5 w-px bg-border-soft" />

        {/* User menu */}
        <Menu>
          <MenuTrigger asChild>
            <button className="inline-flex h-8 items-center gap-1.5 rounded-button pl-1 pr-1.5 transition-colors hover:bg-surface-alt">
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-brand/12 text-[11px] font-semibold text-brand">
                {userInitials}
              </span>
              <span className="hidden text-[12px] font-medium text-ink-strong sm:inline">
                {userName}
              </span>
              <Icon name="chevron-down" size="xs" className="text-ink-faint" />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand/12 text-[12px] font-semibold text-brand">
                {userInitials}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-ink-strong">{userName}</div>
                <div className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">
                  {userRole}
                </div>
              </div>
            </div>
            <MenuSeparator />
            {userMenu.map((a) => (
              <MenuItem
                key={a.id}
                icon={a.icon}
                shortcut={a.shortcut}
                tone={a.tone}
                onSelect={a.onSelect}
              >
                {a.label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      </div>

      {titleBar?.controls && (
        <WindowControls controls={titleBar.controls} maximized={titleBar.maximized} />
      )}
    </div>
  );
};
