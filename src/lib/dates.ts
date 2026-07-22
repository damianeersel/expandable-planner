// Datumhulpfuncties. Alle datums in de app zijn ISO-strings 'YYYY-MM-DD'.
// Weken beginnen op maandag; werkdagen zijn maandag t/m vrijdag.

import type { ISODate } from './types'

export function parseISO(s: ISODate): Date {
  const [j, m, d] = s.split('-').map(Number)
  return new Date(j, m - 1, d)
}

export function toISO(d: Date): ISODate {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function vandaagISO(): ISODate {
  return toISO(new Date())
}

export function addDagen(s: ISODate, n: number): ISODate {
  const d = parseISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** b - a in kalenderdagen. */
export function diffDagen(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000)
}

export function isWeekend(s: ISODate): boolean {
  const dag = parseISO(s).getDay()
  return dag === 0 || dag === 6
}

export function volgendeWerkdag(s: ISODate): ISODate {
  let d = s
  while (isWeekend(d)) d = addDagen(d, 1)
  return d
}

/**
 * Telt n werkdagen verder vanaf start (start telt als dag 1).
 * addWerkdagen('2026-07-20', 5) => vrijdag 2026-07-24.
 */
export function addWerkdagen(start: ISODate, n: number): ISODate {
  let d = volgendeWerkdag(start)
  let resterend = n - 1
  while (resterend > 0) {
    d = addDagen(d, 1)
    if (!isWeekend(d)) resterend -= 1
  }
  return d
}

/** Aantal werkdagen in [van, tot] inclusief. 0 als tot < van. */
export function werkdagenTussen(van: ISODate, tot: ISODate): number {
  if (diffDagen(van, tot) < 0) return 0
  let d = van
  let n = 0
  while (diffDagen(d, tot) >= 0) {
    if (!isWeekend(d)) n += 1
    d = addDagen(d, 1)
  }
  return n
}

/** Aantal overlappende werkdagen tussen twee inclusieve periodes. */
export function overlapWerkdagen(aVan: ISODate, aTot: ISODate, bVan: ISODate, bTot: ISODate): number {
  const van = maxISO(aVan, bVan)
  const tot = minISO(aTot, bTot)
  return werkdagenTussen(van, tot)
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b
}

/** Maandag van de week waarin s valt. */
export function startVanWeek(s: ISODate): ISODate {
  const d = parseISO(s)
  const dag = d.getDay() // 0=zo
  const terug = dag === 0 ? 6 : dag - 1
  d.setDate(d.getDate() - terug)
  return toISO(d)
}

/** ISO-weeknummer (Nederlandse weeknummering). */
export function weekNummer(s: ISODate): number {
  const d = parseISO(s)
  const doel = new Date(d.getTime())
  const dagNr = (d.getDay() + 6) % 7
  doel.setDate(doel.getDate() - dagNr + 3) // donderdag van deze week
  const eersteDonderdag = new Date(doel.getFullYear(), 0, 4)
  const eersteDagNr = (eersteDonderdag.getDay() + 6) % 7
  eersteDonderdag.setDate(eersteDonderdag.getDate() - eersteDagNr + 3)
  return 1 + Math.round((doel.getTime() - eersteDonderdag.getTime()) / (7 * 86400000))
}

/** Lijst van n maandagen, beginnend bij de week waarin `vanaf` valt. */
export function weekReeks(vanaf: ISODate, aantal: number): ISODate[] {
  const eerste = startVanWeek(vanaf)
  return Array.from({ length: aantal }, (_, i) => addDagen(eerste, i * 7))
}

const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const MAANDEN_LANG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const DAGEN_KORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

/** '20-07-2026' */
export function formatDatum(s: ISODate): string {
  const d = parseISO(s)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`
}

/** '20 jul' */
export function formatDatumKort(s: ISODate): string {
  const d = parseISO(s)
  return `${d.getDate()} ${MAANDEN_KORT[d.getMonth()]}`
}

/** 'ma 20 jul' */
export function formatDatumMetDag(s: ISODate): string {
  const d = parseISO(s)
  return `${DAGEN_KORT[d.getDay()]} ${d.getDate()} ${MAANDEN_KORT[d.getMonth()]}`
}

/** 'maandag 20 juli 2026' */
export function formatDatumLang(s: ISODate): string {
  const d = parseISO(s)
  const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']
  return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN_LANG[d.getMonth()]} ${d.getFullYear()}`
}

/** 'juli 2026' */
export function maandLabel(s: ISODate): string {
  const d = parseISO(s)
  return `${MAANDEN_LANG[d.getMonth()]} ${d.getFullYear()}`
}

/** 'Wk 30' */
export function weekLabel(s: ISODate): string {
  return `Wk ${weekNummer(s)}`
}
