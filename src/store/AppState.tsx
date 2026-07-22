// Centrale applicatiestate: reducer + context + localStorage-persistentie + undo.

import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import type {
  Afwezigheid,
  AppData,
  BeschikbaarheidAanpassing,
  ComplexiteitNiveau,
  ExternePartij,
  Fase,
  FaseKey,
  Instellingen,
  ISODate,
  LocatieMutatie,
  Medewerker,
  Permissies,
  Persona,
  ProductTemplate,
  Project,
  ScenarioMode,
  Team,
  TijdelijkeToewijzing,
  UIState,
  Unit,
  UnitStatus,
  Werkpakket,
} from '../lib/types'
import { FASE_VOLGORDE, getPermissies, PERSONAS, STANDAARD_COMPLEXITEITSNIVEAUS } from '../lib/types'
import { addDagen, vandaagISO } from '../lib/dates'
import { maakLocatieUitbreiding, maakSeedData, maakSeedTemplates } from '../lib/seed'
import { getPlaatsInfo, ZONE_AFBOUW, ZONE_CHASSIS, ZONE_PANELEN } from '../lib/locaties'
import { uid } from '../lib/uid'

const OPSLAG_SLEUTEL = 'expandable-planner-v1'
const MAX_HISTORIE = 50

export type Action =
  | { type: 'SET_PERSONA'; personaId: string }
  | { type: 'SET_SCENARIO'; scenario: ScenarioMode }
  | { type: 'UNDO' }
  | { type: 'RESET' }
  | { type: 'PROJECT_TOEVOEGEN'; project: Project; fases: Fase[] }
  | { type: 'PROJECT_BIJWERKEN'; id: string; patch: Partial<Project> }
  | { type: 'ORDER_BEVESTIGEN'; projectId: string }
  | { type: 'FASE_BIJWERKEN'; id: string; patch: Partial<Fase> }
  | { type: 'FASE_VERSCHUIVEN'; faseId: string; deltaDagen: number; cascade: boolean }
  | { type: 'FASE_DATUMS'; faseId: string; start: ISODate; eind: ISODate; cascade: boolean }
  | { type: 'WERKPAKKET_BIJWERKEN'; faseId: string; wpId: string; patch: Partial<Werkpakket> }
  | { type: 'MEDEWERKER_TOEVOEGEN'; medewerker: Medewerker }
  | { type: 'MEDEWERKER_BIJWERKEN'; id: string; patch: Partial<Medewerker> }
  | { type: 'MEDEWERKER_NAAR_TEAM'; medewerkerId: string; teamId?: string }
  | { type: 'TIJDELIJK_TEAM'; medewerkerId: string; toewijzing?: TijdelijkeToewijzing }
  | { type: 'TEAM_TOEVOEGEN'; team: Team }
  | { type: 'TEAM_BIJWERKEN'; id: string; patch: Partial<Team> }
  | { type: 'AFWEZIGHEID_TOEVOEGEN'; afwezigheid: Afwezigheid }
  | { type: 'AFWEZIGHEID_BIJWERKEN'; id: string; patch: Partial<Afwezigheid> }
  | { type: 'AFWEZIGHEID_VERWIJDEREN'; id: string }
  | { type: 'AANPASSING_TOEVOEGEN'; aanpassing: BeschikbaarheidAanpassing }
  | { type: 'AANPASSING_VERWIJDEREN'; id: string }
  | { type: 'EXTERN_BIJWERKEN'; id: string; patch: Partial<ExternePartij> }
  | { type: 'INSTELLINGEN_BIJWERKEN'; patch: Partial<Instellingen> }
  | { type: 'UNIT_TOEVOEGEN'; unit: Unit }
  | { type: 'UNIT_BIJWERKEN'; id: string; patch: Partial<Unit> }
  | { type: 'UNIT_KOPPELEN'; unitId: string; projectId?: string }
  | {
      type: 'UNIT_VERPLAATSEN'
      unitId: string
      naarPlaatsId?: string
      nieuweStatus?: UnitStatus
      faseAanpassen: boolean
      afwijking: boolean
      reden?: string
      opmerking?: string
      gebruiker: string
      tijdstip: string // ISO-datetime
    }
  | { type: 'UNITS_WISSELEN'; unitIdA: string; unitIdB: string; reden?: string; gebruiker: string; tijdstip: string }
  | {
      type: 'UNIT_OPGEHAALD'
      unitId: string
      datum: ISODate
      transporteur?: string
      opmerking?: string
      gebruiker: string
      tijdstip: string
    }
  | { type: 'TEMPLATE_TOEVOEGEN'; template: ProductTemplate }
  | { type: 'TEMPLATE_BIJWERKEN'; id: string; patch: Partial<ProductTemplate> }
  | { type: 'TEMPLATE_VERWIJDEREN'; id: string }
  | { type: 'TEMPLATE_PUBLICEREN'; id: string }
  | { type: 'TEMPLATE_ARCHIVEREN'; id: string }
  | { type: 'COMPLEXITEIT_BIJWERKEN'; niveaus: ComplexiteitNiveau[] }

