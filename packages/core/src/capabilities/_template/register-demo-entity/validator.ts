import { z } from 'zod';
import { err, ok, validationError } from '../../../kernel/index.js';
import type { Result } from '../../../kernel/index.js';
import type { RegisterDemoEntityCommand } from './command.js';

const schema = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
});

/** Parse + normalize untrusted input into a valid command. */
export function validateRegisterDemoEntity(
  input: unknown,
): Result<RegisterDemoEntityCommand> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return err(
      validationError('Invalid RegisterDemoEntity command', {
        issues: parsed.error.flatten(),
      }),
    );
  }
  return ok(parsed.data);
}
