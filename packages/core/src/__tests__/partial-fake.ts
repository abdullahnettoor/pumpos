/**
 * Types an intentionally partial fake as the full port. The members given are
 * still checked against the port; the use case under test must call only them.
 */
export const partialFake = <T>(fake: Partial<T>): T => fake as T;
