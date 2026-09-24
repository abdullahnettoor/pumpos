import { z } from 'zod';
import type { TaxCategory } from '@pump/shared';
import {
  BusinessEvents,
  err,
  eventFromContext,
  invariantViolation,
  notFoundError,
  ok,
  validationError,
} from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { FinancialAccountRepository } from '../accounts/index.js';
import { resolveOfficeEntry, type PaymentTerminalLookup } from '../office-entry.js';
import { computeLineTax, isInterState } from '../tax/index.js';

export interface IncomeCategory {
  id: string;
  organizationId: string;
  name: string;
  taxConfig: Record<string, unknown> | null;
  isSystem: boolean;
  isActive: boolean;
}

/**
 * FI4 — the GST split frozen onto an income entry at capture. Categories carry
 * the rate (`tax_config`), but re-rating a category must never re-write history,
 * so the computed components are persisted with the entry.
 */
export interface IncomeTax {
  taxCategory: TaxCategory;
  gstRate: string | null;
  cessRate: string | null;
  hsnCode: string | null;
  taxableAmount: string;
  cgst: string;
  sgst: string;
  igst: string;
  cess: string;
  snapshot: Record<string, unknown> | null;
}

/** Other income is an Office Record (ADR 0005): Entry Date + Funding Account. */
export interface OtherIncome {
  id: string;
  organizationId: string;
  stationId: string;
  entryDate: string;
  fundingAccountId: string;
  /** Payment Terminal the income was received through (#276). */
  terminalId: string | null;
  categoryId: string;
  amount: string;
  payer: string | null;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  status: string;
  /** FI4 GST split, frozen at capture. */
  taxCategory: TaxCategory;
  gstRate: string | null;
  cessRate: string | null;
  hsnCode: string | null;
  taxableAmount: string;
  cgst: string;
  sgst: string;
  igst: string;
  cess: string;
  taxSnapshot: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeRepository {
  save(income: OtherIncome): Promise<void>;
  findById(id: string): Promise<OtherIncome | null>;
}

export interface IncomeCategoryRepository {
  findById(id: string): Promise<IncomeCategory | null>;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Split a received amount into taxable value + CGST/SGST/IGST using the
 * category's `tax_config` and the supplier/buyer state codes (Phase-T engine).
 * A category with no usable GST rate is `NON_TAXABLE` and carries a zero split,
 * so income without GST configuration behaves exactly as before FI4.
 *
 * `tax_config` keys (all optional): `gst_rate` | `gstRatePct`, `cess`,
 * `hsn_code` | `sac_code`, `price_inclusive` (default true — an agreed rental /
 * commission figure is normally the gross the payer hands over).
 */
export function computeIncomeTax(
  amount: number,
  category: IncomeCategory | null,
  states: { supplierStateCode?: string | null; buyerStateCode?: string | null } = {},
): IncomeTax {
  const cfg = category?.taxConfig ?? {};
  const gstRate = num(cfg.gst_rate ?? cfg.gstRatePct) ?? 0;
  const cessRate = num(cfg.cess ?? cfg.cessPct) ?? 0;
  const exempt = cfg.tax_category === 'EXEMPT' || cfg.taxCategory === 'EXEMPT';
  const taxable = gstRate > 0 || cessRate > 0;

  const hsnCode = (cfg.hsn_code ?? cfg.sac_code ?? null) as string | null;

  if (!taxable) {
    const taxCategory: TaxCategory = exempt ? 'EXEMPT' : 'NON_TAXABLE';
    return {
      taxCategory,
      gstRate: null,
      cessRate: null,
      hsnCode: hsnCode ? String(hsnCode) : null,
      taxableAmount: String(round2(amount)),
      cgst: '0',
      sgst: '0',
      igst: '0',
      cess: '0',
      snapshot: null,
    };
  }

  const inclusive = cfg.price_inclusive === undefined ? true : !!cfg.price_inclusive;
  const interState = isInterState(states);
  const r = computeLineTax(
    {
      taxCategory: 'GST',
      taxableAmount: amount,
      gstRatePct: gstRate,
      cessPct: cessRate,
      inclusive,
    },
    interState,
  );
  return {
    taxCategory: 'GST',
    gstRate: String(gstRate),
    cessRate: cessRate ? String(cessRate) : null,
    hsnCode: hsnCode ? String(hsnCode) : null,
    taxableAmount: String(r.taxableAmount),
    cgst: String(r.cgst),
    sgst: String(r.sgst),
    igst: String(r.igst),
    cess: String(r.cess),
    // Residual audit evidence only — rate/HSN live in columns (returns group by
    // them); inter-state is derivable from igst > 0.
    snapshot: {
      inclusive,
      supplier_state: states.supplierStateCode ?? null,
      buyer_state: states.buyerStateCode ?? null,
    },
  };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface RecordIncomeCommand {
  stationId?: string;
  entryDate?: string;
  /** Required unless a terminal is named (its clearing account is used). */
  fundingAccountId?: string;
  terminalId?: string | null;
  categoryId: string;
  amount: number | string;
  payer?: string;
  description?: string;
  /** Supplier (station) state code for the GST place-of-supply decision. */
  supplierStateCode?: string;
  /** Payer state code, when known — makes the entry inter-state (IGST). */
  buyerStateCode?: string;
}

const schema = z.object({
  stationId: z.string().min(1).optional(),
  entryDate: z.string().optional(),
  fundingAccountId: z.string().min(1).optional(),
  terminalId: z.string().min(1).nullish(),
  categoryId: z.string().min(1, 'categoryId is required'),
  amount: z.coerce.number().positive('amount must be positive'),
  payer: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  supplierStateCode: z.string().max(10).optional(),
  buyerStateCode: z.string().max(10).optional(),
});

export interface RecordIncomeDeps {
  income: IncomeRepository;
  accounts: FinancialAccountRepository;
  terminals?: PaymentTerminalLookup;
  /** Optional (FI4): resolves the category's tax_config to split GST at capture. */
  incomeCategories?: IncomeCategoryRepository;
  events: EventPublisher;
}

/**
 * Record indirect / non-operating income (tanker rental, truck parking,
 * commission, scrap, interest, …) on its Entry Date, received into the chosen
 * Funding Account. Mirror of RecordExpense.
 */
export class RecordIncome implements UseCase<RecordIncomeCommand, OtherIncome> {
  constructor(private readonly deps: RecordIncomeDeps) {}

  async execute(input: RecordIncomeCommand, ctx: ExecutionContext): Promise<Result<OtherIncome>> {
    const p = schema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid RecordIncome command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const entry = await resolveOfficeEntry(this.deps, ctx, cmd);
    if (!entry.success) return entry;
    const { stationId, entryDate, fundingAccount, terminalId } = entry.data;

    // FI4 — freeze the GST split from the category's tax_config at capture.
    const category = this.deps.incomeCategories
      ? await this.deps.incomeCategories.findById(cmd.categoryId)
      : null;
    if (category && category.organizationId !== ctx.organizationId)
      return err(notFoundError('IncomeCategory', cmd.categoryId));
    const tax = computeIncomeTax(cmd.amount, category, {
      supplierStateCode: cmd.supplierStateCode,
      buyerStateCode: cmd.buyerStateCode,
    });

    const now = ctx.clock.now().toISOString();
    const income: OtherIncome = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId,
      entryDate,
      fundingAccountId: fundingAccount.id,
      terminalId,
      categoryId: cmd.categoryId,
      amount: String(cmd.amount),
      payer: cmd.payer ?? null,
      referenceType: null,
      referenceId: null,
      description: cmd.description ?? null,
      status: 'ACTIVE',
      taxCategory: tax.taxCategory,
      gstRate: tax.gstRate,
      cessRate: tax.cessRate,
      hsnCode: tax.hsnCode,
      taxableAmount: tax.taxableAmount,
      cgst: tax.cgst,
      sgst: tax.sgst,
      igst: tax.igst,
      cess: tax.cess,
      taxSnapshot: tax.snapshot,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.income.save(income);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.INCOME_RECORDED,
        aggregateType: 'Income',
        aggregateId: income.id,
        stationId,
        businessDayId: null,
        payload: {
          incomeId: income.id,
          amount: income.amount,
          entryDate,
          fundingAccountId: fundingAccount.id,
          terminalId,
          categoryId: income.categoryId,
          taxCategory: income.taxCategory,
          taxableAmount: income.taxableAmount,
        },
        presentation: {
          templateId: 'income.v2',
          values: { amount: Number(income.amount), accountName: fundingAccount.name },
        },
      }),
    ]);

