import { z } from 'zod';
import { err, ok, validationError } from '../../../kernel/index.js';
import type { Result } from '../../../kernel/index.js';
import type {
  RegisterPaymentTerminalCommand,
  UpdatePaymentTerminalCommand,
} from './command.js';

const registerSchema = z.object({
  stationId: z.string().uuid('stationId must be a valid id'),
  label: z.string().trim().min(1, 'label is required').max(100),
  provider: z.string().trim().max(100).nullish(),
  terminalCode: z.string().trim().max(100).nullish(),
  supportsCard: z.boolean().optional(),
  supportsUpi: z.boolean().optional(),
});

export function validateRegisterPaymentTerminal(
  input: unknown,
): Result<RegisterPaymentTerminalCommand> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      validationError('Invalid RegisterPaymentTerminal command', {
        issues: parsed.error.flatten(),
      }),
    );
  }
  return ok(parsed.data);
}

const updateSchema = z.object({
  id: z.string().min(1, 'id is required'),
  label: z.string().trim().min(1).max(100).optional(),
  provider: z.string().trim().max(100).nullish(),
  terminalCode: z.string().trim().max(100).nullish(),
  supportsCard: z.boolean().optional(),
  supportsUpi: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export function validateUpdatePaymentTerminal(
  input: unknown,
): Result<UpdatePaymentTerminalCommand> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      validationError('Invalid UpdatePaymentTerminal command', {
        issues: parsed.error.flatten(),
      }),
    );
  }
  return ok(parsed.data);
}
