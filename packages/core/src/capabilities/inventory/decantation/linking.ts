import { z } from 'zod';
import { computeDecantationFlags, decantationFlagKey, type DecantationFlag } from '@pump/shared';
import {
  BusinessEvents,
  err,
  eventFromContext,
  invariantViolation,
  notFoundError,
  ok,
  relatedEventFromContext,
  validationError,
} from '../../../kernel/index.js';
import type {
  DomainEvent,
  EventPublisher,
  ExecutionContext,
  Result,
  UseCase,
} from '../../../kernel/index.js';
import type {
  Decantation,
  DecantationLinkRepository,
  DecantationLinkView,
  DecantationRepository,
  LinkableFuelPurchase,
  LinkablePurchaseRow,
} from './ports.js';

/** `{ productId, purchaseId }` pair accepted by the link command and RecordDecantation. */
export const decantationLinkSchema = z.object({
  productId: z.string().min(1),
  purchaseId: z.string().min(1),
});
export type DecantationLinkInput = z.infer<typeof decantationLinkSchema>;

/** Settles variance and cost of an invoice (implemented by DecantationMeasurementService). */
export interface InvoiceSettler {
  settleInvoice(
    ctx: ExecutionContext,
    input: { purchaseId: string; productId: string },
  ): Promise<void>;
}

/** Same defaults as RecordDecantation (kept here to avoid an import cycle). */
const DEFAULT_TOLERANCES = { densityToleranceKgM3: 3, settlingTimeMinutes: 30 } as const;

export interface DecantationLinkerDeps {
  links: DecantationLinkRepository;
  decantations: DecantationRepository;
  settler?: InvoiceSettler;
  settings?: { densityToleranceKgM3: number; settlingTimeMinutes: number };
}

/** A Decantation as read, with its per-product purchase links (D8). */
export type DecantationWithLinks = Decantation & {
  links: Omit<DecantationLinkView, 'decantationId'>[];
  /** Products with a Tank Line that have no linked Fuel Purchase yet. */
  unlinkedProductIds: string[];
};

export function withLinks(d: Decantation, views: DecantationLinkView[]): DecantationWithLinks {
  const links = views
    .filter((v) => v.decantationId === d.id)
    .map(({ decantationId: _omit, ...rest }) => rest);
  const linked = new Set(links.map((l) => l.productId));
  const unlinkedProductIds = [...new Set(d.lines.map((l) => l.productId))].filter(
    (p) => !linked.has(p),
  );
  return { ...d, links, unlinkedProductIds };
}

/** Quantity-weighted invoice density of a product's lines (only lines that carry one). */
export function purchaseDensity(p: LinkableFuelPurchase, productId: string): number | null {
  const lines = p.lines.filter((l) => l.productId === productId && l.invoiceDensity != null);
  const qty = lines.reduce((s, l) => s + l.quantity, 0);
  if (lines.length === 0) return null;
  if (qty <= 0) return lines[0].invoiceDensity;
  return (
    Math.round((lines.reduce((s, l) => s + l.quantity * l.invoiceDensity!, 0) / qty) * 100) / 100
  );
}

/**
 * Shared linking logic (#469, D5/D8): validation, upsert, density-flag recompute
 * and invoice settlement. One Fuel Purchase per product per Decantation; a
 * purchase may serve many Decantations. Never blocks on density.
 */
export class DecantationLinker {
  constructor(private readonly deps: DecantationLinkerDeps) {}

  listViews(ctx: ExecutionContext, decantationId: string): Promise<DecantationLinkView[]> {
    return this.deps.links.listViews(ctx.organizationId, [decantationId]);
  }

  removeLink(ctx: ExecutionContext, decantationId: string, productId: string): Promise<void> {
    return this.deps.links.remove(ctx.organizationId, decantationId, productId);
  }

  /** Validate a link against the Decantation's lines and the purchase. */
  async validate(
    ctx: ExecutionContext,
    d: { stationId: string; productIds: Set<string> },
    link: DecantationLinkInput,
  ): Promise<Result<LinkableFuelPurchase>> {
    if (!d.productIds.has(link.productId))
      return err(validationError('This Decantation has no tank line of that product'));
    const purchase = await this.deps.links.findFuelPurchase(ctx.organizationId, link.purchaseId);
    if (!purchase || purchase.stationId !== d.stationId)
      return err(notFoundError('Purchase', link.purchaseId));
    if (!purchase.isFuelPurchase)
      return err(validationError('Only a Fuel Purchase can be linked to a Decantation'));
    if (!purchase.lines.some((l) => l.productId === link.productId))
      return err(validationError('The purchase does not contain that product'));
    return ok(purchase);
  }

