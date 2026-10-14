import React, { type ReactNode } from 'react';
import { PageHeader } from '../../pump-ds/page-header/index.js';
import { pageTitle, type RoutePath } from '../../nav-intent/routes.js';

export interface PageFrameProps {
  /** The page's route. The title defaults to its sidebar label. */
  route: RoutePath;
  /** Overrides the sidebar label (a detail view inside a page). */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Right of the title: the page's buttons. */
  actions?: ReactNode;
  /** Under the title row: the page's pump-ds `Tabs`. */
  tabs?: ReactNode;
  /** Under the tabs: date range, search, filters. */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * Page Frame (#523): one way a page starts. Title row (title + subtitle on the
 * left, actions on the right), then tabs, then the toolbar, then the content,
 * always in that order. The title is the sidebar label for the route, so the
 * page and its nav item never disagree.
 *
 * Lives outside pump-ds because it reads the app's routes; it is built on the
 * pump-ds `PageHeader`.
 */
export const PageFrame: React.FC<PageFrameProps> = ({
  route,
  title,
  subtitle,
  actions,
  tabs,
  toolbar,
  children,
}) => (
  <div className="flex animate-fade-in flex-col gap-4">
    <div className="flex flex-col gap-3">
      <PageHeader title={title ?? pageTitle(route)} subtitle={subtitle} actions={actions} />
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
