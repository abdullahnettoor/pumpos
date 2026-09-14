import type { Role } from '@pump/shared';

/** Authenticated tenant identity shared by the API middleware and routers. */
export interface AuthenticatedPrincipal {
  id: string;
  email: string | null;
  fullName: string | null;
  organizationId: string;
  role: Role;
  assignedStationIds: string[];
}
