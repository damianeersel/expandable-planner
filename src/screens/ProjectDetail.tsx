// Projectdetailpagina: kop met status en orderbevestiging, processtappenbalk en negen tabs.

import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
  ExternalLink,
  LayoutTemplate,
  OctagonAlert,
  Pencil,
  Truck,
  Users,
} from 'lucide-react'
import { useApp } from '../store/AppState'
import {
  COMPLEXITEIT_LABELS,
  EXTERN_TYPE_LABELS,
  externTypeLabel,
  FASE_STATUS_LABELS,
  PRIORITEIT_LABELS,
  PROJECT_STATUS_LABELS,
  SCENARIO_LABELS,
  type ExternePartij,
  type Fase,
  type Prioriteit,
  type Project,
  type ProjectStatus,
} from '../lib/types'
import {
  bezettingsPct,
  getHuidigeFase,
  getProjectRisico,
  getProjectVoortgang,
  getVerwachteOplevering,
  projectFases,
  scenarioBelasting,
  teamBeschikbaarInWeek,
  teamGeplandInWeek,
  teamLedenOpDag,
  type ProjectRisico,
  type RisicoNiveau,
} from '../lib/capacity'
import { diffDagen, formatDatum, formatDatumMetDag, startVanWeek, weekReeks, werkdagenTussen } from '../lib/dates'
import {
  Badge,
  CapaciteitsBalk,
  InfoTip,
  Invoer,
  Kaart,
  KaartKop,
  Keuze,
  Knop,
  LegeStaat,
  Modal,
  Tabs,
  Tekstvak,
  Tooltip,
  Veld,
  VoortgangsBalk,
  useToast,
  type BadgeKleur,
} from '../components/ui'
import ProcesBalk from '../components/project/ProcesBalk'
import MiniGantt from '../components/project/MiniGantt'
import FaseKaart, { FASE_STATUS_KLEUR } from '../components/project/FaseKaart'
import FasesTab from '../components/project/FasesTab'
import OrderBevestigenDialog from '../components/project/OrderBevestigenDialog'
import OpslaanAlsTemplateModal from '../components/project/OpslaanAlsTemplateModal'
import UnitLocatieTab from '../components/project/UnitLocatieTab'
import BestandenTab from '../components/project/BestandenTab'
import NotitiesHistorieTab from '../components/project/NotitiesHistorieTab'

// ---------- Kleine hulpcomponenten ----------

const PRIO_KLEUR: Record<Prioriteit, BadgeKleur> = { laag: 'grijs', normaal: 'blauw', hoog: 'amber' }
const RISICO_KLEUR: Record<RisicoNiveau, string> = { laag: 'bg-emerald-500', middel: 'bg-amber-500', hoog: 'bg-red-500' }
const RISICO_NIVEAU_LABELS: Record<RisicoNiveau, string> = { laag: 'Laag', middel: 'Middel', hoog: 'Hoog' }

function StatusBadge({ status }: { status: ProjectStatus }) {
  if (status === 'schaduw') {
    return (
      <span className="balk-schaduw inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-brand-900">
        {PROJECT_STATUS_LABELS.schaduw}
      </span>
    )
  }
  if (status === 'definitief') {
    return (
      <span className="inline-flex items-center rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">
        {PROJECT_STATUS_LABELS.definitief}
      </span>
    )
  }
  return <Badge kleur={status === 'opgeleverd' ? 'groen' : 'grijs'}>{PROJECT_STATUS_LABELS[status]}</Badge>
}

function RisicoStip({ risico }: { risico: ProjectRisico }) {
  return (
    <Tooltip
      tekst={
        risico.redenen.length > 0 ? (
          <span className="block text-left">
            {risico.redenen.map((r, i) => (
              <span key={i} className="block">• {r}</span>
            ))}
          </span>
        ) : (
          'Geen risicofactoren gedetecteerd.'
        )
      }
    >
      <span className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
        <span className={`h-2 w-2 rounded-full ${RISICO_KLEUR[risico.niveau]}`} />
        Risico: {RISICO_NIVEAU_LABELS[risico.niveau]}
      </span>
    </Tooltip>
  )
}

