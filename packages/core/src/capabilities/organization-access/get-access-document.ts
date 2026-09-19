import type { AccessDocument, Role } from '@pump/shared';
import { ok } from '../../kernel/index.js';
import type { ExecutionContext, Result, UseCase } from '../../kernel/index.js';
import type { OrganizationAccessReader } from './ports.js';
import { buildAccessDocument } from './resolve-access.js';
import type { AccessRegistry } from './registry.js';

export interface GetAccessDocumentDeps {
  access: OrganizationAccessReader;
  /** Override only in tests; production always uses the shipped registry. */
  registry?: AccessRegistry;
}

/**
 * Read the requesting user's view of what their Organization may use.
 *
 * This is presentation data. Every protected operation re-checks access on the
 * server; nothing is authorized because the client holds a document saying so.
 */
export class GetAccessDocument implements UseCase<{ role: Role }, AccessDocument> {
  constructor(private readonly deps: GetAccessDocumentDeps) {}

  async execute(input: { role: Role }, ctx: ExecutionContext): Promise<Result<AccessDocument>> {
    const inputs = await this.deps.access.load(ctx.organizationId);
    return ok(buildAccessDocument({ inputs, role: input.role, registry: this.deps.registry }));
  }
}
