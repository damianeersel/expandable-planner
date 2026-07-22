// Verlof & verzuim: registraties beheren, capaciteitsimpact per team en mini-kalender.

import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Pencil,
  Plane,
  Plus,
  Thermometer,
  Trash2,
  UserMinus,
} from 'lucide-react'
import { useApp } from '../store/AppState'
import {
  AFWEZIGHEID_LABELS,
  AFWEZIGHEID_STATUS_LABELS,
  type Afwezigheid,
  type AfwezigheidStatus,
  type AfwezigheidType,
  type ISODate,
  type Medewerker,
} from '../lib/types'
import {
  addDagen,
  diffDagen,
  formatDatum,
  formatDatumKort,
  startVanWeek,
  vandaagISO,
  weekLabel,
  weekReeks,
  werkdagenTussen,
} from '../lib/dates'
import { bezettingsPct, medewerkerTeamOpDag, teamBeschikbaarInWeek, teamGeplandInWeek } from '../lib/capacity'
import { uid } from '../lib/uid'
import {
  Badge,
  BevestigDialog,
  CapaciteitsBalk,
  InfoTip,
  Invoer,
  Kaart,
  KaartKop,
  Keuze,
  Knop,
  LegeStaat,
  Modal,
  PaginaKop,
  Tekstvak,
  Tooltip,
  Veld,
  useToast,
  type BadgeKleur,
} from '../components/ui'

// ---------- Constantes ----------

type Dagdeel = Afwezigheid['dagdeel']

const DAGDEEL_LABELS: Record<Dagdeel, string> = {
  heel: 'Hele dag',
  ochtend: 'Ochtend',
  middag: 'Middag',
}

const TYPE_BADGE_KLEUREN: Record<AfwezigheidType, string> = {
  vakantie: 'bg-blue-50 text-blue-700 border-blue-200',
  ziekte: 'bg-red-50 text-red-700 border-red-200',
  kort_verzuim: 'bg-amber-50 text-amber-700 border-amber-200',
  bijzonder_verlof: 'bg-sky-50 text-sky-700 border-sky-200',
  training: 'bg-purple-50 text-purple-700 border-purple-200',
  overig: 'bg-slate-100 text-slate-600 border-slate-200',
}

const KALENDER_KLEUREN: Record<AfwezigheidType, string> = {
  vakantie: 'bg-blue-500',
  ziekte: 'bg-red-500',
  kort_verzuim: 'bg-amber-500',
  bijzonder_verlof: 'bg-sky-400',
  training: 'bg-purple-500',
  overig: 'bg-slate-400',
}

const STATUS_BADGE_KLEUR: Record<AfwezigheidStatus, BadgeKleur> = {
  concept: 'grijs',
  goedgekeurd: 'groen',
  geregistreerd: 'brand',
}

// ---------- Hulpfuncties ----------

/** Uren van een registratie: werkdagen × contracturen/5 × (heel = 1, dagdeel = 0,5), afgerond op 0,5. */
function berekenUren(m: Medewerker | undefined, van: string, tot: string, dagdeel: Dagdeel): number {
  if (!m || !van || !tot || tot < van) return 0
  const dagen = werkdagenTussen(van, tot)
  const factor = dagdeel === 'heel' ? 1 : 0.5
  return Math.round(dagen * (m.contracturen / 5) * factor * 2) / 2
}

/** '3,5' i.p.v. '3.5' (Nederlandse notatie). */
function formatUren(u: number): string {
  return String(u).replace('.', ',')
}

function TypeBadge({ type }: { type: AfwezigheidType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TYPE_BADGE_KLEUREN[type]}`}
    >
      {AFWEZIGHEID_LABELS[type]}
    </span>
  )
}

// ---------- Samenvattingstegel ----------

function Tegel({
  icoon,
  waarde,
  label,
  tip,
  kleurVlak,
}: {
  icoon: ReactNode
  waarde: number
  label: string
  tip?: string
  kleurVlak: string
}) {
  return (
    <Kaart className="flex items-center gap-3 px-4 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${kleurVlak}`}>{icoon}</div>
      <div className="min-w-0">
        <div className="text-xl font-semibold tabular-nums text-slate-900">{waarde}</div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <span className="truncate">{label}</span>
          {tip && <InfoTip tekst={tip} />}
        </div>
      </div>
    </Kaart>
  )
}

