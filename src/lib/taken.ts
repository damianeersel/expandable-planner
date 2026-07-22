// Takenlogica: afgeleide proces-/fasevoortgang, afhankelijkheden (einde-naar-start),
// urenverdeling over uitvoerenden en medewerkersbelasting op taakniveau.

import type { AppData, Fase, ISODate, Medewerker, Taak, TaakStatus, Werkpakket } from './types'
import { addDagen, maxISO, minISO, overlapWerkdagen, werkdagenTussen } from './dates'

// ---------- Afgeleide voortgang & status ----------

export interface TaakTelling {
  totaal: number
  gereed: number
  inUitvoering: number
  onHold: number
  teDoen: number
  urenTotaal: number
  urenGereed: number
  /** Percentage op basis van gereed gemelde uren. */
  pct: number
}

export function telTaken(taken: Taak[]): TaakTelling {
  const t: TaakTelling = { totaal: taken.length, gereed: 0, inUitvoering: 0, onHold: 0, teDoen: 0, urenTotaal: 0, urenGereed: 0, pct: 0 }
  for (const taak of taken) {
    t.urenTotaal += taak.uren
    if (taak.status === 'gereed') {
      t.gereed += 1
      t.urenGereed += taak.uren
    } else if (taak.status === 'in_uitvoering') t.inUitvoering += 1
    else if (taak.status === 'on_hold') t.onHold += 1
    else t.teDoen += 1
  }
  t.pct = t.urenTotaal > 0 ? Math.round((t.urenGereed / t.urenTotaal) * 100) : taken.length > 0 && t.gereed === taken.length ? 100 : 0
  return t
}

/** Afgeleide processtatus uit de taken (fase-statusdomein: gepland/bezig/gereed). */
export function afgeleideProcesStatus(taken: Taak[]): 'gepland' | 'bezig' | 'gereed' {
  if (taken.length === 0) return 'gepland'
  if (taken.every((t) => t.status === 'gereed')) return 'gereed'
  if (taken.some((t) => t.status === 'in_uitvoering')) return 'bezig'
  return 'gepland'
}

/**
 * Normaliseert een fase na een proces-/taakmutatie:
 * proces.uren = som taakuren (indien taken aanwezig), voortgang = gereed-uren-percentage,
 * fase.uren = som procesuren (interne fases) zodat de capaciteitsberekening direct klopt.
 */
export function normaliseerFase(fase: Fase): Fase {
  const werkpakketten = fase.werkpakketten.map((wp) => {
    if (wp.taken.length === 0) return wp
    const telling = telTaken(wp.taken)
    return {
      ...wp,
      uren: telling.urenTotaal,
      voortgang: telling.pct,
      status: afgeleideProcesStatus(wp.taken),
    }
  })
  const somWp = werkpakketten.reduce((s, wp) => s + wp.uren, 0)
  const uren = fase.afdeling === 'extern' ? fase.uren : somWp
  const voortgang =
    somWp > 0
      ? Math.round(werkpakketten.reduce((s, wp) => s + wp.uren * wp.voortgang, 0) / somWp)
      : fase.voortgang
  return { ...fase, werkpakketten, uren, voortgang }
}

// ---------- Opzoeken ----------

export interface TaakPlek {
  fase: Fase
  proces: Werkpakket
  taak: Taak
}

export function vindTaak(data: AppData, projectId: string, taakId: string): TaakPlek | undefined {
  for (const fase of data.fases) {
    if (fase.projectId !== projectId) continue
    for (const proces of fase.werkpakketten) {
      const taak = proces.taken.find((t) => t.id === taakId)
      if (taak) return { fase, proces, taak }
    }
  }
  return undefined
}

export function alleProjectTaken(data: AppData, projectId: string): TaakPlek[] {
  const r: TaakPlek[] = []
  for (const fase of data.fases) {
    if (fase.projectId !== projectId) continue
    for (const proces of fase.werkpakketten) for (const taak of proces.taken) r.push({ fase, proces, taak })
  }
  return r
}

// ---------- Afhankelijkheden (einde-naar-start) ----------

/** Taken (binnen hetzelfde project) die van deze taak afhankelijk zijn. */
export function afhankelijkeTaken(data: AppData, projectId: string, taakId: string): TaakPlek[] {
  return alleProjectTaken(data, projectId).filter((p) => p.taak.afhankelijkVan.includes(taakId))
}

