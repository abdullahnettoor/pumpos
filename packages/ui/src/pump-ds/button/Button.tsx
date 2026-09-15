import React, {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';
import { useOptionalToast } from '../../components/primitives/ToastProvider.js';

/**
 * Button — the single canonical action control for pump-ds. Replaces the
 * scattered `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-ghost`
 * classes with one CVA source of truth.
 *
 * Contract (every pump-ds interactive primitive honors this):
 *   default · hover · active · focus-visible · disabled · loading.
 *
 * Sizes mirror the legacy button scale (sm 32 · md 36 · lg 40) plus an `xs`
 * (28px) for toolbars/filter bars. `iconOnly` renders a square button.
 * `loading` swaps in a spinner, keeps the label width stable, and blocks
 * interaction without collapsing layout.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
    'font-sans font-semibold rounded-button select-none',
    'transition-colors duration-100',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    'disabled:cursor-not-allowed disabled:opacity-50',
    // Normalize nested icon sizing.
    '[&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      size: {
        xs: 'h-7 px-2.5 text-[12px] [&_svg]:size-3.5',
        sm: 'h-8 px-3 text-[12px] [&_svg]:size-4',
        md: 'h-9 px-4 text-[13px] [&_svg]:size-4',
        lg: 'h-10 px-5 text-[14px] [&_svg]:size-[18px]',
      },
      variant: {
        primary:
          'bg-brand text-white border border-transparent hover:bg-[color-mix(in_oklab,var(--color-brand)_88%,black)] active:bg-[color-mix(in_oklab,var(--color-brand)_78%,black)]',
        secondary:
          'bg-surface text-ink-strong border border-border-strong hover:bg-surface-alt active:bg-surface-alt',
        outline:
          'bg-transparent text-brand border border-brand hover:bg-brand/10 active:bg-brand/15',
        ghost:
          'bg-transparent text-ink-default border border-transparent hover:bg-surface-alt active:bg-surface-alt',
        danger:
          'bg-danger-fg text-white border border-transparent hover:bg-[color-mix(in_oklab,var(--color-danger-fg)_88%,black)] active:bg-[color-mix(in_oklab,var(--color-danger-fg)_78%,black)]',
      },
      iconOnly: {
        true: 'px-0 aspect-square',
        false: '',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    compoundVariants: [
      // Square icon-only sizes: width tracks height.
      { iconOnly: true, size: 'xs', className: 'w-7' },
      { iconOnly: true, size: 'sm', className: 'w-8' },
      { iconOnly: true, size: 'md', className: 'w-9' },
      { iconOnly: true, size: 'lg', className: 'w-10' },
    ],
    defaultVariants: {
      size: 'md',
      variant: 'primary',
      iconOnly: false,
      fullWidth: false,
    },
  },
);

const Spinner = ({ className }: { className?: string }) => (
  <svg
    className={cn('motion-safe:animate-spin', className)}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export interface ButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick'>,
    Omit<VariantProps<typeof buttonVariants>, 'iconOnly' | 'fullWidth'> {
  /**
   * May be async. When it returns a promise the button shows its spinner and
   * blocks further clicks until that promise settles, so the control stops
   * claiming the work is finished the instant it was started.
   */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
  /**
   * Called when an async `onClick` rejects. Defaults to logging and raising a
   * generic toast — handlers that can say something useful to the operator
   * should catch inside `onClick` instead.
   */
  onClickError?: (error: unknown) => void;
  /** Leading icon (lucide element). Ignored when `iconOnly` provides the icon via children. */
  leftIcon?: ReactNode;
  /** Trailing icon (lucide element). */
  rightIcon?: ReactNode;
  /** Square button with a single icon as children. */
  iconOnly?: boolean;
  /** Stretch to the container width. */
  fullWidth?: boolean;
  /** Show a spinner, block clicks, and keep width stable. */
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    iconOnly = false,
    fullWidth = false,
    loading = false,
    leftIcon,
    rightIcon,
    disabled,
    children,
    type = 'button',
    onClick,
    onClickError,
    ...rest
  },
  ref,
) {
  const toast = useOptionalToast();
  // A click can outlive the button: submitting a drawer form usually closes it.
  // Track mounted state so settling never writes to an unmounted component.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [running, setRunning] = useState(false);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const result = onClick?.(event);
      if (!(result instanceof Promise)) return;
      setRunning(true);
      result
        .catch((error: unknown) => {
          if (onClickError) {
            onClickError(error);
            return;
          }
          console.error('Button action failed:', error);
          toast?.error('That action could not be completed.');
        })
        .finally(() => {
          if (mounted.current) setRunning(false);
        });
    },
    [onClick, onClickError, toast],
  );

  const isBusy = loading || running;
  const isDisabled = disabled || isBusy;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isBusy || undefined}
      onClick={handleClick}
      className={cn(buttonVariants({ variant, size, iconOnly, fullWidth }), className)}
      {...rest}
    >
      {isBusy && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Spinner className={size === 'lg' ? 'size-[18px]' : 'size-4'} />
        </span>
      )}
      <span className={cn('inline-flex items-center gap-1.5', isBusy && 'invisible')}>
        {leftIcon && (
          <span className="inline-flex" aria-hidden="true">
            {leftIcon}
          </span>
        )}
        {children}
        {rightIcon && (
          <span className="inline-flex" aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </span>
    </button>
  );
});
