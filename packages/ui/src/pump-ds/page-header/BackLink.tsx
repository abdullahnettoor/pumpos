import React from 'react';
import { cn } from '../lib/cn.js';
import { Icon } from '../icon/index.js';

/**
 * BackLink — "‹ Accounts": the way back from a detail page to the page it
 * belongs to (#576). It sits top-left, above the page title, and is a real
 * link: `href` is the parent page's address, so it can be opened in a new tab
 * and reads as a link to assistive tech. Pass `onClick` to navigate in-app;
 * a plain click is then handled there (modified clicks keep the browser's).
 */
export interface BackLinkProps {
  /** The parent page's name, e.g. "Accounts". */
  label: string;
  /** The parent page's address. */
  href: string;
  /** In-app navigation for a plain click. */
  onClick?: () => void;
  className?: string;
}

export function BackLink({ label, href, onClick, className }: BackLinkProps) {
  return (
    <a
      href={href}
      onClick={(e) => {
        if (!onClick || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onClick();
      }}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-button text-[12px] font-medium text-ink-muted transition-colors hover:text-ink-strong',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        className,
      )}
    >
      <Icon name="chevron-left" size="sm" />
      {label}
    </a>
  );
}
