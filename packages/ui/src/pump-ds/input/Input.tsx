import React, { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';
import { Search, X } from 'lucide-react';

/**
 * Input / SearchInput — canonical pump-ds text controls. Same token surface and
 * focus contract as Button (border-strong → brand focus ring, invalid state,
 * disabled). Sizes: sm (28px, toolbars/filter bars) · md (36px, forms).
 * `leftIcon` / `rightIcon` inset affordances; SearchInput wires a search glyph
 * plus an optional clear button.
 */

export type InputSize = 'sm' | 'md';

export const inputVariants = cva(
  [
    'w-full rounded-[var(--radius-input)] border bg-surface text-ink-strong font-sans',
    'transition-colors placeholder:text-ink-faint',
    'focus:outline-none focus:border-brand focus:ring-2 focus:ring-[color-mix(in_oklab,var(--color-brand)_18%,transparent)]',
    'disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed',
  ].join(' '),
  {
    variants: {
      inputSize: {
        sm: 'h-7 px-2.5 text-[12px]',
        md: 'h-9 px-3 text-[13px]',
      },
      invalid: {
        true: 'border-danger-fg focus:border-danger-fg focus:ring-[color-mix(in_oklab,var(--color-danger-fg)_18%,transparent)]',
        false: 'border-border-strong',
      },
    },
    defaultVariants: { inputSize: 'md', invalid: false },
  },
);

const ICON_PAD: Record<InputSize, { left: string; right: string; pos: string }> = {
  sm: { left: 'pl-7', right: 'pr-7', pos: '8px' },
  md: { left: 'pl-9', right: 'pr-9', pos: '10px' },
};

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    Omit<VariantProps<typeof inputVariants>, 'invalid'> {
  invalid?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, inputSize = 'md', invalid = false, leftIcon, rightIcon, ...rest },
  ref,
) {
  const pad = ICON_PAD[inputSize ?? 'md'];
  const iconStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', [side]: pad.pos, top: '50%', transform: 'translateY(-50%)',
    color: 'var(--text-muted)', display: 'inline-flex', pointerEvents: 'none',
  });
  const field = (
    <input
      ref={ref}
      className={cn(inputVariants({ inputSize, invalid }), leftIcon && pad.left, rightIcon && pad.right, className)}
      {...rest}
    />
  );
  if (!leftIcon && !rightIcon) return field;
  return (
    <div style={{ position: 'relative' }}>
      {leftIcon && <span style={iconStyle('left')} aria-hidden="true">{leftIcon}</span>}
      {field}
      {rightIcon && <span style={iconStyle('right')} aria-hidden="true">{rightIcon}</span>}
    </div>
  );
});

export interface SearchInputProps extends Omit<InputProps, 'leftIcon' | 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  /** Show a clear (×) button when there is text. Default true. */
  clearable?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, clearable = true, inputSize = 'md', placeholder = 'Search…', className, style, ...rest },
  ref,
) {
  const pad = ICON_PAD[inputSize ?? 'md'];
  const size = inputSize ?? 'md';
  return (
    <div style={{ position: 'relative', ...style }}>
      <Search size={size === 'sm' ? 13 : 15} style={{ position: 'absolute', left: pad.pos, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputVariants({ inputSize }), pad.left, value && clearable && pad.right, '[&::-webkit-search-cancel-button]:hidden', className)}
        {...rest}
      />
      {value && clearable && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          style={{ position: 'absolute', right: pad.pos, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'inline-flex', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
        >
          <X size={size === 'sm' ? 13 : 15} />
        </button>
      )}
    </div>
  );
});
