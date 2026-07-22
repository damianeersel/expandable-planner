// Capaciteitsberekening: beschikbaarheid van medewerkers/teams/afdelingen per week,
// geplande belasting vanuit fases en signalering van overbezetting en risico's.

import type {
  Afdeling,
  AppData,
  Fase,
  ISODate,
  Medewerker,
  Project,
  ScenarioMode,
  Team,
} from './types'
import { FASE_VOLGORDE } from './types'
import {
  addDagen,
  isWeekend,
  maxISO,
  overlapWerkdagen,
  vandaagISO,
  weekNummer,
  werkdagenTussen,
} from './dates'

// ---------- Medewerker ----------

/** Team waar de medewerker op een specifieke dag toe behoort (incl. tijdelijke toewijzing). */
export function medewerkerTeamOpDag(m: Medewerker, datum: ISODate): string | undefined {
  const t = m.tijdelijkTeam
  if (t && datum >= t.van && datum <= t.tot) return t.teamId
  return m.teamId
}

/** Beschikbaarheidspercentage op een dag (incl. tijdelijke aanpassingen). */
export function medewerkerPctOpDag(data: AppData, m: Medewerker, datum: ISODate): number {
  const aanpassing = data.aanpassingen.find(
    (a) => a.medewerkerId === m.id && datum >= a.van && datum <= a.tot,
  )
  return aanpassing ? aanpassing.pct : m.beschikbaarheidPct
}

/**
 * Netto beschikbare uren van een medewerker op één dag:
 * contracturen/5 × beschikbaarheid% − afwezigheidsuren (concept telt niet mee).
 */
export function medewerkerUrenOpDag(data: AppData, m: Medewerker, datum: ISODate): number {
  if (!m.actief || isWeekend(datum)) return 0
  const dagUren = m.contracturen / 5
  let uren = dagUren * (medewerkerPctOpDag(data, m, datum) / 100)
  for (const afw of data.afwezigheid) {
    if (afw.medewerkerId !== m.id || afw.status === 'concept') continue
    if (datum < afw.van || datum > afw.tot) continue
    uren -= afw.dagdeel === 'heel' ? dagUren : dagUren / 2
  }
  return Math.max(0, uren)
}

/** Afwezigheidsuren van een medewerker in de week die op weekStart (maandag) begint. */
export function medewerkerAfwezigInWeek(data: AppData, m: Medewerker, weekStart: ISODate): number {
  let uren = 0
  const dagUren = m.contracturen / 5
  for (let i = 0; i < 5; i++) {
    const datum = addDagen(weekStart, i)
    for (const afw of data.afwezigheid) {
      if (afw.medewerkerId !== m.id || afw.status === 'concept') continue
      if (datum < afw.van || datum > afw.tot) continue
      uren += afw.dagdeel === 'heel' ? dagUren : dagUren / 2
    }
  }
  return uren
}

/** Netto beschikbare uren van een medewerker in een week (ma t/m vr). */
export function medewerkerBeschikbaarInWeek(data: AppData, medewerkerId: string, weekStart: ISODate): number {
  const m = data.medewerkers.find((x) => x.id === medewerkerId)
  if (!m) return 0
  let uren = 0
  for (let i = 0; i < 5; i++) uren += medewerkerUrenOpDag(data, m, addDagen(weekStart, i))
  return uren
}

// ---------- Team ----------

/** Leden van een team op een bepaalde dag (incl. tijdelijk toegewezen medewerkers). */
export function teamLedenOpDag(data: AppData, teamId: string, datum: ISODate): Medewerker[] {
  return data.medewerkers.filter((m) => m.actief && medewerkerTeamOpDag(m, datum) === teamId)
}

/** Netto beschikbare uren van een team in een week. */
export function teamBeschikbaarInWeek(data: AppData, teamId: string, weekStart: ISODate): number {
  let uren = 0
  for (let i = 0; i < 5; i++) {
    const datum = addDagen(weekStart, i)
    for (const m of data.medewerkers) {
      if (!m.actief) continue
      if (medewerkerTeamOpDag(m, datum) !== teamId) continue
      uren += medewerkerUrenOpDag(data, m, datum)
    }
  }
  return uren
}

/** Uren die een fase in een bepaalde week claimt (uren evenredig verdeeld over werkdagen). */
export function faseUrenInWeek(fase: Fase, weekStart: ISODate): number {
  if (fase.uren <= 0) return 0
  const totaal = werkdagenTussen(fase.start, fase.eind)
  if (totaal <= 0) return 0
  const weekEind = addDagen(weekStart, 4)
  const overlap = overlapWerkdagen(fase.start, fase.eind, weekStart, weekEind)
  return (fase.uren * overlap) / totaal
}

export interface GeplandeUren {
  definitief: number
  schaduw: number
  /** schaduw × verkoopkans */
  gewogen: number
}

