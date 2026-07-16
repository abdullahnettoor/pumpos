import React, { forwardRef, type SelectHTMLAttributes } from 'react';
import { type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';
import { ChevronDown } from 'lucide-react';
import { inputVariants, type InputSize } from './Input.js';

/**
 * Select — canonical pump-ds native `<select>`. Shares the Input token surface
 * and focus contract, with a custom chevron (native arrow suppressed via
 * `appearance-none`). Keep it native for accessibility + mobile pickers.
 */

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    Omit<VariantProps<typeof inputVariants>, 'invalid'> {
  invalid?: boolean;
}

const RIGHT_PAD: Record<InputSize, { cls: string; pos: string }> = {
  sm: { cls: 'pr-7', pos: '8px' },
  md: { cls: 'pr-8', pos: '10px' },
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, inputSize = 'md', invalid = false, children, style, ...rest },
  ref,
) {
  const pad = RIGHT_PAD[inputSize ?? 'md'];
  return (
    <div style={{ position: 'relative', ...style }}>
      <select
        ref={ref}
        className={cn(inputVariants({ inputSize, invalid }), 'appearance-none cursor-pointer', pad.cls, className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={inputSize === 'sm' ? 14 : 16}
        style={{ position: 'absolute', right: pad.pos, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
        aria-hidden="true"
      />
    </div>
  );
});
