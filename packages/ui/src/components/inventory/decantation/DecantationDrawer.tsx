import React, { useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { resolveDecantationSettings, resolveEntryDate, type DecantationView } from '@pump/shared';
import { Drawer } from '../../Drawer.js';
import { Button, Chip } from '../../../pump-ds/index.js';
import { useToast } from '../../primitives/ToastProvider.js';
import { useZodForm } from '../../../forms/useZodForm.js';
import { keepsIdempotencyKey } from '../../../utils/idempotency.js';
import { keyForBody, newSaveKey, resetSaveKey } from '../../../utils/saveKey.js';
import {
  useBusinessDayStatus,
  useDiscardDecantation,
  useInventoryStatus,
  useLinkablePurchases,
  useRecordDecantation,
  useUnlinkDecantationPurchase,
} from '../../../query/hooks.js';
import { DiscardDraftButton } from './DiscardDraftButton.js';
import { StepSection } from './StepSection.js';
import { AfterStep, AfterSummary } from './AfterStep.js';
import { ChambersStep, ChambersSummary } from './ChambersStep.js';
import { InvoicesStep, InvoicesSummary } from './InvoicesStep.js';
import { ReviewStep } from './ReviewStep.js';
import { TanksStep, TanksSummary } from './TanksStep.js';
import { UnloadingStep, UnloadingSummary } from './UnloadingStep.js';
import type { StepProps, TankOption } from './stepShared.js';
import {
  buildSaveBody,
  decantationFormSchema,
  decantationToFormValues,
  emptyDecantationForm,
  liveFlags,
  type DecantationFormContext,
  type DecantationFormValues,
} from './decantationForm.js';
import { reviewDecantation } from './decantationReview.js';

const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

export interface DecantationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  station: { id: string; settings?: unknown } | null;
  /** Edit this Decantation (draft / pending). Omit for a new one. */
  decantation?: DecantationView | null;
}

const STEP_TITLES = [
  'Tanker & invoices',
  'Tanks',
  'Tanker chambers',
  'Unloading',
  'After unloading',
  'Review',
] as const;
const NEXT_LABEL = [
  'Continue to Tanks',
  'Continue to Tanker chambers',
  'Continue to Unloading',
  'Continue to After unloading',
  'Continue to Review',
];

/** The step that owns a failing field, so the stepper opens where the problem is. */
const stepOfError = (errors: Record<string, unknown>): number => {
  if (errors.tankerNumber) return 0;
  const lines = errors.lines as Array<Record<string, unknown> | undefined> | undefined;
  if (lines?.some((l) => l && (l.tankId || l.beforeDip || l.roDensity || l.observedDensity)))
    return 1;
  if (errors.chambers) return 2;
  if (errors.unloadStart || errors.unloadEnd) return 3;
  if (lines?.some((l) => l && (l.afterDip || l.afterDipTime || l.salesDuring))) return 4;
  return 1;
};

/**
 * Record / edit one tanker visit (Decantation, ADR 0007) as an accordion stepper in a
 * wide drawer. Finished steps collapse into compact cards; flags and variance preview
 * live and never block a save. `Drawer` renders nothing while closed, so the form
 * below is rebuilt from props on every open.
 */
export const DecantationDrawer: React.FC<DecantationDrawerProps> = ({ isOpen, ...rest }) =>
  isOpen ? <DecantationForm {...rest} /> : null;

