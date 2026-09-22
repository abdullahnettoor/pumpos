/**
 * Seeding the shift-open form's per-dispenser attendant selection.
 *
 * Nobody is preselected. Staff assignment is what makes an attendant
 * accountable for that dispenser's drawer cash at handover, so it is a
 * decision to be made rather than defaulted — and `staff[0]` is whoever the
 * API returned first, which at most stations is the owner.
 *
 * This only became the safe answer once `OpenShift` started refusing a shift
 * whose in-service dispensers are not all assigned (#258). Before that, a
 * preselected wrong name was genuinely better than none, because assignments
 * can only be written at open: an unassigned dispenser could never be handed
 * over, and the only way out was to close and re-open, discarding the opening
 * readings. Now that state cannot be opened into at all, so the reason for
 * defaulting to an arbitrary person is gone with it.
 */
export interface SeededStaffAssignment {
  duId: string;
  /** Empty string means unassigned; the submit path drops those. */
  userId: string;
}

export function seedStaffAssignments(
  dispensers: { id: string }[] | null | undefined,
): SeededStaffAssignment[] {
  return (dispensers ?? []).map((du) => ({ duId: du.id, userId: '' }));
}