  /** Upsert one validated link. Returns the previous purchase id when it was replaced. */
  async apply(
    ctx: ExecutionContext,
    d: Decantation,
    link: DecantationLinkInput,
    existing: DecantationLinkView[],
  ): Promise<{ changed: boolean; previousPurchaseId: string | null }> {
    const prev = existing.find((v) => v.productId === link.productId);
    if (prev?.purchaseId === link.purchaseId) return { changed: false, previousPurchaseId: null };
    await this.deps.links.upsert({
      id: ctx.ids.newId(),
      organizationId: d.organizationId,
      stationId: d.stationId,
      decantationId: d.id,
      purchaseId: link.purchaseId,
      productId: link.productId,
    });
    return { changed: true, previousPurchaseId: prev?.purchaseId ?? null };
  }

  /**
   * Recompute DENSITY_OUT_OF_TOLERANCE from the current links' invoice density
   * (`fallback` fills products with no link). Mutates `d.flags`, persists when
   * changed and returns the newly appearing flags.
   */
  async recomputeDensityFlags(
    ctx: ExecutionContext,
    d: Decantation,
    fallback: Map<string, number> = new Map(),
    persist = true,
  ): Promise<DecantationFlag[]> {
    const views = await this.deps.links.listViews(ctx.organizationId, [d.id]);
    const density = new Map<string, number>(fallback);
    for (const v of views) if (v.invoiceDensity != null) density.set(v.productId, v.invoiceDensity);
    const settings = this.deps.settings ?? DEFAULT_TOLERANCES;
    const { flags: fresh } = computeDecantationFlags({
      lines: d.lines.map((l) => ({
        id: l.id,
        roDensity: l.roDensity,
        invoiceDensity: density.get(l.productId) ?? null,
      })),
      densityToleranceKgM3: settings.densityToleranceKgM3,
      settlingTimeMinutes: settings.settlingTimeMinutes,
    });
    const nextDensity = fresh.filter((f) => f.code === 'DENSITY_OUT_OF_TOLERANCE');
    const before = new Set(d.flags.map(decantationFlagKey));
    const kept = d.flags.filter((f) => f.code !== 'DENSITY_OUT_OF_TOLERANCE');
    const next = [...kept, ...nextDensity];
    const changed =
      next.length !== d.flags.length ||
      next.some((f) => !before.has(decantationFlagKey(f))) ||
      next.some((f, i) => f.message !== d.flags[i]?.message);
    d.flags = next;
    if (changed && persist) await this.deps.decantations.updateMeasurement(d);
    return nextDensity.filter((f) => !before.has(decantationFlagKey(f)));
  }

  async settle(ctx: ExecutionContext, purchaseId: string | null, productId: string): Promise<void> {
    if (purchaseId && this.deps.settler)
      await this.deps.settler.settleInvoice(ctx, { purchaseId, productId });
  }

  linkedEvent(
    ctx: ExecutionContext,
    d: Decantation,
    link: DecantationLinkInput,
    previousPurchaseId: string | null,
  ): DomainEvent {
    return eventFromContext(ctx, {
      eventType: BusinessEvents.DECANTATION_PURCHASE_LINKED,
      aggregateType: 'Decantation',
      aggregateId: d.id,
      stationId: d.stationId,
      businessDayId: d.businessDayId,
      payload: {
        decantationId: d.id,
        documentNumber: d.documentNumber,
        productId: link.productId,
        purchaseId: link.purchaseId,
        previousPurchaseId,
      },
    });
  }

  flaggedEvent(ctx: ExecutionContext, d: Decantation, flags: DecantationFlag[]): DomainEvent {
    return relatedEventFromContext(ctx, {
      eventType: BusinessEvents.DECANTATION_FLAGGED,
      aggregateType: 'Decantation',
      aggregateId: d.id,
      stationId: d.stationId,
      businessDayId: d.businessDayId,
      payload: { decantationId: d.id, reasons: flags },
    });
  }
}

export interface LinkDecantationPurchaseDeps extends DecantationLinkerDeps {
  events: EventPublisher;
}

export const linkDecantationPurchaseSchema = decantationLinkSchema.extend({
  decantationId: z.string().min(1),
});
export type LinkDecantationPurchaseCommand = z.input<typeof linkDecantationPurchaseSchema>;

/** Link (or replace) the Fuel Purchase of one product on a Decantation. */
export class LinkDecantationPurchase implements UseCase<
  LinkDecantationPurchaseCommand,
  DecantationWithLinks
