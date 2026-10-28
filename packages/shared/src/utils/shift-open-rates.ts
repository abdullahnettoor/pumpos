/**
 * A shift sells each fuel at the rate in effect when it opens, for its whole
 * life (#619). A fuel with no rate in effect would sell at ₹0, so the open is
 * refused until one is set (#630).
 *
 * The fuels that matter are the ones on the nozzles the shift will read: the
 * nozzles of dispensers in service. The server passes those from `OpenShift`;
 * the Open shift form passes the shift-status nozzles, which are filtered the
 * same way. A fuel no running pump sells does not block the open.
 */

/** The fuel ids sold on `nozzles` that have no rate in effect, each once, in nozzle order. */
export function fuelsWithoutRate(
  nozzles: readonly { productId: string }[],
  hasRate: (productId: string) => boolean,
): string[] {
  const missing: string[] = [];
  for (const n of nozzles) {
    if (!missing.includes(n.productId) && !hasRate(n.productId)) missing.push(n.productId);
  }
  return missing;
}

/** "Petrol", "Petrol and Diesel", "Petrol, Diesel and CNG". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "<Fuel> has no rate in effect. Set a rate before opening." — every fuel named. */
export function noRateInEffectMessage(fuelNames: readonly string[]): string {
  const verb = fuelNames.length === 1 ? 'has' : 'have';
  return `${joinNames(fuelNames)} ${verb} no rate in effect. Set a rate before opening.`;
}
