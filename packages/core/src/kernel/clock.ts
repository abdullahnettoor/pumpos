/**
 * Deterministic time + identity sources. Injected into use-cases so behaviour
 * is reproducible and unit-testable (no hidden `Date.now()` / `randomUUID()`).
 */

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Fixed clock for tests. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  set(date: Date): void {
    this.current = date;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export interface IdGenerator {
  newId(): string;
}

export class UuidGenerator implements IdGenerator {
  newId(): string {
    return globalThis.crypto.randomUUID();
  }
}

/** Deterministic, monotonic id generator for tests. */
export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  constructor(private readonly prefix = 'id') {}

  newId(): string {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }
}
