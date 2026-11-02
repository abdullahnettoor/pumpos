import { z } from 'zod';
import { DEFAULT_HEAD_NATURE, HEAD_NATURES } from '@pump/shared';
import type { HeadNature } from '@pump/shared';
import {
  BusinessEvents,
  ErrorCodes,
  conflictError,
  coreError,
  err,
  eventFromContext,
  ok,
  validationError,
} from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';

/**
 * An expense head or an income head (the tables are `expense_categories` and
 * `income_categories`). Its Type (`nature`, Direct / Indirect) is read live by
 * reports; it is never copied onto an entry.
 */
export type HeadKind = 'expense' | 'income';

export interface Head {
  id: string;
  organizationId: string;
  name: string;
  nature: HeadNature;
  isSystem: boolean;
  /** Income heads only: GST treatment. */
  taxConfig?: Record<string, unknown> | null;
  /** Income heads only. */
  isActive?: boolean;
}

/** One repository per kind; the use-cases only differ by event type and income-only fields. */
export interface HeadRepository {
  findById(id: string): Promise<Head | null>;
  existsByName(organizationId: string, name: string, excludeId?: string): Promise<boolean>;
  save(head: Head): Promise<void>;
}

export interface HeadDeps {
  heads: HeadRepository;
  events: EventPublisher;
}

const MAX_NAME = 100;

const nameSchema = z
  .string({ message: 'Category name is required' })
  .trim()
  .min(1, 'Category name is required')
  .max(MAX_NAME, `Category name is too long (max ${MAX_NAME})`);

const natureSchema = z.enum(HEAD_NATURES, { message: 'Type must be DIRECT or INDIRECT' });

const createSchema = z.object({
  name: nameSchema,
  nature: natureSchema.optional(),
  taxConfig: z.record(z.string(), z.unknown()).nullable().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: nameSchema.optional(),
  nature: natureSchema.optional(),
  taxConfig: z.record(z.string(), z.unknown()).nullable().optional(),
  isActive: z.boolean().optional(),
});

/** `nature` is widened to string: the use-case validates it and refuses an unknown value. */
export type CreateHeadCommand = Omit<z.input<typeof createSchema>, 'nature'> & { nature?: string };
export type UpdateHeadCommand = Omit<z.input<typeof updateSchema>, 'nature'> & { nature?: string };

const EVENTS = {
  expense: {
    created: BusinessEvents.EXPENSE_CATEGORY_CREATED,
    updated: BusinessEvents.EXPENSE_CATEGORY_UPDATED,
    aggregateType: 'ExpenseCategory',
  },
  income: {
    created: BusinessEvents.INCOME_CATEGORY_CREATED,
    updated: BusinessEvents.INCOME_CATEGORY_UPDATED,
    aggregateType: 'IncomeCategory',
  },
} as const;

const duplicateName = () => conflictError('A category with this name already exists');

function invalid(command: string, error: z.ZodError): Result<never> {
  const first = error.issues[0]?.message ?? `Invalid ${command} command`;
  return err(validationError(first, { issues: error.flatten() }));
}

/** Add a custom head. The Type defaults to Indirect. Run inside runInTransaction. */
export class CreateHead implements UseCase<CreateHeadCommand, Head> {
  constructor(
    private readonly kind: HeadKind,
    private readonly deps: HeadDeps,
  ) {}

  async execute(input: CreateHeadCommand, ctx: ExecutionContext): Promise<Result<Head>> {
    const p = createSchema.safeParse(input);
    if (!p.success) return invalid('CreateHead', p.error);
    const cmd = p.data;

    if (await this.deps.heads.existsByName(ctx.organizationId, cmd.name))
      return err(duplicateName());

    const head: Head = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      name: cmd.name,
      nature: cmd.nature ?? DEFAULT_HEAD_NATURE,
      isSystem: false,
      ...(this.kind === 'income' ? { taxConfig: cmd.taxConfig ?? null, isActive: true } : {}),
    };
    await this.deps.heads.save(head);

    const events = EVENTS[this.kind];
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: events.created,
        aggregateType: events.aggregateType,
        aggregateId: head.id,
        payload: { categoryId: head.id, kind: this.kind, name: head.name, nature: head.nature },
      }),
    ]);
    return ok(head);
  }
}

/** Rename a head, change its Type, or (income) its tax / active flag. Run inside runInTransaction. */
export class UpdateHead implements UseCase<UpdateHeadCommand, Head> {
  constructor(
    private readonly kind: HeadKind,
    private readonly deps: HeadDeps,
  ) {}

  async execute(input: UpdateHeadCommand, ctx: ExecutionContext): Promise<Result<Head>> {
    const p = updateSchema.safeParse(input);
    if (!p.success) return invalid('UpdateHead', p.error);
    const cmd = p.data;
    const income = this.kind === 'income';
    const touched =
      cmd.name !== undefined ||
      cmd.nature !== undefined ||
      (income && (cmd.taxConfig !== undefined || cmd.isActive !== undefined));
    if (!touched) return err(validationError('Nothing to update'));

    const existing = await this.deps.heads.findById(cmd.id);
    if (!existing || existing.organizationId !== ctx.organizationId) {
      return err(coreError(ErrorCodes.NOT_FOUND, 'Category not found', { id: cmd.id }));
    }
    if (
      cmd.name !== undefined &&
      (await this.deps.heads.existsByName(ctx.organizationId, cmd.name, existing.id))
    ) {
      return err(duplicateName());
    }

    const updated: Head = {
      ...existing,
      name: cmd.name ?? existing.name,
      nature: cmd.nature ?? existing.nature,
      ...(income
        ? {
            taxConfig: cmd.taxConfig !== undefined ? cmd.taxConfig : existing.taxConfig,
            isActive: cmd.isActive ?? existing.isActive,
          }
        : {}),
    };
    await this.deps.heads.save(updated);

    const events = EVENTS[this.kind];
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: events.updated,
        aggregateType: events.aggregateType,
        aggregateId: updated.id,
        payload: {
          categoryId: updated.id,
          kind: this.kind,
          name: updated.name,
          nature: { before: existing.nature, after: updated.nature },
        },
      }),
    ]);
    return ok(updated);
  }
}
