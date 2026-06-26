import type { Repository } from '../../../kernel/index.js';

/** The aggregate this capability owns. */
export interface DemoEntity {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
}

/** Repository port — implemented by an adapter (Drizzle) outside core. */
export interface DemoEntityRepository extends Repository<DemoEntity> {
  existsByName(organizationId: string, name: string): Promise<boolean>;
}