// ---------- Capaciteitsimpact (uitklaprij) ----------

function CapaciteitsImpact({ afw }: { afw: Afwezigheid }) {
  const { data } = useApp()
  const m = data.medewerkers.find((x) => x.id === afw.medewerkerId)
  if (!m) return <p className="text-xs text-slate-500">Medewerker niet gevonden.</p>

  const teamId = medewerkerTeamOpDag(m, afw.van)
  const team = teamId ? data.teams.find((t) => t.id === teamId) : undefined

  if (!team) {
    return (
      <p className="text-xs text-slate-500">
        {m.naam} is niet aan een team gekoppeld; deze afwezigheid heeft geen directe impact op de teamcapaciteit.
      </p>
    )
  }

  const aantalWeken = Math.floor(diffDagen(startVanWeek(afw.van), startVanWeek(afw.tot)) / 7) + 1
  const weken = weekReeks(afw.van, Math.min(aantalWeken, 8))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        Capaciteitsimpact — {team.naam} · teambezetting (definitief)
        <InfoTip tekst="Beschikbare capaciteit = contracturen × beschikbaarheid − goedgekeurde en geregistreerde afwezigheid. Bezetting boven 100% betekent overboeking: er zijn meer uren definitief gepland dan het team beschikbaar heeft." />
      </div>
      {afw.status === 'concept' && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle size={13} className="shrink-0" />
          Deze registratie staat op concept en telt nog niet mee in de beschikbare capaciteit.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {weken.map((week) => {
          const beschikbaar = teamBeschikbaarInWeek(data, team.id, week)
          const gepland = teamGeplandInWeek(data, team.id, week).definitief
          const pct = bezettingsPct(beschikbaar, gepland)
          return (
            <div key={week} className="flex flex-wrap items-center gap-3 text-xs">
              <span className="w-12 shrink-0 font-medium text-slate-700">{weekLabel(week)}</span>
              <span className="w-28 shrink-0 text-slate-500">
                {formatDatumKort(week)} – {formatDatumKort(addDagen(week, 4))}
              </span>
              <span className="w-44 shrink-0 tabular-nums text-slate-500">
                {Math.round(gepland)} u gepland / {Math.round(beschikbaar)} u beschikbaar
              </span>
              <CapaciteitsBalk pct={pct} className="w-44 shrink-0" />
              {pct > 100 ? (
                <span className="flex items-center gap-1 font-medium text-red-600">
                  <AlertTriangle size={13} className="shrink-0" />
                  Team {team.naam} komt deze week capaciteit tekort (overboekt)
                </span>
              ) : pct >= 85 ? (
                <span className="flex items-center gap-1 font-medium text-amber-600">
                  <AlertTriangle size={13} className="shrink-0" />
                  Team {team.naam} komt deze week capaciteit tekort
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
      {aantalWeken > 8 && (
        <p className="text-[11px] text-slate-400">Alleen de eerste 8 weken van deze afwezigheid worden getoond.</p>
      )}
    </div>
  )
}

// ---------- Mini-kalender ----------

function MiniKalender() {
  const { data } = useApp()
  const vandaag = vandaagISO()
  const weken = weekReeks(vandaag, 4)
  const dagen: ISODate[] = weken.flatMap((w) => [0, 1, 2, 3, 4].map((i) => addDagen(w, i)))
  const start = dagen[0]
  const eind = dagen[dagen.length - 1]

  const rijen = data.medewerkers
    .filter((m) => data.afwezigheid.some((a) => a.medewerkerId === m.id && a.van <= eind && a.tot >= start))
    .sort((a, b) => a.naam.localeCompare(b.naam))

  return (
    <Kaart>
      <KaartKop
        titel="Komende 4 weken"
        uitleg="Afwezigheid per medewerker voor de komende vier weken (werkdagen ma t/m vr). Conceptregistraties worden transparant getoond."
      />
      <div className="overflow-x-auto p-4">
        {rijen.length === 0 ? (
          <LegeStaat titel="Geen afwezigheid in de komende 4 weken" tekst="Zodra er verlof of verzuim in deze periode is geregistreerd, verschijnt het hier." />
        ) : (
          <div className="min-w-[820px]">
            {/* Kop met weeknummers */}
            <div className="mb-1.5 flex items-center gap-1.5">
              <div className="w-44 shrink-0" />
              {weken.map((w) => (
                <div key={w} className="flex-1 text-center">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{weekLabel(w)}</div>
                  <div className="text-[11px] text-slate-400">
                    {formatDatumKort(w)} – {formatDatumKort(addDagen(w, 4))}
                  </div>
                </div>
              ))}
            </div>
            {/* Rijen per medewerker */}
            <div className="flex flex-col gap-1">
              {rijen.map((m) => {
                const teamId = medewerkerTeamOpDag(m, vandaag)
                const team = teamId ? data.teams.find((t) => t.id === teamId) : undefined
                return (
                  <div key={m.id} className="flex items-center gap-1.5">
                    <div className="w-44 shrink-0 leading-tight">
                      <div className="truncate text-xs font-medium text-slate-700">{m.naam}</div>
                      <div className="truncate text-[11px] text-slate-400">{team?.naam ?? 'Geen team'}</div>
                    </div>
                    {weken.map((w) => (
                      <div key={w} className="grid flex-1 grid-cols-5 gap-0.5">
                        {[0, 1, 2, 3, 4].map((i) => {
                          const dag = addDagen(w, i)
                          const afw = data.afwezigheid.find(
                            (a) => a.medewerkerId === m.id && dag >= a.van && dag <= a.tot,
                          )
                          const isVandaag = dag === vandaag
                          return (
                            <div
                              key={dag}
                              className={`relative h-6 rounded-sm ${
                                isVandaag ? 'bg-brand-50 ring-1 ring-inset ring-brand-500' : 'bg-slate-50'
                              }`}
                              title={
                                afw
                                  ? `${m.naam} · ${AFWEZIGHEID_LABELS[afw.type]} · ${formatDatum(afw.van)} t/m ${formatDatum(afw.tot)} · ${DAGDEEL_LABELS[afw.dagdeel]}${afw.status === 'concept' ? ' · nog concept' : ''}${afw.notitie ? ` · ${afw.notitie}` : ''}`
                                  : isVandaag
                                    ? `Vandaag · ${formatDatum(dag)}`
                                    : formatDatum(dag)
                              }
                            >
                              {afw && (
                                <span
                                  className={`absolute rounded-sm ${KALENDER_KLEUREN[afw.type]} ${
                                    afw.status === 'concept' ? 'opacity-40' : ''
                                  } ${
                                    afw.dagdeel === 'heel'
                                      ? 'inset-0.5'
                                      : afw.dagdeel === 'ochtend'
                                        ? 'inset-x-0.5 top-0.5 bottom-1/2'
                                        : 'inset-x-0.5 top-1/2 bottom-0.5'
                                  }`}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            {/* Legenda */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              {(Object.keys(AFWEZIGHEID_LABELS) as AfwezigheidType[]).map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-sm ${KALENDER_KLEUREN[t]}`} />
                  {AFWEZIGHEID_LABELS[t]}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-brand-50 ring-1 ring-inset ring-brand-500" />
                Vandaag
              </span>
            </div>
          </div>
        )}
      </div>
    </Kaart>
  )
}

// ---------- Formulier (modal) ----------

interface AfwForm {
  medewerkerId: string
  type: AfwezigheidType
  van: string
  tot: string
  dagdeel: Dagdeel
  status: AfwezigheidStatus
  notitie: string
}

const LEEG_FORM: AfwForm = {
  medewerkerId: '',
  type: 'vakantie',
  van: '',
  tot: '',
  dagdeel: 'heel',
  status: 'goedgekeurd',
  notitie: '',
}

// ---------- Hoofdscherm ----------

export default function Verlof() {
  const { data, dispatch, persona, permissies } = useApp()
  const { toon } = useToast()
  const vandaag = vandaagISO()

  // Filters
  const [filterType, setFilterType] = useState<'alle' | AfwezigheidType>('alle')
  const [filterStatus, setFilterStatus] = useState<'alle' | AfwezigheidStatus>('alle')
  const [filterMedewerker, setFilterMedewerker] = useState('alle')
  const [alleenToekomstig, setAlleenToekomstig] = useState(false)

  // Uitklaprij, modal & verwijderen
  const [openImpactId, setOpenImpactId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [bewerkId, setBewerkId] = useState<string | null>(null)
  const [form, setForm] = useState<AfwForm>(LEEG_FORM)
  const [fouten, setFouten] = useState<Record<string, string>>({})
  const [verwijderId, setVerwijderId] = useState<string | null>(null)

  const medewerkerVan = (id: string) => data.medewerkers.find((m) => m.id === id)
  const teamVan = (afw: { medewerkerId: string; van: ISODate }) => {
    const m = medewerkerVan(afw.medewerkerId)
    const teamId = m ? medewerkerTeamOpDag(m, afw.van) : undefined
    return teamId ? data.teams.find((t) => t.id === teamId) : undefined
  }

  /** Productieleider mag alleen registraties van medewerkers uit de eigen afdeling beheren. */
  const magBeherenVoor = (m?: Medewerker) =>
    permissies.verlofBeheren && (persona.rol !== 'productieleider' || (!!m && m.afdeling === persona.afdeling))

  // ---------- Samenvattingstegels ----------
  const eindVierWeken = addDagen(startVanWeek(vandaag), 27)
  const afwezigVandaag = new Set(
    data.afwezigheid
      .filter((a) => a.status !== 'concept' && a.van <= vandaag && a.tot >= vandaag)
      .map((a) => a.medewerkerId),
  ).size
  const ziekActief = data.afwezigheid.filter(
    (a) => a.type === 'ziekte' && a.status !== 'concept' && a.van <= vandaag && a.tot >= vandaag,
  ).length
  const vakantiesKomend = data.afwezigheid.filter(
    (a) => a.type === 'vakantie' && a.status === 'goedgekeurd' && a.van <= eindVierWeken && a.tot >= vandaag,
  ).length
  const concepten = data.afwezigheid.filter((a) => a.status === 'concept').length

  // ---------- Tabelrijen (gefilterd + gesorteerd) ----------
  const rijen = useMemo(() => {
    const lijst = data.afwezigheid.filter((a) => {
      if (filterType !== 'alle' && a.type !== filterType) return false
      if (filterStatus !== 'alle' && a.status !== filterStatus) return false
      if (filterMedewerker !== 'alle' && a.medewerkerId !== filterMedewerker) return false
      if (alleenToekomstig && a.tot < vandaag) return false
      return true
    })
    const actueel = lijst.filter((a) => a.tot >= vandaag).sort((a, b) => (a.van < b.van ? -1 : a.van > b.van ? 1 : 0))
    const verleden = lijst.filter((a) => a.tot < vandaag).sort((a, b) => (a.van > b.van ? -1 : a.van < b.van ? 1 : 0))
    return [...actueel, ...verleden]
  }, [data.afwezigheid, filterType, filterStatus, filterMedewerker, alleenToekomstig, vandaag])

  const medewerkersGesorteerd = [...data.medewerkers].sort((a, b) => a.naam.localeCompare(b.naam))

  /** Medewerkers die in de modal gekozen mogen worden (productieleider: alleen eigen afdeling). */
  const kiesbareMedewerkers = medewerkersGesorteerd.filter(
    (m) => m.actief && (persona.rol !== 'productieleider' || m.afdeling === persona.afdeling),
  )

  // ---------- Acties ----------

  const openNieuw = () => {
    setBewerkId(null)
    setForm({ ...LEEG_FORM, van: vandaag, tot: vandaag })
    setFouten({})
    setModalOpen(true)
  }

  const openBewerken = (afw: Afwezigheid) => {
    setBewerkId(afw.id)
    setForm({
      medewerkerId: afw.medewerkerId,
      type: afw.type,
      van: afw.van,
      tot: afw.tot,
      dagdeel: afw.dagdeel,
      status: afw.status,
      notitie: afw.notitie ?? '',
    })
    setFouten({})
    setModalOpen(true)
  }

  const opslaan = () => {
    const f: Record<string, string> = {}
    if (!form.medewerkerId) f.medewerker = 'Kies een medewerker.'
    if (!form.van) f.van = 'Vul een startdatum in.'
    if (!form.tot) f.tot = 'Vul een einddatum in.'
    if (form.van && form.tot && form.tot < form.van) f.tot = 'De einddatum moet op of na de startdatum liggen.'
    setFouten(f)
    if (Object.keys(f).length > 0) {
      toon('fout', 'Controleer de rood gemarkeerde velden.')
      return
    }

    const patch = {
      medewerkerId: form.medewerkerId,
      type: form.type,
      van: form.van,
      tot: form.tot,
      dagdeel: form.dagdeel,
      status: form.status,
      notitie: form.notitie.trim() || undefined,
    }
    if (bewerkId) {
      dispatch({ type: 'AFWEZIGHEID_BIJWERKEN', id: bewerkId, patch })
    } else {
      dispatch({ type: 'AFWEZIGHEID_TOEVOEGEN', afwezigheid: { id: uid('afw'), ...patch } })
    }

    const team = teamVan({ medewerkerId: form.medewerkerId, van: form.van })
    if (form.status === 'concept') {
      toon('succes', 'Registratie opgeslagen als concept. Deze telt nog niet mee in de capaciteit.')
    } else if (team) {
      toon('succes', `Registratie opgeslagen. Capaciteit van ${team.naam} is direct bijgewerkt.`)
    } else {
      toon('succes', 'Registratie opgeslagen.')
    }
    setModalOpen(false)
  }

  const wijzigStatus = (afw: Afwezigheid, status: AfwezigheidStatus) => {
    if (status === afw.status) return
    dispatch({ type: 'AFWEZIGHEID_BIJWERKEN', id: afw.id, patch: { status } })
    const team = teamVan(afw)
    toon(
      'succes',
      team
        ? `Status gewijzigd naar "${AFWEZIGHEID_STATUS_LABELS[status]}". Capaciteit van ${team.naam} is direct bijgewerkt.`
        : `Status gewijzigd naar "${AFWEZIGHEID_STATUS_LABELS[status]}".`,
    )
  }

  const verwijderen = () => {
    if (!verwijderId) return
    const afw = data.afwezigheid.find((a) => a.id === verwijderId)
    const team = afw ? teamVan(afw) : undefined
    dispatch({ type: 'AFWEZIGHEID_VERWIJDEREN', id: verwijderId })
    toon(
      'succes',
      team ? `Registratie verwijderd. Capaciteit van ${team.naam} is direct bijgewerkt.` : 'Registratie verwijderd.',
    )
    setVerwijderId(null)
  }

  const teVerwijderen = verwijderId ? data.afwezigheid.find((a) => a.id === verwijderId) : undefined
  const formMedewerker = medewerkerVan(form.medewerkerId)
  const formUren = berekenUren(formMedewerker, form.van, form.tot, form.dagdeel)
  const formWerkdagen = form.van && form.tot && form.tot >= form.van ? werkdagenTussen(form.van, form.tot) : 0
  const geenResultaten = rijen.length === 0
  const filtersActief =
    filterType !== 'alle' || filterStatus !== 'alle' || filterMedewerker !== 'alle' || alleenToekomstig

  return (
    <div className="p-6">
      <PaginaKop
        titel="Verlof & verzuim"
        uitleg="Registreer vakantie, ziekte en overige afwezigheid en zie direct de impact op de beschikbare teamcapaciteit."
        rechts={
          permissies.verlofBeheren ? (
            <Knop variant="primary" onClick={openNieuw}>
              <Plus size={16} />
              Nieuwe registratie
            </Knop>
          ) : undefined
        }
      />

      {/* Samenvattingstegels */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tegel
          icoon={<UserMinus size={18} className="text-slate-600" />}
          waarde={afwezigVandaag}
          label="Afwezig vandaag"
          kleurVlak="bg-slate-100"
        />
        <Tegel
          icoon={<Thermometer size={18} className="text-red-600" />}
          waarde={ziekActief}
          label="Ziekmeldingen actief"
          kleurVlak="bg-red-50"
        />
        <Tegel
          icoon={<Plane size={18} className="text-blue-600" />}
          waarde={vakantiesKomend}
          label="Goedgekeurde vakanties komende 4 weken"
          kleurVlak="bg-blue-50"
        />
        <Tegel
          icoon={<ClipboardList size={18} className="text-amber-600" />}
          waarde={concepten}
          label="Registraties in concept"
          tip="Conceptregistraties tellen nog niet mee in de beschikbare capaciteit; pas na goedkeuring of registratie wordt de teamcapaciteit verlaagd."
          kleurVlak="bg-amber-50"
        />
      </div>

      {/* Registratietabel */}
      <Kaart className="mb-5">
        <KaartKop
          titel="Alle registraties"
          uitleg="Aankomende en lopende registraties staan bovenaan; afgeronde registraties worden gedimd weergegeven. Klap een rij uit voor de capaciteitsimpact op het team."
          rechts={<span className="text-xs text-slate-400">{rijen.length} registratie(s)</span>}
        />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 px-4 py-2.5">
          <Keuze
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'alle' | AfwezigheidType)}
            className="!w-auto !py-1 !text-xs"
            title="Filter op type"
          >
            <option value="alle">Alle typen</option>
            {(Object.keys(AFWEZIGHEID_LABELS) as AfwezigheidType[]).map((t) => (
              <option key={t} value={t}>
                {AFWEZIGHEID_LABELS[t]}
              </option>
            ))}
          </Keuze>
          <Keuze
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'alle' | AfwezigheidStatus)}
            className="!w-auto !py-1 !text-xs"
            title="Filter op status"
          >
            <option value="alle">Alle statussen</option>
            {(Object.keys(AFWEZIGHEID_STATUS_LABELS) as AfwezigheidStatus[]).map((s) => (
              <option key={s} value={s}>
                {AFWEZIGHEID_STATUS_LABELS[s]}
              </option>
            ))}
          </Keuze>
          <Keuze
            value={filterMedewerker}
            onChange={(e) => setFilterMedewerker(e.target.value)}
            className="!w-auto !py-1 !text-xs"
            title="Filter op medewerker"
          >
            <option value="alle">Alle medewerkers</option>
            {medewerkersGesorteerd.map((m) => (
              <option key={m.id} value={m.id}>
                {m.naam}
              </option>
            ))}
          </Keuze>
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={alleenToekomstig}
              onChange={(e) => setAlleenToekomstig(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-700"
            />
            Alleen lopend & toekomstig
          </label>
        </div>

        {geenResultaten ? (
          <div className="p-4">
            <LegeStaat
              titel={filtersActief ? 'Geen registraties voor deze filters' : 'Nog geen registraties'}
              tekst={
                filtersActief
                  ? 'Pas de filters aan om meer registraties te zien.'
                  : 'Voeg een eerste verlof- of verzuimregistratie toe.'
              }
              actie={
                filtersActief ? (
                  <Knop
                    klein
                    onClick={() => {
                      setFilterType('alle')
                      setFilterStatus('alle')
                      setFilterMedewerker('alle')
                      setAlleenToekomstig(false)
                    }}
                  >
                    Filters wissen
                  </Knop>
                ) : permissies.verlofBeheren ? (
                  <Knop klein variant="primary" onClick={openNieuw}>
                    <Plus size={14} />
                    Nieuwe registratie
                  </Knop>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Medewerker</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Van</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Tot</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Dagdeel</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Uren</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Notitie</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Acties</th>
                </tr>
              </thead>
              <tbody>
                {rijen.map((afw) => {
                  const m = medewerkerVan(afw.medewerkerId)
                  const team = teamVan(afw)
                  const verleden = afw.tot < vandaag
                  const uren = berekenUren(m, afw.van, afw.tot, afw.dagdeel)
                  const open = openImpactId === afw.id
                  const magBeheren = magBeherenVoor(m)
                  return (
                    <FragmentRij key={afw.id}>
                      <tr className={`border-b border-slate-100 hover:bg-slate-50 ${verleden ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setOpenImpactId(open ? null : afw.id)}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            title="Capaciteitsimpact tonen"
                          >
                            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-800">{m?.naam ?? 'Onbekend'}</div>
                          <div className="text-xs text-slate-400">{team?.naam ?? 'Geen team'}</div>
                        </td>
                        <td className="px-3 py-2">
                          <TypeBadge type={afw.type} />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums text-slate-600">{formatDatum(afw.van)}</td>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums text-slate-600">{formatDatum(afw.tot)}</td>
                        <td className="px-3 py-2 text-slate-600">{DAGDEEL_LABELS[afw.dagdeel]}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatUren(uren)} u</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col items-start gap-1">
                            <Badge kleur={STATUS_BADGE_KLEUR[afw.status]}>{AFWEZIGHEID_STATUS_LABELS[afw.status]}</Badge>
                            {magBeheren && (
                              <Keuze
                                value={afw.status}
                                onChange={(e) => wijzigStatus(afw, e.target.value as AfwezigheidStatus)}
                                className="!w-auto !px-1.5 !py-0.5 !text-[11px]"
                                title="Status wijzigen"
                              >
                                {(Object.keys(AFWEZIGHEID_STATUS_LABELS) as AfwezigheidStatus[]).map((s) => (
                                  <option key={s} value={s}>
                                    {AFWEZIGHEID_STATUS_LABELS[s]}
                                  </option>
                                ))}
                              </Keuze>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {afw.notitie ? (
                            <Tooltip tekst={afw.notitie}>
                              <span className="block max-w-40 truncate">{afw.notitie}</span>
                            </Tooltip>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {magBeheren ? (
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => openBewerken(afw)}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                title="Bewerken"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                onClick={() => setVerwijderId(afw.id)}
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title="Verwijderen"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ) : (
                            <span className="block text-right text-xs text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-slate-100">
                          <td colSpan={10} className="bg-slate-50/70 px-5 py-3">
                            <CapaciteitsImpact afw={afw} />
                          </td>
                        </tr>
                      )}
                    </FragmentRij>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kaart>

      {/* Mini-kalender */}
      <MiniKalender />

      {/* Modal nieuw/bewerken */}
      <Modal
        open={modalOpen}
        titel={bewerkId ? 'Registratie bewerken' : 'Nieuwe verlofregistratie'}
        onSluiten={() => setModalOpen(false)}
        voettekst={
          <>
            <Knop onClick={() => setModalOpen(false)}>Annuleren</Knop>
            <Knop variant="primary" onClick={opslaan}>
              {bewerkId ? 'Wijzigingen opslaan' : 'Registratie opslaan'}
            </Knop>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Medewerker" verplicht fout={fouten.medewerker} className="col-span-2">
            <Keuze
              value={form.medewerkerId}
              onChange={(e) => setForm({ ...form, medewerkerId: e.target.value })}
            >
              <option value="">— Kies een medewerker —</option>
              {kiesbareMedewerkers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.naam} · {m.functie}
                </option>
              ))}
            </Keuze>
          </Veld>

          <Veld label="Type">
            <Keuze value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AfwezigheidType })}>
              {(Object.keys(AFWEZIGHEID_LABELS) as AfwezigheidType[]).map((t) => (
                <option key={t} value={t}>
                  {AFWEZIGHEID_LABELS[t]}
                </option>
              ))}
            </Keuze>
          </Veld>

          <Veld label="Dagdeel">
            <Keuze value={form.dagdeel} onChange={(e) => setForm({ ...form, dagdeel: e.target.value as Dagdeel })}>
              {(Object.keys(DAGDEEL_LABELS) as Dagdeel[]).map((d) => (
                <option key={d} value={d}>
                  {DAGDEEL_LABELS[d]}
                </option>
              ))}
            </Keuze>
          </Veld>

          <Veld label="Van" verplicht fout={fouten.van}>
            <Invoer type="date" value={form.van} onChange={(e) => setForm({ ...form, van: e.target.value })} />
          </Veld>

          <Veld label="Tot en met" verplicht fout={fouten.tot}>
            <Invoer type="date" value={form.tot} onChange={(e) => setForm({ ...form, tot: e.target.value })} />
          </Veld>

          <div>
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
              Uren (automatisch berekend)
              <InfoTip tekst="Werkdagen (ma t/m vr) × contracturen ÷ 5, bij een ochtend of middag telt elke dag voor de helft. Afgerond op 0,5 uur." />
            </span>
            <Invoer value={formMedewerker ? `${formatUren(formUren)} uur` : '—'} disabled readOnly />
            {formMedewerker && formWerkdagen > 0 && (
              <span className="mt-1 block text-[11px] text-slate-400">
                {formWerkdagen} werkdag(en) × {formatUren(Math.round((formMedewerker.contracturen / 5) * 2) / 2)} u
                {form.dagdeel !== 'heel' ? ' × 0,5' : ''}
              </span>
            )}
          </div>

          <div>
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
              Status
              <InfoTip tekst="Concept telt nog niet mee in de beschikbare capaciteit; goedgekeurde en geregistreerde afwezigheid verlaagt de teamcapaciteit direct." />
            </span>
            <Keuze value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AfwezigheidStatus })}>
              {(Object.keys(AFWEZIGHEID_STATUS_LABELS) as AfwezigheidStatus[]).map((s) => (
                <option key={s} value={s}>
                  {AFWEZIGHEID_STATUS_LABELS[s]}
                </option>
              ))}
            </Keuze>
          </div>

          <Veld label="Notitie" className="col-span-2">
            <Tekstvak
              rows={2}
              value={form.notitie}
              onChange={(e) => setForm({ ...form, notitie: e.target.value })}
              placeholder="Bijv. reden of verwachte terugkeer"
            />
          </Veld>
        </div>
      </Modal>

      {/* Verwijderbevestiging */}
      <BevestigDialog
        open={verwijderId !== null}
        titel="Registratie verwijderen?"
        tekst={
          teVerwijderen
            ? `De ${AFWEZIGHEID_LABELS[teVerwijderen.type].toLowerCase()} van ${
                medewerkerVan(teVerwijderen.medewerkerId)?.naam ?? 'onbekende medewerker'
              } (${formatDatum(teVerwijderen.van)} t/m ${formatDatum(teVerwijderen.tot)}) wordt verwijderd. De beschikbare capaciteit wordt direct bijgewerkt.`
            : undefined
        }
        bevestigLabel="Verwijderen"
        gevaarlijk
        onBevestig={verwijderen}
        onAnnuleer={() => setVerwijderId(null)}
      />
    </div>
  )
}

/** Hulpcomponent om een hoofdrij + uitklaprij samen te groeperen zonder extra DOM. */
function FragmentRij({ children }: { children: ReactNode }) {
  return <>{children}</>
}
