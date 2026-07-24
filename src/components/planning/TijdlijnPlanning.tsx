// Interactieve Gantt-planning: tijdlijn met projecten, fases en werkpakketten,
// versleepbare fasebalken, filters, groeperingen en een capaciteitsstrook.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Filter,
  Lock,
  LocateFixed,
  RotateCcw,
  Search,
  Truck,
  X,
} from 'lucide-react'
import type { Fase, ISODate, Project, Werkpakket } from '../../lib/types'
import { faseNaarZone, zoneBezetting } from '../../lib/locaties'
import {
  AFDELING_LABELS,
  externTypeLabel,
  FASE_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  type Afdeling,
  type ProjectStatus,
} from '../../lib/types'
import {
  addDagen,
  diffDagen,
  formatDatum,
  formatDatumMetDag,
  maandLabel,
  maxISO,
  minISO,
  weekLabel,
  werkdagenTussen,
} from '../../lib/dates'
import {
  getCapaciteitsConflicten,
  getProjectRisico,
  getVerwachteOplevering,
  type ProjectRisico,
} from '../../lib/capacity'
import { useApp } from '../../store/AppState'
import {
  Badge,
  InfoTip,
  Invoer,
  Kaart,
  Keuze,
  Knop,
  LegeStaat,
  PaginaKop,
  Tooltip,
  Veld,
  VoortgangsBalk,
  useToast,
} from '../ui'
import FaseBalk from '../gantt/FaseBalk'
import CapaciteitsStrook from '../gantt/CapaciteitsStrook'
import Legenda from '../gantt/Legenda'
import {
  AANTAL_WEKEN,
  GROEPERING_LABELS,
  LEGE_FILTERS,
  LINKS_BREEDTE,
  maakTijdlijn,
  maandSegmenten,
  overlapMetAfhankelijke,
  overlapMetVoorganger,
  simuleerResize,
  simuleerVerschuiving,
  telActieveFilters,
  type Groepering,
  type PlanningFilters,
  type PlanningsType,
  type Zoom,
} from '../gantt/ganttUtils'

// ---------- Rijmodel ----------

type Rij =
  | { soort: 'groep'; sleutel: string; titel: string; subtitel?: string; project?: Project; fases: Fase[] }
  | { soort: 'fase'; sleutel: string; fase: Fase; project: Project; toonProject: boolean }
  | { soort: 'wp'; sleutel: string; fase: Fase; project: Project; wp: Werkpakket; index: number; aantal: number }

// ---------- Kleine hulpcomponenten ----------