/** Geplande uren voor een team in een week, gesplitst naar definitief / schaduw. */
export function teamGeplandInWeek(data: AppData, teamId: string, weekStart: ISODate): GeplandeUren {
  const r: GeplandeUren = { definitief: 0, schaduw: 0, gewogen: 0 }
  for (const fase of data.fases) {
    if (fase.teamId !== teamId) continue
    const project = data.projecten.find((p) => p.id === fase.projectId)
    if (!project || project.status === 'geannuleerd') continue
    const uren = faseUrenInWeek(fase, weekStart)
    if (uren <= 0) continue
    if (project.status === 'schaduw') {
      r.schaduw += uren
      r.gewogen += (uren * project.verkoopkans) / 100
    } else {
      r.definitief += uren
    }
  }
  return r
}

/** Belasting volgens het gekozen scenario. */
export function scenarioBelasting(g: GeplandeUren, scenario: ScenarioMode): number {
  if (scenario === 'definitief') return g.definitief
  if (scenario === 'definitief_schaduw') return g.definitief + g.schaduw
  return g.definitief + g.gewogen
}

export type CapaciteitsNiveau = 'ok' | 'druk' | 'overboekt'

/** < 85% ok · 85–100% druk · > 100% overboekt */
export function capaciteitsNiveau(pct: number): CapaciteitsNiveau {
  if (pct > 100) return 'overboekt'
  if (pct >= 85) return 'druk'
  return 'ok'
}

export function bezettingsPct(beschikbaar: number, belasting: number): number {
  if (beschikbaar <= 0) return belasting > 0 ? 999 : 0
  return Math.round((belasting / beschikbaar) * 100)
}

// ---------- Afdeling ----------

export function afdelingTeams(data: AppData, afdeling: Afdeling): Team[] {
  return data.teams.filter((t) => t.afdeling === afdeling)
}

export function afdelingBeschikbaarInWeek(data: AppData, afdeling: Afdeling, weekStart: ISODate): number {
  return afdelingTeams(data, afdeling).reduce(
    (som, t) => som + teamBeschikbaarInWeek(data, t.id, weekStart),
    0,
  )
}

export function afdelingGeplandInWeek(data: AppData, afdeling: Afdeling, weekStart: ISODate): GeplandeUren {
  const r: GeplandeUren = { definitief: 0, schaduw: 0, gewogen: 0 }
  for (const t of afdelingTeams(data, afdeling)) {
    const g = teamGeplandInWeek(data, t.id, weekStart)
    r.definitief += g.definitief
    r.schaduw += g.schaduw
    r.gewogen += g.gewogen
  }
  return r
}

// ---------- Project-afgeleiden ----------

export function projectFases(data: AppData, projectId: string): Fase[] {
  return data.fases
    .filter((f) => f.projectId === projectId)
    .sort((a, b) => (a.start === b.start ? FASE_VOLGORDE.indexOf(a.key) - FASE_VOLGORDE.indexOf(b.key) : a.start < b.start ? -1 : 1))
}

/** Verwachte opleverdatum = einddatum van de laatste fase. */
export function getVerwachteOplevering(data: AppData, projectId: string): ISODate {
  const fases = projectFases(data, projectId)
  const project = data.projecten.find((p) => p.id === projectId)
  if (fases.length === 0) return project?.gewensteOpleverdatum ?? vandaagISO()
  return fases.reduce((max, f) => maxISO(max, f.eind), fases[0].eind)
}

/** Urengewogen voortgang over alle fases (spuiterfase weegt mee via doorlooptijd × 8u). */
export function getProjectVoortgang(data: AppData, projectId: string): number {
  const fases = projectFases(data, projectId)
  if (fases.length === 0) return 0
  let gewicht = 0
  let gedaan = 0
  for (const f of fases) {
    const w = f.uren > 0 ? f.uren : werkdagenTussen(f.start, f.eind) * 8
    gewicht += w
    gedaan += (w * (f.status === 'gereed' ? 100 : f.voortgang)) / 100
  }
  return gewicht > 0 ? Math.round((gedaan / gewicht) * 100) : 0
}

/** Eerste fase die nog niet gereed is; anders de laatste fase. */
export function getHuidigeFase(data: AppData, projectId: string): Fase | undefined {
  const fases = projectFases(data, projectId)
  return fases.find((f) => f.status !== 'gereed') ?? fases[fases.length - 1]
}

export interface CapaciteitsConflict {
  weekStart: ISODate
  weekNr: number
  teamId: string
  teamNaam: string
  beschikbaar: number
  belasting: number
  pct: number
}

/**
 * Weken waarin teams van dit project overboekt raken wanneer het project
 * (alsDefinitief) volledig meetelt bovenop alle overige definitieve belasting.
 */
