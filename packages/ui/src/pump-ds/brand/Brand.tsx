import { forwardRef, type HTMLAttributes, type SVGAttributes } from 'react';
import { cn } from '../lib/cn.js';

/**
 * The PumpOS mark: a `P` with a fuel nozzle knocked out of it.
 *
 * Kept as an inline component rather than an imported `.svg` because this
 * package is compiled by `tsc` alone — there is no bundler to turn an asset
 * into a module, and a non-TS file under `src/` is never emitted to `dist/`.
 *
 * The geometry is the canonical artwork in `brand/pumpos-mark.svg`, which
 * `npm run brand` fans out to each app's `public/` for URL-addressed uses like
 * favicons. A test holds the two in sync — change one, change both.
 */
export const MARK_VIEWBOX = '0 0 676.7 762.3';
export const MARK_PATH =
  'M248.9 562.4C244.7 562.4 240.7 561.2 237.2 558.8L237.1 558.7C220 547.2 209.1 538.3 202.9 530.7C197 523.5 191.3 513.6 188.6 505.7C184 492.1 184.3 472.4 189.5 457.1C191.2 451.6 195.6 441.8 197.9 437.9C199.6 434.9 199.7 434.9 201.8 436.3C204.5 438 203.2 439.1 214 425.9C218.2 420.6 222.4 416.4 223.1 416.4C224.9 416.4 227.2 417.8 259.4 437.9C274.3 447.1 288.6 455.8 291.2 457.2C296.7 459.9 302.7 460.4 307.5 458.4C313.5 455.9 314.8 454.2 349.5 402.3C387.8 345.4 394.1 335 397.5 324.7C399.8 317.7 399 302.3 395 279.2C390 251.3 390 252.2 402 236.9C406.1 231.8 409.5 227 409.5 226.3C409.5 225.7 408.6 224.6 407.5 223.9C406.4 223.1 405.9 222.2 406.3 221.5C407.1 220.2 432.5 198.4 445.2 188.1C459.1 176.8 456 178 509.6 165.7C542 158.4 540.1 158.9 540.1 157.6C540.1 157 538.5 148.9 536.4 139.6C533.9 128.1 532.3 122.6 531.6 122.6C529.8 122.6 459.4 138.3 451.8 140.4C438.4 144 431.3 148 406.1 166.1C397.2 172.5 387.1 179.7 383.7 182.1L377.5 186.5L374 182.3C372 180 370 178.2 369.5 178.2C369 178.2 361.4 182.4 352.6 187.6C332.7 199.5 332.2 199.6 312.7 194C297.5 189.6 292.6 189.6 284.9 193.7C278.5 197 221.9 253.7 219 259.5C215.2 267.2 216.7 271.7 225.8 281.7C230.1 286.3 232.1 289.3 232.1 290.8C232.1 293.6 230.6 296.2 212.3 324.6C186.1 365.7 173.4 385.7 167.4 395.8C154.6 417.4 146.4 436.3 142.4 453.5C139.4 466 138.6 488.1 140.6 499.8C146.3 532.4 165.6 559.3 198.7 581.1C200.3 582.2 213.8 594.7 213.8 594.7C213.8 594.8 213.9 594.8 213.9 594.9C214.8 595.6 219.2 599.7 223.9 609.5C224.9 611.4 225.6 613.6 225.9 615.7C228.2 630 228 652.8 225.5 665.2C218.8 698.3 199.9 726.4 172.4 744.4C159.6 752.8 145.5 758.1 129.3 760.9L129.3 760.9C122.7 762 111.6 762.3 63.3 762.3L5.1 762.3L-0 762.3L0 757.2L0 435.2C0 78.2 -0.4 106.4 5.7 87.6C22.2 37.9 62.9 6.6 118.7 0.8C125.8 0.1 167.3 -0.1 270 0.1C425.9 0.5 417.5 0.2 447 6.1C506.9 18 558.3 46.1 600.5 90.1C643 134.4 668.4 188.7 675.6 250.5C677.3 266.6 676.9 307.4 674.7 322C667 372.4 649.5 413.5 618.6 453.6C609 466 583.1 492.5 572 501.1C536.1 529.1 495 548.1 452.7 556.6C427.5 561.6 431.7 562 347.5 562.4C316 562.5 268.7 562.5 248.9 562.4ZM303.9 421.5L303.9 421.5C301.3 424.7 300.3 425.2 297.6 425.1C293.1 425 292.9 424.9 274 413.1C247.2 396.3 244.5 394.4 244.5 393.1C244.5 391.5 243.8 392.5 277.6 344.6C289.2 328.1 300.1 313.1 301.9 311.2C304.6 308.3 305.6 307.9 309.1 307.9C312.6 307.9 314.2 308.6 321 313.1C334.6 322.4 348 332.9 350.1 336C353 340.3 352.9 348 349.9 353.9C345.9 361.9 310.8 413.5 303.9 421.5Z';

export interface PumpOSMarkProps extends SVGAttributes<SVGSVGElement> {}

export const PumpOSMark = forwardRef<SVGSVGElement, PumpOSMarkProps>(function PumpOSMark(
  { className, 'aria-label': ariaLabel, 'aria-hidden': ariaHidden, role, ...rest },
  ref,
) {
  // Same contract as pump-ds `Icon`: decorative unless given a label.
  const labelled = Boolean(ariaLabel);

  return (
    <svg
      ref={ref}
      viewBox={MARK_VIEWBOX}
      // `currentColor` is the whole point: the mark reads brand-green against
      // the app surface and white on a brand-colored one, with no variant. The
      // nozzle is knocked out by the even-odd rule rather than painted white,
      // so whatever sits behind the mark shows through it.
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      // Height tracks the surrounding font size so the mark sits on the text
      // it accompanies; pass a height class to size it independently.
      className={cn('h-[1em] w-auto shrink-0', className)}
      role={role ?? (labelled ? 'img' : undefined)}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden ?? (labelled ? undefined : true)}
      focusable="false"
      {...rest}
    >
      <path d={MARK_PATH} />
    </svg>
  );
});

export interface PumpOSLockupProps extends HTMLAttributes<HTMLSpanElement> {
  /** `horizontal` sets the wordmark beside the mark; `stacked` puts it below. */
  orientation?: 'horizontal' | 'stacked';
}

/**
 * The mark plus the PumpOS wordmark.
 *
 * Deliberately sets neither color nor font size: like the mark's
 * `currentColor`, the lockup inherits both from wherever it is placed, so the
 * topbar and the login screen each style it once and the mark follows.
 */
export const PumpOSLockup = forwardRef<HTMLSpanElement, PumpOSLockupProps>(function PumpOSLockup(
  { orientation = 'horizontal', className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex select-none items-center',
        orientation === 'stacked' ? 'flex-col gap-2' : 'gap-1.5',
        className,
      )}
      {...rest}
    >
      {/* The wordmark already reads "PumpOS", so the mark stays decorative
          rather than making a screen reader say the name twice.

          Sized above 1em on purpose: matched to the cap height the nozzle
          detail closes up into a blob, and it takes roughly 1.6em before the
          cutout reads at the topbar's 15px. Stacked, the mark leads. */}
      <PumpOSMark className={orientation === 'stacked' ? 'h-[2.5em]' : 'h-[1.6em]'} />
      <span>PumpOS</span>
    </span>
  );
});