> {
  private readonly linker: DecantationLinker;
  constructor(private readonly deps: LinkDecantationPurchaseDeps) {
    this.linker = new DecantationLinker(deps);
  }

  async execute(
    input: LinkDecantationPurchaseCommand,
    ctx: ExecutionContext,
  ): Promise<Result<DecantationWithLinks>> {
    const p = linkDecantationPurchaseSchema.safeParse(input);
    if (!p.success)
      return err(
        validationError('Invalid LinkDecantationPurchase command', { issues: p.error.flatten() }),
      );
    const { decantationId, ...link } = p.data;
    const d = await this.deps.decantations.findById(ctx.organizationId, decantationId);
    if (!d || (ctx.stationId && d.stationId !== ctx.stationId))
      return err(notFoundError('Decantation', decantationId));
    const valid = await this.linker.validate(
      ctx,
      { stationId: d.stationId, productIds: new Set(d.lines.map((l) => l.productId)) },
      link,
    );
    if (!valid.success) return valid;

    const existing = await this.deps.links.listViews(ctx.organizationId, [d.id]);
    const applied = await this.linker.apply(ctx, d, link, existing);
    const events: DomainEvent[] = [];
    if (applied.changed) {
      const newFlags = await this.linker.recomputeDensityFlags(ctx, d);
      events.push(this.linker.linkedEvent(ctx, d, link, applied.previousPurchaseId));
      if (newFlags.length > 0) events.push(this.linker.flaggedEvent(ctx, d, newFlags));
      await this.linker.settle(ctx, link.purchaseId, link.productId);
      await this.linker.settle(ctx, applied.previousPurchaseId, link.productId);
      await this.deps.events.publish(events);
    }
    return ok(withLinks(d, await this.deps.links.listViews(ctx.organizationId, [d.id])));
  }
}

export const unlinkDecantationPurchaseSchema = z.object({
  decantationId: z.string().min(1),
  productId: z.string().min(1),
});
export type UnlinkDecantationPurchaseCommand = z.input<typeof unlinkDecantationPurchaseSchema>;

/** Remove the Fuel Purchase link of one product. */
export class UnlinkDecantationPurchase implements UseCase<
  UnlinkDecantationPurchaseCommand,
  DecantationWithLinks
> {
  private readonly linker: DecantationLinker;
  constructor(private readonly deps: LinkDecantationPurchaseDeps) {
    this.linker = new DecantationLinker(deps);
  }

  async execute(
    input: UnlinkDecantationPurchaseCommand,
    ctx: ExecutionContext,
  ): Promise<Result<DecantationWithLinks>> {
    const p = unlinkDecantationPurchaseSchema.safeParse(input);
    if (!p.success)
      return err(
        validationError('Invalid UnlinkDecantationPurchase command', { issues: p.error.flatten() }),
      );
    const d = await this.deps.decantations.findById(ctx.organizationId, p.data.decantationId);
    if (!d || (ctx.stationId && d.stationId !== ctx.stationId))
      return err(notFoundError('Decantation', p.data.decantationId));
    const existing = await this.deps.links.listViews(ctx.organizationId, [d.id]);
    const prev = existing.find((v) => v.productId === p.data.productId);
    if (!prev)
      return err(
        invariantViolation('That product is not linked to a purchase on this Decantation'),
      );

    await this.deps.links.remove(ctx.organizationId, d.id, p.data.productId);
    // Flags of the Decantation are recomputed without the removed invoice density.
    await this.linker.recomputeDensityFlags(ctx, d);
    await this.linker.settle(ctx, prev.purchaseId, p.data.productId);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.DECANTATION_PURCHASE_UNLINKED,
        aggregateType: 'Decantation',
        aggregateId: d.id,
        stationId: d.stationId,
        businessDayId: d.businessDayId,
        payload: {
          decantationId: d.id,
          documentNumber: d.documentNumber,
          productId: p.data.productId,
          purchaseId: prev.purchaseId,
        },
      }),
    ]);
    return ok(withLinks(d, await this.deps.links.listViews(ctx.organizationId, [d.id])));
  }
}

export const listLinkablePurchasesSchema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  productId: z.string().min(1, 'productId is required'),
});
export type ListLinkablePurchasesCommand = z.input<typeof listLinkablePurchasesSchema>;

/** Fuel Purchases of a product at a station, for the link pickers (D8). */
export class ListLinkablePurchases implements UseCase<
  ListLinkablePurchasesCommand,
  LinkablePurchaseRow[]
> {
  constructor(private readonly deps: { links: DecantationLinkRepository }) {}

  async execute(
    input: ListLinkablePurchasesCommand,
    ctx: ExecutionContext,
  ): Promise<Result<LinkablePurchaseRow[]>> {
    const p = listLinkablePurchasesSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid query', { issues: p.error.flatten() }));
    return ok(
      await this.deps.links.listLinkable(ctx.organizationId, p.data.stationId, p.data.productId),
    );
  }
}