export function getCapaciteitsConflicten(data: AppData, projectId: string): CapaciteitsConflict[] {
  const conflicten: CapaciteitsConflict[] = []
  const fases = projectFases(data, projectId).filter((f) => f.teamId && f.status !== 'gereed')
  const gezien = new Set<string>()
  for (const fase of fases) {
    let week = addDagen(fase.start, -((new Date(fase.start.replace(/-/g, '/')).getDay() + 6) % 7))
    while (week <= fase.eind) {
      const sleutel = `${fase.teamId}|${week}`
      if (!gezien.has(sleutel)) {
        gezien.add(sleutel)
        const teamId = fase.teamId!
        const beschikbaar = teamBeschikbaarInWeek(data, teamId, week)
        const g = teamGeplandInWeek(data, teamId, week)
        // Belasting: alle definitieve uren + de uren van dít project (ook als het nog schaduw is).
        const project = data.projecten.find((p) => p.id === projectId)
        let belasting = g.definitief
        if (project?.status === 'schaduw') {
          for (const f2 of data.fases) {
            if (f2.teamId === teamId && f2.projectId === projectId) belasting += faseUrenInWeek(f2, week)
          }
        }
        const pct = bezettingsPct(beschikbaar, belasting)
        if (pct > 100) {
          const team = data.teams.find((t) => t.id === teamId)
          conflicten.push({
            weekStart: week,
            weekNr: weekNummer(week),
            teamId,
            teamNaam: team?.naam ?? teamId,
            beschikbaar: Math.round(beschikbaar),
            belasting: Math.round(belasting),
            pct,
          })
        }
      }
      week = addDagen(week, 7)
    }
  }
  return conflicten.sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
}

export type RisicoNiveau = 'laag' | 'middel' | 'hoog'

export interface ProjectRisico {
  niveau: RisicoNiveau
  redenen: string[]
}

/** Automatische risicobepaling per project. */
export function getProjectRisico(data: AppData, project: Project): ProjectRisico {
  const redenen: string[] = []
  let niveau: RisicoNiveau = 'laag'
  const zwaarder = (n: RisicoNiveau) => {
    const orde: RisicoNiveau[] = ['laag', 'middel', 'hoog']
    if (orde.indexOf(n) > orde.indexOf(niveau)) niveau = n
  }

  const fases = projectFases(data, project.id)
  const verwacht = getVerwachteOplevering(data, project.id)
  if (verwacht > project.gewensteOpleverdatum) {
    const dagen = werkdagenTussen(project.gewensteOpleverdatum, verwacht) - 1
    redenen.push(`Verwachte oplevering ${dagen} werkdag(en) na gewenste datum`)
    zwaarder(project.status === 'definitief' ? 'hoog' : 'middel')
  }

  for (const f of fases) {
    if (f.status === 'geblokkeerd') {
      redenen.push(`Fase "${f.naam}" is geblokkeerd${f.blokkadeNotitie ? `: ${f.blokkadeNotitie}` : ''}`)
      zwaarder('hoog')
    }
    if (f.externePartijId && f.status !== 'gereed') {
      const partij = data.externePartijen.find((e) => e.id === f.externePartijId)
      if (partij && partij.vertragingDagen > 0) {
        redenen.push(`${partij.naam} meldt ${partij.vertragingDagen} werkdag(en) vertraging`)
        zwaarder(f.status === 'bezig' ? 'hoog' : 'middel')
      }
    }
  }

  const conflicten = getCapaciteitsConflicten(data, project.id)
  if (conflicten.length > 0) {
    const teams = [...new Set(conflicten.map((c) => c.teamNaam))]
    redenen.push(`Capaciteitsconflict: ${teams.join(', ')} overboekt in ${conflicten.length} week/weken`)
    zwaarder(project.status === 'definitief' ? 'hoog' : 'middel')
  }

  return { niveau, redenen }
}

// ---------- Teamwaarschuwingen ----------

export interface TeamWaarschuwing {
  soort: 'teamgrootte' | 'overboekt' | 'druk'
  tekst: string
}

export function getTeamWaarschuwingen(data: AppData, teamId: string, weekStart: ISODate): TeamWaarschuwing[] {
  const w: TeamWaarschuwing[] = []
  const leden = teamLedenOpDag(data, teamId, weekStart)
  if (leden.length < 3) w.push({ soort: 'teamgrootte', tekst: `Klein team: ${leden.length} medewerker(s) (richtlijn 3–5)` })
  if (leden.length > 5) w.push({ soort: 'teamgrootte', tekst: `Groot team: ${leden.length} medewerkers (richtlijn 3–5)` })
  const beschikbaar = teamBeschikbaarInWeek(data, teamId, weekStart)
  const g = teamGeplandInWeek(data, teamId, weekStart)
  const pct = bezettingsPct(beschikbaar, g.definitief)
  if (pct > 100) w.push({ soort: 'overboekt', tekst: `Overboekt deze week: ${pct}% van de capaciteit definitief gepland` })
  else if (pct >= 85) w.push({ soort: 'druk', tekst: `Hoge bezetting deze week: ${pct}%` })
  return w
}
