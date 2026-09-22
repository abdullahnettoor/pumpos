/**
 * The form's assignment state, mapped to what `OpenShift` accepts on the wire.
 *
 * Extracted from the submit handler so the shape is assertable (#223). The
 * DU-centric restructure changed only how the operator *enters* these; the
 * payload is meant to be byte-identical for equivalent choices, and a claim
 * like that belongs in a test rather than a comment.
 */
export interface FormStaffAssignment {
  duId: string;
  /** '' when the dispenser is unassigned. */
  userId: string;
}

export interface FormTerminalAssignment {
  terminalId: string;
  /** '' when the terminal is shift-wide rather than on a dispenser. */
  duId: string;
}

export interface OpenShiftAssignmentsPayload {
  staffAssignments: { userId: string; duId: string }[];
  terminalLinks: { terminalId: string; duId: string | null }[];
}

export function buildOpenShiftAssignments(
  staffAssignments: FormStaffAssignment[],
  terminalAssignments: FormTerminalAssignment[],
): OpenShiftAssignmentsPayload {
  return {
    // An unassigned dispenser is an absent row, not a row with an empty user:
    // the command's schema requires a non-empty `userId`.
    staffAssignments: staffAssignments.filter((a) => a.userId !== ''),
    // Every terminal is linked to the shift. `null` is how "shift-wide" is
    // spelled on the wire — the handover reader treats a null link as
    // declarable from any dispenser, so dropping these would hide a shared
    // POS from every attendant.
    terminalLinks: terminalAssignments.map((t) => ({
      terminalId: t.terminalId,
      duId: t.duId || null,
    })),
  };
}