/** Openstaande (niet-gerede) voorgangers van een taak. */
export function openVoorgangers(data: AppData, projectId: string, taak: Taak): TaakPlek[] {
  const alle = alleProjectTaken(data, projectId)
  return taak.afhankelijkVan
    .map((id) => alle.find((p) => p.taak.id === id))
    .filter((p): p is TaakPlek => !!p && p.taak.status !== 'gereed')
}

/** Effectieve planperiode van een taak (terugval op de fase wanneer geen eigen datums). */
export function taakPeriode(taak: Taak, fase: Fase): { start: ISODate; eind: ISODate } {
  return { start: taak.start ?? fase.start, eind: taak.eind ?? fase.eind }
}

// ---------- Uren & medewerkersbelasting ----------

/** Uren per uitvoerende: handmatige verdeling wint, anders gelijkmatig verdeeld. */
export function urenPerUitvoerende(taak: Taak): Record<string, number> {
  if (taak.uitvoerendeIds.length === 0) return {}
  const resultaat: Record<string, number> = {}
  const handmatig = taak.urenPerMedewerker ?? {}
  const zonder = taak.uitvoerendeIds.filter((id) => handmatig[id] === undefined)
  const verdeeld = Object.entries(handmatig)
    .filter(([id]) => taak.uitvoerendeIds.includes(id))
    .reduce((s, [, u]) => s + u, 0)
  const rest = Math.max(0, taak.uren - verdeeld)
  for (const id of taak.uitvoerendeIds) {
    resultaat[id] = handmatig[id] !== undefined ? handmatig[id] : zonder.length > 0 ? rest / zonder.length : 0
  }
  return resultaat
}

/**
 * Geplande taakuren van één medewerker in een week (ma = weekStart).
 * De taakuren worden evenredig over de werkdagen van de taakperiode gespreid.
 * Teamuren zonder toegewezen medewerkers tellen hier niet mee (die zitten al in de teamcapaciteit).
 */
export function medewerkerTaakUrenInWeek(data: AppData, medewerkerId: string, weekStart: ISODate): number {
  const weekEind = addDagen(weekStart, 4)
  let uren = 0
  for (const fase of data.fases) {
    for (const proces of fase.werkpakketten) {
      for (const taak of proces.taken) {
        if (taak.status === 'gereed') continue
        if (!taak.uitvoerendeIds.includes(medewerkerId)) continue
        const { start, eind } = taakPeriode(taak, fase)
        const totaalWd = werkdagenTussen(start, eind)
        if (totaalWd <= 0) continue
        const overlap = overlapWerkdagen(start, eind, weekStart, weekEind)
        if (overlap <= 0) continue
        const eigenUren = urenPerUitvoerende(taak)[medewerkerId] ?? 0
        uren += (eigenUren * overlap) / totaalWd
      }
    }
  }
  return uren
}

/** Taken van een medewerker die overlappen met een periode (voor beschikbaarheidswaarschuwingen). */
export function medewerkerTakenInPeriode(
  data: AppData,
  medewerkerId: string,
  van: ISODate,
  tot: ISODate,
): TaakPlek[] {
  const r: TaakPlek[] = []
  for (const fase of data.fases) {
    for (const proces of fase.werkpakketten) {
      for (const taak of proces.taken) {
        if (taak.status === 'gereed') continue
        if (!taak.uitvoerendeIds.includes(medewerkerId) && taak.taakEigenaarId !== medewerkerId) continue
        const { start, eind } = taakPeriode(taak, fase)
        if (maxISO(start, van) <= minISO(eind, tot)) r.push({ fase, proces, taak })
      }
    }
  }
  return r
}

/** Ontbrekende vaardigheden van een medewerker t.o.v. de taak. */
export function ontbrekendeVaardigheden(taak: Taak, medewerker: Medewerker): string[] {
  return taak.vaardigheden.filter((v) => !medewerker.vaardigheden.includes(v))
}

// ---------- Labels ----------

export const TAAK_STATUS_VOLGORDE: TaakStatus[] = ['te_doen', 'in_uitvoering', 'on_hold', 'gereed']