function Rij({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="flex shrink-0 items-center gap-1 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{children}</span>
    </div>
  )
}

function NotitiesKaart({ project }: { project: Project }) {
  const { dispatch, permissies } = useApp()
  const { toon } = useToast()
  const [tekst, setTekst] = useState(project.notities)
  useEffect(() => setTekst(project.notities), [project.id, project.notities])

  const opslaan = () => {
    dispatch({ type: 'PROJECT_BIJWERKEN', id: project.id, patch: { notities: tekst } })
    toon('succes', 'Projectnotities opgeslagen.')
  }

  return (
    <Kaart>
      <KaartKop titel="Notities" />
      <div className="p-4">
        {permissies.risicoBeheren ? (
          <>
            <Tekstvak rows={4} value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Projectnotities…" />
            <div className="mt-2 flex justify-end">
              <Knop klein variant="primary" disabled={tekst === project.notities} onClick={opslaan}>
                Notities opslaan
              </Knop>
            </div>
          </>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-slate-600">{project.notities || 'Geen notities.'}</p>
        )}
      </div>
    </Kaart>
  )
}

function RisicoKaart({ project }: { project: Project }) {
  const { data } = useApp()
  const risico = getProjectRisico(data, project)
  return (
    <Kaart>
      <KaartKop
        titel="Risicobeeld"
        uitleg="Automatisch bepaald op basis van opleverdatum, blokkades, externe vertragingen en capaciteitsconflicten."
        rechts={<RisicoStip risico={risico} />}
      />
      <div className="p-4">
        {risico.redenen.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 size={16} /> Geen risicofactoren gedetecteerd.
          </div>
        ) : (
          <ul className="space-y-2">
            {risico.redenen.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <AlertTriangle
                  size={15}
                  className={`mt-0.5 shrink-0 ${risico.niveau === 'hoog' ? 'text-red-500' : 'text-amber-500'}`}
                />
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Kaart>
  )
}

function VerkoopkansModal({ project, open, onSluiten }: { project: Project; open: boolean; onSluiten: () => void }) {
  const { dispatch } = useApp()
  const { toon } = useToast()
  const [kans, setKans] = useState(String(project.verkoopkans))
  const [orderdatum, setOrderdatum] = useState(project.verwachteOrderdatum ?? '')
  const [fout, setFout] = useState<string | undefined>()

  useEffect(() => {
    if (open) {
      setKans(String(project.verkoopkans))
      setOrderdatum(project.verwachteOrderdatum ?? '')
      setFout(undefined)
    }
  }, [open, project])

  const opslaan = () => {
    const n = Number(kans)
    if (kans.trim() === '' || Number.isNaN(n) || n < 0 || n > 100) {
      setFout('Vul een verkoopkans in tussen 0 en 100.')
      return
    }
    dispatch({
      type: 'PROJECT_BIJWERKEN',
      id: project.id,
      patch: { verkoopkans: Math.round(n), verwachteOrderdatum: orderdatum || undefined },
    })
    toon('succes', 'Verkoopkans en verwachte orderdatum bijgewerkt.')
    onSluiten()
  }

  return (
    <Modal
      open={open}
      titel="Verkoopkans bewerken"
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={opslaan}>Opslaan</Knop>
        </>
      }
    >
      <div className="space-y-3">
        <Veld label="Verkoopkans (%)" verplicht fout={fout}>
          <Invoer type="number" min={0} max={100} value={kans} onChange={(e) => setKans(e.target.value)} />
        </Veld>
        <Veld label="Verwachte orderdatum">
          <Invoer type="date" value={orderdatum} onChange={(e) => setOrderdatum(e.target.value)} />
        </Veld>
        <p className="text-xs text-slate-500">
          De verkoopkans bepaalt hoe zwaar dit schaduwproject meetelt in het kansgewogen capaciteitsscenario. De planning
          zelf wordt door de planner beheerd.
        </p>
      </div>
    </Modal>
  )
}

// ---------- Tab: Overzicht ----------

function OverzichtTab({ project }: { project: Project }) {
  const { data } = useApp()
  const verwacht = getVerwachteOplevering(data, project.id)
  const teLaat = verwacht > project.gewensteOpleverdatum
  const voortgang = getProjectVoortgang(data, project.id)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Kaart>
          <KaartKop titel="Projectgegevens" />
          <div className="px-4 py-1">
            <Rij label="Klant">{project.klant}</Rij>
            <Rij label="Model">{project.productModel}</Rij>
            <Rij label="Salesverantwoordelijke">{project.salesverantwoordelijke}</Rij>
            <Rij label="Projectmanager">{project.projectmanager}</Rij>
            <Rij label="Status"><StatusBadge status={project.status} /></Rij>
            <Rij label="Prioriteit">
              <Badge kleur={PRIO_KLEUR[project.prioriteit]}>{PRIORITEIT_LABELS[project.prioriteit]}</Badge>
            </Rij>
            <Rij label="Complexiteit">{COMPLEXITEIT_LABELS[project.complexiteit]}</Rij>
            <Rij
              label={
                <>
                  Verkoopkans
                  <InfoTip tekst="Bij het scenario 'Definitief + kansgewogen' telt dit project voor dit percentage mee in de teambelasting. Bij bevestiging wordt de kans automatisch 100%." />
                </>
              }
            >
              {project.verkoopkans}%
            </Rij>
            {project.bijzonderheden && <Rij label="Bijzonderheden">{project.bijzonderheden}</Rij>}
          </div>
        </Kaart>
        <NotitiesKaart project={project} />
      </div>

      <div className="space-y-4">
        <Kaart>
          <KaartKop titel="Planning & datums" />
          <div className="px-4 py-1">
            <Rij label="Aangemaakt op">{formatDatum(project.aangemaaktOp)}</Rij>
            {project.status === 'schaduw' && project.verwachteOrderdatum && (
              <Rij label="Verwachte orderdatum">{formatDatum(project.verwachteOrderdatum)}</Rij>
            )}
            {project.bevestigdOp && <Rij label="Order bevestigd op">{formatDatum(project.bevestigdOp)}</Rij>}
            <Rij label="Gewenste opleverdatum">{formatDatum(project.gewensteOpleverdatum)}</Rij>
            <Rij label="Verwachte opleverdatum">
              <span className={teLaat ? 'font-semibold text-red-600' : 'text-emerald-700'}>
                {formatDatum(verwacht)}
                {teLaat && ` (${werkdagenTussen(project.gewensteOpleverdatum, verwacht) - 1} werkdagen later)`}
              </span>
            </Rij>
            <div className="flex items-center gap-3 py-2.5 text-sm">
              <span className="shrink-0 text-slate-500">Voortgang</span>
              <VoortgangsBalk pct={voortgang} className="flex-1" />
            </div>
          </div>
        </Kaart>
        <RisicoKaart project={project} />
      </div>
    </div>
  )
}

