import {
  BusinessEvents,
  conflictError,
  err,
  eventFromContext,
  ok,
} from '../../../kernel/index.js';
import type {
  EventPublisher,
  ExecutionContext,
  Result,
  UseCase,
} from '../../../kernel/index.js';
import type { RegisterPaymentTerminalCommand } from './command.js';
import { validateRegisterPaymentTerminal } from './validator.js';
import type { PaymentTerminal, PaymentTerminalRepository } from './ports.js';

export interface RegisterPaymentTerminalDeps {
  repository: PaymentTerminalRepository;
  events: EventPublisher;
}

/** Register a new payment terminal (POS machine) for a station. */
export class RegisterPaymentTerminal
  implements UseCase<RegisterPaymentTerminalCommand, PaymentTerminal>
{
  constructor(private readonly deps: RegisterPaymentTerminalDeps) {}

  async execute(
    input: RegisterPaymentTerminalCommand,
    ctx: ExecutionContext,
  ): Promise<Result<PaymentTerminal>> {
    const validated = validateRegisterPaymentTerminal(input);
    if (!validated.success) return validated;
    const cmd = validated.data;

    if (
      await this.deps.repository.existsByLabel(
        ctx.organizationId,
        cmd.stationId,
        cmd.label,
      )
    ) {
      return err(
        conflictError(`A terminal labelled "${cmd.label}" already exists for this station`, {
          label: cmd.label,
          stationId: cmd.stationId,
        }),
      );
    }

    const now = ctx.clock.now().toISOString();
    const terminal: PaymentTerminal = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: cmd.stationId,
      label: cmd.label,
      provider: cmd.provider ?? null,
      terminalCode: cmd.terminalCode ?? null,
      supportsCard: cmd.supportsCard ?? true,
      supportsUpi: cmd.supportsUpi ?? true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.repository.save(terminal);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.PAYMENT_TERMINAL_REGISTERED,
        aggregateType: 'PaymentTerminal',
        aggregateId: terminal.id,
        stationId: terminal.stationId,
        payload: {
          paymentTerminalId: terminal.id,
          stationId: terminal.stationId,
          label: terminal.label,
        },
      }),
    ]);

    return ok(terminal);
  }
}
