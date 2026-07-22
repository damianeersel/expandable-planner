// Projectenoverzicht: zoeken, filteren, sorteren, tabel- en kaartweergave
// en de startknop voor de wizard "Nieuw project vanuit Sales".

import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, LayoutGrid, Plus, Search, Table } from 'lucide-react'
import { useApp } from '../store/AppState'
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
  VoortgangsBalk,
  type BadgeKleur,
} from '../components/ui'
import NieuwProjectWizard from '../components/projecten/NieuwProjectWizard'
import type { Fase, Project } from '../lib/types'
import { FASE_STATUS_LABELS, PROJECT_STATUS_LABELS } from '../lib/types'
import { formatDatum, formatDatumKort, maandLabel, werkdagenTussen } from '../lib/dates'
import {
  getHuidigeFase,
  getProjectRisico,
  getProjectVoortgang,
  getVerwachteOplevering,
  projectFases,
  type ProjectRisico,
  type RisicoNiveau,
} from '../lib/capacity'

type Weergave = 'tabel' | 'kaarten'
type StatusFilter = 'alle' | 'schaduw' | 'definitief'
type RisicoFilter = 'alle' | 'met' | 'zonder'
type SorteerVeld = 'projectnummer' | 'klant' | 'oplever'
type SorteerRichting = 'asc' | 'desc'

interface Rij {
  project: Project
  fases: Fase[]
  huidigeFase?: Fase
  risico: ProjectRisico
  verwacht: string
  voortgang: number
  actie: string
}

const STATUS_BADGE_KLEUR: Record<Project['status'], BadgeKleur> = {
  schaduw: 'blauw',
  definitief: 'brand',
  opgeleverd: 'groen',
  geannuleerd: 'grijs',
}

const RISICO_STIP: Record<RisicoNiveau, string> = {
  laag: 'bg-emerald-500',
  middel: 'bg-amber-500',
  hoog: 'bg-red-500',
}

const RISICO_LABEL: Record<RisicoNiveau, string> = {
  laag: 'Laag risico',
  middel: 'Verhoogd risico',
  hoog: 'Hoog risico',
}

function stipKleur(f: Fase): string {
  if (f.status === 'gereed') return 'bg-brand-600'
  if (f.status === 'bezig') return 'bg-amber-500'
  if (f.status === 'geblokkeerd') return 'bg-red-500'
  return 'bg-slate-300'
}

function eerstvolgendeActie(project: Project, fases: Fase[], huidigeFase?: Fase): string {
  if (project.status === 'schaduw' && project.verwachteOrderdatum) {
    return `Orderbevestiging verwacht ${formatDatumKort(project.verwachteOrderdatum)}`
  }
  const geblokkeerd = fases.find((f) => f.status === 'geblokkeerd')
  if (geblokkeerd) return `Blokkade oplossen: ${geblokkeerd.naam}`
  if (project.status === 'opgeleverd') return 'Opgeleverd'
  if (project.status === 'geannuleerd') return 'Geannuleerd'
  if (!huidigeFase) return 'Planning opstellen'
  if (huidigeFase.status === 'gereed') return 'Project opleveren'
  return `${huidigeFase.naam} afronden`
}

function RisicoStip({ risico }: { risico: ProjectRisico }) {
  const tip =
    risico.redenen.length > 0 ? (
      <span className="block text-left">
        <span className="block font-semibold">{RISICO_LABEL[risico.niveau]}</span>
        {risico.redenen.map((reden, i) => (
          <span key={i} className="block">
            • {reden}
          </span>
        ))}
      </span>
    ) : (
      'Geen risico’s gesignaleerd'
    )
  return (
    <Tooltip tekst={tip}>
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${RISICO_STIP[risico.niveau]}`} />
    </Tooltip>
  )
}

function StatusCel({ project }: { project: Project }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge kleur={STATUS_BADGE_KLEUR[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
      {project.status === 'schaduw' && (
        <span className="pl-1 text-[11px] tabular-nums text-slate-500">{project.verkoopkans}% verkoopkans</span>
      )}
    </div>
  )
}

function VerwachteOpleverCel({ project, verwacht }: { project: Project; verwacht: string }) {
  const teLaat = verwacht > project.gewensteOpleverdatum
  if (!teLaat) return <span className="tabular-nums text-slate-700">{formatDatum(verwacht)}</span>
  const dagen = Math.max(1, werkdagenTussen(project.gewensteOpleverdatum, verwacht) - 1)
  return (
    <Tooltip tekst={`${dagen} werkdag(en) later dan de gewenste opleverdatum (${formatDatum(project.gewensteOpleverdatum)})`}>
      <span className="font-medium tabular-nums text-red-600">{formatDatum(verwacht)}</span>
    </Tooltip>
  )
}

function FaseStippen({ fases }: { fases: Fase[] }) {
  return (
    <div className="flex w-full items-center">
      {fases.map((f, i) => (
        <Fragment key={f.id}>
          {i > 0 && <span className={`h-0.5 min-w-2 flex-1 ${fases[i - 1].status === 'gereed' ? 'bg-brand-300' : 'bg-slate-200'}`} />}
          <Tooltip tekst={`${f.naam} · ${FASE_STATUS_LABELS[f.status]}`}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${stipKleur(f)}`} />
          </Tooltip>
        </Fragment>
      ))}
    </div>
  )
}