// ---------- Tab: Planning ----------

function PlanningTab({ project }: { project: Project }) {
  const { data } = useApp()
  return (
    <Kaart>
      <KaartKop
        titel="Tijdlijn van dit project"
        uitleg="Weekgebaseerde tijdlijn van alle fases. Gestreept groen = schaduwplanning (capaciteit gereserveerd, order nog niet bevestigd); gestreept paars = werk bij een externe partij."
        rechts={
          <Link
            to="/planning"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
          >
            <ExternalLink size={13} /> Openen in planning
          </Link>
        }
      />
      <div className="p-4">
        <MiniGantt data={data} project={project} />
      </div>
    </Kaart>
  )
}

// ---------- Tab: Fases & werkzaamheden (uitgelicht naar eigen component) ----------

// ---------- Tab: Team & resources ----------

function TeamFaseKaart({ fase }: { fase: Fase }) {
  const { data, ui, dispatch, permissies } = useApp()
  const { toon } = useToast()
  const team = data.teams.find((t) => t.id === fase.teamId)
  const leider = team?.productieleiderId ? data.medewerkers.find((m) => m.id === team.productieleiderId) : undefined
  const leden = fase.teamId ? teamLedenOpDag(data, fase.teamId, fase.start) : []

  const aantalWeken = Math.max(1, Math.floor(diffDagen(startVanWeek(fase.start), fase.eind) / 7) + 1)
  const weken = weekReeks(fase.start, aantalWeken)
  let somBeschikbaar = 0
  let somBelasting = 0
  for (const w of weken) {
    somBeschikbaar += teamBeschikbaarInWeek(data, fase.teamId!, w)
    somBelasting += scenarioBelasting(teamGeplandInWeek(data, fase.teamId!, w), ui.scenario)
  }
  const gemBeschikbaar = somBeschikbaar / aantalWeken
  const gemBelasting = somBelasting / aantalWeken
  const pct = bezettingsPct(gemBeschikbaar, gemBelasting)

  const afdeling = team?.afdeling ?? fase.afdeling
  const teamOpties = data.teams.filter((t) => t.afdeling === afdeling)

  const wijzigTeam = (teamId: string) => {
    if (teamId === fase.teamId) return
    dispatch({ type: 'FASE_BIJWERKEN', id: fase.id, patch: { teamId } })
    toon('succes', `Fase "${fase.naam}" toegewezen aan ${data.teams.find((t) => t.id === teamId)?.naam ?? 'ander team'}.`)
  }

  return (
    <Kaart className={fase.status === 'gereed' ? 'opacity-70' : ''}>
      <KaartKop
        titel={
          <>
            {fase.naam}
            <span className="text-xs font-normal text-slate-400">
              {formatDatum(fase.start)} – {formatDatum(fase.eind)}
            </span>
          </>
        }
        rechts={<Badge kleur={FASE_STATUS_KLEUR[fase.status]}>{FASE_STATUS_LABELS[fase.status]}</Badge>}
      />
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 p-4 md:grid-cols-2">
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Team</div>
          {permissies.planningBewerken ? (
            <Keuze value={fase.teamId} onChange={(e) => wijzigTeam(e.target.value)} className="!w-64">
              {teamOpties.map((t) => (
                <option key={t.id} value={t.id}>{t.naam}</option>
              ))}
            </Keuze>
          ) : (
            <div className="text-sm font-medium text-slate-800">{team?.naam ?? 'Onbekend team'}</div>
          )}
          {leider && <div className="mt-1 text-xs text-slate-500">Productieleider: {leider.naam}</div>}
          <ul className="mt-2.5 space-y-1">
            {leden.length === 0 && <li className="text-xs text-slate-400">Geen actieve teamleden op de startdatum.</li>}
            {leden.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm text-slate-700">
                <Users size={13} className="shrink-0 text-slate-400" />
                {m.naam} <span className="text-xs text-slate-400">· {m.functie}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Capaciteit in de faseperiode
            <InfoTip tekst="Beschikbare capaciteit = contracturen × beschikbaarheidspercentage minus goedgekeurde afwezigheid van alle teamleden. De belasting volgt het gekozen capaciteitsscenario." />
          </div>
          <div className="text-sm text-slate-700">
            Gemiddeld <span className="font-semibold tabular-nums">{Math.round(gemBelasting)} u</span> gepland t.o.v.{' '}
            <span className="font-semibold tabular-nums">{Math.round(gemBeschikbaar)} u</span> beschikbaar per week
          </div>
          <CapaciteitsBalk pct={pct} className="mt-2" />
          {pct > 100 && (
            <div className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-600">
              <AlertTriangle size={14} className="mt-px shrink-0" />
              <span>
                Dit team is in deze periode gemiddeld overboekt
                <InfoTip tekst="Overboekt: er zijn meer uren gepland dan het team netto beschikbaar heeft. Verschuif fases, wissel van team of zet tijdelijk extra mensen in." />
              </span>
            </div>
          )}
        </div>
      </div>
    </Kaart>
  )
}

function TeamResourcesTab({ project }: { project: Project }) {
  const { ui, data } = useApp()
  const fases = projectFases(data, project.id).filter((f) => f.teamId)
  if (fases.length === 0) {
    return (
      <LegeStaat
        titel="Geen teamtoewijzingen"
        tekst="Geen enkele fase van dit project heeft een intern team toegewezen."
      />
    )
  }
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        Gemiddelden per week binnen de faseperiode, volgens scenario “{SCENARIO_LABELS[ui.scenario]}”.
        <InfoTip tekst="Bij 'Definitief + kansgewogen' tellen schaduwprojecten mee naar rato van hun verkoopkans: 70% kans = 70% van de uren." />
      </p>
      {fases.map((fase) => (
        <TeamFaseKaart key={fase.id} fase={fase} />
      ))}
    </div>
  )
}

