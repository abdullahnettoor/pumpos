import {
  BusinessEvents,
  err,
  eventFromContext,
  ok,
  relatedEventFromContext,
  validationError,
} from '../../../kernel/index.js';
import type {
  DomainEvent,
  EventPublisher,
  ExecutionContext,
  Result,
} from '../../../kernel/index.js';
import type { ProductRepository } from '../../station-setup/products/ports.js';
import type { StockMovement, StockMovementRepository } from '../ports.js';
import type {
  Decantation,
  DecantationPurchaseLink,
  DecantationPurchaseRepository,
  DecantationRepository,
  DecantationTankLine,
  TankSalesReader,
} from './ports.js';
import type { DecantationMeasurement } from './record-decantation.js';

/** Business Day the Decantation stock movement is booked on (the measuring write's day). */
export interface MeasurementAnchor {
  businessDayId: string;
  businessDate: string;
}

export interface TankDipMeasurementInput {
  stationId: string;
  tankId: string;
  /** Dipped litres. */
  dip: number;
  /** Instant of the dip. */
  dipAt: string;
  /** Stock variance / count id, stored as `measurement_ref_id`. */
  refId: string;
  anchor: MeasurementAnchor;
}

export interface TankDipMeasurementResult {
  measuredLines: number;
}

/** Seam used by RecordStockCount so a tank dip resolves pending lines first. */
export interface TankDipMeasurement {
  measureFromTankDip(
    ctx: ExecutionContext,
    input: TankDipMeasurementInput,
  ): Promise<Result<TankDipMeasurementResult>>;
}

export interface DecantationMeasurementDeps {
  decantations: DecantationRepository;
  links: DecantationPurchaseRepository;
  movements: StockMovementRepository;
  products: Pick<ProductRepository, 'findById' | 'updateCostBasis'>;
  sales: TankSalesReader;
  events: EventPublisher;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Start of the window a tank line has been receiving/selling since. */
const sinceOf = (d: Decantation, l: DecantationTankLine): string =>
  l.beforeDipAt ?? d.unloadStartedAt ?? d.createdAt;

/**
 * Measures Tank Lines and turns the measurement into stock, variance and cost
 * (ADR 0007, D3-D5). Used from the after-dip path (RecordDecantation) and the
 * tank-dip path (RecordStockCount). Always runs inside the caller's transaction
 * under the station inventory lock.
 *
 * - Received quantity is stock; the invoice quantity never enters stock.
 * - A line posts exactly one `Decantation` movement (idempotent: only PENDING
 *   lines are measured), anchored to the Business Day of the measuring write.
 * - Variance is per invoice and per product, shown never netted.
 */
export class DecantationMeasurementService implements DecantationMeasurement, TankDipMeasurement {
  constructor(private readonly deps: DecantationMeasurementDeps) {}

  /** AFTER_DIP: received = after − before + sales during (operator entered). */
  async measureLinesWithAfterDip(
    ctx: ExecutionContext,
    decantation: Decantation,
    anchor: MeasurementAnchor,
  ): Promise<Result<Decantation>> {
    const events: DomainEvent[] = [];
    const measuredNow: DecantationTankLine[] = [];
    const movements: StockMovement[] = [];
    for (const line of decantation.lines) {
      if (line.status !== 'PENDING_MEASUREMENT' || line.afterDip == null) continue;
      const received = round3(line.afterDip - line.beforeDip + line.salesDuring);
      // Never block the save: an inconsistent after dip leaves the line pending,
      // and the next routine Tank Dip measures it instead.
      if (received < 0) continue;
      const r = this.measure(
        ctx,
        decantation,
        line,
        received,
        'AFTER_DIP',
        line.id,
        line.afterDipAt ?? ctx.clock.now().toISOString(),
        anchor,
        events,
      );
      if (!r.success) return r;
      movements.push(r.data);
      measuredNow.push(line);
    }
    return this.finish(ctx, decantation, measuredNow, movements, events);
  }

  /**
   * TANK_DIP: resolves every pending line of the tank from one dip.
   *
   * received = dip − before_dip + litres sold from the tank since the line's
   * window start (before_dip_at ?? unload_started_at ?? created_at). Sale
   * movements are booked at shift close, so sales are known to shift
   * granularity only: the caller must not call this while a shift is open
   * (those lines stay pending). With several pending lines on one tank, an older
   * line ends where the next one begins (next before_dip + sales between), so
   * the later tanker is never counted twice.
   */
  async measureFromTankDip(
    ctx: ExecutionContext,
    input: TankDipMeasurementInput,
  ): Promise<Result<TankDipMeasurementResult>> {
    const decantations = await this.deps.decantations.findPendingForTank(
      ctx.organizationId,
      input.stationId,
      input.tankId,
    );
    const pending = decantations
      .flatMap((d) =>
        d.lines
          .filter((l) => l.tankId === input.tankId && l.status === 'PENDING_MEASUREMENT')
          .map((l) => ({ d, l, since: sinceOf(d, l) })),
      )
      .sort((a, b) => a.since.localeCompare(b.since));
    let count = 0;
    for (let i = 0; i < pending.length; i++) {
      const { d, l, since } = pending[i];
      const next = pending[i + 1];
      const sold = await this.deps.sales.litresSoldBetween(
        ctx.organizationId,
        input.stationId,
        l.tankId,
        since,
        next ? next.since : input.dipAt,
      );
      const end = next ? next.l.beforeDip : input.dip;
      const received = round3(end - l.beforeDip + sold);
      // Inconsistent dips never block the tank dip: the line stays pending.
      if (received < 0) continue;
      const events: DomainEvent[] = [];
      const r = this.measure(
        ctx,
        d,
        l,
        received,
        'TANK_DIP',
        input.refId,
        input.dipAt,
        input.anchor,
        events,
      );
      if (!r.success) return r;
      const done = await this.finish(ctx, d, [l], [r.data], events, { updated: true });
      if (!done.success) return done;
      count++;
    }
    return ok({ measuredLines: count });
  }

