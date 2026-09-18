import type { CSSProperties } from 'react';

/**
 * How the brand lockup is set at the top of an auth screen.
 *
 * The lockup itself sets neither color nor size — it inherits both — so this is
 * where the auth screens say what "brand header" means for them. Shared because
 * sign-in and invite-acceptance are the same screen wearing different words,
 * and a lockup that differed between them would just look like a bug.
 */
export const authBrandHeaderStyle: CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  color: 'var(--brand-primary)',
  letterSpacing: '-0.01em',
};
