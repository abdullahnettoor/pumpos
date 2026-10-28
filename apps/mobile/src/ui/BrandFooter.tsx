import React from 'react';
import { PumpOSMark } from '@pump/ui';

/** Baked in by `vite.config.ts` from package.json; absent under tooling that skips `define`. */
declare const __APP_VERSION__: string | undefined;
const APP_VERSION: string | undefined =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined;

/**
 * A quiet "PumpOS · v1.0.0" line at the foot of an Account sheet. The mark is
 * decorative (the wordmark beside it already says the name); the version is
 * left out rather than faked when a build did not provide one.
 */
export const BrandFooter: React.FC = () => (
  <p className="m-0 flex items-center justify-center gap-1.5 px-4 pb-1 pt-4 text-[11px] text-text-muted">
    <PumpOSMark className="h-3.5" />
    <span>{APP_VERSION ? `PumpOS · v${APP_VERSION}` : 'PumpOS'}</span>
  </p>
);
