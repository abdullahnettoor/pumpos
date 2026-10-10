import React, { useMemo, useState } from 'react';
import {
  runTask,
  useMerchandiseHandovers,
  useMyAssignment,
  useStations,
  type RecordHandoverResult,
} from '@pump/ui';
import { HandoverPanel } from '../components/HandoverPanel.js';
import type { AssignedDu, MyAssignment } from '../components/handover/model.js';
import { AccountSheet } from './attendant/AccountSheet.js';
import { AttendantHeader } from './attendant/AttendantHeader.js';
import { DuStrip } from './attendant/DuStrip.js';
import { NoShiftState } from './attendant/NoShiftState.js';
import { RecordedState } from './attendant/RecordedState.js';
import { allDusRecorded, buildRecap, type MerchandiseHandoverRecord } from './attendant/recap.js';

/**
 * Attendant app (mobile-only): their handover and nothing else. No dock, bell,
 * Home, Shifts, Reports, Money or Insights, and no station switcher; the only
 * way out is Sign out in the account sheet. Other roles reach the same form
 * through the "My handover" tab when they are assigned to a DU.
 *
 * Three states: no shift assigned, the handover form (saveable until the Shift
 * closes), and "Handover recorded", which shows on reload when the assignment
 * already holds a Handover for every DU and straight after a save.
 */
export const AttendantScreen: React.FC<{ userName: string; onSignOut: () => void }> = ({
  userName,
  onSignOut,
}) => {
  const assignmentQ = useMyAssignment();
  const stationsQ = useStations();
  const data: MyAssignment | null | undefined = assignmentQ.data;
  const dus: AssignedDu[] = useMemo(() => data?.dispenserUnits ?? [], [data?.dispenserUnits]);
  const shiftId = data?.shift?.id;
  const merchQ = useMerchandiseHandovers(shiftId ?? null);

  // What the server accepted in this session, tagged with its Shift so a result
  // can never describe a later one. "Edit" suspends the recorded view.
  const [accepted, setAccepted] = useState<{
    shiftId: string;
    results: RecordHandoverResult[];
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const results = accepted && accepted.shiftId === shiftId ? accepted.results : undefined;
  const showRecorded = !editing && (results != null || allDusRecorded(dus));

  const stationName =
    data?.station?.name ??
    (stationsQ.data as { name?: string }[] | undefined)?.[0]?.name ??
    'PumpOS';

  const recap = useMemo(() => {
    if (!showRecorded) return null;
    const mine = (merchQ.data ?? []).find(
      (h: { attendantId: string }) => h.attendantId === data?.userId,
    ) as MerchandiseHandoverRecord | undefined;
    return buildRecap({ dus, results, merchandise: mine });
  }, [showRecorded, dus, results, merchQ.data, data?.userId]);

  const hasWork = Boolean(data) && dus.length > 0;

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
        shiftName={data?.shift?.templateName}
        onEdit={() => {
          setAccepted(null);
          setEditing(true);
        }}
      />
    );
  } else {
    body = (
      <>
        <DuStrip dus={dus} shiftName={data?.shift?.templateName} openedAt={data?.shift?.openedAt} />
        <HandoverPanel
          onRecorded={(saved) => {
            if (!shiftId) return;
            setAccepted({ shiftId, results: saved });
            setEditing(false);
          }}
        />
      </>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-text-default">
      <AttendantHeader
        stationName={stationName}
        userName={userName}
        onOpenAccount={() => setAccountOpen(true)}
      />
      <main className="flex-1 overflow-y-auto px-4 pt-4">
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
