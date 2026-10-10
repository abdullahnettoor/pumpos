import React, { useMemo, useRef, useState } from 'react';
import { generateDssrPdf, useBusinessDayList, useToast } from '@pump/ui';
import type { BusinessDayListItem, Station } from '@pump/shared';
import { DayTiles } from '../../components/DayTiles.js';
import { SalesByProduct } from '../../components/SalesByProduct.js';
import { plural } from '../../lib/format.js';
import { businessDateLabel } from '../../lib/dates.js';
import { liveTabFor, liveTabLabel } from '../../lib/reports/days.js';
import { stepTargets, type StepTarget } from '../../lib/reports/dssr.js';
import { useNav } from '../../shell/nav.js';
import { DetailPage, Note, SectionLabel } from '../../ui/index.js';
import { ShiftSummaryPage } from '../ShiftSummaryPage.js';
import { DayStepper } from './DayStepper.js';
import { DssrDraftBanner } from './DssrDraftBanner.js';
import { IncludedShifts } from './IncludedShifts.js';
import { StockMovement } from './StockMovement.js';
import { useDssrDay, type DssrDay } from './useDssrDay.js';

interface Props {
  station: Station;
  /** The Business Date (`YYYY-MM-DD`) to open on; ‹ › then step across the list's days. */
  businessDate: string;
}

/**
 * The full DSSR of one Business Day, pushed from the Reports list. Sealed days
 * read the immutable DSSR snapshot; Draft days (a past Business Day still open)
 * read the DSSR preview under a "Draft · day not closed" banner, and their PDF
 * is marked as a draft. A Live day has no DSSR (it goes to Home) and there is
 * no Close-day action here: closing stays on desktop. Share and Download use
 * the same PDF generator as desktop.
 */
export const ReportDayPage: React.FC<Props> = ({ station, businessDate }) => {
  const nav = useNav();
  const toast = useToast();
  const [date, setDate] = useState(businessDate);
  const [stepping, setStepping] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const list = useBusinessDayList(station.id);
  const days = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.days), [list.data]);
  const status = days.find((d) => d.businessDate === date)?.status;
  const liveTab = liveTabFor(nav.tabs);

  const { model, loading, error, refetch } = useDssrDay(station, date, status);
  const targets = stepTargets(days, date, { hasOlderMonths: !!list.hasNextPage, liveTab });

  const goTo = (t: StepTarget | null) => {
    if (t?.kind === 'live') nav.select(t.tab);
    else if (t?.kind === 'day') {
      setDate(t.date);
      top.current?.scrollIntoView?.({ block: 'start' });
    }
  };

  // The older month may not be loaded yet: page back until a day with a DSSR turns up.
  const stepOlder = async () => {
    setStepping(true);
    try {
      let t = targets.older;
      let loadedPages = list.data?.pages.length ?? 0;
      while (t?.kind === 'load') {
        const res = await list.fetchNextPage();
        const pages = res.data?.pages ?? [];
        // A failed fetch RESOLVES (it does not throw) and leaves hasNextPage as it was,
        // so looping on it would retry for ever: stop when no new page arrived.
        if (res.isError || pages.length <= loadedPages) throw res.error ?? new Error('No page');
        loadedPages = pages.length;
        const loaded: BusinessDayListItem[] = pages.flatMap((p) => p.days);
        t = stepTargets(loaded, date, { hasOlderMonths: !!res.hasNextPage, liveTab }).older;
      }
      goTo(t);
    } catch {
      toast.error('Could not load older days.');
    } finally {
      setStepping(false);
    }
  };

  const openShift = (shiftId: string) =>
    nav.push(<ShiftSummaryPage station={station} shiftId={shiftId} />, `shift:${shiftId}`);

  const pdf = (day: DssrDay, output: 'save' | 'download') =>
    generateDssrPdf(
      station,
      {
        snapshotData: day.snap,
        businessDate: date,
        generatedAt: day.row.generatedAt ?? new Date().toISOString(),
        draft: day.draft,
      },
      output,
    );

  const shiftCount = model?.shifts.length ?? 0;
  const body = (() => {
    if (status === 'LIVE')
      return (
        <div className="px-4 py-10 text-center text-sm text-text-muted">
          <p>This day is still live, so it has no DSSR yet.</p>
          {liveTab && (
            <button
              type="button"
              onClick={() => nav.select(liveTab)}
              className="mt-2 font-bold text-accent"
            >
              See {liveTabLabel(liveTab)}
            </button>
          )}
        </div>
      );
    if (status === 'REPORT_MISSING') return <Note>No DSSR for this day.</Note>;
    if (loading) return <Note>Loading DSSR…</Note>;
    if (error)
      return (
        <div role="alert" className="px-4 py-10 text-center text-sm text-bad-fg">
          Couldn’t load this DSSR.{' '}
          <button type="button" onClick={refetch} className="font-bold text-accent">
            Retry
          </button>
        </div>
      );
    if (!model) return <Note>This DSSR is not available.</Note>;

    return (
      <>
        {model.draft && <DssrDraftBanner />}

        <SectionLabel right={model.draft ? undefined : 'Sealed'}>Summary</SectionLabel>
        <div className="grid grid-cols-2 gap-2 px-3">
          <DayTiles tiles={model.tiles} />
        </div>

        <SectionLabel>Sales by product</SectionLabel>
        <SalesByProduct
          fuel={model.sales.fuel}
          products={model.sales.products}
          fuelTotal={model.sales.fuelValue}
          productsTotal={model.sales.productsValue}
          fuelNote={{ text: plural(shiftCount, 'closed Shift') }}
          productsNote={{ text: 'Product sales' }}
          fuelEmpty="No fuel sales on this day."
          productsEmpty="No product sales on this day."
        />

        {model.shifts.length > 0 && (
          <>
            <SectionLabel right={plural(shiftCount, 'closed Shift')}>Included Shifts</SectionLabel>
            <IncludedShifts shifts={model.shifts} onOpen={openShift} />
          </>
        )}

        {model.tanks.length > 0 && (
          <>
            <SectionLabel>Stock movement</SectionLabel>
            <StockMovement tanks={model.tanks} />
          </>
        )}

        <p className="px-4 pt-4 text-[11px] text-text-muted">
          Sales only. Collections, expenses and supplier payments are office records by entry date.
        </p>
      </>
    );
  })();

  return (
    <DetailPage
      title={`DSSR · ${businessDateLabel(date)}`}
      subtitle={[model ? plural(shiftCount, 'Shift') : '', station.name]
        .filter(Boolean)
        .join(' · ')}
      right={
        <DayStepper
          older={targets.older}
          newer={targets.newer}
          busy={stepping}
          onOlder={() => void stepOlder()}
          onNewer={() => goTo(targets.newer)}
        />
      }
      share={model ? { onPress: () => pdf(model, 'save') } : undefined}
      download={
        model ? { onPress: () => pdf(model, 'download'), label: 'Download PDF' } : undefined
      }
      onActionError={(message) => toast.error(message)}
    >
      <div ref={top} />
      {body}
    </DetailPage>
  );
};
