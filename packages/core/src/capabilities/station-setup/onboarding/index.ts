import type { FinalizeOnboardingResult, OnboardingDraft } from '@pump/shared';
import { BusinessEvents, err, eventFromContext, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';

/**
 * Persistence port for the multi-aggregate onboarding provisioning. The adapter
 * performs all inserts (station, products, tanks, dispensers, nozzles, prices,
 * shift templates, payment terminals) atomically in one transaction and maps the
 * draft-local ids to real ids. Returns a conflict error if the station code is
 * already taken.
 */
export interface OnboardingProvisioner {
  provision(input: {
    organizationId: string;
    actorId: string | null;
    draft: OnboardingDraft;
  }): Promise<Result<FinalizeOnboardingResult>>;
}

export interface FinalizeStationOnboardingDeps {
  provisioner: OnboardingProvisioner;
  events: EventPublisher;
}

/**
 * Validate a provisioning draft (structure, cross-references, in-draft
 * duplicates). DB-level checks (e.g. station code uniqueness) happen in the
 * provisioner. Returns the first error message, or null if valid.
 */
export function validateOnboardingDraftForProvisioning(draft: OnboardingDraft): string | null {
  const { station, businessRules, products, tanks, dispensers, nozzles, paymentTerminals } = draft;

  if (station.name.trim().length < 2) return 'Station name is required';
  if (station.code.trim().length < 2) return 'Station code is required';
  if (products.length === 0) return 'Add at least one active fuel product before provisioning';
  if (tanks.length === 0) return 'Add at least one storage tank before provisioning';
  if (dispensers.length === 0) return 'Add at least one dispenser before provisioning';
  if (nozzles.length === 0) return 'Add at least one nozzle before provisioning';

  const productCodes = new Set<string>();
  const productNames = new Set<string>();
  for (const product of products) {
    const code = product.code.trim().toUpperCase();
    const name = product.name.trim().toLowerCase();
    if (productCodes.has(code)) return `Duplicate fuel code "${product.code}" found in draft`;
    if (productNames.has(name)) return `Duplicate fuel name "${product.name}" found in draft`;
    productCodes.add(code);
    productNames.add(name);
  }

  const dispenserCodes = new Set<string>();
  const dispenserNames = new Set<string>();
  for (const dispenser of dispensers) {
    const code = dispenser.code.trim().toUpperCase();
    const name = dispenser.name.trim().toLowerCase();
    if (dispenserCodes.has(code)) return `Duplicate dispenser code "${dispenser.code}" found in draft`;
    if (dispenserNames.has(name)) return `Duplicate dispenser name "${dispenser.name}" found in draft`;
    dispenserCodes.add(code);
    dispenserNames.add(name);
  }

  for (const day of businessRules.operatingSchedule.days) {
    if (day.isOpen && !(day.openTime < day.closeTime || businessRules.operatingSchedule.isTwentyFourSeven)) {
      return `Operating hours for ${day.day} must have opening time before closing time`;
    }
  }

  const productMap = new Map(products.map((p) => [p.draftId, p]));
  const tankMap = new Map(tanks.map((t) => [t.draftId, t]));
  const dispenserMap = new Map(dispensers.map((d) => [d.draftId, d]));

  for (const tank of tanks) {
    if (!productMap.has(tank.productDraftId)) return `Tank "${tank.name}" is linked to a missing fuel product`;
    if (tank.openingQuantity > tank.capacity) return `Opening stock for tank "${tank.name}" cannot exceed its capacity`;
  }

  for (const nozzle of nozzles) {
    if (!dispenserMap.has(nozzle.dispenserDraftId)) return `Nozzle "${nozzle.name}" is linked to a missing dispenser`;
    if (!tankMap.has(nozzle.tankDraftId)) return `Nozzle "${nozzle.name}" is linked to a missing tank`;
    if (!productMap.has(nozzle.productDraftId)) return `Nozzle "${nozzle.name}" is linked to a missing fuel product`;
    const tank = tankMap.get(nozzle.tankDraftId)!;
    if (tank.productDraftId !== nozzle.productDraftId) return `Nozzle "${nozzle.name}" fuel must match the selected tank fuel`;
  }

  const terminalLabels = new Set<string>();
  for (const terminal of paymentTerminals ?? []) {
    if (terminal.label.trim().length < 1) return 'Every payment terminal needs a label';
    const label = terminal.label.trim().toLowerCase();
    if (terminalLabels.has(label)) return `Duplicate payment terminal label "${terminal.label}" found in draft`;
    if (!terminal.supportsCard && !terminal.supportsUpi) return `Terminal "${terminal.label}" must support card and/or UPI`;
    terminalLabels.add(label);
  }

  return null;
}

/**
 * Provision a fully-configured station from an onboarding draft in one atomic
 * operation, then emit ONBOARDING_COMPLETED. Domain validation lives here; the
 * transactional multi-table write is delegated to the OnboardingProvisioner port.
 */
export class FinalizeStationOnboarding implements UseCase<OnboardingDraft, FinalizeOnboardingResult> {
  constructor(private readonly deps: FinalizeStationOnboardingDeps) {}

  async execute(draft: OnboardingDraft, ctx: ExecutionContext): Promise<Result<FinalizeOnboardingResult>> {
    const validationMessage = validateOnboardingDraftForProvisioning(draft);
    if (validationMessage) return err(validationError(validationMessage));

    const result = await this.deps.provisioner.provision({
      organizationId: ctx.organizationId,
      actorId: ctx.actorId,
      draft,
    });
    if (!result.success) return result;

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.ONBOARDING_COMPLETED,
        aggregateType: 'Station',
        aggregateId: result.data.station.id,
        stationId: result.data.station.id,
        payload: {
          stationId: result.data.station.id,
          stationCode: result.data.station.code,
          summary: result.data.summary,
        },
      }),
    ]);

    return ok(result.data);
  }
}
