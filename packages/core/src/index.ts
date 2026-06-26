/**
 * @pump/core — framework-agnostic domain layer for PumpOS.
 *
 * Organized as bounded-context capabilities composed of use-cases. The kernel
 * provides the shared building blocks (Result, errors, events, dispatcher,
 * use-case + repository ports). Capabilities are added per implementation phase.
 *
 * Core never imports Hono, Drizzle, React or SQL. Adapters wire concrete
 * implementations of the ports defined here.
 */
export * from './kernel/index.js';
export * from './capabilities/station-setup/index.js';
