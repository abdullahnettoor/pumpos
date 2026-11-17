import { z } from 'zod';

type WithoutDefault<T> = T extends z.ZodDefault<infer Inner> ? Inner : T;

type PartialUpdateShape<Shape extends z.ZodRawShape> = {
  [K in keyof Shape]: z.ZodOptional<WithoutDefault<Shape[K]>>;
};

/**
 * Zod 3's `.partial()` for update payloads: every field optional, and a field
 * left out stays left out (#722).
 *
 * Zod 4's `.partial()` applies a field's `.default()` when the field is
 * missing, so an edit would write creation defaults over stored values (a
 * member's status back to ACTIVE, a station's grace minutes back to 15). This
 * drops each field's default before making it optional.
 */
export function partialUpdate<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
): z.ZodObject<PartialUpdateShape<Shape>> {
  const withoutDefaults = Object.fromEntries(
    Object.entries(schema.shape)
      .filter(([, field]) => field instanceof z.ZodDefault)
      .map(([key, field]) => [key, z.optional((field as z.ZodDefault).removeDefault())]),
  );
  return schema.partial().extend(withoutDefaults) as unknown as z.ZodObject<
    PartialUpdateShape<Shape>
  >;
}
