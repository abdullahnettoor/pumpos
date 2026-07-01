import { useForm, type UseFormProps, type UseFormReturn, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodType } from 'zod';

/**
 * Standardized React Hook Form setup for the app: wires the Zod resolver and
 * defaults validation to `onTouched` (validate a field on blur, then live) so
 * users get inline feedback as they fill a form instead of only on submit.
 *
 * Usage:
 *   const { register, handleSubmit, formState: { errors } } =
 *     useZodForm<MyValues>(mySchema, { defaultValues });
 *
 * Any `useForm` option can be overridden via the second argument (e.g. a
 * different `mode`).
 */
export function useZodForm<TValues extends FieldValues>(
  schema: ZodType<any, any, any>,
  options?: Omit<UseFormProps<TValues>, 'resolver'>,
): UseFormReturn<TValues> {
  return useForm<TValues>({
    mode: 'onTouched',
    // Zod input/output types diverge (defaults, coerce); the resolver reconciles
    // them at runtime, so the cast here is intentional and safe.
    resolver: zodResolver(schema) as never,
    ...options,
  });
}