export default function Projecten() {
  const { data, permissies } = useApp()
  const navigate = useNavigate()

  const [weergave, setWeergave] = useState<Weergave>('tabel')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [zoek, setZoek] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('alle')
  const [risicoFilter, setRisicoFilter] = useState<RisicoFilter>('alle')
  const [pmFilter, setPmFilter] = useState('alle')
  const [modelFilter, setModelFilter] = useState('alle')
  const [maandFilter, setMaandFilter] = useState('alle')
  const [sorteerVeld, setSorteerVeld] = useState<SorteerVeld>('projectnummer')
  const [richting, setRichting] = useState<SorteerRichting>('asc')

  const rijen = useMemo<Rij[]>(
    () =>
      data.projecten.map((project) => {
        const fases = projectFases(data, project.id)
        const huidigeFase = getHuidigeFase(data, project.id)
        return {
          project,
          fases,
          huidigeFase,
          risico: getProjectRisico(data, project),
          verwacht: getVerwachteOplevering(data, project.id),
          voortgang: getProjectVoortgang(data, project.id),
          actie: eerstvolgendeActie(project, fases, huidigeFase),
        }
      }),
    [data],
  )

  const pmOpties = useMemo(() => [...new Set(data.projecten.map((p) => p.projectmanager))].sort((a, b) => a.localeCompare(b, 'nl')), [data.projecten])
  const modelOpties = useMemo(() => [...new Set(data.projecten.map((p) => p.productModel))].sort((a, b) => a.localeCompare(b, 'nl')), [data.projecten])
  const maandOpties = useMemo(() => [...new Set(data.projecten.map((p) => p.gewensteOpleverdatum.slice(0, 7)))].sort(), [data.projecten])

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    return rijen.filter((r) => {
      const p = r.project
      if (q && !p.projectnummer.toLowerCase().includes(q) && !p.naam.toLowerCase().includes(q) && !p.klant.toLowerCase().includes(q)) return false
      if (statusFilter !== 'alle' && p.status !== statusFilter) return false
      if (risicoFilter === 'met' && r.risico.redenen.length === 0) return false
      if (risicoFilter === 'zonder' && r.risico.redenen.length > 0) return false
      if (pmFilter !== 'alle' && p.projectmanager !== pmFilter) return false
      if (modelFilter !== 'alle' && p.productModel !== modelFilter) return false
      if (maandFilter !== 'alle' && p.gewensteOpleverdatum.slice(0, 7) !== maandFilter) return false
      return true
    })
  }, [rijen, zoek, statusFilter, risicoFilter, pmFilter, modelFilter, maandFilter])

  const gesorteerd = useMemo(() => {
    const kopie = [...gefilterd]
    kopie.sort((a, b) => {
      let r = 0
      if (sorteerVeld === 'projectnummer') r = a.project.projectnummer.localeCompare(b.project.projectnummer, 'nl')
      else if (sorteerVeld === 'klant') r = a.project.klant.localeCompare(b.project.klant, 'nl')
      else r = a.project.gewensteOpleverdatum.localeCompare(b.project.gewensteOpleverdatum)
      return richting === 'asc' ? r : -r
    })
    return kopie
  }, [gefilterd, sorteerVeld, richting])

  const filtersActief =
    zoek.trim() !== '' || statusFilter !== 'alle' || risicoFilter !== 'alle' || pmFilter !== 'alle' || modelFilter !== 'alle' || maandFilter !== 'alle'

  const wisFilters = () => {
    setZoek('')
    setStatusFilter('alle')
    setRisicoFilter('alle')
    setPmFilter('alle')
    setModelFilter('alle')
    setMaandFilter('alle')
  }

  const sorteer = (veld: SorteerVeld) => {
    if (veld === sorteerVeld) setRichting((r) => (r === 'asc' ? 'desc' : 'asc'))
    else {
      setSorteerVeld(veld)
      setRichting('asc')
    }
  }

  const SorteerKop = ({ veld, label }: { veld: SorteerVeld; label: string }) => {
    const Icoon = sorteerVeld !== veld ? ArrowUpDown : richting === 'asc' ? ArrowUp : ArrowDown
    return (
      <button onClick={() => sorteer(veld)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-700">
        {label}
        <Icoon size={12} className={sorteerVeld === veld ? 'text-brand-600' : 'text-slate-400'} />
      </button>
    )
  }

  return (
    <div className="p-6">
      <PaginaKop
        titel="Projecten"
        uitleg="Alle trailerprojecten: van schaduwplanning tot oplevering."
        rechts={
          <>
            <div className="flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
              <button
                onClick={() => setWeergave('tabel')}
                title="Tabelweergave"
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  weergave === 'tabel' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Table size={15} />
                Tabel
              </button>
              <button
                onClick={() => setWeergave('kaarten')}
                title="Kaartweergave"
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  weergave === 'kaarten' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <LayoutGrid size={15} />
                Kaarten
              </button>
            </div>
            <Knop
              variant="primary"
              disabled={!permissies.projectAanmaken}
              title={permissies.projectAanmaken ? undefined : 'Alleen planner en sales kunnen een project aanmaken'}
              onClick={() => setWizardOpen(true)}
            >
              <Plus size={16} />
              Nieuw project vanuit Sales
            </Knop>
          </>
        }
      />

      {/* Zoek & filters */}
      <Kaart className="mb-4 px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-56 flex-1">
            <span className="mb-1 block text-xs font-medium text-slate-600">Zoeken</span>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
              <Invoer
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                placeholder="Projectnummer, naam of klant…"
                className="!pl-8"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
              Status
              <InfoTip tekst="Schaduwplanning: voorlopige reservering vóór orderbevestiging. Telt in capaciteitsweergaven mee volgens het gekozen scenario." />
            </span>
            <Keuze value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="!w-auto">
              <option value="alle">Alle statussen</option>
              <option value="schaduw">Schaduwplanning</option>
              <option value="definitief">Definitief</option>
            </Keuze>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Risico</span>
            <Keuze value={risicoFilter} onChange={(e) => setRisicoFilter(e.target.value as RisicoFilter)} className="!w-auto">
              <option value="alle">Alle projecten</option>
              <option value="met">Met risico</option>
              <option value="zonder">Zonder risico</option>
            </Keuze>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Projectmanager</span>
            <Keuze value={pmFilter} onChange={(e) => setPmFilter(e.target.value)} className="!w-auto">
              <option value="alle">Alle projectmanagers</option>
              {pmOpties.map((pm) => (
                <option key={pm} value={pm}>
                  {pm}
                </option>
              ))}
            </Keuze>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Productmodel</span>
            <Keuze value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} className="!w-auto">
              <option value="alle">Alle modellen</option>
              {modelOpties.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Keuze>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Oplevermaand</span>
            <Keuze value={maandFilter} onChange={(e) => setMaandFilter(e.target.value)} className="!w-auto">
              <option value="alle">Alle maanden</option>
              {maandOpties.map((m) => (
                <option key={m} value={m}>
                  {maandLabel(`${m}-01`)}
                </option>
              ))}
            </Keuze>
          </label>
          {filtersActief && (
            <Knop klein variant="ghost" onClick={wisFilters} className="mb-0.5">
              Filters wissen
            </Knop>
          )}
        </div>
      </Kaart>

      <p className="mb-2 text-xs text-slate-500">
        {gesorteerd.length} van {rijen.length} projecten
      </p>

      {gesorteerd.length === 0 ? (
        <LegeStaat
          titel="Geen projecten gevonden"
          tekst={
            filtersActief
              ? 'Er zijn geen projecten die aan de huidige zoekopdracht en filters voldoen.'
              : 'Er zijn nog geen projecten. Maak een nieuw project aan vanuit Sales.'
          }
          actie={
            <div className="flex gap-2">
              {filtersActief && <Knop onClick={wisFilters}>Filters wissen</Knop>}
              {permissies.projectAanmaken && (
                <Knop variant="primary" onClick={() => setWizardOpen(true)}>
                  <Plus size={16} />
                  Nieuw project vanuit Sales
                </Knop>
              )}
            </div>
          }
        />
      ) : weergave === 'tabel' ? (
        <Kaart className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">
                  <SorteerKop veld="projectnummer" label="Projectnr." />
                </th>
                <th className="px-3 py-2.5">
                  <SorteerKop veld="klant" label="Klant" />
                </th>
                <th className="px-3 py-2.5">Model</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Huidige fase</th>
                <th className="px-3 py-2.5">Projectmanager</th>
                <th className="px-3 py-2.5">
                  <SorteerKop veld="oplever" label="Gewenst" />
                </th>
                <th className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    Verwacht
                    <InfoTip tekst="Verwachte opleverdatum = einddatum van de laatste geplande fase. Rood als deze na de gewenste opleverdatum ligt." />
                  </span>
                </th>
                <th className="w-36 px-3 py-2.5">Voortgang</th>
                <th className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    Risico
                    <InfoTip tekst="Automatische signalering: te late oplevering, geblokkeerde fases, vertraging bij externe partijen en overboeking (meer uren gepland dan er capaciteit beschikbaar is)." />
                  </span>
                </th>
                <th className="px-3 py-2.5">Eerstvolgende actie</th>
              </tr>
            </thead>
            <tbody>
              {gesorteerd.map((r) => (
                <tr
                  key={r.project.id}
                  onClick={() => navigate(`/projecten/${r.project.id}`)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-brand-700 hover:underline">{r.project.projectnummer}</span>
                    <span className="block max-w-44 truncate text-xs text-slate-500">{r.project.naam}</span>
                  </td>
                  <td className="max-w-40 truncate px-3 py-2.5 text-slate-700">{r.project.klant}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-slate-600">{r.project.productModel}</td>
                  <td className="px-3 py-2.5">
                    <StatusCel project={r.project} />
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-slate-600">{r.huidigeFase ? r.huidigeFase.naam : '—'}</td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-slate-600">{r.project.projectmanager}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-700">{formatDatum(r.project.gewensteOpleverdatum)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <VerwachteOpleverCel project={r.project} verwacht={r.verwacht} />
                  </td>
                  <td className="px-3 py-2.5">
                    <VoortgangsBalk pct={r.voortgang} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <RisicoStip risico={r.risico} />
                  </td>
                  <td className="max-w-52 truncate px-3 py-2.5 text-xs text-slate-600">{r.actie}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Kaart>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {gesorteerd.map((r) => (
            <Kaart key={r.project.id} onClick={() => navigate(`/projecten/${r.project.id}`)} className="p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-brand-700">{r.project.projectnummer}</span>
                <StatusCel project={r.project} />
              </div>
              <p className="truncate text-sm font-medium text-slate-800">{r.project.naam}</p>
              <p className="mb-3 truncate text-xs text-slate-500">
                {r.project.klant} · {r.project.productModel}
              </p>

              <FaseStippen fases={r.fases} />

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500">Huidige fase</dt>
                <dd className="truncate text-right text-slate-700">{r.huidigeFase ? r.huidigeFase.naam : '—'}</dd>
                <dt className="text-slate-500">Projectmanager</dt>
                <dd className="truncate text-right text-slate-700">{r.project.projectmanager}</dd>
                <dt className="text-slate-500">Gewenste oplevering</dt>
                <dd className="text-right tabular-nums text-slate-700">{formatDatumKort(r.project.gewensteOpleverdatum)}</dd>
                <dt className="text-slate-500">Verwachte oplevering</dt>
                <dd className="text-right">
                  <VerwachteOpleverCel project={r.project} verwacht={r.verwacht} />
                </dd>
              </dl>

              <VoortgangsBalk pct={r.voortgang} className="mt-3" />

              <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5">
                <RisicoStip risico={r.risico} />
                <span className="truncate text-xs text-slate-600">{r.actie}</span>
              </div>
            </Kaart>
          ))}
        </div>
      )}

      <NieuwProjectWizard open={wizardOpen} onSluiten={() => setWizardOpen(false)} />
    </div>
  )
}