interface StoreState {
  data: AppData
  ui: UIState
  verleden: AppData[]
}

/** Alle fase-ids die (transitief) afhankelijk zijn van de gegeven fase, binnen hetzelfde project. */
function afhankelijkeFases(fases: Fase[], faseId: string): Set<string> {
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

function verschuifFase(f: Fase, delta: number): Fase {
  return {
    ...f,
    start: addDagen(f.start, delta),
    eind: addDagen(f.eind, delta),
    transportHeen: f.transportHeen ? addDagen(f.transportHeen, delta) : undefined,
    transportTerug: f.transportTerug ? addDagen(f.transportTerug, delta) : undefined,
  }
}

function pasDataToe(data: AppData, action: Action): AppData {
  switch (action.type) {
    case 'PROJECT_TOEVOEGEN':
      return { ...data, projecten: [...data.projecten, action.project], fases: [...data.fases, ...action.fases] }

    case 'PROJECT_BIJWERKEN':
      return {
        ...data,
        projecten: data.projecten.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      }

    case 'ORDER_BEVESTIGEN': {
      const projecten = data.projecten.map((p) =>
        p.id === action.projectId
          ? { ...p, status: 'definitief' as const, verkoopkans: 100, bevestigdOp: vandaagISO() }
          : p,
      )
      // Eerste engineering-fase van het project op 'bezig' zetten.
      let engineeringGestart = false
      const fases = data.fases.map((f) => {
        if (f.projectId !== action.projectId) return f
        if (!engineeringGestart && f.key === 'engineering' && f.status === 'gepland') {
          engineeringGestart = true
          return { ...f, status: 'bezig' as const }
        }
        return f
      })
      return { ...data, projecten, fases }
    }

    case 'FASE_BIJWERKEN': {
      const fase = data.fases.find((f) => f.id === action.id)
      return {
        ...data,
        fases: data.fases.map((f) => (f.id === action.id ? { ...f, ...action.patch } : f)),
        projecten: markeerProjectspecifiek(data.projecten, fase?.projectId),
      }
    }

    case 'FASE_VERSCHUIVEN': {
      const teVerschuiven = action.cascade ? afhankelijkeFases(data.fases, action.faseId) : new Set<string>()
      teVerschuiven.add(action.faseId)
      const fase = data.fases.find((f) => f.id === action.faseId)
      return {
        ...data,
        fases: data.fases.map((f) => (teVerschuiven.has(f.id) ? verschuifFase(f, action.deltaDagen) : f)),
        projecten: markeerProjectspecifiek(data.projecten, fase?.projectId),
      }
    }

    case 'FASE_DATUMS': {
      const oud = data.fases.find((f) => f.id === action.faseId)
      if (!oud) return data
      const dagen = (a: ISODate, b: ISODate) =>
        Math.round((new Date(b.replace(/-/g, '/')).getTime() - new Date(a.replace(/-/g, '/')).getTime()) / 86400000)
      const deltaStart = dagen(oud.start, action.start)
      const deltaEind = dagen(oud.eind, action.eind)
      const afhankelijk = action.cascade && deltaEind !== 0 ? afhankelijkeFases(data.fases, action.faseId) : new Set<string>()
      return {
        ...data,
        fases: data.fases.map((f) => {
          if (f.id === action.faseId)
            return {
              ...f,
              start: action.start,
              eind: action.eind,
              transportHeen: f.transportHeen ? addDagen(f.transportHeen, deltaStart) : undefined,
              transportTerug: f.transportTerug ? addDagen(f.transportTerug, deltaEind) : undefined,
            }
          if (afhankelijk.has(f.id)) return verschuifFase(f, deltaEind)
          return f
        }),
        projecten: markeerProjectspecifiek(data.projecten, oud.projectId),
      }
    }

    case 'WERKPAKKET_BIJWERKEN': {
      const doelFase = data.fases.find((f) => f.id === action.faseId)
      return {
        ...data,
        fases: data.fases.map((f) => {
          if (f.id !== action.faseId) return f
          const werkpakketten = f.werkpakketten.map((wp) => (wp.id === action.wpId ? { ...wp, ...action.patch } : wp))
          // Fasevoortgang = urengewogen gemiddelde van de werkpakketten.
          const totaal = werkpakketten.reduce((s, wp) => s + wp.uren, 0)
          const voortgang =
            totaal > 0
              ? Math.round(werkpakketten.reduce((s, wp) => s + wp.uren * wp.voortgang, 0) / totaal)
              : f.voortgang
          return { ...f, werkpakketten, voortgang }
        }),
        projecten: markeerProjectspecifiek(data.projecten, doelFase?.projectId),
      }
    }

    case 'MEDEWERKER_TOEVOEGEN':
      return { ...data, medewerkers: [...data.medewerkers, action.medewerker] }

    case 'MEDEWERKER_BIJWERKEN':
      return { ...data, medewerkers: data.medewerkers.map((m) => (m.id === action.id ? { ...m, ...action.patch } : m)) }

    case 'MEDEWERKER_NAAR_TEAM':
      // Definitieve verplaatsing beëindigt ook een eventuele tijdelijke uitleen,
      // zodat één UNDO de volledige verplaatsing terugdraait.
      return {
        ...data,
        medewerkers: data.medewerkers.map((m) =>
          m.id === action.medewerkerId ? { ...m, teamId: action.teamId, tijdelijkTeam: undefined } : m,
        ),
      }

    case 'TIJDELIJK_TEAM':
      return {
        ...data,
        medewerkers: data.medewerkers.map((m) =>
          m.id === action.medewerkerId ? { ...m, tijdelijkTeam: action.toewijzing } : m,
        ),
      }

    case 'TEAM_TOEVOEGEN':
      return { ...data, teams: [...data.teams, action.team] }

    case 'TEAM_BIJWERKEN':
      return { ...data, teams: data.teams.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)) }

    case 'AFWEZIGHEID_TOEVOEGEN':
      return { ...data, afwezigheid: [...data.afwezigheid, action.afwezigheid] }

    case 'AFWEZIGHEID_BIJWERKEN':
      return {
        ...data,
        afwezigheid: data.afwezigheid.map((a) => (a.id === action.id ? { ...a, ...action.patch } : a)),
      }

    case 'AFWEZIGHEID_VERWIJDEREN':
      return { ...data, afwezigheid: data.afwezigheid.filter((a) => a.id !== action.id) }

    case 'AANPASSING_TOEVOEGEN':
      return { ...data, aanpassingen: [...data.aanpassingen, action.aanpassing] }

    case 'AANPASSING_VERWIJDEREN':
      return { ...data, aanpassingen: data.aanpassingen.filter((a) => a.id !== action.id) }

    case 'EXTERN_BIJWERKEN':
      return {
        ...data,
        externePartijen: data.externePartijen.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      }

    case 'INSTELLINGEN_BIJWERKEN':
      return { ...data, instellingen: { ...data.instellingen, ...action.patch } }

    case 'UNIT_TOEVOEGEN':
      return { ...data, units: [...data.units, action.unit] }

    case 'UNIT_BIJWERKEN':
      return { ...data, units: data.units.map((u) => (u.id === action.id ? { ...u, ...action.patch } : u)) }

    case 'UNIT_KOPPELEN':
      // Invariant: max één unit per project en max één project per unit.
      return {
        ...data,
        units: data.units.map((u) => {
          if (u.id === action.unitId) return { ...u, projectId: action.projectId }
          if (action.projectId && u.projectId === action.projectId) return { ...u, projectId: undefined }
          return u
        }),
      }

    case 'UNIT_VERPLAATSEN': {
      const unit = data.units.find((u) => u.id === action.unitId)
      if (!unit) return data
      if (action.naarPlaatsId) {
        // Invariant: één plaats bevat nooit meer dan één unit.
        const bezet = data.units.find(
          (u) => u.plaatsId === action.naarPlaatsId && u.id !== unit.id && u.status !== 'opgeleverd',
        )
        if (bezet) return data
      }
      const van = getPlaatsInfo(data, unit.plaatsId)
      const naar = getPlaatsInfo(data, action.naarPlaatsId)
      const project = unit.projectId ? data.projecten.find((p) => p.id === unit.projectId) : undefined
      const fases =
        action.faseAanpassen && unit.projectId && naar
          ? pasFasesAanVoorZone(data.fases, unit.projectId, naar.zone.id)
          : data.fases
      const mutatie: LocatieMutatie = {
        id: uid('mut'),
        unitId: unit.id,
        projectnummer: project?.projectnummer,
        vanLabel: van?.label ?? (unit.status === 'bij_spuiter' ? 'Externe spuiter' : '—'),
        naarLabel: naar?.label ?? '—',
        tijdstip: action.tijdstip,
        gebruiker: action.gebruiker,
        reden: action.reden,
        opmerking: action.opmerking,
        faseAangepast: action.faseAanpassen,
      }
      return {
        ...data,
        fases,
        units: data.units.map((u) =>
          u.id === unit.id
            ? {
                ...u,
                vorigePlaatsId: u.plaatsId,
                plaatsId: action.naarPlaatsId,
                opPlaatsSinds: action.tijdstip.slice(0, 10),
                status: action.nieuweStatus ?? u.status,
                afwijkingVanPlanning: action.afwijking,
                bijExternePartijId: undefined,
              }
            : u,
        ),
        locatieHistorie: [mutatie, ...data.locatieHistorie],
      }
    }

    case 'UNITS_WISSELEN': {
      const a = data.units.find((u) => u.id === action.unitIdA)
      const b = data.units.find((u) => u.id === action.unitIdB)
      if (!a || !b) return data
      const infoA = getPlaatsInfo(data, a.plaatsId)
      const infoB = getPlaatsInfo(data, b.plaatsId)
      const datum = action.tijdstip.slice(0, 10)
      const projectVan = (u: Unit) =>
        u.projectId ? data.projecten.find((p) => p.id === u.projectId)?.projectnummer : undefined
      const maakMutatie = (u: Unit, vanLabel: string, naarLabel: string): LocatieMutatie => ({
        id: uid('mut'),
        unitId: u.id,
        projectnummer: projectVan(u),
        vanLabel,
        naarLabel,
        tijdstip: action.tijdstip,
        gebruiker: action.gebruiker,
        reden: action.reden ?? 'Units gewisseld',
        faseAangepast: false,
      })
      return {
        ...data,
        units: data.units.map((u) => {
          if (u.id === a.id) return { ...u, vorigePlaatsId: u.plaatsId, plaatsId: b.plaatsId, opPlaatsSinds: datum }
          if (u.id === b.id) return { ...u, vorigePlaatsId: u.plaatsId, plaatsId: a.plaatsId, opPlaatsSinds: datum }
          return u
        }),
        locatieHistorie: [
          maakMutatie(a, infoA?.label ?? '—', infoB?.label ?? '—'),
          maakMutatie(b, infoB?.label ?? '—', infoA?.label ?? '—'),
          ...data.locatieHistorie,
        ],
      }
    }

    case 'UNIT_OPGEHAALD': {
      const unit = data.units.find((u) => u.id === action.unitId)
      if (!unit) return data
      const info = getPlaatsInfo(data, unit.plaatsId)
      const project = unit.projectId ? data.projecten.find((p) => p.id === unit.projectId) : undefined
      const mutatie: LocatieMutatie = {
        id: uid('mut'),
        unitId: unit.id,
        projectnummer: project?.projectnummer,
        vanLabel: info?.label ?? '—',
        naarLabel: `Opgehaald${action.transporteur ? ` · ${action.transporteur}` : ''}`,
        tijdstip: action.tijdstip,
        gebruiker: action.gebruiker,
        reden: 'Opgeleverd aan klant',
        opmerking: action.opmerking,
        faseAangepast: false,
      }
      return {
        ...data,
        projecten: project
          ? data.projecten.map((p) => (p.id === project.id ? { ...p, status: 'opgeleverd' as const } : p))
          : data.projecten,
        units: data.units.map((u) =>
          u.id === unit.id
            ? {
                ...u,
                vorigePlaatsId: u.plaatsId,
                plaatsId: undefined,
                status: 'opgeleverd' as const,
                opgehaaldOp: action.datum,
                transporteur: action.transporteur,
                geplandeVertrekdatum: undefined,
              }
            : u,
        ),
        locatieHistorie: [mutatie, ...data.locatieHistorie],
      }
    }

    case 'TEMPLATE_TOEVOEGEN':
      return { ...data, templates: [...data.templates, action.template] }

    case 'TEMPLATE_BIJWERKEN':
      return {
        ...data,
        templates: data.templates.map((t) =>
          t.id === action.id ? { ...t, ...action.patch, gewijzigdOp: vandaagISO() } : t,
        ),
      }

    case 'TEMPLATE_VERWIJDEREN': {
      // Alleen verwijderen als geen enkel project deze versie gebruikt.
      if (data.projecten.some((p) => p.templateId === action.id)) return data
      return { ...data, templates: data.templates.filter((t) => t.id !== action.id) }
    }

    case 'TEMPLATE_PUBLICEREN': {
      const doel = data.templates.find((t) => t.id === action.id)
      if (!doel) return data
      return {
        ...data,
        templates: data.templates.map((t) => {
          if (t.id === action.id) return { ...t, status: 'gepubliceerd' as const, geldigVanaf: vandaagISO() }
          // Eerder gepubliceerde versie van dezelfde lijn wordt gearchiveerd.
          if (t.trailertype === doel.trailertype && t.complexiteitId === doel.complexiteitId && t.status === 'gepubliceerd')
            return { ...t, status: 'gearchiveerd' as const }
          return t
        }),
      }
    }

    case 'TEMPLATE_ARCHIVEREN':
      return {
        ...data,
        templates: data.templates.map((t) => (t.id === action.id ? { ...t, status: 'gearchiveerd' as const } : t)),
      }

    case 'COMPLEXITEIT_BIJWERKEN':
      return { ...data, complexiteitNiveaus: action.niveaus }

    default:
      return data
  }
}

