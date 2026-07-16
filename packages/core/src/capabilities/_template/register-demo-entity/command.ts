/**
 * The command: the *intent* to perform a use-case. A plain, serializable input
 * shape — no behaviour. Validation lives in `validator.ts`.
 */
export interface RegisterDemoEntityCommand {
  name: string;
}
