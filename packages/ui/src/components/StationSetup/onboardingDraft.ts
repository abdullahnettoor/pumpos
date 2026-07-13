import {
  OnboardingDraft,
  OnboardingDispenserDraft,
  OnboardingNozzleDraft,
  OnboardingPaymentTerminalDraft,
  OnboardingProductDraft,
  OnboardingShiftTemplateDraft,
  OnboardingTankDraft,
  OperatingDaySchedule,
  WeeklyOperatingSchedule,
} from '@pump/shared';

export interface OnboardingValidationIssue {
  step: number;
  message: string;
}

export interface StoredOnboardingDraft {
  draft: OnboardingDraft;
  currentStep: number;
}

const STORAGE_KEY = 'pump-onboarding-draft-v2';

export const WEEKDAY_ORDER: OperatingDaySchedule['day'][] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

export function createDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `draft_${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultOperatingSchedule(): WeeklyOperatingSchedule {
  return {
    isTwentyFourSeven: false,
    days: WEEKDAY_ORDER.map((day) => ({
      day,
      isOpen: true,
      openTime: '06:00',
      closeTime: '22:00',
    })),
  };
}

export function createEmptyOnboardingDraft(): OnboardingDraft {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

  return {
    station: {
      name: '',
      code: '',
      address: '',
      phone: '',
      shiftGraceMinutes: 15,
      timezone,
    },
    businessRules: {
      businessDayStartsAt: '06:00',
      operatingSchedule: createDefaultOperatingSchedule(),
    },
    products: [],
    tanks: [],
    dispensers: [],
    nozzles: [],
    shiftTemplates: [],
    paymentTerminals: [],
  };
}

export function createFuelDraft(): OnboardingProductDraft {
  return {
    draftId: createDraftId(),
    name: '',
    code: '',
    productType: 'FUEL',
    stockTracked: true,
    isTaxable: false,
    unit: 'L',
    taxConfig: {
      gst_rate: 0,
      hsn_code: '2710',
    },
    isActive: true,
    currentPrice: 0,
  };
}

export function createTankDraft(productDraftId = ''): OnboardingTankDraft {
  return {
    draftId: createDraftId(),
    name: '',
    productDraftId,
    capacity: 20000,
    openingQuantity: 0,
  };
}

export function createDispenserDraft(): OnboardingDispenserDraft {
  return {
    draftId: createDraftId(),
    name: '',
    code: '',
    status: 'ACTIVE',
  };
}

export function createNozzleDraft(dispenserDraftId = '', tankDraftId = '', productDraftId = ''): OnboardingNozzleDraft {
  return {
    draftId: createDraftId(),
    dispenserDraftId,
    tankDraftId,
    productDraftId,
    name: '',
    openingReading: 0,
  };
}

export function createShiftTemplateDraft(): OnboardingShiftTemplateDraft {
  return {
    draftId: createDraftId(),
    name: '',
    startTime: '06:00',
    endTime: '14:00',
    isActive: true,
  };
}

export function createPaymentTerminalDraft(): OnboardingPaymentTerminalDraft {
  return {
    draftId: createDraftId(),
    label: '',
    provider: '',
    terminalCode: '',
    supportsCard: true,
    supportsUpi: true,
  };
}

export function saveStoredOnboardingDraft(state: StoredOnboardingDraft) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadStoredOnboardingDraft(): StoredOnboardingDraft | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredOnboardingDraft;
    // Backward-compat: older stored drafts predate the payment terminals step.
    if (parsed?.draft && !Array.isArray(parsed.draft.paymentTerminals)) {
      parsed.draft.paymentTerminals = [];
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearStoredOnboardingDraft() {
  localStorage.removeItem(STORAGE_KEY);
}

export function formatWeekday(day: OperatingDaySchedule['day']) {
  return day.charAt(0) + day.slice(1).toLowerCase();
}

export function validateOnboardingDraft(draft: OnboardingDraft): OnboardingValidationIssue[] {
  const issues: OnboardingValidationIssue[] = [];
  const productMap = new Map(draft.products.map((product) => [product.draftId, product]));
  const tankMap = new Map(draft.tanks.map((tank) => [tank.draftId, tank]));
  const dispenserMap = new Map(draft.dispensers.map((dispenser) => [dispenser.draftId, dispenser]));

  if (!draft.station.name.trim()) {
    issues.push({ step: 1, message: 'Station name is required.' });
  }
  if (!draft.station.code.trim()) {
    issues.push({ step: 1, message: 'Station code is required.' });
  }

  if (!draft.businessRules.businessDayStartsAt) {
    issues.push({ step: 2, message: 'Business day start time is required.' });
  }

  if (!draft.businessRules.operatingSchedule.isTwentyFourSeven) {
    const openDays = draft.businessRules.operatingSchedule.days.filter((day) => day.isOpen);
    if (openDays.length === 0) {
      issues.push({ step: 2, message: 'At least one operating day must be open.' });
    }

    for (const day of openDays) {
      if (day.openTime >= day.closeTime) {
        issues.push({ step: 2, message: `${formatWeekday(day.day)} operating hours must have opening time before closing time.` });
      }
    }
  }

  if (draft.products.length === 0) {
    issues.push({ step: 3, message: 'Add at least one fuel product.' });
  }

  const productCodes = new Set<string>();
  const productNames = new Set<string>();
  for (const product of draft.products) {
    const code = product.code.trim().toUpperCase();
    const name = product.name.trim().toLowerCase();

    if (!product.name.trim()) {
      issues.push({ step: 3, message: 'Every fuel product needs a name.' });
    }
    if (!product.code.trim()) {
      issues.push({ step: 3, message: 'Every fuel product needs a code.' });
    }
    if (product.currentPrice <= 0) {
      issues.push({ step: 6, message: `${product.name || 'Fuel product'} needs a valid selling price.` });
    }
    if (productCodes.has(code)) {
      issues.push({ step: 3, message: `Duplicate fuel code "${product.code}" found.` });
    }
    if (productNames.has(name)) {
      issues.push({ step: 3, message: `Duplicate fuel name "${product.name}" found.` });
    }

    productCodes.add(code);
    productNames.add(name);
  }

  if (draft.tanks.length === 0) {
    issues.push({ step: 4, message: 'Add at least one tank.' });
  }

  for (const tank of draft.tanks) {
    if (!tank.name.trim()) {
      issues.push({ step: 4, message: 'Every tank needs a name.' });
    }
    if (!tank.productDraftId || !productMap.has(tank.productDraftId)) {
      issues.push({ step: 4, message: `Tank "${tank.name || 'Untitled tank'}" must be linked to a fuel product.` });
    }
    if (tank.capacity <= 0) {
      issues.push({ step: 4, message: `Tank "${tank.name || 'Untitled tank'}" needs a valid capacity.` });
    }
    if (tank.openingQuantity > tank.capacity) {
      issues.push({ step: 6, message: `Opening quantity for tank "${tank.name || 'Untitled tank'}" cannot exceed capacity.` });
    }
  }

  if (draft.dispensers.length === 0) {
    issues.push({ step: 5, message: 'Add at least one dispenser.' });
  }
  if (draft.nozzles.length === 0) {
    issues.push({ step: 5, message: 'Add at least one nozzle.' });
  }

  const dispenserCodes = new Set<string>();
  for (const dispenser of draft.dispensers) {
    const code = dispenser.code.trim().toUpperCase();
    if (!dispenser.name.trim()) {
      issues.push({ step: 5, message: 'Every dispenser needs a name.' });
    }
    if (!dispenser.code.trim()) {
      issues.push({ step: 5, message: 'Every dispenser needs a code.' });
    }
    if (dispenserCodes.has(code)) {
      issues.push({ step: 5, message: `Duplicate dispenser code "${dispenser.code}" found.` });
    }
    dispenserCodes.add(code);
  }

  for (const nozzle of draft.nozzles) {
    if (!nozzle.name.trim()) {
      issues.push({ step: 5, message: 'Every nozzle needs a name.' });
    }
    if (!nozzle.dispenserDraftId || !dispenserMap.has(nozzle.dispenserDraftId)) {
      issues.push({ step: 5, message: `Nozzle "${nozzle.name || 'Untitled nozzle'}" must be linked to a dispenser.` });
    }
    if (!nozzle.tankDraftId || !tankMap.has(nozzle.tankDraftId)) {
      issues.push({ step: 5, message: `Nozzle "${nozzle.name || 'Untitled nozzle'}" must be linked to a tank.` });
    }
    if (!nozzle.productDraftId || !productMap.has(nozzle.productDraftId)) {
      issues.push({ step: 5, message: `Nozzle "${nozzle.name || 'Untitled nozzle'}" must be linked to a fuel product.` });
    }
    if (nozzle.openingReading < 0) {
      issues.push({ step: 6, message: `Nozzle "${nozzle.name || 'Untitled nozzle'}" needs a non-negative opening reading.` });
    }

    const tank = nozzle.tankDraftId ? tankMap.get(nozzle.tankDraftId) : null;
    if (tank && tank.productDraftId !== nozzle.productDraftId) {
      issues.push({ step: 5, message: `Nozzle "${nozzle.name || 'Untitled nozzle'}" fuel must match the selected tank.` });
    }
  }

  if (draft.shiftTemplates.length === 0) {
    issues.push({ step: 7, message: 'Add at least one shift template.' });
  }

  for (const template of draft.shiftTemplates) {
    if (!template.name.trim()) {
      issues.push({ step: 7, message: 'Every shift template needs a name.' });
    }
    if (!template.startTime || !template.endTime) {
      issues.push({ step: 7, message: `Shift template "${template.name || 'Untitled shift'}" needs start and end times.` });
    }
  }

  // Payment terminals are optional, but any added must be valid + uniquely labelled.
  const terminalLabels = new Set<string>();
  for (const terminal of draft.paymentTerminals ?? []) {
    const label = terminal.label.trim().toLowerCase();
    if (!terminal.label.trim()) {
      issues.push({ step: 8, message: 'Every payment terminal needs a label.' });
    } else if (terminalLabels.has(label)) {
      issues.push({ step: 8, message: `Duplicate payment terminal label "${terminal.label}" found.` });
    }
    if (!terminal.supportsCard && !terminal.supportsUpi) {
      issues.push({ step: 8, message: `Terminal "${terminal.label || 'Untitled terminal'}" must support card and/or UPI.` });
    }
    terminalLabels.add(label);
  }

  return issues;
}
