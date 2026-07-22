let teller = 0

/** Korte unieke id voor nieuwe records. */
export function uid(prefix = 'id'): string {
  teller += 1
  return `${prefix}-${Date.now().toString(36)}-${teller}-${Math.random().toString(36).slice(2, 7)}`
}
