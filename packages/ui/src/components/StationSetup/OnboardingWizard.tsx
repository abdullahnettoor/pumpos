import React, { useEffect, useMemo, useState } from 'react';
import {
  FinalizeOnboardingResult,
  OnboardingDispenserDraft,
  OnboardingDraft,
  OnboardingNozzleDraft,
  OnboardingProductDraft,
  OnboardingShiftTemplateDraft,
  OnboardingTankDraft,
  Station,
} from '@pump/shared';
import { CloudStationService } from '../../services/cloud.js';
import { Drawer } from '../Drawer.js';
import { Button, Chip } from '../../pump-ds/index.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import {
  clearStoredOnboardingDraft,
  createDefaultOperatingSchedule,
  createDispenserDraft,
  createDraftId,
  createEmptyOnboardingDraft,
  createFuelDraft,
  createNozzleDraft,
  createShiftTemplateDraft,
  createTankDraft,
  loadStoredOnboardingDraft,
  saveStoredOnboardingDraft,
  validateOnboardingDraft,
  WEEKDAY_ORDER,
} from './onboardingDraft.js';

// Import sub-step components
import { Step1StationBasics } from './OnboardingSteps/Step1StationBasics.js';
import { Step2BusinessRules } from './OnboardingSteps/Step2BusinessRules.js';
import { Step3FuelsCatalog } from './OnboardingSteps/Step3FuelsCatalog.js';
import { Step4Tanks } from './OnboardingSteps/Step4Tanks.js';
import { Step5Dispensers } from './OnboardingSteps/Step5Dispensers.js';
import { Step6OpeningValues } from './OnboardingSteps/Step6OpeningValues.js';
import { Step7ShiftTemplates } from './OnboardingSteps/Step7ShiftTemplates.js';
import { Step8PaymentTerminals } from './OnboardingSteps/Step8PaymentTerminals.js';
import { Step8Review } from './OnboardingSteps/Step8Review.js';

const stationService = new CloudStationService();

interface OnboardingWizardProps {
  onOnboardingComplete: (station: Station) => void;
  userName: string;
}

const steps = [
  { num: 1, title: 'Station Basics' },
  { num: 2, title: 'Business Rules' },
  { num: 3, title: 'Fuels & Rates' },
  { num: 4, title: 'Tanks' },
  { num: 5, title: 'Dispensers & Nozzles' },
  { num: 6, title: 'Opening / Current Values' },
  { num: 7, title: 'Shift Templates' },
  { num: 8, title: 'Payment Terminals' },
  { num: 9, title: 'Review & Provision' },
] as const;

const provisioningStages = [
  'Validating draft',
  'Creating station',
  'Linking infrastructure',
  'Applying opening values',
  'Finalizing setup',
];

const panelStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-card)',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-muted)',
};

const inputStyle: React.CSSProperties = {
  height: '34px',
  padding: '0 10px',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--border-strong)',
  fontSize: '13px',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-strong)',
};

const textAreaStyle: React.CSSProperties = {
  minHeight: '72px',
  padding: '10px',
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--border-strong)',
  fontSize: '13px',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-strong)',
  resize: 'vertical',
};

function cloneFuelDraft(product?: OnboardingProductDraft | null): OnboardingProductDraft {
  return product ? { ...product, taxConfig: { ...product.taxConfig } } : createFuelDraft();
}

function cloneTankDraft(tank?: OnboardingTankDraft | null, productDraftId = ''): OnboardingTankDraft {
  return tank ? { ...tank } : createTankDraft(productDraftId);
}