function Segmented<T extends string>({
  opties,
  waarde,
  onKies,
}: {
  opties: { id: T; label: string }[]
  waarde: T
  onKies: (id: T) => void
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
      {opties.map((o, i) => (
        <button
          key={o.id}
          onClick={() => onKies(o.id)}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${i > 0 ? 'border-l border-slate-300' : ''} ${
            waarde === o.id ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function RisicoStip({ risico }: { risico: ProjectRisico }) {
  const kleur = risico.niveau === 'hoog' ? 'bg-red-500' : risico.niveau === 'middel' ? 'bg-amber-500' : 'bg-emerald-500'
  const tekst =
    risico.redenen.length > 0 ? (
      <span>
        {risico.redenen.map((r, i) => (
          <span key={i} className="block">
            • {r}
          </span>
        ))}
      </span>
    ) : (
      'Geen bijzondere risico’s'
    )
  return (
    <Tooltip tekst={tekst}>
      <span className={`block h-2 w-2 shrink-0 rounded-full ${kleur}`} />
    </Tooltip>
  )
}

function Chip({ label, onVerwijder }: { label: string; onVerwijder: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs text-brand-800">
      {label}
      <button onClick={onVerwijder} className="rounded-full p-0.5 hover:bg-brand-100" title="Filter verwijderen">
        <X size={11} />
      </button>
    </span>
  )
}

// ---------- Hoofdscherm ----------

export default function TijdlijnPlanning() {
  const { data, ui, dispatch, permissies, kanOngedaanMaken } = useApp()
  const { toon } = useToast()
  const navigate = useNavigate()
  const kanBewerken = permissies.planningBewerken

  const [zoom, setZoom] = useState<Zoom>('week')
  const [groepering, setGroepering] = useState<Groepering>('project')
  const [planningsType, setPlanningsType] = useState<PlanningsType>('beide')
  const [cascade, setCascade] = useState(true)
  const [zoek, setZoek] = useState('')
  const [filters, setFilters] = useState<PlanningFilters>(LEGE_FILTERS)
  const [filterPaneel, setFilterPaneel] = useState(false)
  const [dichteGroepen, setDichteGroepen] = useState<Set<string>>(new Set())
  const [openFases, setOpenFases] = useState<Set<string>>(new Set())
  const [popover, setPopover] = useState<{ fase: Fase; project: Project; x: number; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const tijdlijn = useMemo(() => maakTijdlijn(zoom), [zoom])
  const maandSegs = useMemo(() => maandSegmenten(tijdlijn), [tijdlijn])
  const dagen = useMemo(
    () => (zoom === 'dag' ? Array.from({ length: AANTAL_WEKEN * 7 }, (_, i) => addDagen(tijdlijn.rangeStart, i)) : []),
    [zoom, tijdlijn],
  )
  const weekBreedte = tijdlijn.dagBreedte * 7

  const gridAchtergrond = useMemo(() => {
    const weekGrid = `repeating-linear-gradient(to right, #e2e8f0 0px, #e2e8f0 1px, transparent 1px, transparent ${weekBreedte}px)`
    if (zoom !== 'dag') return weekGrid
    const weekend = `repeating-linear-gradient(to right, transparent 0px, transparent ${tijdlijn.dagBreedte * 5}px, rgba(148,163,184,0.16) ${tijdlijn.dagBreedte * 5}px, rgba(148,163,184,0.16) ${weekBreedte}px)`
    return `${weekend}, ${weekGrid}`
  }, [zoom, weekBreedte, tijdlijn.dagBreedte])

  // ---------- Opzoektabellen ----------

  const teamMap = useMemo(() => new Map(data.teams.map((t) => [t.id, t])), [data.teams])
  const medewerkerMap = useMemo(() => new Map(data.medewerkers.map((m) => [m.id, m])), [data.medewerkers])
  const partijMap = useMemo(() => new Map(data.externePartijen.map((e) => [e.id, e])), [data.externePartijen])

  const productieleiders = useMemo(() => {
    const ids = [...new Set(data.teams.map((t) => t.productieleiderId).filter((id): id is string => !!id))]
    return ids
      .map((id) => ({ id, naam: medewerkerMap.get(id)?.naam ?? id }))
      .sort((a, b) => a.naam.localeCompare(b.naam))
  }, [data.teams, medewerkerMap])

  const productModellen = useMemo(
    () => [...new Set(data.projecten.map((p) => p.productModel))].sort(),
    [data.projecten],
  )

  const oplevermaanden = useMemo(() => {
    const maanden = [
      ...new Set(data.projecten.filter((p) => p.status !== 'geannuleerd').map((p) => p.gewensteOpleverdatum.slice(0, 7))),
    ].sort()
    return maanden.map((m) => ({ waarde: m, label: maandLabel(`${m}-01`) }))
  }, [data.projecten])

  const projectInfo = useMemo(() => {
    const map = new Map<string, { risico: ProjectRisico; verwacht: ISODate }>()
    for (const p of data.projecten) {
      map.set(p.id, { risico: getProjectRisico(data, p), verwacht: getVerwachteOplevering(data, p.id) })
    }
    return map
  }, [data])

  // ---------- Filteren ----------

  const zichtbaar = useMemo(() => {
    const faseFilterActief = !!(
      filters.afdeling ||
      filters.teamId ||
      filters.productieleiderId ||
      filters.spuiterId ||
      filters.onderaannemerId
    )

    const zoekTekst = zoek.trim().toLowerCase()
    const projectVoldoet = (p: Project): boolean => {
      if (p.status === 'geannuleerd' && filters.status !== 'geannuleerd') return false
      if (planningsType === 'definitief' && p.status === 'schaduw') return false
      if (planningsType === 'schaduw' && p.status !== 'schaduw') return false
      if (zoekTekst && !`${p.projectnummer} ${p.naam} ${p.klant}`.toLowerCase().includes(zoekTekst)) return false
      if (filters.status && p.status !== filters.status) return false
      if (filters.productModel && p.productModel !== filters.productModel) return false
      if (filters.oplevermaand && !p.gewensteOpleverdatum.startsWith(filters.oplevermaand)) return false
      if (filters.risico) {
        const metRisico = (projectInfo.get(p.id)?.risico.niveau ?? 'laag') !== 'laag'
        if ((filters.risico === 'met') !== metRisico) return false
      }
      return true
    }

    const faseVoldoet = (f: Fase): boolean => {
      if (filters.afdeling && f.afdeling !== filters.afdeling) return false
      if (filters.teamId && f.teamId !== filters.teamId) return false
      if (filters.productieleiderId) {
        const team = f.teamId ? teamMap.get(f.teamId) : undefined
        if (team?.productieleiderId !== filters.productieleiderId) return false
      }
      if (filters.spuiterId && f.externePartijId !== filters.spuiterId) return false
      if (filters.onderaannemerId && f.externePartijId !== filters.onderaannemerId) return false
      return true
    }

    const projecten: Project[] = []
    const fasesPer = new Map<string, Fase[]>()
    const gesorteerd = [...data.projecten].sort((a, b) => a.projectnummer.localeCompare(b.projectnummer))
    for (const p of gesorteerd) {
      if (!projectVoldoet(p)) continue
      const fases = data.fases.filter((f) => f.projectId === p.id && faseVoldoet(f)).sort((a, b) => (a.start < b.start ? -1 : 1))
      if (faseFilterActief && fases.length === 0) continue
      projecten.push(p)
      fasesPer.set(p.id, fases)
    }
    return { projecten, fasesPer }
  }, [data, filters, planningsType, zoek, projectInfo, teamMap])

  const projectMap = useMemo(() => new Map(data.projecten.map((p) => [p.id, p])), [data.projecten])

  // ---------- Rijen opbouwen ----------

  const rijen = useMemo<Rij[]>(() => {
    const resultaat: Rij[] = []
    const voegFaseToe = (fase: Fase, project: Project, toonProject: boolean) => {
      resultaat.push({ soort: 'fase', sleutel: `fase-${fase.id}`, fase, project, toonProject })
      if (openFases.has(fase.id)) {
        fase.werkpakketten.forEach((wp, index) => {
          resultaat.push({
            soort: 'wp',
            sleutel: `wp-${fase.id}-${wp.id}`,
            fase,
            project,
            wp,
            index,
            aantal: fase.werkpakketten.length,
          })
        })
      }
    }

    if (groepering === 'project') {
      for (const p of zichtbaar.projecten) {
        const fases = zichtbaar.fasesPer.get(p.id) ?? []
        resultaat.push({ soort: 'groep', sleutel: `proj-${p.id}`, titel: p.naam, project: p, fases })
        if (!dichteGroepen.has(`proj-${p.id}`)) {
          for (const f of fases) voegFaseToe(f, p, false)
        }
      }
      return resultaat
    }

    // Andere dimensies: fases groeperen onder afdeling / team / productieleider / externe partij.
    const groepen = new Map<string, { titel: string; fases: Fase[] }>()
    const groepVan = (f: Fase): { sleutel: string; titel: string } => {
      if (groepering === 'afdeling') return { sleutel: f.afdeling, titel: AFDELING_LABELS[f.afdeling] }
      if (groepering === 'team') {
        if (f.teamId) return { sleutel: f.teamId, titel: teamMap.get(f.teamId)?.naam ?? f.teamId }
        return { sleutel: 'zonder-team', titel: 'Zonder team (extern)' }
      }
      if (groepering === 'productieleider') {
        const plId = f.teamId ? teamMap.get(f.teamId)?.productieleiderId : undefined
        if (plId) return { sleutel: plId, titel: medewerkerMap.get(plId)?.naam ?? plId }
        return { sleutel: 'zonder-pl', titel: 'Zonder productieleider' }
      }
      // extern
      if (f.externePartijId) {
        const partij = partijMap.get(f.externePartijId)
        return { sleutel: f.externePartijId, titel: partij ? `${partij.naam} (${externTypeLabel(partij.type)})` : f.externePartijId }
      }
      return { sleutel: 'intern', titel: 'Interne fases' }
    }

    for (const p of zichtbaar.projecten) {
      for (const f of zichtbaar.fasesPer.get(p.id) ?? []) {
        const { sleutel, titel } = groepVan(f)
        const bestaand = groepen.get(sleutel)
        if (bestaand) bestaand.fases.push(f)
        else groepen.set(sleutel, { titel, fases: [f] })
      }
    }

    const gesorteerd = [...groepen.entries()].sort((a, b) => a[1].titel.localeCompare(b[1].titel))
    for (const [sleutel, groep] of gesorteerd) {
      const fases = groep.fases.sort((a, b) => (a.start < b.start ? -1 : 1))
      const rijSleutel = `grp-${sleutel}`
      resultaat.push({
        soort: 'groep',
        sleutel: rijSleutel,
        titel: groep.titel,
        subtitel: `${fases.length} fase${fases.length === 1 ? '' : 's'}`,
        fases,
      })
      if (!dichteGroepen.has(rijSleutel)) {
        for (const f of fases) voegFaseToe(f, projectMap.get(f.projectId)!, true)
      }
    }
    return resultaat
  }, [zichtbaar, groepering, dichteGroepen, openFases, teamMap, medewerkerMap, partijMap, projectMap])

  // Teams voor de capaciteitsstrook bij teamgroepering.
  const stripTeamIds = useMemo(() => {
    if (groepering !== 'team') return []
    const ids: string[] = []
    for (const p of zichtbaar.projecten) {
      for (const f of zichtbaar.fasesPer.get(p.id) ?? []) {
        if (f.teamId && !ids.includes(f.teamId)) ids.push(f.teamId)
      }
    }
    return ids.sort((a, b) => (teamMap.get(a)?.naam ?? a).localeCompare(teamMap.get(b)?.naam ?? b))
  }, [groepering, zichtbaar, teamMap])

  // ---------- Interactie ----------

  const scrollNaarVandaag = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = Math.max(0, tijdlijn.vandaagX - (el.clientWidth - LINKS_BREEDTE) / 3)
  }

  useEffect(() => {
    scrollNaarVandaag()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom])

  const meldWijziging = (sim: typeof data, faseId: string, omschrijving: string) => {
    const fase = sim.fases.find((f) => f.id === faseId)
    const project = fase ? projectMap.get(fase.projectId) : undefined
    if (!fase || !project) return
    toon('succes', omschrijving)
    const verwacht = getVerwachteOplevering(sim, project.id)
    if (verwacht > project.gewensteOpleverdatum) {
      const dagenTeLaat = Math.max(1, werkdagenTussen(project.gewensteOpleverdatum, verwacht) - 1)
      toon(
        'waarschuwing',
        `Verwachte oplevering van ${project.projectnummer} valt nu ${dagenTeLaat} werkdag(en) na de gewenste datum (${formatDatum(project.gewensteOpleverdatum)}).`,
      )
    }
    const conflicten = getCapaciteitsConflicten(sim, project.id)
    if (conflicten.length > 0) {
      const perTeam = new Map<string, number[]>()
      for (const c of conflicten) {
        const lijst = perTeam.get(c.teamNaam) ?? []
        if (!lijst.includes(c.weekNr)) lijst.push(c.weekNr)
        perTeam.set(c.teamNaam, lijst)
      }
      const tekst = [...perTeam.entries()].map(([team, wkn]) => `${team} in week ${wkn.join(', ')}`).join('; ')
      toon('waarschuwing', `Capaciteitsconflict: ${tekst} overboekt.`)
    }
    if (!cascade) {
      const overlap = overlapMetAfhankelijke(sim, fase)
      if (overlap) {
        toon(
          'waarschuwing',
          `"${fase.naam}" overlapt nu ${overlap.overlapWerkdagen} werkdag(en) met de afhankelijke fase "${overlap.andereFase.naam}". Meeschuiven staat uit.`,
        )
      }
    }
    // Koppeling met de locatieplanning: is er straks wel een fysieke plaats?
    const zoneId = faseNaarZone(fase.key)
    if (zoneId) {
      const bezetting = zoneBezetting(sim, zoneId)
      if (bezetting.vrij === 0) {
        const zoneNaam = sim.zones.find((z) => z.id === zoneId)?.naam ?? zoneId
        toon(
          'waarschuwing',
          `Let op: ${zoneNaam} is fysiek vol (${bezetting.bezet}/${bezetting.capaciteit} plaatsen). Controleer de locatieplanning voordat deze fase start.`,
        )
      }
    }
  }

  const verschuifFase = (faseId: string, deltaDagen: number) => {
    const fase = data.fases.find((f) => f.id === faseId)
    if (!fase || deltaDagen === 0) return
    dispatch({ type: 'FASE_VERSCHUIVEN', faseId, deltaDagen, cascade })
    const sim = simuleerVerschuiving(data, faseId, deltaDagen, cascade)
    meldWijziging(
      sim,
      faseId,
      `Fase "${fase.naam}" ${Math.abs(deltaDagen)} dag(en) ${deltaDagen > 0 ? 'later' : 'eerder'} gepland${cascade ? ' — afhankelijke fases meegeschoven' : ''}.`,
    )
  }

  const wijzigEinddatum = (faseId: string, deltaDagen: number) => {
    const fase = data.fases.find((f) => f.id === faseId)
    if (!fase || deltaDagen === 0) return
    const nieuwEind = maxISO(fase.start, addDagen(fase.eind, deltaDagen))
    dispatch({ type: 'FASE_DATUMS', faseId, start: fase.start, eind: nieuwEind, cascade })
    const sim = simuleerResize(data, faseId, diffDagen(fase.eind, nieuwEind), cascade)
    meldWijziging(sim, faseId, `Einddatum van "${fase.naam}" gewijzigd naar ${formatDatum(nieuwEind)}.`)
  }

  const ongedaanMaken = () => {
    if (!kanOngedaanMaken) return
    dispatch({ type: 'UNDO' })
    toon('info', 'Laatste wijziging ongedaan gemaakt.')
  }

  const toggleGroep = (sleutel: string) => {
    setDichteGroepen((s) => {
      const kopie = new Set(s)
      if (kopie.has(sleutel)) kopie.delete(sleutel)
      else kopie.add(sleutel)
      return kopie
    })
  }

  const toggleFase = (faseId: string) => {
    setOpenFases((s) => {
      const kopie = new Set(s)
      if (kopie.has(faseId)) kopie.delete(faseId)
      else kopie.add(faseId)
      return kopie
    })
  }

  const wisFilters = () => {
    setFilters(LEGE_FILTERS)
    setPlanningsType('beide')
    setZoek('')
  }

  // ---------- Filterchips ----------

  const chips = useMemo(() => {
    const lijst: { key: keyof PlanningFilters; label: string }[] = []
    if (filters.status) lijst.push({ key: 'status', label: `Status: ${PROJECT_STATUS_LABELS[filters.status]}` })
    if (filters.afdeling) lijst.push({ key: 'afdeling', label: `Afdeling: ${AFDELING_LABELS[filters.afdeling]}` })
    if (filters.teamId) lijst.push({ key: 'teamId', label: `Team: ${teamMap.get(filters.teamId)?.naam ?? filters.teamId}` })
    if (filters.productieleiderId)
      lijst.push({ key: 'productieleiderId', label: `PL: ${medewerkerMap.get(filters.productieleiderId)?.naam ?? filters.productieleiderId}` })
    if (filters.productModel) lijst.push({ key: 'productModel', label: `Model: ${filters.productModel}` })
    if (filters.spuiterId) lijst.push({ key: 'spuiterId', label: `Spuiter: ${partijMap.get(filters.spuiterId)?.naam ?? filters.spuiterId}` })
    if (filters.onderaannemerId)
      lijst.push({ key: 'onderaannemerId', label: `Onderaannemer: ${partijMap.get(filters.onderaannemerId)?.naam ?? filters.onderaannemerId}` })
    if (filters.oplevermaand) lijst.push({ key: 'oplevermaand', label: `Oplevering: ${maandLabel(`${filters.oplevermaand}-01`)}` })
    if (filters.risico) lijst.push({ key: 'risico', label: filters.risico === 'met' ? 'Met risico' : 'Zonder risico' })
    return lijst
  }, [filters, teamMap, medewerkerMap, partijMap])

  const aantalFilters = telActieveFilters(filters)

  // ---------- Renderhulpen ----------

  const vandaagLijn = (
    <div className="pointer-events-none absolute inset-y-0 z-[5] w-0.5 bg-red-500/70" style={{ left: tijdlijn.vandaagX }} />
  )

  const rijBreedte = LINKS_BREEDTE + tijdlijn.totaalBreedte

  const linkerCel = (inhoud: ReactNode, extraKlasse = '') => (
    <div
      className={`sticky left-0 z-10 flex w-72 shrink-0 items-center gap-1.5 border-r border-slate-200 bg-white px-2 transition-colors group-hover:bg-slate-50 ${extraKlasse}`}
    >
      {inhoud}
    </div>
  )

  const koptekstHoogte = zoom === 'dag' ? 56 : zoom === 'week' ? 38 : 20

  return (
    <div className="flex h-full flex-col px-6 pt-3 pb-4">
      {!kanBewerken && (
        <div className="mb-2 flex justify-end">
          <Badge kleur="grijs" title="Jouw rol mag de planning niet bewerken">
            <Lock size={11} /> Alleen lezen
          </Badge>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
          <Invoer
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op PR-nummer, naam of klant…"
            title="Filter de tijdlijn op projectnummer, projectnaam of klant"
            className="!w-64 !py-1.5 !pl-8 !text-xs"
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          Groeperen
          <Keuze
            value={groepering}
            onChange={(e) => setGroepering(e.target.value as Groepering)}
            className="!w-auto !py-1 !text-xs"
          >
            {Object.entries(GROEPERING_LABELS).map(([waarde, label]) => (
              <option key={waarde} value={waarde}>
                {label}
              </option>
            ))}
          </Keuze>
        </label>

        <span className="flex items-center gap-1">
          <Segmented<PlanningsType>
            opties={[
              { id: 'definitief', label: 'Definitief' },
              { id: 'schaduw', label: 'Schaduw' },
              { id: 'beide', label: 'Beide' },
            ]}
            waarde={planningsType}
            onKies={setPlanningsType}
          />
          <InfoTip tekst="Schaduwplanning: nog niet bevestigde orders die alvast zijn ingepland. Definitieve projecten zijn bevestigde orders." />
        </span>

        <Segmented<Zoom>
          opties={[
            { id: 'dag', label: 'Dag' },
            { id: 'week', label: 'Week' },
            { id: 'maand', label: 'Maand' },
          ]}
          waarde={zoom}
          onKies={setZoom}
        />

        <Knop klein onClick={scrollNaarVandaag} title="Scroll de tijdlijn naar vandaag">
          <LocateFixed size={14} /> Vandaag
        </Knop>

        <label
          className={`flex items-center gap-1.5 text-xs ${kanBewerken ? 'cursor-pointer text-slate-600' : 'cursor-not-allowed text-slate-400'}`}
          title={kanBewerken ? 'Schuif fases die afhankelijk zijn van de versleepte fase automatisch mee' : 'Alleen-lezen rol'}
        >
          <input
            type="checkbox"
            checked={cascade}
            disabled={!kanBewerken}
            onChange={(e) => setCascade(e.target.checked)}
            className="accent-brand-700"
          />
          Afhankelijke fases meeschuiven
        </label>

        {kanBewerken && (
          <Knop klein onClick={ongedaanMaken} disabled={!kanOngedaanMaken} title="Laatste wijziging terugdraaien">
            <RotateCcw size={14} /> Ongedaan maken
          </Knop>
        )}

        <Knop klein variant={filterPaneel || aantalFilters > 0 ? 'primary' : 'secondary'} onClick={() => setFilterPaneel((v) => !v)}>
          <Filter size={14} /> Filters{aantalFilters > 0 ? ` (${aantalFilters})` : ''}
        </Knop>

        <div className="ml-auto">
          <Legenda />
        </div>
      </div>

      {/* Filterpaneel */}
      {filterPaneel && (
        <Kaart className="mb-3 p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Veld label="Projectstatus">
              <Keuze value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as '' | ProjectStatus })}>
                <option value="">Alle</option>
                {Object.entries(PROJECT_STATUS_LABELS).map(([w, l]) => (
                  <option key={w} value={w}>
                    {l}
                  </option>
                ))}
              </Keuze>
            </Veld>
            <Veld label="Afdeling">
              <Keuze value={filters.afdeling} onChange={(e) => setFilters({ ...filters, afdeling: e.target.value as '' | Afdeling })}>
                <option value="">Alle</option>
                {Object.entries(AFDELING_LABELS).map(([w, l]) => (
                  <option key={w} value={w}>
                    {l}
                  </option>
                ))}
              </Keuze>
            </Veld>
            <Veld label="Team">
              <Keuze value={filters.teamId} onChange={(e) => setFilters({ ...filters, teamId: e.target.value })}>
                <option value="">Alle</option>
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.naam}
                  </option>
                ))}
              </Keuze>
            </Veld>
            <Veld label="Productieleider">
              <Keuze value={filters.productieleiderId} onChange={(e) => setFilters({ ...filters, productieleiderId: e.target.value })}>
                <option value="">Alle</option>
                {productieleiders.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.naam}
                  </option>
                ))}
              </Keuze>
            </Veld>
            <Veld label="Productmodel">
              <Keuze value={filters.productModel} onChange={(e) => setFilters({ ...filters, productModel: e.target.value })}>
                <option value="">Alle</option>
                {productModellen.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Keuze>
            </Veld>
            <Veld label="Externe spuiter">
              <Keuze value={filters.spuiterId} onChange={(e) => setFilters({ ...filters, spuiterId: e.target.value })}>
                <option value="">Alle</option>
                {data.externePartijen
                  .filter((e) => e.type === 'spuiter')
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.naam}
                    </option>
                  ))}
              </Keuze>
            </Veld>
            <Veld label="Onderaannemer">
              <Keuze value={filters.onderaannemerId} onChange={(e) => setFilters({ ...filters, onderaannemerId: e.target.value })}>
                <option value="">Alle</option>
                {data.externePartijen
                  .filter((e) => e.type !== 'spuiter')
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.naam}
                    </option>
                  ))}
              </Keuze>
            </Veld>
            <Veld label="Oplevermaand">
              <Keuze value={filters.oplevermaand} onChange={(e) => setFilters({ ...filters, oplevermaand: e.target.value })}>
                <option value="">Alle</option>
                {oplevermaanden.map((m) => (
                  <option key={m.waarde} value={m.waarde}>
                    {m.label}
                  </option>
                ))}
              </Keuze>
            </Veld>
            <Veld label="Risico">
              <Keuze value={filters.risico} onChange={(e) => setFilters({ ...filters, risico: e.target.value as '' | 'met' | 'zonder' })}>
                <option value="">Alle</option>
                <option value="met">Met risico</option>
                <option value="zonder">Zonder risico</option>
              </Keuze>
            </Veld>
            <div className="flex items-end">
              <Knop klein onClick={wisFilters} disabled={aantalFilters === 0}>
                <X size={13} /> Filters wissen
              </Knop>
            </div>
          </div>
        </Kaart>
      )}

      {/* Actieve filterchips */}
      {chips.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <Chip key={chip.key} label={chip.label} onVerwijder={() => setFilters((f) => ({ ...f, [chip.key]: '' }) as PlanningFilters)} />
          ))}
          <button onClick={wisFilters} className="text-xs text-slate-500 underline hover:text-slate-700">
            Alles wissen
          </button>
        </div>
      )}

      {/* Gantt */}
      <Kaart className="min-h-0 flex-1 overflow-hidden">
        {rijen.length === 0 ? (
          <div className="p-8">
            <LegeStaat
              titel="Geen projecten of fases gevonden"
              tekst="De huidige combinatie van zoekterm, filters en planningstype levert geen resultaten op."
              actie={
                <Knop variant="primary" klein onClick={wisFilters}>
                  Zoekterm en filters wissen
                </Knop>
              }
            />
          </div>
        ) : (
          <div ref={scrollRef} className="scrollbar-dun h-full overflow-auto">
            <div className="min-w-full" style={{ width: rijBreedte }}>
              {/* Kopregel: maanden, weken, dagen */}
              <div className="sticky top-0 z-40 flex border-b border-slate-200 bg-white" style={{ width: rijBreedte }}>
                <div className="sticky left-0 z-10 flex w-72 shrink-0 items-end border-r border-slate-200 bg-white px-3 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {groepering === 'project' ? 'Project / fase' : `${GROEPERING_LABELS[groepering]} / fase`}
                  </span>
                </div>
                <div className="relative shrink-0 bg-white" style={{ width: tijdlijn.totaalBreedte, height: koptekstHoogte }}>
                  {maandSegs.map((seg) => (
                    <div
                      key={seg.left}
                      className="absolute top-0 h-5 overflow-hidden truncate border-l border-slate-200 px-1.5 pt-0.5 text-[10px] font-semibold text-slate-500"
                      style={{ left: seg.left, width: seg.breedte }}
                    >
                      {seg.label}
                    </div>
                  ))}
                  {zoom !== 'maand' &&
                    tijdlijn.weken.map((wk, i) => (
                      <div
                        key={wk}
                        className="absolute h-[18px] overflow-hidden border-l border-slate-100 px-1 pt-0.5 text-[10px] tabular-nums text-slate-400"
                        style={{ left: i * weekBreedte, width: weekBreedte, top: 20 }}
                      >
                        {weekLabel(wk)}
                      </div>
                    ))}
                  {zoom === 'dag' &&
                    dagen.map((dag, i) => {
                      const weekend = i % 7 >= 5
                      return (
                        <div
                          key={dag}
                          className={`absolute h-[18px] border-l border-slate-100 pt-0.5 text-center text-[9px] tabular-nums ${weekend ? 'bg-slate-100/60 text-slate-300' : 'text-slate-400'}`}
                          style={{ left: i * tijdlijn.dagBreedte, width: tijdlijn.dagBreedte, top: 38 }}
                        >
                          {Number(dag.slice(8))}
                        </div>
                      )
                    })}
                  <div className="absolute inset-y-0 z-10 w-0.5 bg-red-500" style={{ left: tijdlijn.vandaagX }} />
                  <span
                    className="absolute bottom-0.5 z-10 rounded-sm bg-red-500 px-1 py-px text-[9px] font-medium leading-none text-white"
                    style={{ left: tijdlijn.vandaagX + 3 }}
                  >
                    Vandaag
                  </span>
                </div>
              </div>

              {/* Rijen */}
              {rijen.map((rij) => {
                if (rij.soort === 'groep') {
                  const dicht = dichteGroepen.has(rij.sleutel)
                  const Chevron = dicht ? ChevronRight : ChevronDown
                  const p = rij.project
                  const info = p ? projectInfo.get(p.id) : undefined
                  const span =
                    rij.fases.length > 0
                      ? {
                          start: rij.fases.reduce((min, f) => minISO(min, f.start), rij.fases[0].start),
                          eind: rij.fases.reduce((max, f) => maxISO(max, f.eind), rij.fases[0].eind),
                        }
                      : null
                  return (
                    <div key={rij.sleutel} className="group flex border-b border-slate-100" style={{ width: rijBreedte }}>
                      {linkerCel(
                        <>
                          <button
                            onClick={() => toggleGroep(rij.sleutel)}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                            title={dicht ? 'Uitklappen' : 'Inklappen'}
                          >
                            <Chevron size={15} />
                          </button>
                          {info && <RisicoStip risico={info.risico} />}
                          {p ? (
                            <>
                              <div className="min-w-0 flex-1 leading-tight">
                                <div className="flex items-baseline gap-1.5 overflow-hidden">
                                  <span className="shrink-0 text-xs font-semibold text-slate-800">{p.projectnummer}</span>
                                  <span className="truncate text-xs text-slate-600">{p.naam}</span>
                                </div>
                                <div className="truncate text-[10px] text-slate-400">{p.klant}</div>
                              </div>
                              {p.status === 'schaduw' ? (
                                <span
                                  className="balk-schaduw shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-brand-900"
                                  title={`Schaduwplanning · verkoopkans ${p.verkoopkans}%`}
                                >
                                  Schaduw {p.verkoopkans}%
                                </span>
                              ) : (
                                <Badge kleur={p.status === 'definitief' ? 'brand' : p.status === 'opgeleverd' ? 'groen' : 'grijs'}>
                                  {PROJECT_STATUS_LABELS[p.status]}
                                </Badge>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{rij.titel}</span>
                              <span className="shrink-0 text-[10px] text-slate-400">{rij.subtitel}</span>
                            </>
                          )}
                        </>,
                        'h-10',
                      )}
                      <div className="relative h-10 shrink-0" style={{ width: tijdlijn.totaalBreedte, backgroundImage: gridAchtergrond }}>
                        {vandaagLijn}
                        {span && (
                          <div
                            className={`absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full ${p && p.status === 'schaduw' ? 'balk-schaduw' : p ? 'bg-brand-600/70' : 'bg-slate-300'}`}
                            style={{ left: tijdlijn.x(span.start), width: Math.max(2, (diffDagen(span.start, span.eind) + 1) * tijdlijn.dagBreedte) }}
                          />
                        )}
                        {p && info && (
                          <>
                            <span
                              className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                              style={{ left: tijdlijn.x(p.gewensteOpleverdatum) + tijdlijn.dagBreedte / 2 }}
                            >
                              <Tooltip tekst={`Gewenste oplevering: ${formatDatum(p.gewensteOpleverdatum)}`}>
                                <span className="block h-2.5 w-2.5 rotate-45 border-2 border-slate-500 bg-white" />
                              </Tooltip>
                            </span>
                            <span
                              className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                              style={{ left: tijdlijn.x(info.verwacht) + tijdlijn.dagBreedte / 2 }}
                            >
                              <Tooltip
                                tekst={
                                  info.verwacht > p.gewensteOpleverdatum
                                    ? `Verwachte oplevering: ${formatDatum(info.verwacht)} — ${Math.max(1, werkdagenTussen(p.gewensteOpleverdatum, info.verwacht) - 1)} werkdag(en) na de gewenste datum`
                                    : `Verwachte oplevering: ${formatDatum(info.verwacht)}`
                                }
                              >
                                <span
                                  className={`block h-2.5 w-2.5 rotate-45 ${info.verwacht > p.gewensteOpleverdatum ? 'bg-red-500' : 'bg-brand-600'}`}
                                />
                              </Tooltip>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )
                }

                if (rij.soort === 'fase') {
                  const { fase, project } = rij
                  const team = fase.teamId ? teamMap.get(fase.teamId) : undefined
                  const pl = team?.productieleiderId ? medewerkerMap.get(team.productieleiderId) : undefined
                  const partij = fase.externePartijId ? partijMap.get(fase.externePartijId) : undefined
                  const uitvoerder = partij ? partij.naam : (team?.naam ?? 'Geen team')
                  const heeftWps = fase.werkpakketten.length > 0
                  const wpOpen = openFases.has(fase.id)
                  const WpChevron = wpOpen ? ChevronDown : ChevronRight
                  const overlap = overlapMetVoorganger(data, fase)
                  return (
                    <div key={rij.sleutel} className="group flex border-b border-slate-100" style={{ width: rijBreedte }}>
                      {linkerCel(
                        <>
                          <span className="w-4 shrink-0" />
                          {heeftWps ? (
                            <button
                              onClick={() => toggleFase(fase.id)}
                              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                              title={wpOpen ? 'Werkpakketten verbergen' : 'Werkpakketten tonen'}
                            >
                              <WpChevron size={13} />
                            </button>
                          ) : (
                            <span className="w-[21px] shrink-0" />
                          )}
                          <div className="min-w-0 flex-1 leading-tight">
                            <div className="flex items-center gap-1 overflow-hidden">
                              {partij && <Truck size={11} className="shrink-0 text-purple-600" />}
                              <span className="truncate text-[11px] font-medium text-slate-700">{fase.naam}</span>
                            </div>
                            <div className="truncate text-[10px] text-slate-400">
                              {rij.toonProject ? `${project.projectnummer} · ${project.naam}` : `${uitvoerder}${pl ? ` · ${pl.naam}` : ''}`}
                            </div>
                          </div>
                          <div className="flex w-16 shrink-0 items-center gap-1">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full ${fase.status === 'gereed' ? 'bg-emerald-500' : 'bg-brand-600'}`}
                                style={{ width: `${fase.status === 'gereed' ? 100 : fase.voortgang}%` }}
                              />
                            </div>
                            <span className="w-7 shrink-0 text-right text-[9px] tabular-nums text-slate-400">
                              {fase.status === 'gereed' ? 100 : fase.voortgang}%
                            </span>
                          </div>
                        </>,
                        'h-9',
                      )}
                      <div className="relative h-9 shrink-0" style={{ width: tijdlijn.totaalBreedte, backgroundImage: gridAchtergrond }}>
                        {vandaagLijn}
                        <FaseBalk
                          fase={fase}
                          project={project}
                          x={tijdlijn.x}
                          dagBreedte={tijdlijn.dagBreedte}
                          kanBewerken={kanBewerken}
                          afhankelijkheidsWaarschuwing={
                            overlap
                              ? `Start ${overlap.overlapWerkdagen} werkdag(en) vóór het einde van "${overlap.andereFase.naam}"${overlap.toegestaan > 0 ? ` (toegestane overlap: ${overlap.toegestaan})` : ''}.`
                              : undefined
                          }
                          onVerschuif={verschuifFase}
                          onResize={wijzigEinddatum}
                          onKlik={(f, pos) => setPopover({ fase: f, project, x: pos.x, y: pos.y })}
                        />
                      </div>
                    </div>
                  )
                }

                // Werkpakketrij
                const { fase, wp, index, aantal } = rij
                const faseLeft = tijdlijn.x(fase.start)
                const faseBreedte = (diffDagen(fase.start, fase.eind) + 1) * tijdlijn.dagBreedte
                const segment = faseBreedte / aantal
                const schaduw = rij.project.status === 'schaduw'
                // Externe uitvoering (proces zelf of één van de detailtaken) herkenbaar maken.
                const externPartijId =
                  wp.externePartijId ?? wp.taken.find((t) => t.uitvoering === 'extern')?.externeActie?.partijId
                const isExtern = wp.uitvoering === 'extern' || wp.taken.some((t) => t.uitvoering === 'extern')
                const externPartij = externPartijId
                  ? data.externePartijen.find((p) => p.id === externPartijId)
                  : undefined
                return (
                  <div key={rij.sleutel} className="group flex border-b border-slate-50" style={{ width: rijBreedte }}>
                    {linkerCel(
                      <>
                        <span className="w-11 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500">{wp.naam}</span>
                        {isExtern && (
                          <span
                            className="shrink-0 rounded-full border border-purple-200 bg-purple-50 px-1 text-[8px] font-medium text-purple-700"
                            title={`Externe uitvoering${externPartij ? ` · ${externPartij.naam}` : ''}`}
                          >
                            Extern{externPartij ? ` · ${externPartij.naam}` : ''}
                          </span>
                        )}
                        <span className="shrink-0 text-[9px] tabular-nums text-slate-400">{wp.voortgang}%</span>
                      </>,
                      'h-6',
                    )}
                    <div className="relative h-6 shrink-0" style={{ width: tijdlijn.totaalBreedte, backgroundImage: gridAchtergrond }}>
                      {vandaagLijn}
                      <div
                        className={`absolute top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-sm ${
                          isExtern ? 'balk-extern' : schaduw ? 'balk-schaduw' : 'border border-brand-300 bg-brand-100'
                        }`}
                        style={{ left: faseLeft + index * segment, width: Math.max(3, segment - 2) }}
                        title={`${wp.naam} · ${wp.voortgang}% · ${wp.uren} u · ${FASE_STATUS_LABELS[wp.status]}${
                          externPartij ? ` · Extern: ${externPartij.naam}` : ''
                        }`}
                      >
                        {!schaduw && !isExtern && <div className="h-full bg-brand-500" style={{ width: `${wp.voortgang}%` }} />}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Capaciteitsstrook */}
              <CapaciteitsStrook
                weken={tijdlijn.weken}
                dagBreedte={tijdlijn.dagBreedte}
                perTeam={groepering === 'team'}
                teamIds={stripTeamIds}
              />
            </div>
          </div>
        )}
      </Kaart>

      {/* Fase-popover */}
      {popover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPopover(null)} />
          <div
            className="fixed z-50 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
            style={{
              left: Math.max(8, Math.min(popover.x, window.innerWidth - 336)),
              top: Math.max(8, Math.min(popover.y + 10, window.innerHeight - 300)),
            }}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800">{popover.fase.naam}</div>
                <div className="truncate text-xs text-slate-500">
                  {popover.project.projectnummer} · {popover.project.naam}
                </div>
              </div>
              <button onClick={() => setPopover(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Badge
                  kleur={
                    popover.fase.status === 'gereed'
                      ? 'groen'
                      : popover.fase.status === 'geblokkeerd'
                        ? 'rood'
                        : popover.fase.status === 'bezig'
                          ? 'brand'
                          : 'grijs'
                  }
                >
                  {FASE_STATUS_LABELS[popover.fase.status]}
                </Badge>
                {popover.fase.externePartijId && (
                  <Badge kleur="paars">
                    <Truck size={11} /> Extern
                  </Badge>
                )}
              </div>
              <div>
                <span className="text-slate-400">Periode:</span> {formatDatumMetDag(popover.fase.start)} –{' '}
                {formatDatumMetDag(popover.fase.eind)} ({werkdagenTussen(popover.fase.start, popover.fase.eind)} werkdagen)
              </div>
              {popover.fase.externePartijId ? (
                <div>
                  <span className="text-slate-400">Externe partij:</span>{' '}
                  {partijMap.get(popover.fase.externePartijId)?.naam ?? 'Onbekend'}
                  {popover.fase.transportHeen && popover.fase.transportTerug && (
                    <span className="block text-[11px] text-slate-500">
                      Transport: heen {formatDatum(popover.fase.transportHeen)} · terug {formatDatum(popover.fase.transportTerug)}
                    </span>
                  )}
                </div>
              ) : (
                <div>
                  <span className="text-slate-400">Team:</span> {teamMap.get(popover.fase.teamId ?? '')?.naam ?? 'Geen team'}
                  {(() => {
                    const plId = teamMap.get(popover.fase.teamId ?? '')?.productieleiderId
                    const pl = plId ? medewerkerMap.get(plId) : undefined
                    return pl ? <span> · {pl.naam}</span> : null
                  })()}
                </div>
              )}
              {popover.fase.uren > 0 && (
                <div>
                  <span className="text-slate-400">Geplande uren:</span> {popover.fase.uren} u
                </div>
              )}
              <VoortgangsBalk pct={popover.fase.status === 'gereed' ? 100 : popover.fase.voortgang} />
              {popover.fase.blokkadeNotitie && (
                <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-700">{popover.fase.blokkadeNotitie}</div>
              )}
              {popover.fase.notities && <div className="text-[11px] text-slate-500">{popover.fase.notities}</div>}
            </div>
            <div className="mt-3 flex justify-end">
              <Knop klein variant="primary" onClick={() => navigate(`/projecten/${popover.project.id}`)}>
                <ExternalLink size={13} /> Naar project
              </Knop>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
