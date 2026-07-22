// Gedeelde helpers voor de Gantt-planning: tijdlijnberekening, groepering,
// filters en lokale simulatie van faseverschuivingen (voor waarschuwingen).

import type { AppData, Afdeling, Fase, ISODate, ProjectStatus } from '../../lib/types'
import {
  addDagen,
  diffDagen,
  maandLabel,
  minISO,
  startVanWeek,
  vandaagISO,
  werkdagenTussen,
} from '../../lib/dates'

// ---------- Tijdlijn ----------

export type Zoom = 'dag' | 'week' | 'maand'

export const DAG_BREEDTES: Record<Zoom, number> = { dag: 26, week: 9, maand: 3.5 }

/** Breedte van de sticky linkerkolom in px (Tailwind w-72). */
export const LINKS_BREEDTE = 288

const WEKEN_VOOR = 4
const WEKEN_NA = 30
export const AANTAL_WEKEN = WEKEN_VOOR + WEKEN_NA

export interface Tijdlijn {
  zoom: Zoom
  dagBreedte: number
  rangeStart: ISODate // maandag, 4 weken vóór vandaag
  rangeEind: ISODate // inclusief (zondag)
  weken: ISODate[] // maandagen
  totaalBreedte: number
  x: (datum: ISODate) => number
  vandaag: ISODate
  vandaagX: number
}

export function maakTijdlijn(zoom: Zoom): Tijdlijn {
  const vandaag = vandaagISO()
  const rangeStart = addDagen(startVanWeek(vandaag), -WEKEN_VOOR * 7)
  const dagBreedte = DAG_BREEDTES[zoom]
  const weken = Array.from({ length: AANTAL_WEKEN }, (_, i) => addDagen(rangeStart, i * 7))
  const x = (datum: ISODate) => diffDagen(rangeStart, datum) * dagBreedte
  return {
    zoom,
    dagBreedte,
    rangeStart,
    rangeEind: addDagen(rangeStart, AANTAL_WEKEN * 7 - 1),
    weken,
    totaalBreedte: AANTAL_WEKEN * 7 * dagBreedte,
    x,
    vandaag,
    vandaagX: x(vandaag),
  }
}

export interface MaandSegment {
  label: string
  left: number
  breedte: number
}

export function maandSegmenten(t: Tijdlijn): MaandSegment[] {
  const segmenten: MaandSegment[] = []
  let cursor = t.rangeStart
  while (cursor <= t.rangeEind) {
    const [j, m] = cursor.split('-').map(Number)
    const laatste = new Date(j, m, 0).getDate()
    const maandEind = `${j}-${String(m).padStart(2, '0')}-${String(laatste).padStart(2, '0')}`
    const segEind = minISO(maandEind, t.rangeEind)
    segmenten.push({
      label: maandLabel(cursor),
      left: t.x(cursor),
      breedte: (diffDagen(cursor, segEind) + 1) * t.dagBreedte,
    })
    cursor = addDagen(segEind, 1)
  }
  return segmenten
}

// ---------- Groepering & planningstype ----------

export type Groepering = 'project' | 'afdeling' | 'team' | 'productieleider' | 'extern'

export const GROEPERING_LABELS: Record<Groepering, string> = {
  project: 'Project',
  afdeling: 'Afdeling',
  team: 'Team',
  productieleider: 'Productieleider',
  extern: 'Externe partij',
}

export type PlanningsType = 'definitief' | 'schaduw' | 'beide'

// ---------- Filters ----------

export interface PlanningFilters {
  status: '' | ProjectStatus
  afdeling: '' | Afdeling
  teamId: string
  productieleiderId: string
  productModel: string
  spuiterId: string
  onderaannemerId: string
  oplevermaand: string // 'YYYY-MM'
  risico: '' | 'met' | 'zonder'
}

export const LEGE_FILTERS: PlanningFilters = {
  status: '',
  afdeling: '',
  teamId: '',
  productieleiderId: '',
  productModel: '',
  spuiterId: '',
  onderaannemerId: '',
  oplevermaand: '',
  risico: '',
}

export function telActieveFilters(f: PlanningFilters): number {
  return Object.values(f).filter((v) => v !== '').length
}

// ---------- Afhankelijkheden & simulatie ----------

