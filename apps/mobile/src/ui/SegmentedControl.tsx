import { SegmentedControl as DsSegmentedControl } from '@pump/ui';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for assistive tech ("Period"). */
  label: string;
  /** `vertical` stacks the options as full-width rows (a short list of presets). */
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

/**
 * Full-width pill toggle (Last 7 / 30 days, Customers / Suppliers): the design
 * system's `SegmentedControl` (a radiogroup), stretched to the row with a brand-filled
 * selection and a thumb-sized height. `w-auto` (not the design system's `w-full`) so the
 * default `mx-3` insets it instead of pushing it 12px past the right edge.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  orientation = 'horizontal',
  className = 'mx-3 w-auto',
}: Props<T>) {
  return (
    <DsSegmentedControl
      aria-label={label}
      options={options}
      value={value}
      onChange={onChange}
      stretch
      activeStyle="brand"
      orientation={orientation}
      className={`${orientation === 'vertical' ? '' : 'h-10 '}${className}`}
    />
  );
}
