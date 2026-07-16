import {
  BusinessEvents,
  conflictError,
  err,
  eventFromContext,
  forbiddenError,
  notFoundError,
  ok,
} from '../../../kernel/index.js';
import type {
  EventPublisher,
  ExecutionContext,
  Result,
  UseCase,
} from '../../../kernel/index.js';
import type { UpdatePaymentTerminalCommand } from './command.js';
import { validateUpdatePaymentTerminal } from './validator.js';
import type { PaymentTerminal, PaymentTerminalRepository } from './ports.js';

export interface UpdatePaymentTerminalDeps {
  repository: PaymentTerminalRepository;
  events: EventPublisher;
}

/** Update a payment terminal's details or active state. */
export class UpdatePaymentTerminal
  implements UseCase<UpdatePaymentTerminalCommand, PaymentTerminal>
{
  constructor(private readonly deps: UpdatePaymentTerminalDeps) {}

  async execute(
    input: UpdatePaymentTerminalCommand,
    ctx: ExecutionContext,
  ): Promise<Result<PaymentTerminal>> {
    const validated = validateUpdatePaymentTerminal(input);
    if (!validated.success) return validated;
    const cmd = validated.data;

    const existing = await this.deps.repository.findById(cmd.id);
    if (!existing) return err(notFoundError('PaymentTerminal', cmd.id));
    if (existing.organizationId !== ctx.organizationId) {
      return err(forbiddenError('Terminal belongs to another organization'));
    }

    if (
      cmd.label !== undefined &&
      cmd.label !== existing.label &&
      (await this.deps.repository.existsByLabel(
        ctx.organizationId,
        existing.stationId,
        cmd.label,
        existing.id,
      ))
    ) {
      return err(
        conflictError(`A terminal labelled "${cmd.label}" already exists for this station`, {
          label: cmd.label,
        }),
      );
    }

    const changes: Record<string, unknown> = {};
    const updated: PaymentTerminal = { ...existing };
    for (const key of ['label', 'provider', 'terminalCode', 'supportsCard', 'supportsUpi', 'isActive'] as const) {
      const value = cmd[key];
      if (value !== undefined) {
        (updated as unknown as Record<string, unknown>)[key] = value;
        changes[key] = value;
      }
    }
    updated.updatedAt = ctx.clock.now().toISOString();

    await this.deps.repository.save(updated);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.PAYMENT_TERMINAL_UPDATED,
        aggregateType: 'PaymentTerminal',
        aggregateId: updated.id,
        stationId: updated.stationId,
        payload: { paymentTerminalId: updated.id, changes },
      }),
    ]);

    return ok(updated);
  }
}
