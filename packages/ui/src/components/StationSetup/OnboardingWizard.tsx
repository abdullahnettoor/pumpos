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
import { Button, Chip, EmptyState, Icon, SectionHeader } from '../../pump-ds/index.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { PageFrame } from '../page-frame/PageFrame.js';
import { Field, NumberInput, Select, TextInput } from '../primitives/Field.js';
import { STEP_PANEL } from './OnboardingSteps/stepLayout.js';
import { Check } from 'lucide-react';
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
import { useRunTask } from '../../utils/runTask.js';
import { officeSubmitKeys, sendKeyed } from '../../office-records/submitKeys.js';

const stationService = new CloudStationService();

interface OnboardingWizardProps {
  onOnboardingComplete: (station: Station) => void | Promise<unknown>;
  /** Leave onboarding (e.g. after discarding the draft) — host routes home. */
  onExit?: () => void;
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

function cloneFuelDraft(product?: OnboardingProductDraft | null): OnboardingProductDraft {
  return product ? { ...product, taxConfig: { ...product.taxConfig } } : createFuelDraft();
}

function cloneTankDraft(
  tank?: OnboardingTankDraft | null,
  productDraftId = '',
): OnboardingTankDraft {
  return tank ? { ...tank } : createTankDraft(productDraftId);
}

function cloneShiftTemplateDraft(
  template?: OnboardingShiftTemplateDraft | null,
): OnboardingShiftTemplateDraft {
  return template ? { ...template } : createShiftTemplateDraft();
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutesToTime(min: number): string {
  const norm = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function cloneDispenserDraft(
  dispenser?: OnboardingDispenserDraft | null,
): OnboardingDispenserDraft {
  return dispenser ? { ...dispenser } : createDispenserDraft();
}

function cloneNozzleDraft(
  nozzle?: OnboardingNozzleDraft | null,
  defaults?: Partial<OnboardingNozzleDraft>,
): OnboardingNozzleDraft {
  if (nozzle) return { ...nozzle };
  return {
    ...createNozzleDraft(
      defaults?.dispenserDraftId || '',
      defaults?.tankDraftId || '',
      defaults?.productDraftId || '',
    ),
    ...defaults,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onOnboardingComplete,
  onExit,
  userName,
}) => {
  const runTask = useRunTask();
  const [draft, setDraft] = useState<OnboardingDraft>(createEmptyOnboardingDraft());
  const [currentStep, setCurrentStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const confirm = useConfirm();

  // Modal Drawers
  const [fuelDrawer, setFuelDrawer] = useState<OnboardingProductDraft | null>(null);
  const [tankDrawer, setTankDrawer] = useState<OnboardingTankDraft | null>(null);
  const [shiftTemplateDrawer, setShiftTemplateDrawer] =
    useState<OnboardingShiftTemplateDraft | null>(null);
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
  const [provisionedStation, setProvisionedStation] = useState<Station | null>(null);

  useEffect(() => {
    const stored = loadStoredOnboardingDraft();
    if (stored?.draft) {
      setDraft(stored.draft);
      setCurrentStep(Math.min(Math.max(stored.currentStep || 1, 1), steps.length));
      // Resuming an existing draft — go straight to the steps.
      setShowIntro(false);
    } else {
      // Fresh start — show the prep/intro screen first.
      setShowIntro(true);
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

    const msProducts = draft.products.filter((p) => p.code.toUpperCase() === 'MS');
    const hsdProducts = draft.products.filter((p) => p.code.toUpperCase() === 'HSD');

    const msProduct = msProducts[0] || draft.products[0];
    const hsdProduct = hsdProducts[0] || draft.products[1] || draft.products[0];

    const msTanks = msProduct
      ? draft.tanks.filter((t) => t.productDraftId === msProduct.draftId)
      : [];
    const hsdTanks = hsdProduct
      ? draft.tanks.filter((t) => t.productDraftId === hsdProduct.draftId)
      : [];

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

    const msProducts = draft.products.filter((p) => p.code.toUpperCase() === 'MS');
    const hsdProducts = draft.products.filter((p) => p.code.toUpperCase() === 'HSD');

    const msProduct = msProducts[0] || draft.products[0];
    const hsdProduct = hsdProducts[0] || draft.products[1] || draft.products[0];

    const msTanks = msProduct
      ? draft.tanks.filter((t) => t.productDraftId === msProduct.draftId)
      : [];
    const hsdTanks = hsdProduct
      ? draft.tanks.filter((t) => t.productDraftId === hsdProduct.draftId)
      : [];

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
          ? prev.products.map((product) =>
              product.draftId === fuelDrawer.draftId ? fuelDrawer : product,
            )
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
      const exists = prev.shiftTemplates.some(
        (template) => template.draftId === shiftTemplateDrawer.draftId,
      );
      return {
        ...prev,
        shiftTemplates: exists
          ? prev.shiftTemplates.map((template) =>
              template.draftId === shiftTemplateDrawer.draftId ? shiftTemplateDrawer : template,
            )
          : [...prev.shiftTemplates, shiftTemplateDrawer],
      };
    });
    setShiftTemplateDrawer(null);
  };

  const saveDispenser = () => {
    if (!dispenserDrawer) return;
    updateDraft((prev) => {
      const otherNozzles = prev.nozzles.filter(
        (nozzle) => nozzle.dispenserDraftId !== dispenserDrawer.dispenser.draftId,
      );
      const dispenserExists = prev.dispensers.some(
        (item) => item.draftId === dispenserDrawer.dispenser.draftId,
      );

      return {
        ...prev,
        dispensers: dispenserExists
          ? prev.dispensers.map((item) =>
              item.draftId === dispenserDrawer.dispenser.draftId ? dispenserDrawer.dispenser : item,
            )
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
      const openDay = draft.businessRules.operatingSchedule.days.find((d) => d.isOpen);
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
    if (
      !(await confirm({
        title: 'Discard onboarding draft?',
        message: 'This will clear the locally stored setup and start over.',
        confirmLabel: 'Discard',
        danger: true,
      }))
    )
      return;
    clearStoredOnboardingDraft();
    setDraft(createEmptyOnboardingDraft());
    setCurrentStep(1);
    setErrorMsg(null);
    // Leave onboarding and return home (dashboard) when the host provides a
    // route out; otherwise stay and start over from step 1.
    onExit?.();
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
      // Keyed per Go live (#537): after a dropped connection, going live again
      // with the same draft reuses the key, so the station is created once.
      const payload = { draft };
      const result = await sendKeyed(
        officeSubmitKeys.session('setup:onboarding:finalize'),
        payload,
        (idempotencyKey) => stationService.finalizeOnboarding(payload, { idempotencyKey }),
      );

      setProvisioning((prev) => ({ ...prev, stageIndex: 2 }));
      await wait(150);
      setProvisioning((prev) => ({ ...prev, stageIndex: 3 }));
      await wait(150);
      setProvisioning((prev) => ({ ...prev, stageIndex: 4 }));
      await wait(150);
      setProvisioning((prev) => ({ ...prev, completed: true }));
      clearStoredOnboardingDraft();
      // Hold on a success screen instead of jumping straight to the dashboard —
      // the owner sees what they built and continues when ready.
      setProvisionedStation(result.station);
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
      <div className="flex min-h-[100vh] items-center justify-center text-[13px] text-ink-muted">
        Preparing onboarding workspace...
      </div>
    );
  }

  const setupBar = (subtitle: string, middle: React.ReactNode, right: React.ReactNode) => (
    <header className="relative flex h-[68px] shrink-0 items-center justify-between gap-4 border-b border-border-soft bg-surface px-6">
      <div className="flex flex-col">
        <span className="text-[14px] font-semibold text-ink-strong">PumpOS Setup</span>
        <span className="text-[12px] text-ink-muted">{subtitle}</span>
      </div>
      {middle}
      {right}
    </header>
  );

  if (showIntro) {
    const prepItems: { t: string; d: string }[] = [
      { t: 'Station details', d: 'Name, address, timezone and when your business day starts.' },
      {
        t: 'Fuels & selling rates',
        d: 'The fuels you sell (Petrol, Diesel, …) and their current prices.',
      },
      { t: 'Tanks', d: "Each tank's capacity, the fuel it holds, and its current stock." },
      {
        t: 'Dispensers & nozzles',
        d: 'Your dispenser layout and which tank each nozzle draws from.',
      },
      { t: 'Opening meter readings', d: 'The current cumulative reading on each nozzle.' },
      { t: 'Shift timings', d: 'Your operating shifts (for example, day and night).' },
      { t: 'Payment terminals', d: 'Card / UPI machines — optional, and easy to add later.' },
    ];
    return (
      <div className="flex h-[100vh] flex-col overflow-hidden bg-canvas">
        {setupBar(
          "Let's bring your station online",
          null,
          onExit && (
            <Button type="button" variant="secondary" size="sm" onClick={() => onExit()}>
              Back to dashboard
            </Button>
          ),
        )}

        <main className="flex flex-1 justify-center overflow-y-auto p-6">
          <div className="w-full max-w-[760px]">
            <PageFrame
              title="Let's set up your station"
              subtitle="PumpOS is built around your station's real infrastructure. Have these details handy so setup is quick and accurate — it usually takes about 5–7 minutes."
            >
              <div className="flex flex-col gap-5">
                <section className="flex flex-col gap-2">
                  <SectionHeader title="What to have ready" />
                  <div className={STEP_PANEL}>
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">
                      {prepItems.map((item, i) => (
                        <li key={item.t} className="flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-alt text-[12px] font-semibold text-ink-muted"
                          >
                            {i + 1}
                          </span>
                          <span className="flex min-w-0 flex-col gap-px">
                            <span className="text-[13px] font-semibold text-ink-strong">
                              {item.t}
                            </span>
                            <span className="text-[12px] leading-[1.45] text-ink-muted">
                              {item.d}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                <div className="rounded-card border border-border-soft bg-surface-alt px-4 py-3.5 text-[12.5px] leading-[1.55] text-ink-muted">
                  <span className="font-semibold text-ink-strong">
                    Set the infrastructure carefully.{' '}
                  </span>
                  Your tanks, dispensers and nozzles are linked and drive every sale, so getting
                  them right now saves rework — editing them later ripples across the system.
                  Details like payment terminals are easy to change anytime.
                </div>

                <div className="flex items-center gap-2 text-[12px] text-ink-muted">
                  <Chip tone="neutral" size="md">
                    Saved automatically
                  </Chip>
                  <span>
                    Your progress is saved as you go — you can leave and pick up where you left off.
                  </span>
                </div>
              </div>
            </PageFrame>
          </div>
        </main>

        <footer className="flex h-[72px] shrink-0 items-center justify-between border-t border-border-soft bg-surface px-6">
          {onExit ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => onExit()}>
              Back to dashboard
            </Button>
          ) : (
            <span />
          )}
          <div className="text-[12px] text-ink-muted">~5–7 minutes · editable later</div>
          <Button type="button" variant="primary" size="md" onClick={() => setShowIntro(false)}>
            Start setup
          </Button>
        </footer>
      </div>
    );
  }

  const closeProvisioning = () =>
    setProvisioning({
      isOpen: false,
      stageIndex: 0,
      failedMessage: null,
      failedStage: null,
      completed: false,
    });

  return (
    <div className="flex h-[100vh] flex-col overflow-hidden bg-canvas">
      {setupBar(
        'Setting up your station · saved automatically as you go',
        <div className="flex flex-col items-center gap-1">
          <span className="text-[13px] font-semibold text-ink-strong">
            {steps[currentStep - 1].title}
          </span>
          <div className="flex items-center gap-1.5">
            {steps.map((s) => (
              <span
                key={s.num}
                onClick={() => {
                  if (s.num <= currentStep) moveToStep(s.num);
                }}
                className={cn(
                  'size-2 rounded-full transition-colors duration-200',
                  currentStep === s.num
                    ? 'bg-brand'
                    : currentStep > s.num
                      ? 'bg-success-fg'
                      : 'bg-border-strong',
                  s.num <= currentStep ? 'cursor-pointer' : 'cursor-default',
                )}
                title={s.title}
              />
            ))}
          </div>
        </div>,
        <>
          <div className="flex items-center gap-2.5">
            <Chip tone="neutral" size="md">
              Draft saved
            </Chip>
            <Button type="button" variant="secondary" size="sm" onClick={discardDraft}>
              Discard Draft
            </Button>
          </div>
          {/* Global Progress Bar */}
          <div className="absolute inset-x-0 bottom-0 h-[2.5px] bg-border-soft">
            <div
              className="h-full bg-brand transition-[width] duration-[250ms] ease-out"
              style={{ width: `${(currentStep / steps.length) * 100}%` }}
            />
          </div>
        </>,
      )}

      <main className="flex flex-1 justify-center overflow-y-auto p-6">
        <div className="flex w-full max-w-[1120px] flex-col gap-5">
          {errorMsg && (
            <div
              role="alert"
              className="rounded-card border border-danger-fg/15 bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger-fg"
            >
              {errorMsg}
            </div>
          )}

          {currentStep === 1 && <Step1StationBasics draft={draft} updateDraft={updateDraft} />}

          {currentStep === 2 && (
            <Step2BusinessRules
              draft={draft}
              updateDraft={updateDraft}
              syncTwentyFourSeven={syncTwentyFourSeven}
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
            />
          )}

          {currentStep === 4 && (
            <Step4Tanks
              draft={draft}
              handleQuickAddTank={handleQuickAddTank}
              onAddTank={() =>
                setTankDrawer(cloneTankDraft(null, draft.products[0]?.draftId || ''))
              }
              onEditTank={(t) => setTankDrawer(cloneTankDraft(t))}
              onRemoveTank={removeTank}
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
            />
          )}

          {currentStep === 6 && <Step6OpeningValues draft={draft} updateDraft={updateDraft} />}

          {currentStep === 7 && (
            <Step7ShiftTemplates
              draft={draft}
              onAutofillShifts={handleAutofillShifts}
              onAddShiftTemplate={() => setShiftTemplateDrawer(cloneShiftTemplateDraft())}
              onEditShiftTemplate={(st) => setShiftTemplateDrawer(cloneShiftTemplateDraft(st))}
              onRemoveShiftTemplate={removeShiftTemplate}
            />
          )}

          {currentStep === 8 && <Step8PaymentTerminals draft={draft} updateDraft={updateDraft} />}

          {currentStep === 9 && (
            <Step8Review
              draft={draft}
              validationIssues={validationIssues}
              moveToStep={moveToStep}
            />
          )}
        </div>
      </main>

      <footer className="flex h-[72px] shrink-0 items-center justify-between border-t border-border-soft bg-surface px-6">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 1))}
          disabled={currentStep === 1}
        >
          Previous Step
        </Button>

        <div className="text-[12px] text-ink-muted">
          Step {currentStep} of {steps.length}
          {currentStep < steps.length ? ` · ${steps.length - currentStep} left` : ' · last step'}
        </div>

        {currentStep === steps.length ? (
          <Button type="button" variant="primary" size="md" onClick={handleProvision}>
            Go live
          </Button>
        ) : (
          <Button type="button" variant="primary" size="md" onClick={handleNext}>
            Continue
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
            onSubmit={(e) => {
              e.preventDefault();
              saveFuel();
            }}
            className="flex flex-col"
          >
            <Field label="Fuel Name" htmlFor="onb-fuel-name" required>
              <TextInput
                id="onb-fuel-name"
                value={fuelDrawer.name}
                onChange={(e) => setFuelDrawer({ ...fuelDrawer, name: e.target.value })}
                placeholder="e.g. Petrol (MS)"
                required
              />
            </Field>

            <Field label="Fuel Code" htmlFor="onb-fuel-code" required>
              <TextInput
                id="onb-fuel-code"
                value={fuelDrawer.code}
                onChange={(e) => {
                  const code = e.target.value.toUpperCase();
                  // Gaseous fuels are metered/sold by mass (kg), not volume. Nudge
                  // the unit to kg for CNG/LPG-type codes while it's still the L default.
                  const isGas = /^(CNG|LPG|AUTOLPG|LNG|CBG)$/.test(code);
                  setFuelDrawer({
                    ...fuelDrawer,
                    code,
                    unit: isGas && !/^kg$/i.test(fuelDrawer.unit) ? 'kg' : fuelDrawer.unit,
                  });
                }}
                placeholder="e.g. MS"
                required
              />
            </Field>

            <Field
              label="Sales Unit"
              htmlFor="onb-fuel-unit"
              required
              hint="Gaseous fuels (CNG, Auto-LPG) are metered by weight, so tank stock and readings for this fuel are tracked in kg."
            >
              <Select
                id="onb-fuel-unit"
                value={/^kg$/i.test(fuelDrawer.unit) ? 'kg' : 'L'}
                onChange={(e) => setFuelDrawer({ ...fuelDrawer, unit: e.target.value })}
                required
              >
                <option value="L">Liters (L) — Petrol / Diesel / Ethanol</option>
                <option value="kg">Kilograms (kg) — CNG / Auto-LPG</option>
              </Select>
            </Field>

            <DrawerActions saveLabel="Save Fuel" onCancel={() => setFuelDrawer(null)} />
          </form>
        )}
      </Drawer>

      <Drawer isOpen={!!tankDrawer} onClose={() => setTankDrawer(null)} title="Tank Configuration">
        {tankDrawer && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveTank();
            }}
            className="flex flex-col"
          >
            <Field label="Tank Identifier" htmlFor="onb-tank-name" required>
              <TextInput
                id="onb-tank-name"
                value={tankDrawer.name}
                onChange={(e) => setTankDrawer({ ...tankDrawer, name: e.target.value })}
                placeholder="e.g. Tank 1"
                required
              />
            </Field>

            <Field label="Linked Fuel Product" htmlFor="onb-tank-fuel" required>
              <Select
                id="onb-tank-fuel"
                value={tankDrawer.productDraftId}
                onChange={(e) => setTankDrawer({ ...tankDrawer, productDraftId: e.target.value })}
                required
              >
                <option value="">Select fuel</option>
                {draft.products.map((product) => (
                  <option key={product.draftId} value={product.draftId}>
                    {product.name || product.code}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={`Capacity (${
                draft.products.find((p) => p.draftId === tankDrawer.productDraftId)?.unit || 'L'
              })`}
              htmlFor="onb-tank-capacity"
              required
            >
              <NumberInput
                id="onb-tank-capacity"
                step="0.1"
                value={tankDrawer.capacity || ''}
                onChange={(e) =>
                  setTankDrawer({ ...tankDrawer, capacity: Number(e.target.value) || 0 })
                }
                placeholder="e.g. 20000"
                required
              />
            </Field>

            <DrawerActions saveLabel="Save Tank" onCancel={() => setTankDrawer(null)} />
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
            onSubmit={(e) => {
              e.preventDefault();
              saveShiftTemplate();
            }}
            className="flex flex-col"
          >
            <Field label="Template Name" htmlFor="onb-shift-name" required>
              <TextInput
                id="onb-shift-name"
                value={shiftTemplateDrawer.name}
                onChange={(e) =>
                  setShiftTemplateDrawer({ ...shiftTemplateDrawer, name: e.target.value })
                }
                placeholder="e.g. Morning Shift"
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Time" htmlFor="onb-shift-start" required>
                <TextInput
                  id="onb-shift-start"
                  type="time"
                  value={shiftTemplateDrawer.startTime}
                  onChange={(e) =>
                    setShiftTemplateDrawer({ ...shiftTemplateDrawer, startTime: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="End Time" htmlFor="onb-shift-end" required>
                <TextInput
                  id="onb-shift-end"
                  type="time"
                  value={shiftTemplateDrawer.endTime}
                  onChange={(e) =>
                    setShiftTemplateDrawer({ ...shiftTemplateDrawer, endTime: e.target.value })
                  }
                  required
                />
              </Field>
            </div>

            <DrawerActions
              saveLabel="Save Template"
              onCancel={() => setShiftTemplateDrawer(null)}
            />
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
            onSubmit={(e) => {
              e.preventDefault();
              saveDispenser();
            }}
            className="flex flex-col"
          >
            <Field label="Dispenser Name" htmlFor="onb-du-name" required>
              <TextInput
                id="onb-du-name"
                value={dispenserDrawer.dispenser.name}
                onChange={(e) =>
                  setDispenserDrawer({
                    ...dispenserDrawer,
                    dispenser: { ...dispenserDrawer.dispenser, name: e.target.value },
                  })
                }
                placeholder="e.g. Dispenser 1"
                required
              />
            </Field>

            <Field label="Code / Reference ID" htmlFor="onb-du-code" required>
              <TextInput
                id="onb-du-code"
                value={dispenserDrawer.dispenser.code}
                onChange={(e) =>
                  setDispenserDrawer({
                    ...dispenserDrawer,
                    dispenser: { ...dispenserDrawer.dispenser, code: e.target.value.toUpperCase() },
                  })
                }
                placeholder="e.g. DU-01"
                required
              />
            </Field>

            <section className="flex flex-col gap-3 border-t border-border-soft pt-4">
              <SectionHeader
                title="Nozzle Mappings"
                subtitle="Map each nozzle to a storage tank and fuel type."
                controls={{
                  actions: (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      leftIcon={<Icon name="plus" size="xs" />}
                      onClick={() => {
                        const otherNozzlesCount = draft.nozzles.filter(
                          (n) => n.dispenserDraftId !== dispenserDrawer.dispenser.draftId,
                        ).length;
                        const nextNum = otherNozzlesCount + dispenserDrawer.nozzles.length + 1;
                        const firstTank = draft.tanks[0];
                        const defaultFuelId =
                          firstTank?.productDraftId || draft.products[0]?.draftId || '';
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
                      Nozzle
                    </Button>
                  ),
                }}
              />

              <div className="flex flex-col gap-3">
                {dispenserDrawer.nozzles.length === 0 ? (
                  <EmptyState compact title="No nozzles configured for this dispenser yet." />
                ) : (
                  dispenserDrawer.nozzles.map((nozzle, index) => {
                    const filteredTanks = draft.tanks.filter(
                      (t) => t.productDraftId === nozzle.productDraftId,
                    );
                    const updateNozzle = (patch: Partial<OnboardingNozzleDraft>) =>
                      setDispenserDrawer({
                        ...dispenserDrawer,
                        nozzles: dispenserDrawer.nozzles.map((item) =>
                          item.draftId === nozzle.draftId ? { ...item, ...patch } : item,
                        ),
                      });
                    return (
                      <div
                        key={nozzle.draftId}
                        className="flex flex-col gap-2 rounded-card border border-border-soft bg-surface-alt p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-ink-muted">
                            Nozzle #{index + 1}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="text-danger-fg"
                            onClick={() =>
                              setDispenserDrawer({
                                ...dispenserDrawer,
                                nozzles: dispenserDrawer.nozzles.filter(
                                  (item) => item.draftId !== nozzle.draftId,
                                ),
                              })
                            }
                          >
                            Remove
                          </Button>
                        </div>

                        <Field label="Name" htmlFor={`onb-nozzle-name-${nozzle.draftId}`}>
                          <TextInput
                            id={`onb-nozzle-name-${nozzle.draftId}`}
                            value={nozzle.name}
                            onChange={(e) => updateNozzle({ name: e.target.value })}
                            required
                          />
                        </Field>

                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Fuel" htmlFor={`onb-nozzle-fuel-${nozzle.draftId}`}>
                            <Select
                              id={`onb-nozzle-fuel-${nozzle.draftId}`}
                              value={nozzle.productDraftId}
                              onChange={(e) => {
                                const nextFuelId = e.target.value;
                                const firstMatchedTank = draft.tanks.find(
                                  (t) => t.productDraftId === nextFuelId,
                                );
                                updateNozzle({
                                  productDraftId: nextFuelId,
                                  tankDraftId: firstMatchedTank?.draftId || '',
                                });
                              }}
                              required
                            >
                              <option value="">Select fuel</option>
                              {draft.products.map((p) => (
                                <option key={p.draftId} value={p.draftId}>
                                  {p.name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Tank" htmlFor={`onb-nozzle-tank-${nozzle.draftId}`}>
                            <Select
                              id={`onb-nozzle-tank-${nozzle.draftId}`}
                              value={nozzle.tankDraftId}
                              onChange={(e) => updateNozzle({ tankDraftId: e.target.value })}
                              required
                            >
                              <option value="">Select tank</option>
                              {filteredTanks.map((t) => (
                                <option key={t.draftId} value={t.draftId}>
                                  {t.name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <DrawerActions saveLabel="Save Dispenser" onCancel={() => setDispenserDrawer(null)} />
          </form>
        )}
      </Drawer>

      {/* Provisioning overlay modal */}
      {provisioning.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink-strong/25 p-6">
          {provisioning.completed && !provisioning.failedMessage ? (
            <div className="flex w-full max-w-[520px] animate-fade-in flex-col gap-[18px] rounded-card border border-border-soft bg-surface p-7 shadow-lg">
              <div className="flex flex-col items-center gap-2.5 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-success-bg text-success-fg">
                  <Check size={26} />
                </div>
                <h3 className="m-0 text-[18px] font-semibold text-ink-strong">
                  Your station is live
                </h3>
                <p className="m-0 text-[13px] leading-normal text-ink-muted">
                  {provisionedStation?.name ? (
                    <>
                      <strong className="text-ink-strong">{provisionedStation.name}</strong> is set
                      up and ready for operations.
                    </>
                  ) : (
                    'Your station is set up and ready for operations.'
                  )}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Fuels', value: draft.products.length },
                  { label: 'Tanks', value: draft.tanks.length },
                  { label: 'Dispensers', value: draft.dispensers.length },
                  { label: 'Nozzles', value: draft.nozzles.length },
                  { label: 'Shift templates', value: draft.shiftTemplates.length },
                  { label: 'Terminals', value: draft.paymentTerminals?.length ?? 0 },
                ].map((t) => (
                  <div
                    key={t.label}
                    className="rounded-card border border-border-soft bg-surface-alt p-3 text-center"
                  >
                    <div className="font-mono text-[18px] font-semibold text-ink-strong">
                      {t.value}
                    </div>
                    <div className="text-[12px] text-ink-muted">{t.label}</div>
                  </div>
                ))}
              </div>

              <p className="m-0 text-center text-[12px] text-ink-muted">
                You can fine-tune fuels, pricing and infrastructure anytime from Station.
              </p>

              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => {
                  if (provisionedStation)
                    runTask(
                      onOnboardingComplete(provisionedStation),
                      'Could not open the dashboard.',
                    );
                }}
              >
                Go to dashboard
              </Button>
            </div>
          ) : (
            <div className="flex w-full max-w-[520px] flex-col gap-[18px] rounded-card border border-border-soft bg-surface p-6 shadow-lg">
              <div>
                <h3 className="text-[18px] font-semibold text-ink-strong">
                  {provisioning.completed ? 'Station Provisioned' : 'Provisioning Station'}
                </h3>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {provisioning.failedMessage
                    ? 'The draft is still safe locally. Fix the issue and try again.'
                    : 'Applying the full onboarding draft in one backend workflow.'}
                </p>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
                <div
                  className={cn(
                    'h-full transition-[width] duration-200',
                    provisioning.failedMessage ? 'bg-danger-fg' : 'bg-brand',
                  )}
                  style={{
                    width: provisioning.failedMessage
                      ? '100%'
                      : `${((provisioning.stageIndex + (provisioning.completed ? 1 : 0)) / provisioningStages.length) * 100}%`,
                  }}
                />
              </div>

              <div className="flex flex-col gap-2.5">
                {provisioningStages.map((stage, index) => {
                  const isActive =
                    provisioning.stageIndex === index &&
                    !provisioning.failedMessage &&
                    !provisioning.completed;
                  const isCompleted =
                    provisioning.completed ||
                    (!provisioning.failedMessage && provisioning.stageIndex > index);
                  const isFailed = provisioning.failedStage === stage;

                  return (
                    <div
                      key={stage}
                      className={cn(
                        'flex items-center justify-between rounded-card border px-3 py-2.5',
                        isActive
                          ? 'border-border-strong bg-surface-alt'
                          : 'border-transparent bg-transparent',
                      )}
                    >
                      <span
                        className={cn(
                          'text-[13px] text-ink-default',
                          isActive ? 'font-semibold' : 'font-medium',
                        )}
                      >
                        {stage}
                      </span>
                      {isFailed ? (
                        <Chip tone="danger" size="md">
                          Failed
                        </Chip>
                      ) : isCompleted ? (
                        <Chip tone="success" size="md">
                          Done
                        </Chip>
                      ) : isActive ? (
                        <Chip tone="info" size="md">
                          Running
                        </Chip>
                      ) : (
                        <Chip tone="neutral" size="md">
                          Queued
                        </Chip>
                      )}
                    </div>
                  );
                })}
              </div>

              {provisioning.failedMessage && (
                <div className="rounded-card border border-danger-fg/15 bg-danger-bg px-3.5 py-3 text-[12px] text-danger-fg">
                  {provisioning.failedMessage}
                </div>
              )}

              {(provisioning.failedMessage || provisioning.completed) && (
                <div className="flex justify-end gap-2">
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
                        if (lower.includes('station name') || lower.includes('station code'))
                          targetStep = 1;
                        else if (
                          lower.includes('business day') ||
                          lower.includes('operating hour') ||
                          lower.includes('operating schedule') ||
                          lower.includes('timezone')
                        )
                          targetStep = 2;
                        else if (
                          lower.includes('price') ||
                          lower.includes('selling rate') ||
                          lower.includes('fuel rate') ||
                          lower.includes('selling price')
                        )
                          targetStep = 6;
                        else if (lower.includes('fuel') || lower.includes('product'))
                          targetStep = 3;
                        else if (lower.includes('opening stock') || lower.includes('capacity'))
                          targetStep = 6;
                        else if (lower.includes('tank')) targetStep = 4;
                        else if (lower.includes('opening reading')) targetStep = 6;
                        else if (
                          lower.includes('nozzle') ||
                          lower.includes('dispenser') ||
                          lower.includes('du')
                        )
                          targetStep = 5;
                        else if (lower.includes('shift template')) targetStep = 7;
                        else if (stage === 'Validating draft') targetStep = 8;
                        else if (stage === 'Creating station') targetStep = 1;
                        else if (stage === 'Linking infrastructure') targetStep = 4;
                        else if (
                          stage === 'Applying opening values' ||
                          stage === 'Applying go-live values'
                        )
                          targetStep = 6;

                        setCurrentStep(targetStep);
                        closeProvisioning();
                        setErrorMsg(msg);
                      }}
                    >
                      Go to Section
                    </Button>
                  )}
                  <Button type="button" variant="secondary" size="sm" onClick={closeProvisioning}>
                    Close
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Save + Cancel row at the foot of each onboarding drawer form. */
const DrawerActions: React.FC<{ saveLabel: string; onCancel: () => void }> = ({
  saveLabel,
  onCancel,
}) => (
  <div className="mt-4 flex gap-3">
    <Button type="submit" variant="primary" size="sm" className="flex-1">
      {saveLabel}
    </Button>
    <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={onCancel}>
      Cancel
    </Button>
  </div>
);
