import React, { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { Search, CornerDownLeft } from 'lucide-react';
import { cn } from '../lib/cn.js';

/**
 * CommandPalette — the ⌘K global search + command surface. Built on cmdk
 * (fuzzy filter, keyboard nav, groups) inside a Radix Dialog (portal, focus
 * trap, overlay, escape). Data-driven: pass groups of items; each item runs
 * its `onSelect` and the palette closes.
 *
 * Search is client-side over whatever the host feeds in (typically flattened
 * TanStack Query caches: customers, suppliers, products, shifts) plus static
 * command/navigation items. No backend required.
 */

export interface CommandItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Right-aligned secondary text (code, balance, date). */
  meta?: string;
  /** Right-aligned keyboard shortcut hint (only shown when no meta). */
  shortcut?: string;
  /** Extra strings to match against (codes, phone, aliases). */
  keywords?: string[];
  onSelect: () => void;
}

export interface CommandGroup {
  heading: string;
  items: CommandItem[];
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandGroup[];
  placeholder?: string;
  emptyMessage?: string;
  /** Footer helper text on the right. */
  footerHint?: string;
}

const Kbd: React.FC<{ children: ReactNode }> = ({ children }) => (
  <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border-strong border-b-2 bg-surface px-1 font-mono text-[10px] font-medium text-ink-strong">
    {children}
  </kbd>
);

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  groups,
  placeholder = 'Search or run a command…',
  emptyMessage = 'No matches found.',
  footerHint = 'Search across customers, invoices, shifts & more',
}) => {
  const run = (fn: () => void) => {
    onOpenChange(false);
    // Defer so the dialog unmount doesn't swallow the navigation/focus change.
    requestAnimationFrame(fn);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(24,32,26,0.28)]" />
        <Dialog.Content
          aria-label="Command palette"
          className="fixed left-1/2 top-[15vh] z-50 w-[min(92vw,560px)] -translate-x-1/2 overflow-hidden rounded-drawer border border-border-soft bg-surface shadow-[0_16px_48px_rgba(24,32,26,0.22)] outline-none"
        >
          <Command
            loop
            filter={(value, search, keywords) => {
              const hay = `${value} ${(keywords ?? []).join(' ')}`.toLowerCase();
              return hay.includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <div className="flex items-center gap-2.5 border-b border-border-soft px-4 py-3">
              <Search className="size-4 shrink-0 text-ink-muted" />
              <Command.Input
                autoFocus
                placeholder={placeholder}
                className="flex-1 bg-transparent text-[14px] text-ink-strong outline-none placeholder:text-ink-muted"
              />
              <Kbd>esc</Kbd>
            </div>

            <Command.List className="max-h-[min(60vh,360px)] overflow-y-auto py-1">
              <Command.Empty className="px-4 py-8 text-center text-[13px] text-ink-muted">
                {emptyMessage}
              </Command.Empty>

              {groups.map((group) => (
                <Command.Group
                  key={group.heading}
                  heading={group.heading}
                  className="px-1.5 py-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-faint"
                >
                  {group.items.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={`${item.label} ${item.meta ?? ''}`}
                      keywords={item.keywords}
                      onSelect={() => run(item.onSelect)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px]',
                        'text-ink-default data-[selected=true]:bg-brand/10 data-[selected=true]:text-ink-strong',
                      )}
                    >
                      {item.icon && (
                        <span className="inline-flex size-4 items-center justify-center text-ink-muted [&_svg]:size-4 data-[selected=true]:text-brand" aria-hidden="true">
                          {item.icon}
                        </span>
                      )}
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.meta ? (
                        <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-faint">{item.meta}</span>
                      ) : item.shortcut ? (
                        <span className="ml-auto"><Kbd>{item.shortcut}</Kbd></span>
                      ) : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>

            <div className="flex items-center gap-4 border-t border-border-soft px-4 py-2 text-[11px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
              <span className="inline-flex items-center gap-1.5"><Kbd><CornerDownLeft className="size-2.5" /></Kbd> select</span>
              <span className="ml-auto hidden sm:inline">{footerHint}</span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

/**
 * useCommandPalette — wires ⌘K / Ctrl+K to toggle an open state. Returns the
 * controlled `open` + `setOpen` to pass into `<CommandPalette>`.
 */
export function useCommandPalette(): { open: boolean; setOpen: (v: boolean) => void } {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}
