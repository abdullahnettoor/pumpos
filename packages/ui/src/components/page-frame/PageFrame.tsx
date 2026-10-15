import React, { useEffect, type ReactNode } from 'react';
import { PageHeader, type BackLinkProps } from '../../pump-ds/page-header/index.js';
import { pageTitle, type RoutePath } from '../../nav-intent/routes.js';

/**
 * A sidebar page names its `route` and takes the sidebar label as its title.
 * A page outside the sidebar (design system, onboarding) names its `title`.
 */
type PageFrameTitle =
  | {
      /** The page's route. The title defaults to its sidebar label. */
      route: RoutePath;
      /** Overrides the sidebar label (a detail view inside a page). */
      title?: ReactNode;
    }
  | { route?: undefined; title: ReactNode };

export type PageFrameProps = PageFrameTitle & {
  /**
   * A detail page's way back to its parent ("‹ Accounts", #576): top-left,
   * above the title. Every detail page uses this slot, never its own button.
   */
  back?: BackLinkProps;
  subtitle?: ReactNode;
  /** Right of the title: the page's buttons. They scroll away with it. */
  actions?: ReactNode;
  /**
   * Under the title row: the page's pump-ds `Tabs`. The tab row alone sticks
   * to the top of the content area on scroll (#604).
   */
  tabs?: ReactNode;
  /**
   * Under the tabs: the page's standard toolbar, a pump-ds `ControlBar`:
   * the page-level `DateRangeMenu` first (or `ReportRangeBar` on a report),
   * then a `SearchInput`, then filters.
   */
  toolbar?: ReactNode;
  children: ReactNode;
};

/**
 * Page Frame (#523): one way a page starts. An optional back link, then the
 * title row (title + subtitle on the left, actions on the right), then tabs,
 * then the toolbar, then the content, always in that order. The title is the sidebar label for the route, so the
 * page and its nav item never disagree.
 *
 * On a tabbed page (#604) the tab row alone sticks to the top of the
 * scrolling content area, on the canvas colour, full-bleed over the area's
 * padding. The actions stay on the title row and scroll away with it.
 * Nothing else sticks: a page without tabs scrolls whole.
 *
 * Lives outside pump-ds because it reads the app's routes; it is built on the
 * pump-ds `PageHeader`. A route with no sidebar label and no `title` would
 * render an empty heading, so it logs a dev error instead.
 */
export const PageFrame: React.FC<PageFrameProps> = ({
  route,
  title,
  back,
  subtitle,
  actions,
  tabs,
  toolbar,
  children,
}) => {
  const heading = title ?? (route ? pageTitle(route) : undefined);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || heading) return;
    console.error(
      `[PageFrame] "${route}" is not a sidebar page, so it has no default title. ` +
        'Pass a title.',
    );
  }, [route, heading]);

  // One flat column, so the sticky tab row's containing block is the whole
  // page and it stays stuck to the end of the content (#604). Spacing is the
  // slots' top padding: 12px between header, tabs and toolbar, 16px above the
  // content. The row sticks at the content area's padding edge (`top` is minus
  // that padding), so it sits flush under the top bar.
  return (
    <div className="flex animate-fade-in flex-col">
      <PageHeader title={heading ?? ''} back={back} subtitle={subtitle} actions={actions} />
      {tabs && (
        // Only the tab row sticks (#604, owner): the title, subtitle and
        // actions scroll away together. A bar wider than the row scrolls
        // sideways with edge fades (pump-ds Tabs).
        <div
          data-page-frame-slot="tabs"
          className="sticky top-[calc(var(--space-6)*-1)] z-20 -mx-(--space-6) bg-canvas px-(--space-6) pt-3"
        >
          {tabs}
        </div>
      )}
      {toolbar && (
        <div data-page-frame-slot="toolbar" className="flex flex-wrap items-center gap-2.5 pt-3">
          {toolbar}
        </div>
      )}
      <div className="min-w-0 pt-4">{children}</div>
    </div>
  );
};
