/** Zahl deutsch formatiert (Tausenderpunkt, Dezimalkomma), höchstens `digits` Nachkommastellen. */
export function fmtNumber(n: number, digits = 1): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: digits });
}
