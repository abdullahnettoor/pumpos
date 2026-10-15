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
  /** Right of the title: the page's buttons. */
  actions?: ReactNode;
  /** Under the title row: the page's pump-ds `Tabs`. */
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

  return (
    <div className="flex animate-fade-in flex-col gap-4">
      <div className="flex flex-col gap-3">
        <PageHeader title={heading ?? ''} back={back} subtitle={subtitle} actions={actions} />
        {tabs && <div data-page-frame-slot="tabs">{tabs}</div>}
        {toolbar && (
          <div data-page-frame-slot="toolbar" className="flex flex-wrap items-center gap-2.5">
            {toolbar}
          </div>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
};