    return ok(income);
  }
}

export interface VoidIncomeCommand {
  id: string;
  reason?: string;
}

const voidSchema = z.object({
  id: z.string().min(1, 'id is required'),
  reason: z.string().max(255).optional(),
});

export interface VoidIncomeDeps {
  income: IncomeRepository;
  events: EventPublisher;
}

/** Void an income entry (soft) — reverses its ledger posting via the outbox. */
export class VoidIncome implements UseCase<VoidIncomeCommand, OtherIncome> {
  constructor(private readonly deps: VoidIncomeDeps) {}

  async execute(input: VoidIncomeCommand, ctx: ExecutionContext): Promise<Result<OtherIncome>> {
    const p = voidSchema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid VoidIncome command', { issues: p.error.flatten() }));

    const existing = await this.deps.income.findById(p.data.id);
    if (!existing) return err(notFoundError('Income', p.data.id));
    if (existing.status === 'VOIDED')
      return err(invariantViolation('Income already voided', { id: existing.id }));

    const now = ctx.clock.now().toISOString();
    const voided: OtherIncome = { ...existing, status: 'VOIDED', updatedAt: now };
    await this.deps.income.save(voided);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.INCOME_VOIDED,
        aggregateType: 'Income',
        aggregateId: voided.id,
        stationId: voided.stationId,
        businessDayId: null,
        payload: { incomeId: voided.id, amount: voided.amount, reason: p.data.reason ?? null },
      }),
    ]);

    return ok(voided);
  }
}
