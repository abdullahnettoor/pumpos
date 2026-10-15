import React from 'react';
import { PageFrame } from '../../page-frame/PageFrame.js';

/** The bordered surface each onboarding step lays its fields on. */
export const STEP_PANEL =
  'flex flex-col gap-4 rounded-card border border-border-soft bg-surface p-5';

/**
 * One onboarding step: the page-header title row (PageFrame, no route — the
 * wizard is full-screen outside the app shell) above the step's content.
 */
export const OnboardingStep: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, actions, children }) => (
  <PageFrame title={title} subtitle={subtitle} actions={actions}>
    <div className="flex flex-col gap-5">{children}</div>
  </PageFrame>
);