  /**
   * Recompute the per-invoice variance for (purchase, product) and update the
   * product's weighted-average cost once every line of that product on every
   * Decantation linked to the invoice is measured (D4/D5). Also called by
   * linking (#469). A no-op while any line is pending.
   *
   * Per link: received = that Decantation's lines of the product; invoice_qty =
   * the purchase's quantity of the product; variance = Σ received over all linked
   * Decantations − invoice quantity (the same invoice-level figure on each link).
   * WAC is applied per newly settled link (one never settled before; a settled
   * link is never re-applied): qty = Σ received of the newly settled links, value
   * = the invoice value on the very first settlement and 0 on later ones (the
   * value was already counted), so total cost = invoice value over Σ received.
   * On-hand before = current on-hand − the newly settled qty.
   */
  async settleInvoice(
    ctx: ExecutionContext,
    input: { purchaseId: string; productId: string },
  ): Promise<void> {
    const links = await this.deps.links.listForPurchaseProduct(
      ctx.organizationId,
      input.purchaseId,
      input.productId,
    );
    if (links.length === 0) return;
    const invoice = await this.deps.links.invoiceLine(
      ctx.organizationId,
      links[0].stationId,
      input.purchaseId,
      input.productId,
    );
    if (!invoice) return;

    const receivedByLink = new Map<string, number>();
    for (const link of links) {
      const d = await this.deps.decantations.findById(ctx.organizationId, link.decantationId);
      const lines = (d?.lines ?? []).filter((l) => l.productId === input.productId);
      if (lines.length === 0 || lines.some((l) => l.status !== 'MEASURED')) {
        await this.markSettling(links);
        return;
      }
      receivedByLink.set(link.id, round3(lines.reduce((s, l) => s + (l.receivedQty ?? 0), 0)));
    }
    const totalReceived = round3([...receivedByLink.values()].reduce((s, n) => s + n, 0));
    const variance = round3(totalReceived - invoice.quantity);
    const newLinks = links.filter((l) => !l.varianceComputedAt);
    const firstSettlement = newLinks.length === links.length;
    const newReceived = round3(newLinks.reduce((s, l) => s + (receivedByLink.get(l.id) ?? 0), 0));
    const now = ctx.clock.now().toISOString();

    for (const link of links)
      await this.deps.links.updateVariance({
        ...link,
        receivedQty: receivedByLink.get(link.id) ?? null,
        invoiceQty: round3(invoice.quantity),
        varianceQty: variance,
        varianceComputedAt: now,
      });

    if (newLinks.length === 0 || newReceived <= 0) return;
    const product = await this.deps.products.findById(input.productId);
    if (!product || product.organizationId !== ctx.organizationId) return;
    const onHand = await this.deps.movements.currentQuantityForProduct(
      ctx.organizationId,
      input.productId,
    );
    const baseQty = Math.max(onHand - newReceived, 0);
    const oldCost = Number(product.costBasis ?? 0);
    const value = firstSettlement ? invoice.value : 0;
    const newCost = (baseQty * oldCost + value) / (baseQty + newReceived);
    await this.deps.products.updateCostBasis(input.productId, String(round4(newCost)));
  }

  /**
   * Some line of the invoice is still pending: hide stale received/variance so
   * the report shows Settling. `varianceComputedAt` is kept on links that already
   * contributed to cost, so a later settlement never re-adds the invoice value.
   */
  private async markSettling(links: DecantationPurchaseLink[]): Promise<void> {
    for (const link of links)
      if (link.receivedQty !== null || link.invoiceQty !== null || link.varianceQty !== null)
        await this.deps.links.updateVariance({
          ...link,
          receivedQty: null,
          invoiceQty: null,
          varianceQty: null,
        });
  }

