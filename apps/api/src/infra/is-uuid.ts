const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a path parameter has the shape Postgres accepts for a `uuid` column.
 * A route checks this before it uses the value in a query: otherwise a typo'd
 * id reaches the database as an invalid cast (a 500) instead of "not found".
 * The shape only: versions and variants are not checked, as Postgres does not.
 */
export const isUuid = (value: string): boolean => UUID.test(value);
