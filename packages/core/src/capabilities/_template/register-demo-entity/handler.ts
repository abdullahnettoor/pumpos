import { conflictError, err, eventFromContext, ok } from '../../../kernel/index.js';
import type {
  EventPublisher,
  ExecutionContext,
  Result,
  UseCase,
} from '../../../kernel/index.js';
import type { RegisterDemoEntityCommand } from './command.js';
import { validateRegisterDemoEntity } from './validator.js';
import { DEMO_ENTITY_REGISTERED } from './events.js';
import type { DemoEntity, DemoEntityRepository } from './ports.js';

export interface RegisterDemoEntityDeps {
  repository: DemoEntityRepository;
  events: EventPublisher;
}

/**
 * Reference use-case showing the canonical slice shape:
 *   validate -> enforce invariants -> persist -> emit events -> return Result.
 *
 * Copy this folder structure for real capabilities. This `_template` folder is
 * illustrative and is excluded from the public package surface.
 */
export class RegisterDemoEntity
  implements UseCase<RegisterDemoEntityCommand, DemoEntity>
{
  constructor(private readonly deps: RegisterDemoEntityDeps) {}

  async execute(
    input: RegisterDemoEntityCommand,
    ctx: ExecutionContext,
  ): Promise<Result<DemoEntity>> {
    const validated = validateRegisterDemoEntity(input);
    if (!validated.success) return validated;
    const { name } = validated.data;

    if (await this.deps.repository.existsByName(ctx.organizationId, name)) {
      return err(
        conflictError(`A demo entity named "${name}" already exists`, { name }),
      );
    }

    const entity: DemoEntity = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      name,
      createdAt: ctx.clock.now().toISOString(),
    };

    await this.deps.repository.save(entity);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: DEMO_ENTITY_REGISTERED,
        aggregateType: 'DemoEntity',
        aggregateId: entity.id,
        payload: { demoEntityId: entity.id, name: entity.name },
      }),
    ]);

    return ok(entity);
  }
}