/** Alle fase-ids die (transitief) afhankelijk zijn van de gegeven fase, binnen hetzelfde project. */
export function afhankelijkeFaseIds(fases: Fase[], faseId: string): Set<string> {
  const bron = fases.find((f) => f.id === faseId)
  if (!bron) return new Set()
  const projectFases = fases.filter((f) => f.projectId === bron.projectId)
  const resultaat = new Set<string>()
  let front = [faseId]
  while (front.length > 0) {
    const volgend: string[] = []
    for (const f of projectFases) {
      if (resultaat.has(f.id)) continue
      if (f.afhankelijkVan.some((dep) => front.includes(dep) || resultaat.has(dep))) {
        resultaat.add(f.id)
        volgend.push(f.id)
      }
    }
    if (volgend.length === 0) break
    front = volgend
  }
  return resultaat
}

function verschuif(f: Fase, delta: number): Fase {
  return {
    ...f,
    start: addDagen(f.start, delta),
    eind: addDagen(f.eind, delta),
    transportHeen: f.transportHeen ? addDagen(f.transportHeen, delta) : undefined,
    transportTerug: f.transportTerug ? addDagen(f.transportTerug, delta) : undefined,
  }
}

/** Simuleert FASE_VERSCHUIVEN zonder de store te raken (voor waarschuwingen direct na dispatch). */
export function simuleerVerschuiving(data: AppData, faseId: string, deltaDagen: number, cascade: boolean): AppData {
  const teVerschuiven = cascade ? afhankelijkeFaseIds(data.fases, faseId) : new Set<string>()
  teVerschuiven.add(faseId)
  return {
    ...data,
    fases: data.fases.map((f) => (teVerschuiven.has(f.id) ? verschuif(f, deltaDagen) : f)),
  }
}

/** Simuleert FASE_DATUMS (alleen einddatum verschoven met deltaEind). */
export function simuleerResize(data: AppData, faseId: string, deltaEind: number, cascade: boolean): AppData {
  const afhankelijk = cascade && deltaEind !== 0 ? afhankelijkeFaseIds(data.fases, faseId) : new Set<string>()
  return {
    ...data,
    fases: data.fases.map((f) => {
      if (f.id === faseId) return { ...f, eind: addDagen(f.eind, deltaEind) }
      if (afhankelijk.has(f.id)) return verschuif(f, deltaEind)
      return f
    }),
  }
}

export interface OverlapMelding {
  andereFase: Fase
  overlapWerkdagen: number
  toegestaan: number
}

/** Toegestane overlap in werkdagen tussen voorganger en opvolger. */
function toegestaneOverlap(data: AppData, voorganger: Fase, opvolger: Fase): number {
  if (voorganger.key === 'chassis' && opvolger.key === 'panelen') {
    return Math.max(0, data.instellingen.chassisPanelenOverlapDagen)
  }
  return 0
}

/** Start deze fase te vroeg t.o.v. een voorganger (meer overlap dan toegestaan)? */
export function overlapMetVoorganger(data: AppData, fase: Fase): OverlapMelding | null {
  for (const depId of fase.afhankelijkVan) {
    const voorganger = data.fases.find((f) => f.id === depId)
    if (!voorganger) continue
    if (fase.start > voorganger.eind) continue
    const overlap = werkdagenTussen(fase.start, minISO(voorganger.eind, fase.eind))
    const toegestaan = toegestaneOverlap(data, voorganger, fase)
    if (overlap > toegestaan) return { andereFase: voorganger, overlapWerkdagen: overlap, toegestaan }
  }
  return null
}

/** Overlapt deze fase (na wijziging) met een fase die van haar afhankelijk is? */
export function overlapMetAfhankelijke(data: AppData, fase: Fase): OverlapMelding | null {
  for (const f of data.fases) {
    if (f.projectId !== fase.projectId || !f.afhankelijkVan.includes(fase.id)) continue
    if (f.start > fase.eind) continue
    const overlap = werkdagenTussen(f.start, minISO(fase.eind, f.eind))
    const toegestaan = toegestaneOverlap(data, fase, f)
    if (overlap > toegestaan) return { andereFase: f, overlapWerkdagen: overlap, toegestaan }
  }
  return null
}
