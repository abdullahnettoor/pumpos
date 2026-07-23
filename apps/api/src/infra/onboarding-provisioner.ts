import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { conflictError, err, invariantViolation, ok } from '@pump/core';
import type { OnboardingProvisioner, Result } from '@pump/core';
import type { FinalizeOnboardingResult, OnboardingDraft } from '@pump/shared';
import { normalizeProvider, resolveBusinessDate } from '@pump/shared';
import { AccountProvisioningService } from './account-provisioning.js';

/** Signals a provisioning failure to roll back the transaction with a typed reason. */
class ProvisionFailure extends Error {
  constructor(public readonly kind: 'conflict' | 'invariant', message: string) {
    super(message);
  }
}

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/**
 * Drizzle adapter for the onboarding provisioning port. Performs all station
 * setup inserts atomically in one transaction and maps draft-local ids to real
 * ids. Mirrors the proven finalize SQL; failures roll the whole thing back.
 */
export class DrizzleOnboardingProvisioner implements OnboardingProvisioner {
  constructor(private readonly db: DbClient) {}

  async provision(input: {
    organizationId: string;
    actorId: string | null;
    draft: OnboardingDraft;
  }): Promise<Result<FinalizeOnboardingResult>> {
    const { organizationId, actorId, draft } = input;
    try {
      const result = await this.db.transaction(async (tx) => {
        const existingStation = await tx
          .select()
          .from(schema.stations)
          .where(and(eq(schema.stations.organizationId, organizationId), eq(schema.stations.code, draft.station.code.toUpperCase())))
          .limit(1);
        if (existingStation.length > 0) {
          throw new ProvisionFailure('conflict', `Station code "${draft.station.code}" already exists`);
        }

        const [newStation] = await tx
          .insert(schema.stations)
          .values({
            organizationId,
            name: draft.station.name,
            code: draft.station.code.toUpperCase(),
            address: draft.station.address,
            phone: draft.station.phone,
            settings: {
              shift_grace_minutes: draft.station.shiftGraceMinutes,
              shift_lock_grace_days: 3,
              offline_warning_days: 3,
              offline_critical_days: 7,
              business_day_starts_at: draft.businessRules.businessDayStartsAt,
              timezone: draft.station.timezone,
              operating_schedule: draft.businessRules.operatingSchedule,
              pending_opening_stock_seed: [],
            },
            onboardingStatus: 'IN_PROGRESS',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        // Assign the person who onboarded the station to it. Owners bypass
        // station scoping so this is a no-op for them, but a Manager (or any
        // non-Owner actor, e.g. multisite onboarding) would otherwise create a
        // station they cannot access. The station was just created in this
        // transaction, so no prior assignment can exist.
        if (actorId) {
          await tx.insert(schema.userStationAssignments).values({ userId: actorId, stationId: newStation.id });
        }

        const productIdMap = new Map<string, string>();
        // Opening cost basis per fuel product = weighted average of its tanks'
        // (opening qty × landed rate) ÷ Σ opening qty. Built from tanks (which
        // reference productDraftId) so it's available when inserting products.
        const openingCostByProductDraft = new Map<string, { qty: number; value: number }>();
        for (const tank of draft.tanks) {
          const rate = tank.openingCostRate ?? 0;
          if (tank.openingQuantity > 0 && rate > 0) {
            const agg = openingCostByProductDraft.get(tank.productDraftId) ?? { qty: 0, value: 0 };
            agg.qty += tank.openingQuantity;
            agg.value += tank.openingQuantity * rate;
            openingCostByProductDraft.set(tank.productDraftId, agg);
          }
        }
        for (const product of draft.products) {
          const openCost = openingCostByProductDraft.get(product.draftId);
          const costBasis = openCost && openCost.qty > 0 ? String(round4(openCost.value / openCost.qty)) : '0';
          const [createdProduct] = await tx
            .insert(schema.products)
            .values({
              organizationId,
              name: product.name,
              code: product.code.toUpperCase(),
              productType: product.productType,
              inventoryType:
                product.productType === 'FUEL' ? 'BULK' : (product.productType as string) === 'SERVICE' ? 'NONE' : 'ITEM',
              stockTracked: product.stockTracked,
              isTaxable: product.isTaxable,
              unit: product.unit,
              taxConfig: product.taxConfig,
              costBasis,
              isActive: product.isActive,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          productIdMap.set(product.draftId, createdProduct.id);
        }

        const tankIdMap = new Map<string, string>();
        const pendingOpeningStockSeed: Array<{ tankId: string; productId: string; quantity: number }> = [];
        for (const tank of draft.tanks) {
          const mappedProductId = productIdMap.get(tank.productDraftId);
          if (!mappedProductId) throw new ProvisionFailure('invariant', `Tank "${tank.name}" references an unknown fuel product`);
          const [createdTank] = await tx
            .insert(schema.tanks)
            .values({
              organizationId,
              stationId: newStation.id,
              name: tank.name,
              productId: mappedProductId,
              capacity: String(tank.capacity),
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          tankIdMap.set(tank.draftId, createdTank.id);
          if (tank.openingQuantity > 0) {
            pendingOpeningStockSeed.push({ tankId: createdTank.id, productId: mappedProductId, quantity: tank.openingQuantity });
          }
        }

        const dispenserIdMap = new Map<string, string>();
        for (const dispenser of draft.dispensers) {
          const [createdDispenser] = await tx
            .insert(schema.dispenserUnits)
            .values({
              organizationId,
              stationId: newStation.id,
              name: dispenser.name,
              code: dispenser.code.toUpperCase(),
              status: dispenser.status,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          dispenserIdMap.set(dispenser.draftId, createdDispenser.id);
        }

        for (const nozzle of draft.nozzles) {
          const mappedDispenserId = dispenserIdMap.get(nozzle.dispenserDraftId);
          const mappedTankId = tankIdMap.get(nozzle.tankDraftId);
          const mappedProductId = productIdMap.get(nozzle.productDraftId);
          if (!mappedDispenserId) throw new ProvisionFailure('invariant', `Nozzle "${nozzle.name}" references an unknown dispenser`);
          if (!mappedTankId) throw new ProvisionFailure('invariant', `Nozzle "${nozzle.name}" references an unknown tank`);
          if (!mappedProductId) throw new ProvisionFailure('invariant', `Nozzle "${nozzle.name}" references an unknown fuel product`);
          await tx.insert(schema.nozzles).values({
            organizationId,
            stationId: newStation.id,
            duId: mappedDispenserId,
            tankId: mappedTankId,
            productId: mappedProductId,
            name: nozzle.name,
            currentReading: String(nozzle.openingReading),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        // Seed opening fuel stock. Tank quantity is derived purely from
        // stock_movements, so opening stock must be a real movement — not just a
        // stashed figure. Anchor it to the station's first business day (opened
        // lazily for the onboarding date), matching the "a day opens when the
        // first entry lands" rule. Skip entirely when there is nothing to seed.
        if (pendingOpeningStockSeed.length > 0 && actorId) {
          const businessDate = resolveBusinessDate({
            now: new Date(),
            timeZone: draft.station.timezone,
            dayStartsAt: draft.businessRules.businessDayStartsAt,
          });
          const [openingDay] = await tx
            .insert(schema.businessDays)
            .values({
              organizationId,
              stationId: newStation.id,
              businessDate,
              status: 'OPEN',
              openedBy: actorId,
              openedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
          await tx.insert(schema.stockMovements).values(
            pendingOpeningStockSeed.map((seed) => ({
              businessDayId: openingDay.id,
              productId: seed.productId,
              tankId: seed.tankId,
              movementType: 'OpeningBalance',
              quantity: String(seed.quantity),
              referenceType: 'ONBOARDING',
              notes: 'Opening stock',
              createdAt: new Date(),
            })),
          );
        }

        const activeFuelProducts = draft.products.filter((p) => p.isActive);
        if (activeFuelProducts.length > 0) {
          await tx.insert(schema.fuelPrices).values(
            activeFuelProducts.map((product) => ({
              organizationId,
              stationId: newStation.id,
              productId: productIdMap.get(product.draftId)!,
              price: String(product.currentPrice),
              effectiveFrom: new Date(),
              createdAt: new Date(),
            })),
          );
        }

        if (draft.shiftTemplates.length > 0) {
          await tx.insert(schema.shiftTemplates).values(
            draft.shiftTemplates.map((template) => ({
              organizationId,
              name: template.name,
              startTime: template.startTime,
              endTime: template.endTime,
              isActive: template.isActive,
            })),
          );
        }

        const paymentTerminals = draft.paymentTerminals ?? [];
        if (paymentTerminals.length > 0) {
          await tx.insert(schema.paymentTerminals).values(
            paymentTerminals.map((terminal) => ({
              organizationId,
              stationId: newStation.id,
              label: terminal.label,
              provider: normalizeProvider(terminal.provider),
              terminalCode: terminal.terminalCode?.trim() ? terminal.terminalCode.trim() : null,
              supportsCard: terminal.supportsCard,
              supportsUpi: terminal.supportsUpi,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          );
        }

        // Provision the station's default money accounts (Cash in Hand + Bank).
        // Card/UPI clearing accounts are created per acquirer and linked to the
        // terminals just created (none if the station registered no terminals).
        const provisioner = new AccountProvisioningService(tx as unknown as DbClient);
        await provisioner.ensureStationDefaults(organizationId, newStation.id);
        if (paymentTerminals.length > 0) {
          await provisioner.provisionTerminalClearing(organizationId, newStation.id);
        }

        const [readyStation] = await tx
          .update(schema.stations)
          .set({
            onboardingStatus: 'READY_FOR_OPERATIONS',
            settings: {
              ...(newStation.settings as Record<string, unknown>),
              pending_opening_stock_seed: [],
            },
            updatedAt: new Date(),
          })
          .where(eq(schema.stations.id, newStation.id))
          .returning();

        return {
          station: readyStation,
          summary: {
            productCount: draft.products.length,
            tankCount: draft.tanks.length,
            dispenserCount: draft.dispensers.length,
            nozzleCount: draft.nozzles.length,
            shiftTemplateCount: draft.shiftTemplates.length,
            paymentTerminalCount: paymentTerminals.length,
          },
        } as unknown as FinalizeOnboardingResult;
      });

      return ok(result);
    } catch (e) {
      if (e instanceof ProvisionFailure) {
        return e.kind === 'conflict' ? err(conflictError(e.message)) : err(invariantViolation(e.message));
      }
      throw e;
    }
  }
}
