/** Selectors for the Account sheet's read-only team summary. */

/** Members still on the team: everyone not deactivated. */
export function activeMembers<T extends { status?: string }>(users: readonly T[] | undefined): T[] {
  return (users ?? []).filter((u) => u.status !== 'INACTIVE');
}

/** Distinct names of the people assigned to a Dispenser Unit on the open shift. */
export function onShiftNames(
  assignments: ReadonlyArray<{ userName?: string | null }> | undefined,
): string[] {
  const names = (assignments ?? []).map((a) => a.userName).filter((n): n is string => !!n);
  return [...new Set(names)];
}
