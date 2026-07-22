// Lokale hulpfuncties en het filtermodel voor de Locatieplanning.
// Alleen gebruikt door componenten in src/components/locatie en LocatiePlanning.tsx.

import type { AppData, Project, Unit, UnitStatus } from '../../lib/types'
import type { BadgeKleur } from '../ui'
import { getHuidigeFase } from '../../lib/capacity'
import { getPlaatsInfo, getUnitWaarschuwingen } from '../../lib/locaties'

/** Badgekleur per unitstatus: bouw = brand/sky, wachten = amber, opslag = blauw, gereed = groen. */
export const STATUS_BADGE_KLEUR: Record<UnitStatus, BadgeKleur> = {
  niet_gestart: 'grijs',
  in_chassisbouw: 'brand',
  wacht_panelenbouw: 'amber',
  in_panelenbouw: 'brand',
  wacht_spuiter: 'amber',
  bij_spuiter: 'paars',
  wacht_afbouw: 'amber',
  in_afbouw: 'brand',
  in_kwaliteitscontrole: 'blauw',
  productie_voltooid: 'groen',
  in_opslag: 'blauw',
  wacht_afhaling: 'groen',
  opgeleverd: 'grijs',
  geblokkeerd: 'rood',
}

export function projectVanUnit(data: AppData, unit: Unit): Project | undefined {
  return unit.projectId ? data.projecten.find((p) => p.id === unit.projectId) : undefined
}

/** Productieleider van het team van de huidige projectfase. */
export function productieleiderVanProject(data: AppData, project: Project | undefined): string | undefined {
  if (!project) return undefined
  const fase = getHuidigeFase(data, project.id)
  const team = fase?.teamId ? data.teams.find((t) => t.id === fase.teamId) : undefined
  const leider = team?.productieleiderId
    ? data.medewerkers.find((m) => m.id === team.productieleiderId)
    : undefined
  return leider?.naam
}

/** '20-07-2026 14:32' (lokale tijd) uit een ISO-datetime. */
export function formatTijdstip(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Label voor de huidige verblijfplaats van een unit, ook zonder fysieke plaats. */
export function huidigeLocatieLabel(data: AppData, unit: Unit): string {
  const info = getPlaatsInfo(data, unit.plaatsId)
  if (info) return info.label
  if (unit.status === 'bij_spuiter') {
    const partij = unit.bijExternePartijId
      ? data.externePartijen.find((e) => e.id === unit.bijExternePartijId)
      : undefined
    return partij ? `Externe spuiter (${partij.naam})` : 'Externe spuiter'
  }
  if (unit.status === 'opgeleverd') return 'Opgehaald door klant'
  return 'Geen plaats toegewezen'
}

// ---------- Filters ----------

export interface LocatieFilters {
  zoek: string
  locatie: string // 'alle' of locatie-id
  zone: string // 'alle' of zone-id
  status: 'alle' | UnitStatus
  model: string
  klant: string
  projectmanager: string
  productieleider: string
  alleenVrij: boolean
  alleenBezet: boolean
  metWaarschuwing: boolean
  zonderProject: boolean
  wachtAfhaling: boolean
  opgeleverd: boolean
  afwijking: boolean
  zonderPlaats: boolean
}

export const LEGE_FILTERS: LocatieFilters = {
  zoek: '',
  locatie: 'alle',
  zone: 'alle',
  status: 'alle',
  model: 'alle',
  klant: 'alle',
  projectmanager: 'alle',
  productieleider: 'alle',
  alleenVrij: false,
  alleenBezet: false,
  metWaarschuwing: false,
  zonderProject: false,
  wachtAfhaling: false,
  opgeleverd: false,
  afwijking: false,
  zonderPlaats: false,
}

export function heeftActieveFilters(f: LocatieFilters): boolean {
  return (
    f.zoek.trim() !== '' ||
    f.locatie !== 'alle' ||
    f.zone !== 'alle' ||
    f.status !== 'alle' ||
    f.model !== 'alle' ||
    f.klant !== 'alle' ||
    f.projectmanager !== 'alle' ||
    f.productieleider !== 'alle' ||
    f.alleenVrij ||
    f.alleenBezet ||
    f.metWaarschuwing ||
    f.zonderProject ||
    f.wachtAfhaling ||
    f.afwijking ||
    f.zonderPlaats
  )
}

/** Voldoet een unit aan de actieve filters? (De vrij/bezet-toggles werken op plaatsniveau.) */
export function unitMatcht(data: AppData, unit: Unit, f: LocatieFilters): boolean {
  const project = projectVanUnit(data, unit)
  const info = getPlaatsInfo(data, unit.plaatsId)

  const term = f.zoek.trim().toLowerCase()
  if (term) {
    const tekst = [
      project?.projectnummer,
      project?.naam,
      project?.klant,
      project?.productModel,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!tekst.includes(term)) return false
  }
  if (f.locatie !== 'alle' && info?.locatie.id !== f.locatie) return false
  if (f.zone !== 'alle' && info?.zone.id !== f.zone) return false
  if (f.status !== 'alle' && unit.status !== f.status) return false
  if (f.model !== 'alle' && project?.productModel !== f.model) return false
  if (f.klant !== 'alle' && project?.klant !== f.klant) return false
  if (f.projectmanager !== 'alle' && project?.projectmanager !== f.projectmanager) return false
  if (f.productieleider !== 'alle' && productieleiderVanProject(data, project) !== f.productieleider) return false
  if (f.metWaarschuwing && getUnitWaarschuwingen(data, unit).length === 0) return false
  if (f.zonderProject && unit.projectId) return false
  if (f.wachtAfhaling && unit.status !== 'wacht_afhaling') return false
  if (
    f.afwijking &&
    !unit.afwijkingVanPlanning &&
    !getUnitWaarschuwingen(data, unit).some((w) => w.soort === 'afwijking')
  )
    return false
  if (f.zonderPlaats && unit.plaatsId) return false
  return true
}