/** Zet de projectspecifiek-vlag op een template-gekoppeld project zodra de planning wijzigt. */
function markeerProjectspecifiek(projecten: Project[], projectId: string | undefined): Project[] {
  if (!projectId) return projecten
  return projecten.map((p) =>
    p.id === projectId && p.templateId && !p.projectspecifiekAangepast ? { ...p, projectspecifiekAangepast: true } : p,
  )
}

/**
 * Past de projectfases aan bij een fysieke verplaatsing naar een zone:
 * alle fases vóór de doelfase worden gereed gemeld; de doelfase gaat naar "bezig".
 * Verplaatsing naar opslag markeert alle fases als gereed.
 */
function pasFasesAanVoorZone(fases: Fase[], projectId: string, zoneId: string): Fase[] {
  const doelKeys: FaseKey[] =
    zoneId === ZONE_CHASSIS ? ['chassis'] : zoneId === ZONE_PANELEN ? ['panelen'] : zoneId === ZONE_AFBOUW ? ['afbouw'] : []
  const doelIndex =
    doelKeys.length > 0 ? Math.min(...doelKeys.map((k) => FASE_VOLGORDE.indexOf(k))) : FASE_VOLGORDE.length
  let doelGezet = false
  return fases.map((f) => {
    if (f.projectId !== projectId) return f
    const idx = FASE_VOLGORDE.indexOf(f.key)
    if (idx < doelIndex) {
      if (f.status === 'gereed') return f
      return {
        ...f,
        status: 'gereed' as const,
        voortgang: 100,
        werkpakketten: f.werkpakketten.map((wp) => ({ ...wp, status: 'gereed' as const, voortgang: 100 })),
      }
    }
    if (!doelGezet && doelKeys.includes(f.key)) {
      doelGezet = true
      if (f.status === 'gepland') return { ...f, status: 'bezig' as const }
    }
    return f
  })
}

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'SET_PERSONA':
      return { ...state, ui: { ...state.ui, personaId: action.personaId } }
    case 'SET_SCENARIO':
      return { ...state, ui: { ...state.ui, scenario: action.scenario } }
    case 'UNDO': {
      if (state.verleden.length === 0) return state
      const vorige = state.verleden[state.verleden.length - 1]
      return { ...state, data: vorige, verleden: state.verleden.slice(0, -1) }
    }
    case 'RESET': {
      const data = maakSeedData()
      return { ...state, data, verleden: [], ui: { ...state.ui, scenario: data.instellingen.standaardScenario } }
    }
    default: {
      const data = pasDataToe(state.data, action)
      if (data === state.data) return state
      const verleden = [...state.verleden, state.data].slice(-MAX_HISTORIE)
      return { ...state, data, verleden }
    }
  }
}