  /**
   * Reverses what a link added to the product's weighted-average cost, before the
   * link is removed or replaced (unlink / replace / relink stay net zero).
   * Approximation: a settled invoice's value was added once, on its first
   * settlement, against the qty of the links settled then. On removal the link
   * gives back qty = its received and value = invoice value x its received / Σ
   * received of the settled links of that invoice. Cost never goes negative; a
   * link that never settled contributed nothing and reverses nothing.
   */
  async reverseLinkContribution(
    ctx: ExecutionContext,
    input: { purchaseId: string; productId: string; decantationId: string },
  ): Promise<void> {
    const links = await this.deps.links.listForPurchaseProduct(
      ctx.organizationId,
      input.purchaseId,
      input.productId,
    );
    const removed = links.find((l) => l.decantationId === input.decantationId);
    if (!removed || !removed.varianceComputedAt) return;
    const receivedOf = async (l: DecantationPurchaseLink) => {
      const d = await this.deps.decantations.findById(ctx.organizationId, l.decantationId);
      return round3(
        (d?.lines ?? [])
          .filter((x) => x.productId === input.productId)
          .reduce((s, x) => s + (x.receivedQty ?? 0), 0),
      );
    };
    let settledTotal = 0;
    let removedQty = 0;
    for (const l of links) {
      if (!l.varianceComputedAt) continue;
      const q = await receivedOf(l);
      settledTotal += q;
      if (l.id === removed.id) removedQty = q;
    }
    if (removedQty <= 0 || settledTotal <= 0) return;
    const invoice = await this.deps.links.invoiceLine(
      ctx.organizationId,
      removed.stationId,
      input.purchaseId,
      input.productId,
    );
    if (!invoice) return;
    const product = await this.deps.products.findById(input.productId);
    if (!product || product.organizationId !== ctx.organizationId) return;
    const onHand = await this.deps.movements.currentQuantityForProduct(
      ctx.organizationId,
      input.productId,
    );
    const remaining = onHand - removedQty;
    if (remaining <= 0) return;
    const value = (invoice.value * removedQty) / settledTotal;
    const newCost = Math.max((onHand * Number(product.costBasis ?? 0) - value) / remaining, 0);
    await this.deps.products.updateCostBasis(input.productId, String(round4(newCost)));
  }

  private measure(
    ctx: ExecutionContext,
    d: Decantation,
    line: DecantationTankLine,
    received: number,
    by: 'AFTER_DIP' | 'TANK_DIP',
    refId: string,
    at: string,
    anchor: MeasurementAnchor,
    events: DomainEvent[],
  ): Result<StockMovement> {
    if (received < 0)
      return err(
        validationError('Measured quantity is negative; check the before and after dips', {
          tankLineId: line.id,
          received,
        }),
      );
    line.receivedQty = received;
    line.measuredBy = by;
    line.measurementRefId = refId;
    line.measuredAt = at;
    line.status = 'MEASURED';
    const movement: StockMovement = {
      id: ctx.ids.newId(),
      shiftId: null,
      businessDayId: anchor.businessDayId,
      productId: line.productId,
      tankId: line.tankId,
      movementType: 'Decantation',
      quantity: String(received),
      referenceType: 'decantation_tank_line',
      referenceId: line.id,
      notes: `Decantation ${d.documentNumber} (${by === 'AFTER_DIP' ? 'after dip' : 'tank dip'})`,
      createdAt: ctx.clock.now().toISOString(),
    };
    events.push(
      relatedEventFromContext(ctx, {
        eventType: BusinessEvents.STOCK_MOVEMENT_RECORDED,
        aggregateType: 'StockMovement',
        aggregateId: movement.id,
        stationId: d.stationId,
        businessDayId: anchor.businessDayId,
        payload: {
          movementId: movement.id,
          movementType: 'Decantation',
          productId: line.productId,
          tankId: line.tankId,
          quantity: received,
          decantationId: d.id,
          tankLineId: line.id,
          measuredBy: by,
        },
      }),
    );
    return ok(movement);
  }

  private async finish(
    ctx: ExecutionContext,
    d: Decantation,
    measured: DecantationTankLine[],
    movements: StockMovement[],
    events: DomainEvent[],
    opts: { updated?: boolean } = {},
  ): Promise<Result<Decantation>> {
    if (measured.length === 0) return ok(d);
    await this.deps.movements.saveMany(movements);
    if (d.lines.every((l) => l.status === 'MEASURED')) d.status = 'MEASURED';
    d.updatedAt = ctx.clock.now().toISOString();
    await this.deps.decantations.updateMeasurement(d);

    for (const productId of new Set(measured.map((l) => l.productId))) {
      const links = await this.deps.links.listForDecantation(ctx.organizationId, d.id);
      for (const link of links.filter((l) => l.productId === productId))
        await this.settleInvoice(ctx, { purchaseId: link.purchaseId, productId });
    }

    // The after-dip path is followed by RecordDecantation's own event; a
    // tank-dip measurement announces the status change itself.
    if (opts.updated)
      events.unshift(
        eventFromContext(ctx, {
          eventType: BusinessEvents.DECANTATION_RECORDED,
          aggregateType: 'Decantation',
          aggregateId: d.id,
          stationId: d.stationId,
          businessDayId: d.businessDayId,
          payload: {
            decantationId: d.id,
            documentNumber: d.documentNumber,
            tankerNumber: d.tankerNumber,
            status: d.status,
            updated: true,
            measuredBy: 'TANK_DIP',
            lines: d.lines,
          },
        }),
      );
    await this.deps.events.publish(events);
    return ok(d);
  }
}
