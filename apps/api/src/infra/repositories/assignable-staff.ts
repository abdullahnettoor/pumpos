import { sql } from 'drizzle-orm';

/**
 * The single definition of "staff this shift-open can assign", over a `users`
 * row aliased `u`. The shift-status reference query offers exactly this list to
 * the open form, and `OpenShift` refuses anyone outside it (#286); both use this
 * fragment so the form can never offer someone the open would refuse.
 *
 * An assignable user is ACTIVE and in the organization, whatever their role
 * (#301): when an attendant is on leave, a Manager, Accountant, Staff member or
 * the Owner covers the pump and holds its Drawer exactly as an Attendant would
 * (ADR 0005). They must also belong to the station (`user_station_assignments`),
 * except an Owner, who works every station of the organization without an
 * assignment row (`isAuthorizedForStation`).
 */
export const assignableStaffWhere = (organizationId: string, stationId: string) => sql`
  u.organization_id = ${organizationId}
  AND u.status = 'ACTIVE'
  AND (
    u.role = 'Owner'
    OR EXISTS (
      SELECT 1 FROM user_station_assignments usa
      WHERE usa.user_id = u.id AND usa.station_id = ${stationId}
    )
  )`;
