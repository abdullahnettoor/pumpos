import { useCallback, useMemo, useState } from 'react';
import {
  buildSaveBody,
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

  const [values, setValues] = useState<DecantationFormValues>(() => {
    if (decantation) {
      const v = decantationToFormValues(decantation, timeZone);
      // Finishing: the end time defaults to now, an editable suggestion.
      return { ...v, unloadEnd: v.unloadEnd || nowTime(timeZone) };
    }
    return {
      ...emptyDecantationForm(resolveEntryDate({ timeZone })),
      unloadStart: nowTime(timeZone),
    };
  });

  const patch = useCallback(
    (p: Partial<DecantationFormValues>) => setValues((v) => ({ ...v, ...p })),
    [],
  );
  const setLine = useCallback(
    (i: number, p: Partial<DecantationLineValues>) =>
      setValues((v) => ({ ...v, lines: v.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) })),
    [],
  );
  const addLine = useCallback(
    () => setValues((v) => ({ ...v, lines: [...v.lines, emptyLine()] })),
    [],
  );
  const removeLine = useCallback(
    (i: number) =>
      setValues((v) => ({
        ...v,
        lines: v.lines.filter((_, j) => j !== i),
        // Chambers point at lines by index: keep them on a line that still exists.
        chambers: v.chambers.map((c) => ({
          ...c,
          lineIndex: c.lineIndex > i ? c.lineIndex - 1 : Math.min(c.lineIndex, v.lines.length - 2),
        })),
      })),
    [],
  );
  const setChamber = useCallback(
    (i: number, p: Partial<DecantationChamberValues>) =>
      setValues((v) => ({
        ...v,
        chambers: v.chambers.map((c, j) => (j === i ? { ...c, ...p } : c)),
      })),
    [],
  );
  const addChamber = useCallback(
    () => setValues((v) => ({ ...v, chambers: [...v.chambers, emptyChamber(0)] })),
    [],
  );
  const setLink = useCallback(
    (productId: string, purchaseId: string) =>
      setValues((v) => ({ ...v, links: { ...v.links, [productId]: purchaseId } })),
    [],
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

  /** Inline problems that stop a save: the tanker, and a tank + before dip per line. */
  const errors = useMemo(() => {
    const lines = values.lines.map((l) => ({
      tank: l.tankId ? undefined : 'Choose the tank',
      beforeDip: l.beforeDip.trim() === '' ? 'Enter the before dip' : undefined,
    }));
    return {
      tanker: values.tankerNumber.trim() ? undefined : 'Enter the tanker number',
      lines,
      any:
        !values.tankerNumber.trim() ||
        values.lines.length === 0 ||
        lines.some((l) => l.tank || l.beforeDip),
    };
  }, [values]);

  const body = (draft: boolean) => buildSaveBody(values, ctx, { draft });

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
    body,
  };
}

export type Visit = ReturnType<typeof useVisit>;
