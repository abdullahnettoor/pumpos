import React from 'react';
import { PumpOSLockup } from '../../pump-ds/index.js';
import { authBrandHeaderStyle } from './brandHeader.js';

export interface AuthScreenProps {
  /** The screen's one heading under the lockup. */
  title: React.ReactNode;
  /** A muted line under the heading (the invited email). */
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The card every sign-in screen sits in: the lockup, a heading, then the
 * screen's content, centred on the canvas. Sign-in and invite acceptance are
 * the same screen wearing different words, so they share it.
 */
export const AuthScreen: React.FC<AuthScreenProps> = ({ title, subtitle, children }) => (
  <div className="flex min-h-screen items-center justify-center bg-canvas p-5 font-sans">
    <div className="flex w-full max-w-[380px] animate-fade-in flex-col gap-5 rounded-card border border-border-soft bg-surface px-6 py-8">
      <div className="text-center">
        <PumpOSLockup orientation="stacked" style={authBrandHeaderStyle} />
        <h1 className="mt-2 text-[14px] font-semibold text-ink-strong">{title}</h1>
        {subtitle && <p className="mt-1 text-[12px] text-ink-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  </div>
);