// ---------- Tab: Externe partijen ----------

const PARTIJ_STATUS: Record<ExternePartij['status'], { label: string; kleur: BadgeKleur }> = {
  beschikbaar: { label: 'Beschikbaar', kleur: 'groen' },
  vol: { label: 'Vol', kleur: 'amber' },
  vertraagd: { label: 'Vertraagd', kleur: 'rood' },
}

function ExternFaseKaart({ fase }: { fase: Fase }) {
  const { data, dispatch, permissies } = useApp()
  const { toon } = useToast()
  const partij = data.externePartijen.find((e) => e.id === fase.externePartijId)
  const opties = data.externePartijen.filter((e) => e.type === (partij?.type ?? 'spuiter'))
  const doorlooptijd = werkdagenTussen(fase.start, fase.eind)

  const wissel = (id: string) => {
    if (id === fase.externePartijId) return
    dispatch({ type: 'FASE_BIJWERKEN', id: fase.id, patch: { externePartijId: id } })
    toon('succes', `Fase "${fase.naam}" toegewezen aan ${data.externePartijen.find((e) => e.id === id)?.naam ?? 'andere partij'}.`)
  }

  return (
    <Kaart>
      <KaartKop
        titel={
          <>
            <Truck size={15} className="text-purple-500" />
            {fase.naam}
          </>
        }
        rechts={
          partij ? <Badge kleur={PARTIJ_STATUS[partij.status].kleur}>{PARTIJ_STATUS[partij.status].label}</Badge> : undefined
        }
      />
      <div className="grid grid-cols-1 gap-x-8 px-4 py-1 md:grid-cols-2">
        <div>
          <Rij label="Partij">{partij?.naam ?? 'Onbekende partij'}</Rij>
          <Rij label="Type">{partij ? externTypeLabel(partij.type) : '—'}</Rij>
          <Rij label="Specialisme">{partij?.specialisme ?? '—'}</Rij>
          <Rij label="Contactpersoon">{partij?.contactpersoon ?? '—'}</Rij>
        </div>
        <div>
          <Rij label="Transport heen">{formatDatumMetDag(fase.transportHeen ?? fase.start)}</Rij>
          <Rij label="Transport terug">{formatDatumMetDag(fase.transportTerug ?? fase.eind)}</Rij>
          <Rij label="Doorlooptijd">{doorlooptijd} werkdagen</Rij>
          <Rij label="Gemelde vertraging">
            {partij && partij.vertragingDagen > 0 ? (
              <span className="font-semibold text-red-600">{partij.vertragingDagen} werkdag(en)</span>
            ) : (
              <span className="text-emerald-700">Geen</span>
            )}
          </Rij>
        </div>
      </div>
      {partij?.notities && <p className="px-4 pb-3 text-xs italic text-slate-500">{partij.notities}</p>}
      {permissies.externBeheren && fase.status !== 'gereed' && (
        <div className="border-t border-slate-100 px-4 py-3">
          <Veld label={`Andere ${partij ? externTypeLabel(partij.type).toLowerCase() : 'partij'} kiezen`}>
            <Keuze value={fase.externePartijId} onChange={(e) => wissel(e.target.value)} className="!w-80">
              {opties.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.naam} — {PARTIJ_STATUS[e.status].label}
                  {e.vertragingDagen > 0 ? `, +${e.vertragingDagen} dagen vertraging` : ''}
                </option>
              ))}
            </Keuze>
          </Veld>
        </div>
      )}
    </Kaart>
  )
}

