import { fileURLToPath } from 'node:url';

/**
 * Point `@pump/*` at workspace **source**, not the compiled `dist/` that each
 * package's `main` names (#289).
 *
 * Without this, a test in one workspace runs whatever another workspace last
 * built. Root `npm test` builds nothing first, so after a pull or branch switch
 * the API suite silently exercised stale core code. The statement-budget tests
 * caught it by counting one query too many, which looked like a timing flake.
 * Tests must always run the code in the working tree.
 */
const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export const workspaceSourceAliases = {
  '@pump/core': src('core'),
  '@pump/db': src('db'),
  '@pump/shared': src('shared'),
};
