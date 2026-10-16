import { z } from 'zod';
import { err, ok, validationError } from '../../../kernel/index.js';
import type {
  CoreError,
  DomainEvent,
  EventPublisher,
  ExecutionContext,
  Result,
  UseCase,
} from '../../../kernel/index.js';
import type { TankRepository } from '../tanks/index.js';
import {
  checkNozzleSource,
  newNozzle,
  nozzleCreateSchema,
  type Nozzle,
  type NozzleProductLookup,
  type NozzleRepository,
} from '../nozzles/index.js';
import {
  dispenserCreateSchema,
  newDispenser,
  type CreateDispenserCommand,
  type DispenserRepository,
  type DispenserUnit,
} from './index.js';

/** A nozzle of a dispenser being created: its station and dispenser come from the dispenser. */
export interface DispenserNozzleInput {
  tankId: string;
  productId: string;
  name: string;
  currentReading?: number | string;
}

export interface CreateDispenserWithNozzlesCommand extends CreateDispenserCommand {
  nozzles: DispenserNozzleInput[];
}

export interface DispenserWithNozzles {
  dispenser: DispenserUnit;
  nozzles: Nozzle[];
}

/** More than any real island carries; bounds the work one request can ask for. */
export const MAX_NOZZLES_PER_DISPENSER = 32;

const commandSchema = dispenserCreateSchema.extend({
  nozzles: z
    .array(nozzleCreateSchema.omit({ stationId: true, duId: true }))
    .max(MAX_NOZZLES_PER_DISPENSER),
});

export interface DispenserWithNozzlesDeps {
  dispensers: DispenserRepository;
  nozzles: NozzleRepository;
  tanks: TankRepository;
  products: NozzleProductLookup;
  events: EventPublisher;
}

/** Name the failing nozzle without changing the message the operator already knows. */
function forNozzle(error: CoreError, nozzleIndex: number): CoreError {
  return { ...error, details: { ...error.details, nozzleIndex } };
}

/**
 * Create a Dispenser and its Nozzles as one command (#591).
 *
 * All or nothing: every nozzle is checked against its Product and Tank before anything is
 * written, so a refused nozzle leaves no dispenser behind. Run inside one
 * transaction, a retry under the same Idempotency-Key can neither leave a
 * dispenser without nozzles nor create a second one. Emits DISPENSER_CREATED
 * and one NOZZLE_CREATED per nozzle in a single publish.
 */
export class CreateDispenserWithNozzles implements UseCase<
  CreateDispenserWithNozzlesCommand,
  DispenserWithNozzles
> {
  constructor(private readonly deps: DispenserWithNozzlesDeps) {}

  async execute(
    input: CreateDispenserWithNozzlesCommand,
    ctx: ExecutionContext,
  ): Promise<Result<DispenserWithNozzles>> {
    const p = commandSchema.safeParse(input);
    if (!p.success)
      return err(
        validationError('Invalid CreateDispenserWithNozzles command', {
          issues: p.error.flatten(),
        }),
      );
    const { nozzles: nozzleInputs, ...dispenserInput } = p.data;

    for (const [idx, n] of nozzleInputs.entries()) {
      const check = await checkNozzleSource(
        this.deps,
        { stationId: dispenserInput.stationId, tankId: n.tankId, productId: n.productId },
        ctx,
      );
      if (!check.success) return err(forNozzle(check.error, idx));
    }

    const created = newDispenser(dispenserInput, ctx);
    const nozzles = nozzleInputs.map((n) =>
      newNozzle({ ...n, stationId: dispenserInput.stationId, duId: created.dispenser.id }, ctx),
    );

    await this.deps.dispensers.save(created.dispenser);
    for (const n of nozzles) await this.deps.nozzles.save(n.nozzle);
    const events: DomainEvent[] = [created.event, ...nozzles.map((n) => n.event)];
    await this.deps.events.publish(events);

    return ok({ dispenser: created.dispenser, nozzles: nozzles.map((n) => n.nozzle) });
  }
}
