import { useCallback, useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import {
  buildSaveBody,
  decantationFormSchema,
  useZodForm,
  withoutLine,
  decantationToFormValues,
  emptyChamber,
  emptyDecantationForm,
  emptyLine,
  isoToLocalTime,
  liveFlags,
  reviewDecantation,
  useInventoryStatus,
  useLinkablePurchases,
  type DecantationChamberValues,
  type DecantationFormContext,
  type DecantationFormValues,
  type DecantationLineValues,
} from '@pump/ui';
import {
  resolveDecantationSettings,
  resolveEntryDate,
  businessDateSettings,
  type DecantationView,
  type LinkablePurchase,
  type Station,
} from '@pump/shared';

export interface TankOption {
  id: string;
  name: string;
  productId: string;
  productName: string;
  currentVolume: number | null;
  /** For the "Book 13,000 L of 20,000 L · 65%" line, as on desktop (#609). */
  capacity: number | null;
  /** The product's unit (L, or kg for CNG). */
  unit: string | null;
}

const DIRTY = { shouldDirty: true } as const;

/** Depth-first first `message` of a react-hook-form error tree. */
function firstMessage(e: unknown): string | undefined {
  if (!e || typeof e !== 'object') return undefined;
  const o = e as Record<string, unknown>;
  if (typeof o.message === 'string' && o.message) return o.message;
  for (const v of Object.values(o)) {
    if (v === o.ref) continue;
    const m = firstMessage(v);
    if (m) return m;
  }
  return undefined;
}

function initialValues(timeZone: string, decantation?: DecantationView): DecantationFormValues {
  if (decantation) {
    const v = decantationToFormValues(decantation, timeZone);
    // Finishing: the end time defaults to now, an editable suggestion.
    return { ...v, unloadEnd: v.unloadEnd || nowTime(timeZone) };
  }
  return {
    ...emptyDecantationForm(resolveEntryDate({ timeZone })),
    unloadStart: nowTime(timeZone),
  };
}

export const nowTime = (timeZone: string): string =>
  isoToLocalTime(new Date().toISOString(), timeZone);

/**
 * One tanker visit as the mobile flows edit it. The whole visit stays in form
 * state (the update is a full replace), reusing the desktop drawer's form model:
 * the same values → API body mapping, the same live flag and variance rules.
 * Flags and variance only preview; nothing here blocks a save.
 */
export function useVisit(station: Station, decantation?: DecantationView) {
  const timeZone = businessDateSettings(station.settings).timeZone;
  const settings = useMemo(() => resolveDecantationSettings(station.settings), [station.settings]);

  const tanksQ = useInventoryStatus(station.id);
  const tanks: TankOption[] = useMemo(
    () =>
      (tanksQ.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        productId: t.productId,
        productName: t.productName ?? t.productCode ?? 'Fuel',
        currentVolume: t.currentVolume != null ? Number(t.currentVolume) : null,
        capacity: t.capacity != null ? Number(t.capacity) : null,
        unit: t.productUnit ?? null,
      })),
    [tanksQ.data],
  );
  const fuelProducts = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tanks) if (!seen.has(t.productId)) seen.set(t.productId, t.productName);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [tanks]);

  const purchaseQs = useLinkablePurchases(
    station.id,
    fuelProducts.map((p) => p.id),
  );
  const purchases = useMemo(() => {
    const out: Record<string, LinkablePurchase[]> = {};
    fuelProducts.forEach((p, i) => {
      out[p.id] = purchaseQs[i]?.data ?? [];
    });
    return out;
  }, [fuelProducts, purchaseQs]);

  const form = useZodForm<DecantationFormValues>(decantationFormSchema, {
    defaultValues: initialValues(timeZone, decantation),
  });
  const values = useWatch({ control: form.control }) as DecantationFormValues;
  const read = form.getValues;

  const patch = useCallback(
    (p: Partial<DecantationFormValues>) => {
      for (const [k, x] of Object.entries(p))
        form.setValue(k as keyof DecantationFormValues, x, DIRTY);
    },
    [form],
  );
  const setLine = useCallback(
    (i: number, p: Partial<DecantationLineValues>) => {
      for (const [k, x] of Object.entries(p))
        form.setValue(`lines.${i}.${k}` as `lines.${number}.tankId`, x as never, DIRTY);
    },
    [form],
  );
  const addLine = useCallback(
    () => form.setValue('lines', [...read('lines'), emptyLine()], DIRTY),
    [form, read],
  );
  const removeLine = useCallback(
    (i: number) => {
      const next = withoutLine(read(), i);
      form.setValue('lines', next.lines, DIRTY);
      form.setValue('chambers', next.chambers, DIRTY);
    },
    [form, read],
  );
  const setChamber = useCallback(
    (i: number, p: Partial<DecantationChamberValues>) => {
      for (const [k, x] of Object.entries(p))
        form.setValue(`chambers.${i}.${k}` as `chambers.${number}.sealOk`, x as never, DIRTY);
    },
    [form],
  );
  const addChamber = useCallback(
    () => form.setValue('chambers', [...read('chambers'), emptyChamber(0)], DIRTY),
    [form, read],
  );
  const setLink = useCallback(
    (productId: string, purchaseId: string) =>
      form.setValue('links', { ...read('links'), [productId]: purchaseId }, DIRTY),
    [form, read],
  );

  // Invoice facts of the picked Fuel Purchases (an edited visit falls back to what it links).
  const { invoiceDensityByProduct, invoiceQtyByProduct } = useMemo(() => {
    const density: Record<string, number | null> = {};
    const qty: Record<string, number | null> = {};
    for (const l of decantation?.links ?? []) {
      density[l.productId] = l.invoiceDensity;
      qty[l.productId] = l.invoiceQty;
    }
    for (const [productId, purchaseId] of Object.entries(values.links)) {
      const p = purchases[productId]?.find((x) => x.purchaseId === purchaseId);
      if (p) {
        density[productId] = p.invoiceDensity;
        qty[productId] = p.invoiceQty;
      }
    }
    return { invoiceDensityByProduct: density, invoiceQtyByProduct: qty };
  }, [decantation?.links, values.links, purchases]);

  const ctx: DecantationFormContext = useMemo(
    () => ({
      stationId: station.id,
      timeZone,
      tanks,
      invoiceDensityByProduct,
      invoiceQtyByProduct,
      settings,
    }),
    [station.id, timeZone, tanks, invoiceDensityByProduct, invoiceQtyByProduct, settings],
  );
  const flags = useMemo(() => liveFlags(values, ctx), [values, ctx]);
  const review = useMemo(
    () => reviewDecantation(values, tanks, invoiceQtyByProduct, settings.quantityTolerance),
    [values, tanks, invoiceQtyByProduct, settings.quantityTolerance],
  );

  /** Runs the shared Zod schema; the field errors then show inline. */
  const validate = useCallback(() => form.trigger(), [form]);
  const fe = form.formState.errors;
  const errors = {
    tanker: fe.tankerNumber?.message,
    lines: values.lines.map((_, i) => ({
      tank: fe.lines?.[i]?.tankId?.message,
      beforeDip: fe.lines?.[i]?.beforeDip?.message,
    })),
    /** First problem anywhere in the form, for a summary line. */
    summary: firstMessage(fe),
    any: Object.keys(fe).length > 0,
  };

  const body = (draft: boolean) => buildSaveBody(form.getValues(), ctx, { draft });

  return {
    values,
    patch,
    setLine,
    addLine,
    removeLine,
    setChamber,
    addChamber,
    setLink,
    tanks,
    tanksLoading: tanksQ.isLoading,
    fuelProducts,
    purchases,
    ctx,
    settings,
    timeZone,
    flags,
    review,
    errors,
    validate,
    body,
  };
}

export type Visit = ReturnType<typeof useVisit>;