/** Vult opgeslagen data van vóór de locatieplanning aan met locaties, plaatsen en units. */
function migreerNaarLocaties(data: AppData): AppData {
  if (Array.isArray((data as Partial<AppData>).units)) return data
  const uitbreiding = maakLocatieUitbreiding()
  const bestaandeProjecten = new Set(data.projecten.map((p) => p.id))
  return {
    ...data,
    projecten: [...data.projecten, ...uitbreiding.projecten.filter((p) => !bestaandeProjecten.has(p.id))],
    fases: [...data.fases, ...uitbreiding.fases.filter((f) => !bestaandeProjecten.has(f.projectId))],
    locaties: uitbreiding.locaties,
    zones: uitbreiding.zones,
    plaatsen: uitbreiding.plaatsen,
    units: uitbreiding.units,
    locatieHistorie: uitbreiding.locatieHistorie,
  }
}

/** Vult opgeslagen data van vóór het templatesysteem aan met templates en complexiteitsniveaus. */
function migreerNaarTemplates(data: AppData): AppData {
  const patch: Partial<AppData> = {}
  if (!Array.isArray((data as Partial<AppData>).templates)) patch.templates = maakSeedTemplates()
  if (!Array.isArray((data as Partial<AppData>).complexiteitNiveaus))
    patch.complexiteitNiveaus = STANDAARD_COMPLEXITEITSNIVEAUS.map((n) => ({ ...n }))
  return Object.keys(patch).length > 0 ? { ...data, ...patch } : data
}

