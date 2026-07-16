import type { DomainEvent } from '../../../kernel/index.js';

/**
 * Capability-local event type. Cross-context events belong in the shared
 * BusinessEvents catalog; context-local ones (like this example) may be
 * declared here.
 */
export const DEMO_ENTITY_REGISTERED = 'DEMO_ENTITY_REGISTERED';

export interface DemoEntityRegisteredPayload {
  demoEntityId: string;
  name: string;
}

export type DemoEntityRegistered = DomainEvent<
  typeof DEMO_ENTITY_REGISTERED,
  DemoEntityRegisteredPayload
>;
