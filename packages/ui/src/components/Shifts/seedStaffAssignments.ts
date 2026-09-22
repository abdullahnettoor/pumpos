/**
 * Seeding the shift-open form's per-dispenser attendant selection.
 *
 * Every dispenser is preselected with the first available member of staff.
 * That looks like the wrong default — staff assignment is what makes an
 * attendant accountable for that dispenser's drawer cash at handover, and
 * `staff[0]` is whoever the API happened to return first — and while
 * restructuring the form (#223) it was briefly changed to leave dispensers
 * unassigned unless there was exactly one candidate.
 *
 * That was worse, because of where assignments can be written: only at shift
 * open (`OpenShift`), from `staffAssignments`, which the submit path filters
 * empties out of. There is no route that adds an assignment to a shift that is
 * already open. So a shift opened with none is a shift where
 * `GET /shifts/my-assignment` answers null for every attendant, no handover
 * can be recorded at all, and the only way out is to close and re-open —
 * discarding the opening readings.
 *
 * A misassignment is visible on the dispenser's own card and is one click to
 * correct; even unnoticed, it attributes a shortage to a named person, which
 * is auditable and disputable. An absent assignment is neither, and cannot be
 * repaired. Preselecting is the safer wrong.
 *
 * The real hole is that zero assignments is reachable at all — an operator can
 * still set every card to Unassigned by hand. That wants a guard at open
 * rather than a seeding trick, and is filed separately.
 */
export interface SeededStaffAssignment {
  duId: string;
  /** Empty string means unassigned; the submit path drops those. */
  userId: string;
}

export function seedStaffAssignments(
  dispensers: { id: string }[] | null | undefined,
  staff: { id: string }[] | null | undefined,
): SeededStaffAssignment[] {
  const defaultUserId = staff?.[0]?.id ?? '';
  return (dispensers ?? []).map((du) => ({ duId: du.id, userId: defaultUserId }));
}