function ExternTab({ project }: { project: Project }) {
  const { data } = useApp()
  const fases = projectFases(data, project.id).filter((f) => f.externePartijId)
  if (fases.length === 0) {
    return (
      <LegeStaat
        titel="Geen externe partijen betrokken"
        tekst="Geen enkele fase van dit project is uitbesteed aan een externe partij."
      />
    )
  }
  return (
    <div className="space-y-4">
      {fases.map((f) => (
        <ExternFaseKaart key={f.id} fase={f} />
      ))}
    </div>
  )
}

// ---------- Tab: Risico's & blokkades ----------

function RisicoTab({ project }: { project: Project }) {
  const { data } = useApp()
  const geblokkeerd = projectFases(data, project.id).filter((f) => f.status === 'geblokkeerd')
  return (
    <div className="space-y-4">
      <RisicoKaart project={project} />
      <Kaart>
        <KaartKop titel="Geblokkeerde fases" />
        <div className="p-4">
          {geblokkeerd.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 size={16} /> Geen geblokkeerde fases.
            </div>
          ) : (
            <div className="space-y-2">
              {geblokkeerd.map((f) => (
                <div
                  key={f.id}
                  className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  <OctagonAlert size={16} className="mt-0.5 shrink-0" />
                  <span>
                    <span className="font-semibold">{f.naam}</span> ({formatDatum(f.start)} – {formatDatum(f.eind)}):{' '}
                    {f.blokkadeNotitie || 'geen notitie opgegeven'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Kaart>
    </div>
  )
}

// ---------- Tab: Notities & historie (uitgelicht naar eigen component) ----------

// ---------- Hoofdscherm ----------

const TABS = [
  { id: 'overzicht', label: 'Overzicht' },
  { id: 'planning', label: 'Planning' },
  { id: 'fases', label: 'Fases & werkzaamheden' },
  { id: 'team', label: 'Team & resources' },
  { id: 'unit', label: 'Trailer en locatie' },
  { id: 'bestanden', label: 'Bestanden' },
  { id: 'extern', label: 'Externe partijen' },
  { id: 'risico', label: 'Risico’s & blokkades' },
  { id: 'historie', label: 'Notities & historie' },
]

export default function ProjectDetail() {
  const { id } = useParams()
  const { data, permissies } = useApp()
  const [tab, setTab] = useState('overzicht')
  const [orderDialoogOpen, setOrderDialoogOpen] = useState(false)
  const [verkoopModalOpen, setVerkoopModalOpen] = useState(false)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)

  const project = data.projecten.find((p) => p.id === id)

  if (!project) {
    return (
      <div className="p-6">
        <LegeStaat
          titel="Project niet gevonden"
          tekst="Dit project bestaat niet (meer) of de link is onjuist. Ga terug naar het projectoverzicht."
          actie={
            <Link to="/projecten">
              <Knop>
                <ArrowLeft size={15} /> Terug naar projecten
              </Knop>
            </Link>
          }
        />
      </div>
    )
  }

  const risico = getProjectRisico(data, project)
  const voortgang = getProjectVoortgang(data, project.id)
  const verwacht = getVerwachteOplevering(data, project.id)
  const teLaat = verwacht > project.gewensteOpleverdatum
  const templateComplexiteitNaam =
    data.complexiteitNiveaus.find((n) => n.id === project.templateComplexiteitId)?.naam ??
    project.templateComplexiteitId ??
    '—'
  const kanTemplateOpslaan = permissies.templatesBeheren || permissies.planningBewerken

  return (
    <div className="p-6">
      <Link
        to="/projecten"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-brand-700"
      >
        <ArrowLeft size={15} /> Terug naar projecten
      </Link>

      {/* Kop */}
      <div className="mb-5 mt-2 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">{project.naam}</h1>
            <span className="font-mono text-sm text-slate-400">{project.projectnummer}</span>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {project.klant} · {project.productModel}
          </div>
          {project.templateId && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <LayoutTemplate size={13} className="text-slate-400" />
                Gebaseerd op: {project.templateTrailertype ?? project.productModel} · {templateComplexiteitNaam} ·
                versie {project.templateVersie ?? 1}
              </span>
              <Badge kleur="grijs">
                Losgekoppeld van template
                <InfoTip tekst="Het project is bij het aanmaken een volledige, zelfstandige kopie van het template geworden. Wijzigingen aan het template werken niet door in dit project (en andersom)." />
              </Badge>
              {project.projectspecifiekAangepast && <Badge kleur="amber">Projectspecifiek aangepast</Badge>}
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={project.status} />
            {project.status === 'schaduw' && (
              <InfoTip tekst="Schaduwplanning: het project is nog niet bevestigd, maar de capaciteit is alvast gereserveerd zodat de planning haalbaar blijft zodra de order binnenkomt." />
            )}
            <Badge kleur={PRIO_KLEUR[project.prioriteit]}>Prioriteit: {PRIORITEIT_LABELS[project.prioriteit]}</Badge>
            <RisicoStip risico={risico} />
            {project.status === 'schaduw' && (
              <>
                <Badge kleur="brand">Verkoopkans {project.verkoopkans}%</Badge>
                {permissies.verkoopkansWijzigen && (
                  <Knop
                    klein
                    variant="ghost"
                    onClick={() => setVerkoopModalOpen(true)}
                    title="Verkoopkans en verwachte orderdatum bewerken"
                  >
                    <Pencil size={13} /> Bewerken
                  </Knop>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2.5">
          <div className="flex items-start gap-6 text-sm">
            <div className="text-right">
              <div className="text-xs text-slate-500">Gewenste oplevering</div>
              <div className="font-medium tabular-nums text-slate-800">{formatDatum(project.gewensteOpleverdatum)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Verwachte oplevering</div>
              <div className={`tabular-nums ${teLaat ? 'font-semibold text-red-600' : 'font-medium text-slate-800'}`}>
                {formatDatum(verwacht)}
              </div>
              {teLaat && (
                <div className="text-[11px] text-red-500">
                  {werkdagenTussen(project.gewensteOpleverdatum, verwacht) - 1} werkdag(en) later dan gewenst
                </div>
              )}
            </div>
          </div>
          <div className="flex w-72 items-center gap-2">
            <span className="text-xs text-slate-500">Voortgang</span>
            <VoortgangsBalk pct={voortgang} className="flex-1" />
          </div>
          {project.status === 'schaduw' && permissies.orderBevestigen && (
            <Knop variant="primary" onClick={() => setOrderDialoogOpen(true)}>
              <CheckCircle size={16} /> Order bevestigen
            </Knop>
          )}
          {kanTemplateOpslaan && (
            <Knop
              variant="secondary"
              onClick={() => setTemplateModalOpen(true)}
              title="Bewaar de huidige planning als herbruikbaar concepttemplate"
            >
              <LayoutTemplate size={15} /> Opslaan als nieuw template
            </Knop>
          )}
        </div>
      </div>

      <ProcesBalk data={data} project={project} />

      <Tabs tabs={TABS} actief={tab} onKies={setTab} />
      <div className="mt-4">
        {tab === 'overzicht' && <OverzichtTab project={project} />}
        {tab === 'planning' && <PlanningTab project={project} />}
        {tab === 'fases' && <FasesTab project={project} />}
        {tab === 'team' && <TeamResourcesTab project={project} />}
        {tab === 'unit' && <UnitLocatieTab project={project} />}
        {tab === 'bestanden' && <BestandenTab key={project.id} project={project} />}
        {tab === 'extern' && <ExternTab project={project} />}
        {tab === 'risico' && <RisicoTab project={project} />}
        {tab === 'historie' && <NotitiesHistorieTab key={project.id} project={project} />}
      </div>

      <OrderBevestigenDialog project={project} open={orderDialoogOpen} onSluiten={() => setOrderDialoogOpen(false)} />
      <VerkoopkansModal project={project} open={verkoopModalOpen} onSluiten={() => setVerkoopModalOpen(false)} />
      <OpslaanAlsTemplateModal project={project} open={templateModalOpen} onSluiten={() => setTemplateModalOpen(false)} />
    </div>
  )
}