function migreerData(data: AppData): AppData {
  return migreerNaarTemplates(migreerNaarLocaties(data))
}

function beginState(): StoreState {
  let data: AppData | null = null
  let ui: UIState | null = null
  try {
    const ruw = localStorage.getItem(OPSLAG_SLEUTEL)
    if (ruw) {
      const geparsed = JSON.parse(ruw)
      if (geparsed && geparsed.data && geparsed.data.projecten && geparsed.ui) {
        data = migreerData(geparsed.data)
        ui = geparsed.ui
      }
    }
  } catch {
    data = null
  }
  const seed = data ?? maakSeedData()
  return {
    data: seed,
    ui: ui ?? { personaId: 'p-planner', scenario: seed.instellingen.standaardScenario },
    verleden: [],
  }
}

interface AppContextWaarde {
  data: AppData
  ui: UIState
  dispatch: (a: Action) => void
  persona: Persona
  permissies: Permissies
  kanOngedaanMaken: boolean
}

const AppContext = createContext<AppContextWaarde | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, beginState)

  useEffect(() => {
    try {
      localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify({ data: state.data, ui: state.ui }))
    } catch {
      // opslag vol of niet beschikbaar — prototype negeert dit stilletjes
    }
  }, [state.data, state.ui])

  const waarde = useMemo<AppContextWaarde>(() => {
    const persona = PERSONAS.find((p) => p.id === state.ui.personaId) ?? PERSONAS[0]
    return {
      data: state.data,
      ui: state.ui,
      dispatch,
      persona,
      permissies: getPermissies(persona.rol),
      kanOngedaanMaken: state.verleden.length > 0,
    }
  }, [state])

  return <AppContext.Provider value={waarde}>{children}</AppContext.Provider>
}

export function useApp(): AppContextWaarde {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp moet binnen AppProvider gebruikt worden')
  return ctx
}
