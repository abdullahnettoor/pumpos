import React, { useMemo, useState } from 'react';
import { businessDateSettings, type Station } from '@pump/shared';
import {
  runTask,
  useMerchandiseHandovers,
  useMyAssignment,
  type RecordHandoverResult,
} from '@pump/ui';
import { HandoverPanel } from '../components/HandoverPanel.js';
import type { AssignedDu, MyAssignment } from '../lib/handover/model.js';
import { scrollEdgeClass, useScrolled } from '../ui/index.js';
import { AccountSheet } from './attendant/AccountSheet.js';
import { AttendantHeader } from './attendant/AttendantHeader.js';
import { DuStrip } from './attendant/DuStrip.js';
import { NoShiftState } from './attendant/NoShiftState.js';
import { RecordedState } from './attendant/RecordedState.js';
import { buildRecap, type MerchandiseHandoverRecord } from '../lib/handover/recap.js';

/**
 * Attendant app (mobile-only): their handover and nothing else. No dock, bell,
 * Home, Shifts, Reports, Money or Insights, and no station switcher; the only
 * way out is Sign out in the account sheet. Other roles reach the same form
 * from the pinned handover card on Home when they are assigned to a DU.
 *
 * Three states: no shift assigned, the handover form (saveable until the Shift
 * closes), and "Handover recorded", which shows on reload when the assignment
 * already holds a Handover for every DU and straight after a save.
 */
export const AttendantScreen: React.FC<{
  userName: string;
  onSignOut: () => void;
  /** The org's stations: the Shift's station gives the timezone times are shown in. */
  stations?: readonly Station[];
}> = ({ userName, onSignOut, stations = [] }) => {
  const assignmentQ = useMyAssignment();
  const assignment: MyAssignment | null | undefined = assignmentQ.data;
  const dus: AssignedDu[] = useMemo(
    () => assignment?.dispenserUnits ?? [],
    [assignment?.dispenserUnits],
  );
  const shiftId = assignment?.shift?.id;
  // The server returns an Attendant only their own product handover.
  const merchQ = useMerchandiseHandovers(shiftId ?? null);

  // What the server accepted in this session, tagged with its Shift so a result
  // can never describe a later one. "Edit" suspends the recorded view.
  const [accepted, setAccepted] = useState<{
    shiftId: string;
    savedResults: RecordHandoverResult[];
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // The header stays put above the scroller; its edge shows once the form has scrolled under it.
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const scrolled = useScrolled(scroller);

  const savedResults = accepted && accepted.shiftId === shiftId ? accepted.savedResults : undefined;

  // The station the Shift is at, never an arbitrary one from the org's list;
  // with no assignment there is nothing to name.
  const stationName = assignment?.station?.name ?? 'PumpOS';
  const timeZone = businessDateSettings(
    stations.find((s) => s.id === assignment?.station?.id)?.settings,
  ).timeZone;

  // Null until every DU has a recorded Handover (this session's or the one the
  // assignment holds): a partly recorded Shift still shows the form.
  const myMerchandise = useMemo(() => {
    const rows: MerchandiseHandoverRecord[] = merchQ.data ?? [];
    return rows.find((h) => h.attendantId === assignment?.userId);
  }, [merchQ.data, assignment?.userId]);
  const recap = useMemo(
    () => (editing ? null : buildRecap({ dus, results: savedResults, merchandise: myMerchandise })),
    [editing, dus, savedResults, myMerchandise],
  );

  const hasWork = Boolean(assignment) && dus.length > 0;

  // The form has its own sticky save bar at the foot of the scroller; the
  // other states just need breathing room.
  const isForm = !assignmentQ.isLoading && hasWork && !recap;
  let body: React.ReactNode;
  if (assignmentQ.isLoading) {
    body = <p className="py-16 text-center text-sm text-text-muted">Loading your shift…</p>;
  } else if (!hasWork) {
    body = (
      <NoShiftState
        refreshing={assignmentQ.isFetching}
        failed={assignmentQ.isError}
        onRefresh={() => runTask(assignmentQ.refetch(), (e: unknown) => console.error(e))}
      />
    );
  } else if (recap) {
    body = (
      <RecordedState
        recap={recap}
        shiftName={assignment?.shift?.templateName}
        timeZone={timeZone}
        onEdit={() => {
          setAccepted(null);
          setEditing(true);
        }}
      />
    );
  } else {
    body = (
      <>
        <DuStrip
          dus={dus}
          shiftName={assignment?.shift?.templateName}
          openedAt={assignment?.shift?.openedAt}
        />
        <HandoverPanel
          timeZone={timeZone}
          onRecorded={(saved) => {
            if (!shiftId) return;
            setAccepted({ shiftId, savedResults: saved });
            setEditing(false);
          }}
        />
      </>
    );
  }

  return (
    <div className="app-column flex h-[100dvh] flex-col bg-background text-text-default">
      <AttendantHeader
        stationName={stationName}
        userName={userName}
        onOpenAccount={() => setAccountOpen(true)}
        edgeClass={scrollEdgeClass(scrolled)}
      />
      <main ref={setScroller} className="no-scrollbar flex-1 overflow-y-auto px-4 pt-4">
        {isForm ? body : <div className="pb-8">{body}</div>}
      </main>
      <AccountSheet
        open={accountOpen}
        userName={userName}
        stationName={stationName}
        onClose={() => setAccountOpen(false)}
        onSignOut={() => {
          setAccountOpen(false);
          onSignOut();
        }}
      />
    </div>
  );
};
