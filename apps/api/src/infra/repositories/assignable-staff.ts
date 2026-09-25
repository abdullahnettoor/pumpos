import { sql } from 'drizzle-orm';

/** Roles that may be put on a Dispenser Unit's Drawer at shift open (#291). */
export const ASSIGNABLE_STAFF_ROLES = ['Attendant', 'Staff'] as const;

/**
 * The single definition of "staff this shift-open can assign", over a `users`
 * row aliased `u`. The shift-status reference query offers exactly this list to
 * the open form, and `OpenShift` refuses anyone outside it (#286); both use this
 * fragment so the form can never offer someone the open would refuse.
 *
 * An assignable user is ACTIVE, in the organization, assigned to the station
 * (`user_station_assignments`), and an Attendant or Staff (#291). Owners,
 * Managers and Accountants are not given a Drawer.
 */
export const assignableStaffWhere = (organizationId: string, stationId: string) => sql`
  u.organization_id = ${organizationId}
  AND u.status = 'ACTIVE'
  AND u.role IN (${sql.join(
    ASSIGNABLE_STAFF_ROLES.map((r) => sql`${r}`),
    sql`, `,
  )})
  AND EXISTS (
    SELECT 1 FROM user_station_assignments usa
    WHERE usa.user_id = u.id AND usa.station_id = ${stationId}
  )`;