const DecantationForm: React.FC<Omit<DecantationDrawerProps, 'isOpen'>> = ({
  onClose,
  station,
  decantation,
}) => {
  const stationId = station?.id ?? null;
  const stationSettings = station?.settings as { timezone?: string } | undefined;
  const timeZone = stationSettings?.timezone ?? DEFAULT_TIME_ZONE;
  const settings = useMemo(
    () => resolveDecantationSettings(station?.settings),
    [station?.settings],
  );
  const toast = useToast();
  const record = useRecordDecantation(stationId);
  const unlink = useUnlinkDecantationPurchase(stationId);
  const tanksQ = useInventoryStatus(stationId);

  const tanks: TankOption[] = useMemo(
    () =>
      (tanksQ.data ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        productId: t.productId,
        productName: t.productName ?? t.productCode ?? 'Fuel',
        currentVolume: t.currentVolume != null ? Number(t.currentVolume) : null,
      })),
    [tanksQ.data],
  );
  const fuelProducts = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tanks) if (!seen.has(t.productId)) seen.set(t.productId, t.productName);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [tanks]);

  const purchaseQs = useLinkablePurchases(
    stationId,
    fuelProducts.map((p) => p.id),
  );
  const purchases = useMemo(() => {
    const out: Record<
      string,
      { data: NonNullable<(typeof purchaseQs)[number]['data']>; loading: boolean }
    > = {};
    fuelProducts.forEach((p, i) => {
      out[p.id] = { data: purchaseQs[i]?.data ?? [], loading: !!purchaseQs[i]?.isLoading };
    });
    return out;
  }, [fuelProducts, purchaseQs]);

  const form = useZodForm<DecantationFormValues>(decantationFormSchema, {
    defaultValues: decantation
      ? decantationToFormValues(decantation, timeZone)
      : emptyDecantationForm(resolveEntryDate({ timeZone })),
  });
  const values = useWatch({ control: form.control }) as DecantationFormValues;

  // Invoice facts of the picked Fuel Purchases (falls back to what an edited record already links).
  const { invoiceDensityByProduct, invoiceQtyByProduct } = useMemo(() => {
    const density: Record<string, number | null> = {};
    const qty: Record<string, number | null> = {};
    for (const l of decantation?.links ?? []) {
      density[l.productId] = l.invoiceDensity;
      qty[l.productId] = l.invoiceQty;
    }
    for (const [productId, purchaseId] of Object.entries(values.links ?? {})) {
      const p = purchases[productId]?.data.find((x) => x.purchaseId === purchaseId);
      if (p) {
        density[productId] = p.invoiceDensity;
        qty[productId] = p.invoiceQty;
      }
    }
    return { invoiceDensityByProduct: density, invoiceQtyByProduct: qty };
  }, [decantation?.links, values.links, purchases]);

  const ctx: DecantationFormContext = useMemo(
    () => ({
      stationId: stationId ?? '',
      timeZone,
      tanks,
      invoiceDensityByProduct,
      invoiceQtyByProduct,
      settings,
    }),
    [stationId, timeZone, tanks, invoiceDensityByProduct, invoiceQtyByProduct, settings],
  );
  const flags = useMemo(() => liveFlags(values, ctx), [values, ctx]);
  const review = useMemo(
    () => reviewDecantation(values, tanks, invoiceQtyByProduct, settings.quantityTolerance),
    [values, tanks, invoiceQtyByProduct, settings.quantityTolerance],
  );
  const flagged = flags.flags.length > 0;

  const editing = !!decantation;
  // A sealed day accepts only the after dip (server rule): other steps become read-only cards.
  const dayQ = useBusinessDayStatus(stationId, editing ? decantation?.businessDate : undefined, {
    enabled: !!stationId && !!decantation?.businessDate,
  });
  const sealed = editing && dayQ.data?.requestedState === 'CLOSED';
  const [savedLinks, setSavedLinks] = useState<Record<string, string>>(() =>
    Object.fromEntries((decantation?.links ?? []).map((l) => [l.productId, l.purchaseId])),
  );
  const [open, setOpen] = useState(editing ? 5 : 0);
  const unlinkProduct = async (productId: string) => {
    if (!decantation) return;
    try {
      setError(null);
      await unlink.mutateAsync({ decantationId: decantation.id, productId });
      setSavedLinks(({ [productId]: _gone, ...rest }) => rest);
      form.setValue(
        'links',
        { ...form.getValues('links'), [productId]: '' },
        { shouldDirty: true },
      );
      toast.success('Purchase unlinked.');
    } catch (err: any) {
      setError(err?.message || 'Could not unlink the purchase');
    }
  };

  const [done, setDone] = useState<Set<number>>(() => new Set(editing ? [0, 1, 2, 3, 4] : []));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newSaveKey());

  const next = (i: number) => {
    setDone((s) => new Set(s).add(i));
    setOpen(i + 1);
  };

  const save = (draft: boolean) =>
    form.handleSubmit(
      async (vals) => {
        if (submitting || !stationId) return;
        try {
          setSubmitting(true);
          setError(null);
          const body = buildSaveBody(vals, ctx, { draft });
          const result = await record.mutateAsync({
            body,
            ...(decantation ? { decantationId: decantation.id } : {}),
            idempotencyKey: keyForBody(keyRef.current, body),
          });
          resetSaveKey(keyRef.current);
          const hasFlags = (result?.decantation?.flags?.length ?? 0) > 0 || flagged;
          toast.success(
            draft
              ? 'Decantation saved as draft.'
              : hasFlags
                ? 'Decantation saved and flagged for review.'
                : 'Decantation saved.',
          );
          for (const w of result?.warnings ?? []) toast.info?.(w.message);
          onClose();
        } catch (err: any) {
          // Unknown outcome keeps the key so a retry cannot record the visit twice.
          if (!keepsIdempotencyKey(err)) resetSaveKey(keyRef.current);
          setError(err?.message || 'Failed to save the Decantation');
        } finally {
          setSubmitting(false);
        }
      },
      (errors) => setOpen(stepOfError(errors as Record<string, unknown>)),
    )();

  const stepProps: StepProps = { form, values, tanks, settings, flags, review };
  const cont = (i: number) =>
    i < NEXT_LABEL.length ? (
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={() => next(i)}>
          {NEXT_LABEL[i]}
        </Button>
      </div>
    ) : null;

  const summaries = [
    <InvoicesSummary key="s0" {...stepProps} purchases={purchases} />,
    <TanksSummary key="s1" {...stepProps} invoiceDensityByProduct={invoiceDensityByProduct} />,
    <ChambersSummary key="s2" {...stepProps} />,
    <UnloadingSummary key="s3" {...stepProps} />,
    <AfterSummary key="s4" {...stepProps} />,
    null,
  ];
  const bodies = [
    <InvoicesStep
      key="b0"
      {...stepProps}
      purchases={purchases}
      fuelProducts={fuelProducts}
      savedLinks={savedLinks}
      unlinkBusy={unlink.isPending}
      onUnlink={decantation ? (p) => void unlinkProduct(p) : undefined}
    />,
    <TanksStep key="b1" {...stepProps} invoiceDensityByProduct={invoiceDensityByProduct} />,
    <ChambersStep key="b2" {...stepProps} />,
    <UnloadingStep key="b3" {...stepProps} />,
    <AfterStep key="b4" {...stepProps} />,
    <ReviewStep key="b5" {...stepProps} />,
  ];

  const discard = useDiscardDecantation(stationId);
  const discardDraft = async () => {
    if (!decantation) return;
    try {
      setError(null);
      await discard.mutateAsync({ decantationId: decantation.id });
      toast.success('Draft discarded.');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not discard the draft');
    }
  };

  const footer = (
    <div className="flex w-full items-center gap-2">
      <span className="text-[12px] text-ink-muted">
        {values.lines?.length ?? 0} tank{(values.lines?.length ?? 0) === 1 ? '' : 's'} · one tanker
        visit
      </span>
      {flagged && (
        <Chip size="md" tone="danger">
          {flags.flags.length} flag{flags.flags.length === 1 ? '' : 's'}
        </Chip>
      )}
      <span className="flex-1" />
      {decantation?.status === 'DRAFT' && (
        <DiscardDraftButton
          busy={submitting || discard.isPending}
          onConfirm={() => void discardDraft()}
        />
      )}
      <Button variant="ghost" size="sm" onClick={onClose}>
        Cancel
      </Button>
      {!sealed && (
        <Button variant="secondary" size="sm" disabled={submitting} onClick={() => save(true)}>
          Save as draft
        </Button>
      )}
      <Button
        variant={flagged ? 'danger' : 'primary'}
        size="sm"
        disabled={submitting}
        onClick={() => save(false)}
      >
        {sealed ? 'Save after dip' : flagged ? 'Save with flag' : 'Save Decantation'}
      </Button>
    </div>
  );

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={decantation ? `Decantation ${decantation.documentNumber}` : 'New Decantation'}
      widthVariant="wide"
      footer={footer}
    >
      {error && (
        <div
          role="alert"
          className="mb-2.5 rounded-input bg-danger-bg px-3 py-2 text-[12px] text-danger-fg"
        >
          {error}
        </div>
      )}
      {sealed && (
        <div
          role="note"
          className="mb-2.5 rounded-input bg-warning-bg px-3 py-2 text-[12px] text-warning-fg"
        >
          This business day is closed. Only the after dip can still be added; the rest of the record
          is sealed.
        </div>
      )}
      {STEP_TITLES.filter((_, i) => !(sealed && i === 5)).map((title, i) => (
        <StepSection
          key={title}
          n={i + 1}
          title={title}
          open={(sealed ? 4 : open) === i}
          done={done.has(i)}
          summary={summaries[i]}
          readOnly={sealed && i !== 4}
          onOpen={() => setOpen(i)}
        >
          {bodies[i]}
          {sealed ? null : cont(i)}
        </StepSection>
      ))}
    </Drawer>
  );
};
