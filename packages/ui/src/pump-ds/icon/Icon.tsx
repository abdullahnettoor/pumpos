import React, { forwardRef, type SVGAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';
import { ICON_REGISTRY, type IconName } from './registry.js';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg';

const iconVariants = cva('shrink-0 inline-block align-middle transition-colors', {
  variants: {
    size: {
      xs: 'size-3.5', // 14px — table toolbars, chips, badges
      sm: 'size-4', // 16px — small buttons, search & input adornments
      md: 'size-[18px]', // 18px — standard buttons, form actions, navigation
      lg: 'size-5', // 20px — page headers, metric cards, drawers
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const ICON_PIXEL_SIZES: Record<IconSize, number> = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
};

const DEFAULT_STROKE_WIDTH: Record<IconSize, number> = {
  xs: 1.5,
  sm: 1.75,
  md: 2,
  lg: 2,
};

export interface IconProps
  extends Omit<SVGAttributes<SVGSVGElement>, 'size' | 'name'>, VariantProps<typeof iconVariants> {
  /** Name or domain alias of the icon from the canonical registry */
  name: IconName;
  /** Size token matching pump-ds scale (xs: 14px, sm: 16px, md: 18px, lg: 20px) */
  size?: IconSize;
  /** Stroke weight override. Defaults to scale token (1.5px to 2px). */
  strokeWidth?: number;
}

/**
 * Icon — canonical pump-ds iconography primitive.
 *
 * Backed by Lucide React and configured with the Calm Industrial Precision
 * stroke weights, size tokens, and accessibility contracts.
 */
export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  {
    name,
    size = 'md',
    strokeWidth,
    className,
    'aria-label': ariaLabel,
    'aria-hidden': ariaHidden,
    role,
    ...rest
  },
  ref,
) {
  const Component = ICON_REGISTRY[name];
  if (!Component) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Icon] Unknown icon name: "${name}"`);
    }
    return null;
  }

  const resolvedSize = size ?? 'md';
  const pixelSize = ICON_PIXEL_SIZES[resolvedSize];
  const resolvedStrokeWidth = strokeWidth ?? DEFAULT_STROKE_WIDTH[resolvedSize];

  const isLabeled = Boolean(ariaLabel);
  const resolvedRole = role ?? (isLabeled ? 'img' : undefined);
  const resolvedAriaHidden = ariaHidden !== undefined ? ariaHidden : isLabeled ? undefined : true;

  return (
    <Component
      ref={ref}
      size={pixelSize}
      strokeWidth={resolvedStrokeWidth}
      className={cn(iconVariants({ size: resolvedSize }), className)}
      role={resolvedRole}
      aria-label={ariaLabel}
      aria-hidden={resolvedAriaHidden}
      focusable="false"
      {...rest}
    />
  );
});