function cloneShiftTemplateDraft(template?: OnboardingShiftTemplateDraft | null): OnboardingShiftTemplateDraft {
  return template ? { ...template } : createShiftTemplateDraft();
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutesToTime(min: number): string {
  const norm = (min % 1440 + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function cloneDispenserDraft(dispenser?: OnboardingDispenserDraft | null): OnboardingDispenserDraft {
  return dispenser ? { ...dispenser } : createDispenserDraft();
}

function cloneNozzleDraft(nozzle?: OnboardingNozzleDraft | null, defaults?: Partial<OnboardingNozzleDraft>): OnboardingNozzleDraft {
  if (nozzle) return { ...nozzle };
  return {
    ...createNozzleDraft(defaults?.dispenserDraftId || '', defaults?.tankDraftId || '', defaults?.productDraftId || ''),
    ...defaults,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onOnboardingComplete,
  userName,
}) => {
  const [draft, setDraft] = useState<OnboardingDraft>(createEmptyOnboardingDraft());
  const [currentStep, setCurrentStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const confirm = useConfirm();

  // Modal Drawers
  const [fuelDrawer, setFuelDrawer] = useState<OnboardingProductDraft | null>(null);
  const [tankDrawer, setTankDrawer] = useState<OnboardingTankDraft | null>(null);
  const [shiftTemplateDrawer, setShiftTemplateDrawer] = useState<OnboardingShiftTemplateDraft | null>(null);
  const [dispenserDrawer, setDispenserDrawer] = useState<{
    dispenser: OnboardingDispenserDraft;
    nozzles: OnboardingNozzleDraft[];
  } | null>(null);

  const [provisioning, setProvisioning] = useState<{
    isOpen: boolean;
    stageIndex: number;
    failedMessage?: string | null;
    failedStage?: string | null;
    completed: boolean;
  }>({
    isOpen: false,
    stageIndex: 0,
    failedMessage: null,
    failedStage: null,
    completed: false,
  });

  useEffect(() => {
    const stored = loadStoredOnboardingDraft();
    if (stored?.draft) {
      setDraft(stored.draft);
      setCurrentStep(Math.min(Math.max(stored.currentStep || 1, 1), steps.length));
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveStoredOnboardingDraft({ draft, currentStep });
  }, [draft, currentStep, isHydrated]);

  const validationIssues = useMemo(() => validateOnboardingDraft(draft), [draft]);
  const hasQuickMs = draft.products.some((product) => product.code.toUpperCase() === 'MS');
  const hasQuickHsd = draft.products.some((product) => product.code.toUpperCase() === 'HSD');

  const updateDraft = (updater: (prev: OnboardingDraft) => OnboardingDraft) => {
    setDraft((prev) => updater(prev));
  };

  const syncTwentyFourSeven = (enabled: boolean) => {
    updateDraft((prev) => ({
      ...prev,
      businessRules: {
        ...prev.businessRules,
        operatingSchedule: enabled
          ? {
              isTwentyFourSeven: true,
              days: WEEKDAY_ORDER.map((day) => ({
                day,
                isOpen: true,
                openTime: '00:00',
                closeTime: '23:59',
              })),
            }
          : {
              ...createDefaultOperatingSchedule(),
              isTwentyFourSeven: false,
            },
      },
    }));
  };

  const openDispenserDrawer = (dispenser?: OnboardingDispenserDraft) => {
    const target = cloneDispenserDraft(dispenser ?? null);
    if (!dispenser) {
      const nextIndex = draft.dispensers.length + 1;
      target.name = `Dispenser ${nextIndex}`;
      target.code = `DU-${nextIndex}`;
    }
    setDispenserDrawer({
      dispenser: target,
      nozzles: draft.nozzles
        .filter((nozzle) => nozzle.dispenserDraftId === target.draftId)
        .map((nozzle) => ({ ...nozzle })),
    });
  };

  const handleAddDualDispenser = () => {
    const nextIndex = draft.dispensers.length + 1;
    const dispenserId = createDraftId();
    const newDispenser: OnboardingDispenserDraft = {
      draftId: dispenserId,
      name: `Dispenser ${nextIndex}`,
      code: `DU-${nextIndex}`,
      status: 'ACTIVE',
    };

    const msProducts = draft.products.filter(p => p.code.toUpperCase() === 'MS');
    const hsdProducts = draft.products.filter(p => p.code.toUpperCase() === 'HSD');

    const msProduct = msProducts[0] || draft.products[0];
    const hsdProduct = hsdProducts[0] || draft.products[1] || draft.products[0];

    const msTanks = msProduct ? draft.tanks.filter(t => t.productDraftId === msProduct.draftId) : [];
    const hsdTanks = hsdProduct ? draft.tanks.filter(t => t.productDraftId === hsdProduct.draftId) : [];

    const msTank = msTanks[0] || draft.tanks[0];
    const hsdTank = hsdTanks[0] || draft.tanks[1] || draft.tanks[0];

    const nozzleBase = draft.nozzles.length;
    const nozzle1: OnboardingNozzleDraft = {
      draftId: createDraftId(),
      dispenserDraftId: dispenserId,
      tankDraftId: msTank?.draftId || '',
      productDraftId: msProduct?.draftId || '',
      name: `N${nozzleBase + 1}`,
      openingReading: 0,
    };

    const nozzle2: OnboardingNozzleDraft = {
      draftId: createDraftId(),
      dispenserDraftId: dispenserId,
      tankDraftId: hsdTank?.draftId || '',
      productDraftId: hsdProduct?.draftId || '',
      name: `N${nozzleBase + 2}`,
      openingReading: 0,
    };

    updateDraft((prev) => ({
      ...prev,
      dispensers: [...prev.dispensers, newDispenser],
      nozzles: [...prev.nozzles, nozzle1, nozzle2],
    }));
  };

  const handleAddQuadDispenser = () => {
    const nextIndex = draft.dispensers.length + 1;
    const dispenserId = createDraftId();
    const newDispenser: OnboardingDispenserDraft = {
      draftId: dispenserId,
      name: `Dispenser ${nextIndex}`,
      code: `DU-${nextIndex}`,
      status: 'ACTIVE',
    };

    const msProducts = draft.products.filter(p => p.code.toUpperCase() === 'MS');
    const hsdProducts = draft.products.filter(p => p.code.toUpperCase() === 'HSD');

    const msProduct = msProducts[0] || draft.products[0];
    const hsdProduct = hsdProducts[0] || draft.products[1] || draft.products[0];

    const msTanks = msProduct ? draft.tanks.filter(t => t.productDraftId === msProduct.draftId) : [];
    const hsdTanks = hsdProduct ? draft.tanks.filter(t => t.productDraftId === hsdProduct.draftId) : [];

    const msTank1 = msTanks[0] || draft.tanks[0];
    const msTank2 = msTanks[1] || msTanks[0] || draft.tanks[0];
    const hsdTank1 = hsdTanks[0] || draft.tanks[1] || draft.tanks[0];
    const hsdTank2 = hsdTanks[1] || hsdTanks[0] || draft.tanks[1] || draft.tanks[0];

    const nozzleBase = draft.nozzles.length;
    const nozzles: OnboardingNozzleDraft[] = [
      {
        draftId: createDraftId(),
        dispenserDraftId: dispenserId,
        tankDraftId: msTank1?.draftId || '',
        productDraftId: msProduct?.draftId || '',
        name: `N${nozzleBase + 1}`,
        openingReading: 0,
      },
      {
        draftId: createDraftId(),
        dispenserDraftId: dispenserId,
        tankDraftId: msTank2?.draftId || '',
        productDraftId: msProduct?.draftId || '',
        name: `N${nozzleBase + 2}`,
        openingReading: 0,
      },
      {
        draftId: createDraftId(),
        dispenserDraftId: dispenserId,
        tankDraftId: hsdTank1?.draftId || '',
        productDraftId: hsdProduct?.draftId || '',
        name: `N${nozzleBase + 3}`,
        openingReading: 0,
      },
      {
        draftId: createDraftId(),
        dispenserDraftId: dispenserId,
        tankDraftId: hsdTank2?.draftId || '',
        productDraftId: hsdProduct?.draftId || '',
        name: `N${nozzleBase + 4}`,
        openingReading: 0,
      },
    ];

    updateDraft((prev) => ({
      ...prev,
      dispensers: [...prev.dispensers, newDispenser],
      nozzles: [...prev.nozzles, ...nozzles],
    }));
  };

  const saveFuel = () => {
    if (!fuelDrawer) return;
    updateDraft((prev) => {
      const exists = prev.products.some((product) => product.draftId === fuelDrawer.draftId);
      return {
        ...prev,
        products: exists
          ? prev.products.map((product) => (product.draftId === fuelDrawer.draftId ? fuelDrawer : product))
          : [...prev.products, fuelDrawer],
      };
    });
    setFuelDrawer(null);
  };

  const saveTank = () => {
    if (!tankDrawer) return;
    updateDraft((prev) => {
      const exists = prev.tanks.some((tank) => tank.draftId === tankDrawer.draftId);
      return {
        ...prev,
        tanks: exists
          ? prev.tanks.map((tank) => (tank.draftId === tankDrawer.draftId ? tankDrawer : tank))
          : [...prev.tanks, tankDrawer],
      };
    });
    setTankDrawer(null);
  };

  const saveShiftTemplate = () => {
    if (!shiftTemplateDrawer) return;
    updateDraft((prev) => {
      const exists = prev.shiftTemplates.some((template) => template.draftId === shiftTemplateDrawer.draftId);
      return {
        ...prev,
        shiftTemplates: exists
          ? prev.shiftTemplates.map((template) => (template.draftId === shiftTemplateDrawer.draftId ? shiftTemplateDrawer : template))
          : [...prev.shiftTemplates, shiftTemplateDrawer],
      };
    });
    setShiftTemplateDrawer(null);
  };

  const saveDispenser = () => {
    if (!dispenserDrawer) return;
    updateDraft((prev) => {
      const otherNozzles = prev.nozzles.filter((nozzle) => nozzle.dispenserDraftId !== dispenserDrawer.dispenser.draftId);
      const dispenserExists = prev.dispensers.some((item) => item.draftId === dispenserDrawer.dispenser.draftId);

      return {
        ...prev,
        dispensers: dispenserExists
          ? prev.dispensers.map((item) => (item.draftId === dispenserDrawer.dispenser.draftId ? dispenserDrawer.dispenser : item))
          : [...prev.dispensers, dispenserDrawer.dispenser],
        nozzles: [...otherNozzles, ...dispenserDrawer.nozzles],
      };
    });
    setDispenserDrawer(null);
  };

  const removeProduct = (draftId: string) => {
    updateDraft((prev) => ({
      ...prev,
      products: prev.products.filter((product) => product.draftId !== draftId),
      tanks: prev.tanks.filter((tank) => tank.productDraftId !== draftId),
      nozzles: prev.nozzles.filter((nozzle) => nozzle.productDraftId !== draftId),
    }));
  };

  const removeTank = (draftId: string) => {
    updateDraft((prev) => ({
      ...prev,
      tanks: prev.tanks.filter((tank) => tank.draftId !== draftId),
      nozzles: prev.nozzles.filter((nozzle) => nozzle.tankDraftId !== draftId),
    }));
  };

  const removeDispenser = (draftId: string) => {
    updateDraft((prev) => ({
      ...prev,
      dispensers: prev.dispensers.filter((dispenser) => dispenser.draftId !== draftId),
      nozzles: prev.nozzles.filter((nozzle) => nozzle.dispenserDraftId !== draftId),
    }));
  };

  const removeShiftTemplate = (draftId: string) => {
    updateDraft((prev) => ({
      ...prev,
      shiftTemplates: prev.shiftTemplates.filter((template) => template.draftId !== draftId),
    }));
  };

  const handleQuickFuel = (type: 'MS' | 'HSD') => {
    if ((type === 'MS' && hasQuickMs) || (type === 'HSD' && hasQuickHsd)) return;

    const product: OnboardingProductDraft = {
      ...createFuelDraft(),
      name: type === 'MS' ? 'Petrol' : 'Diesel',
      code: type,
      taxConfig: { gst_rate: 0, hsn_code: '2710' },
      currentPrice: 0,
    };

    updateDraft((prev) => ({
      ...prev,
      products: [...prev.products, product],
    }));
  };

  const handleQuickAddTank = (productDraftId: string, productName: string, capacity: number) => {
    const existingOfProduct = draft.tanks.filter((t) => t.productDraftId === productDraftId);
    const name = `${productName} Tank ${existingOfProduct.length + 1}`;
    updateDraft((prev) => ({
      ...prev,
      tanks: [
        ...prev.tanks,
        {
          draftId: createDraftId(),
          name,
          productDraftId,
          capacity,
          openingQuantity: 0,
          openingCostRate: 0,
        },
      ],
    }));
  };

  const handleAutofillShifts = (count: 2 | 3) => {
    const is247 = draft.businessRules.operatingSchedule.isTwentyFourSeven;
    const bizStart = draft.businessRules.businessDayStartsAt || '06:00';
    
    let templates: OnboardingShiftTemplateDraft[] = [];

    if (is247) {
      const startMin = parseTimeToMinutes(bizStart);
      if (count === 2) {
        templates = [
          {
            draftId: createDraftId(),
            name: 'Day Shift',
            startTime: formatMinutesToTime(startMin),
            endTime: formatMinutesToTime(startMin + 12 * 60),
            isActive: true,
          },
          {
            draftId: createDraftId(),
            name: 'Night Shift',
            startTime: formatMinutesToTime(startMin + 12 * 60),
            endTime: formatMinutesToTime(startMin),
            isActive: true,
          },
        ];
      } else {
        templates = [
          {
            draftId: createDraftId(),
            name: 'Morning Shift',
            startTime: formatMinutesToTime(startMin),
            endTime: formatMinutesToTime(startMin + 8 * 60),
            isActive: true,
          },
          {
            draftId: createDraftId(),
            name: 'Evening Shift',
            startTime: formatMinutesToTime(startMin + 8 * 60),
            endTime: formatMinutesToTime(startMin + 16 * 60),
            isActive: true,
          },
          {
            draftId: createDraftId(),
            name: 'Night Shift',
            startTime: formatMinutesToTime(startMin + 16 * 60),
            endTime: formatMinutesToTime(startMin),
            isActive: true,
          },
        ];
      }
    } else {
      const openDay = draft.businessRules.operatingSchedule.days.find(d => d.isOpen);
      const openTime = openDay?.openTime || '06:00';
      const closeTime = openDay?.closeTime || '22:00';

      const openMin = parseTimeToMinutes(openTime);
      let closeMin = parseTimeToMinutes(closeTime);
      if (closeMin <= openMin) {
        closeMin += 1440;
      }

      const duration = closeMin - openMin;
      const step = duration / count;

      if (count === 2) {
        templates = [
          {
            draftId: createDraftId(),
            name: 'First Shift',
            startTime: formatMinutesToTime(openMin),
            endTime: formatMinutesToTime(openMin + step),
            isActive: true,
          },
          {
            draftId: createDraftId(),
            name: 'Second Shift',
            startTime: formatMinutesToTime(openMin + step),
            endTime: formatMinutesToTime(closeMin),
            isActive: true,
          },
        ];
      } else {
        templates = [
          {
            draftId: createDraftId(),
            name: 'Morning Shift',
            startTime: formatMinutesToTime(openMin),
            endTime: formatMinutesToTime(openMin + step),
            isActive: true,
          },
          {
            draftId: createDraftId(),
            name: 'Afternoon Shift',
            startTime: formatMinutesToTime(openMin + step),
            endTime: formatMinutesToTime(openMin + 2 * step),
            isActive: true,
          },
          {
            draftId: createDraftId(),
            name: 'Evening Shift',
            startTime: formatMinutesToTime(openMin + 2 * step),
            endTime: formatMinutesToTime(closeMin),
            isActive: true,
          },
        ];
      }
    }

    updateDraft((prev) => ({
      ...prev,
      shiftTemplates: templates,
    }));
  };

  const discardDraft = async () => {
    if (!(await confirm({ title: 'Discard onboarding draft?', message: 'This will clear the locally stored setup and start over.', confirmLabel: 'Discard', danger: true }))) return;
    clearStoredOnboardingDraft();
    setDraft(createEmptyOnboardingDraft());
    setCurrentStep(1);
    setErrorMsg(null);
  };

  const moveToStep = (step: number) => {
    setCurrentStep(step);
    setErrorMsg(null);
  };

  const handleNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, steps.length));
    setErrorMsg(null);
  };

  const handleProvision = async () => {
    const issues = validateOnboardingDraft(draft);
    if (issues.length > 0) {
      const firstIssue = issues[0];
      setErrorMsg(firstIssue.message);
      setCurrentStep(firstIssue.step);
      return;
    }

    setErrorMsg(null);
    setProvisioning({
      isOpen: true,
      stageIndex: 0,
      failedMessage: null,
      failedStage: null,
      completed: false,
    });

    try {
      await wait(150);
      setProvisioning((prev) => ({ ...prev, stageIndex: 1 }));
      const result = await stationService.finalizeOnboarding({ draft }) as FinalizeOnboardingResult;

      setProvisioning((prev) => ({ ...prev, stageIndex: 2 }));
      await wait(150);
      setProvisioning((prev) => ({ ...prev, stageIndex: 3 }));
      await wait(150);
      setProvisioning((prev) => ({ ...prev, stageIndex: 4 }));
      await wait(150);
      setProvisioning((prev) => ({ ...prev, completed: true }));
      clearStoredOnboardingDraft();
      await wait(300);
      onOnboardingComplete(result.station);
    } catch (err: any) {
      const stageName = err?.details?.stage || provisioningStages[1];
      setProvisioning((prev) => ({
        ...prev,
        failedMessage: err.message || 'Provisioning failed',
        failedStage: stageName,
        completed: false,
      }));
    }
  };

  if (!isHydrated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--text-muted)' }}>
        Preparing onboarding workspace...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--bg-canvas)', overflow: 'hidden' }}>
      <header style={{
        height: '68px',
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        gap: '16px',
        flexShrink: 0,
        position: 'relative',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-strong)' }}>PumpOS Setup</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Smooth station provisioning for {userName}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
            {steps[currentStep - 1].title}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {steps.map((s) => (
              <span
                key={s.num}
                onClick={() => {
                  if (s.num <= currentStep) moveToStep(s.num);
                }}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: currentStep === s.num
                    ? 'var(--brand-primary)'
                    : currentStep > s.num
                      ? 'var(--state-success-fg)'
                      : 'var(--border-strong)',
                  cursor: s.num <= currentStep ? 'pointer' : 'default',
                  transition: 'background-color 200ms ease',
                }}
                title={s.title}
              />
            ))}
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={discardDraft}
        >
          Discard Draft
        </Button>

        {/* Global Progress Bar */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '2.5px',
          backgroundColor: 'var(--border-soft)',
        }}>
          <div style={{
            height: '100%',
            width: `${(currentStep / steps.length) * 100}%`,
            backgroundColor: 'var(--brand-primary)',
            transition: 'width 250ms ease-out',
          }} />
        </div>
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '1120px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {errorMsg && (
            <div style={{
              backgroundColor: 'var(--state-danger-bg)',
              color: 'var(--state-danger-fg)',
              border: '1px solid rgba(159, 63, 54, 0.15)',
              borderRadius: 'var(--radius-card)',
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: 500,
            }}>
              {errorMsg}
            </div>
          )}

          {currentStep === 1 && (
            <Step1StationBasics
              draft={draft}
              updateDraft={updateDraft}
              panelStyle={panelStyle}
              fieldLabelStyle={fieldLabelStyle}
              inputStyle={inputStyle}
              textAreaStyle={textAreaStyle}
            />
          )}

          {currentStep === 2 && (
            <Step2BusinessRules
              draft={draft}
              updateDraft={updateDraft}
              syncTwentyFourSeven={syncTwentyFourSeven}
              panelStyle={panelStyle}
              fieldLabelStyle={fieldLabelStyle}
              inputStyle={inputStyle}
            />
          )}

          {currentStep === 3 && (
            <Step3FuelsCatalog
              draft={draft}
              hasQuickMs={hasQuickMs}
              hasQuickHsd={hasQuickHsd}
              handleQuickFuel={handleQuickFuel}
              onAddProduct={() => setFuelDrawer(cloneFuelDraft())}
              onEditProduct={(p) => setFuelDrawer(cloneFuelDraft(p))}
              onRemoveProduct={removeProduct}
              panelStyle={panelStyle}
            />
          )}

          {currentStep === 4 && (
            <Step4Tanks
              draft={draft}
              handleQuickAddTank={handleQuickAddTank}
              onAddTank={() => setTankDrawer(cloneTankDraft(null, draft.products[0]?.draftId || ''))}
              onEditTank={(t) => setTankDrawer(cloneTankDraft(t))}
              onRemoveTank={removeTank}
              panelStyle={panelStyle}
              inputStyle={inputStyle}
            />
          )}

          {currentStep === 5 && (
            <Step5Dispensers
              draft={draft}
              onAddDualDispenser={handleAddDualDispenser}
              onAddQuadDispenser={handleAddQuadDispenser}
              onAddCustomDispenser={() => openDispenserDrawer()}
              onManageDispenser={(du) => openDispenserDrawer(du)}
              onRemoveDispenser={removeDispenser}
              panelStyle={panelStyle}
            />
          )}

          {currentStep === 6 && (
            <Step6OpeningValues
              draft={draft}
              updateDraft={updateDraft}
              panelStyle={panelStyle}
              fieldLabelStyle={fieldLabelStyle}
              inputStyle={inputStyle}
            />
          )}

          {currentStep === 7 && (
            <Step7ShiftTemplates
              draft={draft}
              onAutofillShifts={handleAutofillShifts}
              onAddShiftTemplate={() => setShiftTemplateDrawer(cloneShiftTemplateDraft())}
              onEditShiftTemplate={(st) => setShiftTemplateDrawer(cloneShiftTemplateDraft(st))}
              onRemoveShiftTemplate={removeShiftTemplate}
              panelStyle={panelStyle}
            />
          )}

          {currentStep === 8 && (
            <Step8PaymentTerminals
              draft={draft}
              updateDraft={updateDraft}
              panelStyle={panelStyle}
              fieldLabelStyle={fieldLabelStyle}
              inputStyle={inputStyle}
            />
          )}

          {currentStep === 9 && (
            <Step8Review
              draft={draft}
              validationIssues={validationIssues}
              moveToStep={moveToStep}
              panelStyle={panelStyle}
              fieldLabelStyle={fieldLabelStyle}
            />
          )}
        </div>
      </main>

      <footer style={{
        height: '72px',
        backgroundColor: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        flexShrink: 0,
      }}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 1))}
          disabled={currentStep === 1}
        >
          Previous Step
        </Button>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Step {currentStep} of {steps.length}
        </div>

        {currentStep === steps.length ? (
          <Button type="button" variant="primary" size="md" onClick={handleProvision}>
            Provision Station
          </Button>
        ) : (
          <Button type="button" variant="primary" size="md" onClick={handleNext}>
            Next Step
          </Button>
        )}
      </footer>

      {/* Creation/Edit Drawer Modals (Shared context modals for clean view step layouts) */}
      <Drawer
        isOpen={!!fuelDrawer}
        onClose={() => setFuelDrawer(null)}
        title={fuelDrawer?.draftId ? 'Fuel Configuration' : 'Add Fuel'}
      >
        {fuelDrawer && (
          <form
            onSubmit={(e) => { e.preventDefault(); saveFuel(); }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Fuel Name *</label>
              <input
                type="text"
                value={fuelDrawer.name}
                onChange={(e) => setFuelDrawer({ ...fuelDrawer, name: e.target.value })}
                placeholder="e.g. Petrol (MS)"
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-strong)'
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Fuel Code *</label>
              <input
                type="text"
                value={fuelDrawer.code}
                onChange={(e) => setFuelDrawer({ ...fuelDrawer, code: e.target.value.toUpperCase() })}
                placeholder="e.g. MS"
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-strong)'
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Sales Unit *</label>
              <input
                type="text"
                value={fuelDrawer.unit}
                onChange={(e) => setFuelDrawer({ ...fuelDrawer, unit: e.target.value })}
                placeholder="e.g. Liters"
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-strong)'
                }}
                required
              />
            </div>



            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button
                type="submit"
                style={{
                  flex: 1,
                  height: '32px',
                  backgroundColor: 'var(--brand-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Save Fuel
              </button>
              <button
                type="button"
                onClick={() => setFuelDrawer(null)}
                style={{
                  flex: 1,
                  height: '32px',
                  backgroundColor: 'var(--bg-surface-alt)',
                  color: 'var(--text-default)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Drawer>

      <Drawer
        isOpen={!!tankDrawer}
        onClose={() => setTankDrawer(null)}
        title="Tank Configuration"
      >
        {tankDrawer && (
          <form
            onSubmit={(e) => { e.preventDefault(); saveTank(); }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Tank Identifier *</label>
              <input
                type="text"
                value={tankDrawer.name}
                onChange={(e) => setTankDrawer({ ...tankDrawer, name: e.target.value })}
                placeholder="e.g. Tank 1"
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-strong)'
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Linked Fuel Product *</label>
              <select
                value={tankDrawer.productDraftId}
                onChange={(e) => setTankDrawer({ ...tankDrawer, productDraftId: e.target.value })}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-strong)'
                }}
                required
              >
                <option value="">Select fuel</option>
                {draft.products.map((product) => (
                  <option key={product.draftId} value={product.draftId}>
                    {product.name || product.code}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Capacity (Liters) *</label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={tankDrawer.capacity || ''}
                onChange={(e) => setTankDrawer({ ...tankDrawer, capacity: Number(e.target.value) || 0 })}
                placeholder="e.g. 20000"
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-strong)'
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button
                type="submit"
                style={{
                  flex: 1,
                  height: '32px',
                  backgroundColor: 'var(--brand-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Save Tank
              </button>
              <button
                type="button"
                onClick={() => setTankDrawer(null)}
                style={{
                  flex: 1,
                  height: '32px',
                  backgroundColor: 'var(--bg-surface-alt)',
                  color: 'var(--text-default)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Drawer>

      <Drawer
        isOpen={!!shiftTemplateDrawer}
        onClose={() => setShiftTemplateDrawer(null)}
        title="Shift Template"
      >
        {shiftTemplateDrawer && (
          <form
            onSubmit={(e) => { e.preventDefault(); saveShiftTemplate(); }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Template Name *</label>
              <input
                type="text"
                value={shiftTemplateDrawer.name}
                onChange={(e) => setShiftTemplateDrawer({ ...shiftTemplateDrawer, name: e.target.value })}
                placeholder="e.g. Morning Shift"
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-strong)'
                }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Start Time *</label>
                <input
                  type="time"
                  value={shiftTemplateDrawer.startTime}
                  onChange={(e) => setShiftTemplateDrawer({ ...shiftTemplateDrawer, startTime: e.target.value })}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-strong)'
                  }}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>End Time *</label>
                <input
                  type="time"
                  value={shiftTemplateDrawer.endTime}
                  onChange={(e) => setShiftTemplateDrawer({ ...shiftTemplateDrawer, endTime: e.target.value })}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-strong)'
                  }}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button
                type="submit"
                style={{
                  flex: 1,
                  height: '32px',
                  backgroundColor: 'var(--brand-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Save Template
              </button>
              <button
                type="button"
                onClick={() => setShiftTemplateDrawer(null)}
                style={{
                  flex: 1,
                  height: '32px',
                  backgroundColor: 'var(--bg-surface-alt)',
                  color: 'var(--text-default)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Drawer>

      <Drawer
        isOpen={!!dispenserDrawer}
        onClose={() => setDispenserDrawer(null)}
        title="Dispenser & Nozzles"
      >
        {dispenserDrawer && (
          <form
            onSubmit={(e) => { e.preventDefault(); saveDispenser(); }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Dispenser Name *</label>
              <input
                type="text"
                value={dispenserDrawer.dispenser.name}
                onChange={(e) => setDispenserDrawer({ ...dispenserDrawer, dispenser: { ...dispenserDrawer.dispenser, name: e.target.value } })}
                placeholder="e.g. Dispenser 1"
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-strong)'
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Code / Reference ID *</label>
              <input
                type="text"
                value={dispenserDrawer.dispenser.code}
                onChange={(e) => setDispenserDrawer({ ...dispenserDrawer, dispenser: { ...dispenserDrawer.dispenser, code: e.target.value.toUpperCase() } })}
                placeholder="e.g. DU-01"
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-strong)'
                }}
                required
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>Nozzle Mappings</h4>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Map each nozzle to a storage tank and fuel type.</p>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    style={{
                      height: '26px',
                      padding: '0 8px',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--text-strong)',
                      borderRadius: 'var(--radius-button)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      const otherNozzlesCount = draft.nozzles.filter((n) => n.dispenserDraftId !== dispenserDrawer.dispenser.draftId).length;
                      const nextNum = otherNozzlesCount + dispenserDrawer.nozzles.length + 1;
                      const firstTank = draft.tanks[0];
                      const defaultFuelId = firstTank?.productDraftId || draft.products[0]?.draftId || '';
                      const defaultTankId = firstTank?.draftId || '';
                      setDispenserDrawer({
                        ...dispenserDrawer,
                        nozzles: [
                          ...dispenserDrawer.nozzles,
                          cloneNozzleDraft(null, {
                            dispenserDraftId: dispenserDrawer.dispenser.draftId,
                            tankDraftId: defaultTankId,
                            productDraftId: defaultFuelId,
                            name: `N${nextNum}`,
                          }),
                        ],
                      });
                    }}
                  >
                    + Nozzle
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {dispenserDrawer.nozzles.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', border: '1px dashed var(--border-soft)', borderRadius: 'var(--radius-card)' }}>
                    No nozzles configured for this dispenser yet.
                  </div>
                ) : (
                  dispenserDrawer.nozzles.map((nozzle, index) => {
                    const filteredTanks = draft.tanks.filter(t => t.productDraftId === nozzle.productDraftId);
                    return (
                      <div
                        key={nozzle.draftId}
                        style={{
                          padding: '12px',
                          border: '1px solid var(--border-soft)',
                          borderRadius: '6px',
                          backgroundColor: 'var(--bg-surface-alt)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Nozzle #{index + 1}</span>
                          <button
                            type="button"
                            onClick={() => setDispenserDrawer({
                              ...dispenserDrawer,
                              nozzles: dispenserDrawer.nozzles.filter((item) => item.draftId !== nozzle.draftId),
                            })}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: 'var(--state-danger-fg)',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 600
                            }}
                          >
                            Remove
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Name</label>
                            <input
                              type="text"
                              value={nozzle.name}
                              onChange={(e) => setDispenserDrawer({
                                ...dispenserDrawer,
                                nozzles: dispenserDrawer.nozzles.map((item) => item.draftId === nozzle.draftId ? { ...item, name: e.target.value } : item),
                              })}
                              style={{
                                height: '28px',
                                padding: '0 8px',
                                borderRadius: 'var(--radius-input)',
                                border: '1px solid var(--border-strong)',
                                fontSize: '12px',
                                backgroundColor: 'var(--bg-surface)',
                                color: 'var(--text-strong)'
                              }}
                              required
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Opening Reading</label>
                            <input
                              type="number"
                              min={0}
                              step="0.001"
                              value={nozzle.openingReading ?? 0}
                              onChange={(e) => setDispenserDrawer({
                                ...dispenserDrawer,
                                nozzles: dispenserDrawer.nozzles.map((item) => item.draftId === nozzle.draftId ? { ...item, openingReading: Number(e.target.value) || 0 } : item),
                              })}
                              style={{
                                height: '28px',
                                padding: '0 8px',
                                borderRadius: 'var(--radius-input)',
                                border: '1px solid var(--border-strong)',
                                fontSize: '12px',
                                backgroundColor: 'var(--bg-surface)',
                                color: 'var(--text-strong)'
                              }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Fuel</label>
                            <select
                              value={nozzle.productDraftId}
                              onChange={(e) => {
                                const nextFuelId = e.target.value;
                                const firstMatchedTank = draft.tanks.find(t => t.productDraftId === nextFuelId);
                                setDispenserDrawer({
                                  ...dispenserDrawer,
                                  nozzles: dispenserDrawer.nozzles.map((item) =>
                                    item.draftId === nozzle.draftId
                                      ? { ...item, productDraftId: nextFuelId, tankDraftId: firstMatchedTank?.draftId || '' }
                                      : item
                                  ),
                                });
                              }}
                              style={{
                                height: '28px',
                                padding: '0 4px',
                                borderRadius: 'var(--radius-input)',
                                border: '1px solid var(--border-strong)',
                                fontSize: '12px',
                                backgroundColor: 'var(--bg-surface)',
                                color: 'var(--text-strong)'
                              }}
                              required
                            >
                              <option value="">Select fuel</option>
                              {draft.products.map(p => (
                                <option key={p.draftId} value={p.draftId}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tank</label>
                            <select
                              value={nozzle.tankDraftId}
                              onChange={(e) => setDispenserDrawer({
                                ...dispenserDrawer,
                                nozzles: dispenserDrawer.nozzles.map((item) => item.draftId === nozzle.draftId ? { ...item, tankDraftId: e.target.value } : item),
                              })}
                              style={{
                                height: '28px',
                                padding: '0 4px',
                                borderRadius: 'var(--radius-input)',
                                border: '1px solid var(--border-strong)',
                                fontSize: '12px',
                                backgroundColor: 'var(--bg-surface)',
                                color: 'var(--text-strong)'
                              }}
                              required
                            >
                              <option value="">Select tank</option>
                              {filteredTanks.map(t => (
                                <option key={t.draftId} value={t.draftId}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button
                type="submit"
                style={{
                  flex: 1,
                  height: '32px',
                  backgroundColor: 'var(--brand-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Save Dispenser
              </button>
              <button
                type="button"
                onClick={() => setDispenserDrawer(null)}
                style={{
                  flex: 1,
                  height: '32px',
                  backgroundColor: 'var(--bg-surface-alt)',
                  color: 'var(--text-default)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Drawer>

      {/* Provisioning overlay modal */}
      {provisioning.isOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '24px',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '520px',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-card)',
            border: '1px solid var(--border-soft)',
            boxShadow: '0 20px 48px rgba(15, 23, 42, 0.15)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>
                {provisioning.completed ? 'Station Provisioned' : 'Provisioning Station'}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {provisioning.failedMessage
                  ? 'The draft is still safe locally. Fix the issue and try again.'
                  : 'Applying the full onboarding draft in one backend workflow.'}
              </p>
            </div>

            <div style={{ height: '8px', backgroundColor: 'var(--bg-surface-alt)', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: provisioning.failedMessage
                    ? '100%'
                    : `${((provisioning.stageIndex + (provisioning.completed ? 1 : 0)) / provisioningStages.length) * 100}%`,
                  backgroundColor: provisioning.failedMessage ? 'var(--brand-danger)' : 'var(--brand-primary)',
                  transition: 'width 200ms ease',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {provisioningStages.map((stage, index) => {
                const isActive = provisioning.stageIndex === index && !provisioning.failedMessage && !provisioning.completed;
                const isCompleted = provisioning.completed || (!provisioning.failedMessage && provisioning.stageIndex > index);
                const isFailed = provisioning.failedStage === stage;

                return (
                  <div key={stage} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-card)',
                    backgroundColor: isActive ? 'var(--bg-surface-alt)' : 'transparent',
                    border: `1px solid ${isActive ? 'var(--border-strong)' : 'transparent'}`,
                  }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-default)', fontWeight: isActive ? 600 : 500 }}>{stage}</span>
                    {isFailed ? (
                      <Chip tone="danger" size="sm">Failed</Chip>
                    ) : isCompleted ? (
                      <Chip tone="success" size="sm">Done</Chip>
                    ) : isActive ? (
                      <Chip tone="info" size="sm">Running</Chip>
                    ) : (
                      <Chip tone="neutral" size="sm">Queued</Chip>
                    )}
                  </div>
                );
              })}
            </div>

            {provisioning.failedMessage && (
              <div style={{
                backgroundColor: 'var(--state-danger-bg)',
                color: 'var(--state-danger-fg)',
                borderRadius: 'var(--radius-card)',
                border: '1px solid rgba(159, 63, 54, 0.15)',
                padding: '12px 14px',
                fontSize: '12px',
              }}>
                {provisioning.failedMessage}
              </div>
            )}

            {(provisioning.failedMessage || provisioning.completed) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                {provisioning.failedMessage && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const msg = provisioning.failedMessage || '';
                      const stage = provisioning.failedStage || '';
                      let targetStep = 8;
                      const lower = msg.toLowerCase();
                      if (lower.includes('station name') || lower.includes('station code')) targetStep = 1;
                      else if (lower.includes('business day') || lower.includes('operating hour') || lower.includes('operating schedule') || lower.includes('timezone')) targetStep = 2;
                      else if (lower.includes('price') || lower.includes('selling rate') || lower.includes('fuel rate') || lower.includes('selling price')) targetStep = 6;
                      else if (lower.includes('fuel') || lower.includes('product')) targetStep = 3;
                      else if (lower.includes('opening stock') || lower.includes('capacity')) targetStep = 6;
                      else if (lower.includes('tank')) targetStep = 4;
                      else if (lower.includes('opening reading')) targetStep = 6;
                      else if (lower.includes('nozzle') || lower.includes('dispenser') || lower.includes('du')) targetStep = 5;
                      else if (lower.includes('shift template')) targetStep = 7;
                      else if (stage === 'Validating draft') targetStep = 8;
                      else if (stage === 'Creating station') targetStep = 1;
                      else if (stage === 'Linking infrastructure') targetStep = 4;
                      else if (stage === 'Applying opening values' || stage === 'Applying go-live values') targetStep = 6;

                      setCurrentStep(targetStep);
                      setProvisioning({
                        isOpen: false,
                        stageIndex: 0,
                        failedMessage: null,
                        failedStage: null,
                        completed: false,
                      });
                      setErrorMsg(msg);
                    }}
                  >
                    Go to Section
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setProvisioning({
                    isOpen: false,
                    stageIndex: 0,
                    failedMessage: null,
                    failedStage: null,
                    completed: false,
                  })}
                >
                  Close
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
