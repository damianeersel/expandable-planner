// Beschikbaarheidsoverzicht per medewerker: week- en maandweergave met filters,
// afwezigheden, tijdelijke beschikbaarheidsaanpassingen en de geplande taakbelasting
// vanuit de detailplanning (bezetting per medewerker).

import { Fragment, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Plus, Search, Trash2 } from 'lucide-react'
import { useApp } from '../store/AppState'
import {
  AFDELING_LABELS,
  AFWEZIGHEID_LABELS,
  PRODUCTIE_AFDELINGEN,
  type Afdeling,
  type AfwezigheidType,
  type AppData,
  type BeschikbaarheidAanpassing,
  type ISODate,
  type Medewerker,
} from '../lib/types'
import {
  addDagen,
  formatDatum,
  formatDatumKort,
  parseISO,
  startVanWeek,
  vandaagISO,
  weekNummer,
} from '../lib/dates'
import {
  bezettingsPct,
  capaciteitsNiveau,
  medewerkerAfwezigInWeek,
  medewerkerBeschikbaarInWeek,
  medewerkerPctOpDag,
  medewerkerUrenOpDag,
} from '../lib/capacity'
import { medewerkerTaakBelastingInWeek, medewerkerTaakUrenInWeek } from '../lib/taken'
import { uid } from '../lib/uid'
import {
  Badge,
  BevestigDialog,
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
} from '../components/ui'

// ---------- Hulpconstanten ----------

const DAG_NAMEN = ['ma', 'di', 'wo', 'do', 'vr']

const AFW_AFKORTING: Record<AfwezigheidType, string> = {
  vakantie: 'VAK',
  ziekte: 'ZKT',
  kort_verzuim: 'KV',
  bijzonder_verlof: 'BV',
  training: 'TRN',
  overig: 'OVG',
}

const AFW_CEL_KLEUR: Record<AfwezigheidType, string> = {
  vakantie: 'border-sky-200 bg-sky-100 text-sky-700',
  ziekte: 'border-red-200 bg-red-100 text-red-700',
  training: 'border-purple-200 bg-purple-100 text-purple-700',
  kort_verzuim: 'border-slate-300 bg-slate-200 text-slate-600',
  bijzonder_verlof: 'border-slate-300 bg-slate-200 text-slate-600',
  overig: 'border-slate-300 bg-slate-200 text-slate-600',
}

const DAGDEEL_LABEL: Record<'heel' | 'ochtend' | 'middag', string> = {
  heel: 'hele dag',
  ochtend: 'ochtend',
  middag: 'middag',
}

/** Uren met Nederlandse notatie: 8 → '8', 7.2 → '7,2'. */
function formatUren(u: number): string {
  const r = Math.round(u * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',')
}

/** Bruto beschikbare uren in een week: contracturen × beschikbaarheidspercentage (vóór afwezigheid). */
function brutoBeschikbaarInWeek(data: AppData, m: Medewerker, weekStart: ISODate): number {
  let uren = 0
  for (let i = 0; i < 5; i++) {
    uren += (m.contracturen / 5) * (medewerkerPctOpDag(data, m, addDagen(weekStart, i)) / 100)
  }
  return uren
}

// ---------- Celcomponenten ----------

function WeekCel({ data, m, datum }: { data: AppData; m: Medewerker; datum: ISODate }) {
  const uren = medewerkerUrenOpDag(data, m, datum)
  const dagContract = m.contracturen / 5
  const afwezig = data.afwezigheid.filter(
    (a) => a.medewerkerId === m.id && a.status !== 'concept' && datum >= a.van && datum <= a.tot,
  )
  const aanpassing = data.aanpassingen.find((a) => a.medewerkerId === m.id && datum >= a.van && datum <= a.tot)
  const verlaagd = aanpassing !== undefined && aanpassing.pct < m.beschikbaarheidPct

  // Volledig afwezig → gekleurd blokje met type-afkorting.
  if (uren <= 0 && afwezig.length > 0) {
    const a = afwezig[0]
    return (
      <Tooltip
        tekst={`${AFWEZIGHEID_LABELS[a.type]} (${DAGDEEL_LABEL[a.dagdeel]}) · ${formatDatum(a.van)} t/m ${formatDatum(a.tot)}${a.notitie ? ` — ${a.notitie}` : ''}`}
      >
        <span
          className={`inline-flex min-w-11 items-center justify-center rounded border px-1.5 py-0.5 text-[11px] font-semibold ${AFW_CEL_KLEUR[a.type]}`}
        >
          {AFW_AFKORTING[a.type]}
        </span>
      </Tooltip>
    )
  }

  // 0 uren zonder afwezigheid (bijv. aanpassing naar 0%).
  if (uren <= 0) {
    return (
      <Tooltip
        tekst={
          verlaagd && aanpassing
            ? `Tijdelijk ${aanpassing.pct}% beschikbaar — ${aanpassing.reden}`
            : 'Geen beschikbare uren op deze dag'
        }
      >
        <span className="inline-flex min-w-11 justify-center rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 tabular-nums">
          0
        </span>
      </Tooltip>
    )
  }

  // Volledig beschikbaar volgens het eigen (structurele) percentage.
  const vol = afwezig.length === 0 && !verlaagd && uren >= dagContract * (m.beschikbaarheidPct / 100) - 0.01
  if (vol) {
    return (
      <span className="inline-flex min-w-11 justify-center rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800 tabular-nums">
        {formatUren(uren)}
      </span>
    )
  }

  // Gedeeltelijk beschikbaar (halve dag afwezig en/of tijdelijke aanpassing).
  const delen: string[] = []
  for (const a of afwezig) delen.push(`${AFWEZIGHEID_LABELS[a.type]} (${DAGDEEL_LABEL[a.dagdeel]})`)
  if (verlaagd && aanpassing) delen.push(`Tijdelijk ${aanpassing.pct}% beschikbaar — ${aanpassing.reden}`)
  if (delen.length === 0) delen.push('Gedeeltelijk beschikbaar')
  return (
    <Tooltip tekst={`${formatUren(uren)} van ${formatUren(dagContract)} uur beschikbaar · ${delen.join(' · ')}`}>
      <span className="inline-flex min-w-11 justify-center rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 tabular-nums">
        {formatUren(uren)}
      </span>
    </Tooltip>
  )
}

/** Geplande taakuren in een week, met tooltip die de bijdragende taken toont (PR-nummer · taak · uren). */
function GeplandCel({ data, m, weekStart }: { data: AppData; m: Medewerker; weekStart: ISODate }) {
  const details = medewerkerTaakBelastingInWeek(data, m.id, weekStart)
  const totaal = details.reduce((s, d) => s + d.uren, 0)
  if (totaal <= 0) return <span className="text-slate-300">—</span>
  const zichtbaar = details.slice(0, 6)
  const rest = details.length - zichtbaar.length
  return (
    <Tooltip
      tekst={
        <span className="block max-w-80">
          {zichtbaar.map((d) => {
            const project = data.projecten.find((p) => p.id === d.plek.fase.projectId)
            return (
              <span key={d.plek.taak.id} className="block">
                • {project?.projectnummer ?? '—'} · {d.plek.taak.naam} · {formatUren(d.uren)} u
                {d.schaduw ? ' (schaduw)' : ''}
              </span>
            )
          })}
          {rest > 0 && <span className="block">… en {rest} andere {rest === 1 ? 'taak' : 'taken'}</span>}
        </span>
      }
    >
      <span className="tabular-nums text-slate-600 underline decoration-dotted decoration-slate-300 underline-offset-2">
        {formatUren(totaal)}
      </span>
    </Tooltip>
  )
}

/** Bezettingsbadge: geplande taakuren t.o.v. netto beschikbare uren (<85% ok · 85–100% druk · >100% overboekt). */
function BezettingBadge({ beschikbaar, gepland }: { beschikbaar: number; gepland: number }) {
  if (gepland <= 0) return <span className="text-xs text-slate-300">—</span>
  const pct = bezettingsPct(beschikbaar, gepland)
  const niveau = capaciteitsNiveau(pct)
  const stijl =
    niveau === 'overboekt'
      ? 'bg-red-50 text-red-700'
      : niveau === 'druk'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-emerald-50 text-emerald-800'
  const label = beschikbaar <= 0 ? '—' : pct > 400 ? '>400%' : `${pct}%`
  return (
    <Tooltip
      tekst={
        beschikbaar <= 0
          ? `${formatUren(gepland)} uur aan taken gepland, maar geen beschikbare uren`
          : `${formatUren(gepland)} uur aan taken gepland t.o.v. ${formatUren(beschikbaar)} uur netto beschikbaar${
              niveau === 'overboekt' ? ' — overboekt' : niveau === 'druk' ? ' — hoge bezetting' : ''
            }`
      }
    >
      <span className={`inline-flex min-w-12 justify-center rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${stijl}`}>
        {label}
      </span>
    </Tooltip>
  )
}

function MaandCel({ data, m, weekStart }: { data: AppData; m: Medewerker; weekStart: ISODate }) {
  const netto = medewerkerBeschikbaarInWeek(data, m.id, weekStart)
  const gepland = medewerkerTaakUrenInWeek(data, m.id, weekStart)
  const ratio = m.contracturen > 0 ? netto / m.contracturen : 0
  const weekEind = addDagen(weekStart, 4)

  if (netto <= 0) {
    const redenen: string[] = []
    for (const a of data.afwezigheid) {
      if (a.medewerkerId !== m.id || a.status === 'concept') continue
      if (a.van <= weekEind && a.tot >= weekStart) redenen.push(AFWEZIGHEID_LABELS[a.type])
    }
    const aanpassing = data.aanpassingen.find(
      (a) => a.medewerkerId === m.id && a.pct === 0 && a.van <= weekEind && a.tot >= weekStart,
    )
    if (aanpassing) redenen.push(`tijdelijke aanpassing 0% (${aanpassing.reden})`)
    return (
      <Tooltip
        tekst={`Geen beschikbare uren deze week${redenen.length > 0 ? `: ${[...new Set(redenen)].join(', ')}` : ''}${
          gepland > 0 ? ` · let op: wel ${formatUren(gepland)} uur aan taken gepland` : ''
        }`}
      >
        <span
          className={`inline-flex min-w-12 justify-center rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700 tabular-nums ${
            gepland > 0 ? 'ring-1 ring-red-400' : ''
          }`}
        >
          0
        </span>
      </Tooltip>
    )
  }

  const tint =
    ratio >= 0.9
      ? 'bg-emerald-50 text-emerald-800'
      : ratio >= 0.5
        ? 'bg-amber-50 text-amber-800'
        : 'bg-rose-50 text-rose-700'
  const overboekt = gepland > netto
  return (
    <Tooltip
      tekst={`${formatUren(netto)} van ${m.contracturen} contracturen (${Math.round(ratio * 100)}%)${
        gepland > 0
          ? ` · ${formatUren(gepland)} uur aan taken gepland${overboekt ? ' — meer dan beschikbaar' : ''}`
          : ''
      }`}
    >
      <span
        className={`inline-flex min-w-12 justify-center rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${tint} ${
          overboekt ? 'ring-1 ring-red-400' : ''
        }`}
      >
        {formatUren(netto)}
      </span>
    </Tooltip>
  )
}

// ---------- Legenda ----------

function LegendaItem({ kleur, label }: { kleur: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3.5 w-3.5 shrink-0 rounded border ${kleur}`} />
      {label}
    </span>
  )
}

// ---------- Formulier ----------

interface AanpassingForm {
  medewerkerId: string
  van: string
  tot: string
  pct: string
  reden: string
}

function leegForm(): AanpassingForm {
  return { medewerkerId: '', van: vandaagISO(), tot: '', pct: '80', reden: '' }
}

// ---------- Hoofdscherm ----------

export default function Beschikbaarheid() {
  const { data, dispatch, permissies, persona } = useApp()
  const { toon } = useToast()

  const vandaag = vandaagISO()
  const huidigeWeekStart = startVanWeek(vandaag)

  const [weergave, setWeergave] = useState<'week' | 'maand'>('week')
  const [weekStart, setWeekStart] = useState<ISODate>(huidigeWeekStart)
  const [afdelingFilter, setAfdelingFilter] = useState<'alle' | Afdeling>('alle')
  const [teamFilter, setTeamFilter] = useState('alle')
  const [zoek, setZoek] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<AanpassingForm>(leegForm)
  const [fouten, setFouten] = useState<Partial<Record<keyof AanpassingForm, string>>>({})
  const [teVerwijderen, setTeVerwijderen] = useState<BeschikbaarheidAanpassing | null>(null)

  const kanBewerken = permissies.teamsBeheren

  // ---------- Periode ----------

  const stap = weergave === 'week' ? 7 : 28
  const dagen = useMemo(() => [0, 1, 2, 3, 4].map((i) => addDagen(weekStart, i)), [weekStart])
  const weekStarts = useMemo(() => [0, 1, 2, 3].map((i) => addDagen(weekStart, i * 7)), [weekStart])
  const periodeEind = weergave === 'week' ? addDagen(weekStart, 4) : addDagen(weekStarts[3], 4)

  const periodeLabel =
    weergave === 'week'
      ? `Wk ${weekNummer(weekStart)} · ${formatDatumKort(weekStart)} – ${formatDatumKort(periodeEind)} ${parseISO(periodeEind).getFullYear()}`
      : `Wk ${weekNummer(weekStart)} – Wk ${weekNummer(weekStarts[3])} · ${formatDatumKort(weekStart)} – ${formatDatumKort(periodeEind)} ${parseISO(periodeEind).getFullYear()}`

  // ---------- Filters & groepen ----------

  const teamOpties = useMemo(
    () =>
      data.teams
        .filter((t) => afdelingFilter === 'alle' || t.afdeling === afdelingFilter)
        .slice()
        .sort((a, b) => a.naam.localeCompare(b.naam)),
    [data.teams, afdelingFilter],
  )

  const groepen = useMemo(() => {
    const zoekTekst = zoek.trim().toLowerCase()
    const matchZoek = (m: Medewerker) => zoekTekst === '' || m.naam.toLowerCase().includes(zoekTekst)
    const afdIndex = (a: Afdeling) => {
      const i = PRODUCTIE_AFDELINGEN.indexOf(a)
      return i === -1 ? 99 : i
    }

    const teams = data.teams
      .filter((t) => afdelingFilter === 'alle' || t.afdeling === afdelingFilter)
      .filter((t) => teamFilter === 'alle' || t.id === teamFilter)
      .slice()
      .sort((a, b) => afdIndex(a.afdeling) - afdIndex(b.afdeling) || a.naam.localeCompare(b.naam))

    const resultaat = teams
      .map((t) => ({
        id: t.id,
        label: t.naam,
        leden: data.medewerkers
          .filter((m) => m.actief && m.teamId === t.id && matchZoek(m))
          .slice()
          .sort((a, b) => a.naam.localeCompare(b.naam)),
      }))
      .filter((g) => g.leden.length > 0)

    // Medewerkers zonder vast team (bijv. productieleiders) — alleen zonder specifiek teamfilter.
    if (teamFilter === 'alle') {
      const los = data.medewerkers
        .filter(
          (m) =>
            m.actief && !m.teamId && (afdelingFilter === 'alle' || m.afdeling === afdelingFilter) && matchZoek(m),
        )
        .slice()
        .sort((a, b) => a.naam.localeCompare(b.naam))
      if (los.length > 0) resultaat.push({ id: 'zonder-team', label: 'Zonder vast team', leden: los })
    }

    return resultaat
  }, [data.teams, data.medewerkers, afdelingFilter, teamFilter, zoek])

  const aantalMedewerkers = groepen.reduce((s, g) => s + g.leden.length, 0)

  const teamNaam = (id?: string) => data.teams.find((t) => t.id === id)?.naam
  const medewerkerNaam = (id: string) => data.medewerkers.find((m) => m.id === id)?.naam ?? 'Onbekende medewerker'

  // ---------- Actieve & geplande aanpassingen ----------

  const actieveAanpassingen = useMemo(
    () =>
      data.aanpassingen
        .filter((a) => a.tot >= vandaag)
        .slice()
        .sort((a, b) => (a.van === b.van ? a.tot.localeCompare(b.tot) : a.van.localeCompare(b.van))),
    [data.aanpassingen, vandaag],
  )

  // ---------- Modal-acties ----------

  const openModal = () => {
    setForm(leegForm())
    setFouten({})
    setModalOpen(true)
  }

  const sluitModal = () => {
    setModalOpen(false)
    setFouten({})
  }

  const opslaan = () => {
    const f: Partial<Record<keyof AanpassingForm, string>> = {}
    if (!form.medewerkerId) f.medewerkerId = 'Kies een medewerker.'
    if (!form.van) f.van = 'Vul een startdatum in.'
    if (!form.tot) f.tot = 'Vul een einddatum in.'
    else if (form.van && form.tot < form.van) f.tot = 'De einddatum moet op of na de startdatum liggen.'
    const pctNum = Number(form.pct)
    if (form.pct.trim() === '' || Number.isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
      f.pct = 'Vul een percentage tussen 0 en 100 in.'
    }
    if (!form.reden.trim()) f.reden = 'Vul een reden in.'
    if (form.medewerkerId && form.van && form.tot && form.tot >= form.van) {
      const overlappend = data.aanpassingen.find(
        (a) => a.medewerkerId === form.medewerkerId && form.van <= a.tot && form.tot >= a.van,
      )
      if (overlappend) {
        f.van = `Deze periode overlapt met een bestaande aanpassing (${formatDatum(overlappend.van)} t/m ${formatDatum(overlappend.tot)}, ${overlappend.pct}%). Verwijder die eerst of kies een andere periode.`
      }
    }
    setFouten(f)
    if (Object.keys(f).length > 0) {
      toon('fout', 'De aanpassing kan nog niet worden opgeslagen: controleer de gemarkeerde velden.')
      return
    }
    dispatch({
      type: 'AANPASSING_TOEVOEGEN',
      aanpassing: {
        id: uid('aan'),
        medewerkerId: form.medewerkerId,
        van: form.van,
        tot: form.tot,
        pct: Math.round(pctNum),
        reden: form.reden.trim(),
      },
    })
    toon('succes', `Aanpassing voor ${medewerkerNaam(form.medewerkerId)} opgeslagen — de beschikbare capaciteit is direct bijgewerkt.`)
    sluitModal()
  }

  const verwijderAanpassing = () => {
    if (!teVerwijderen) return
    dispatch({ type: 'AANPASSING_VERWIJDEREN', id: teVerwijderen.id })
    toon('succes', `Aanpassing voor ${medewerkerNaam(teVerwijderen.medewerkerId)} verwijderd — de capaciteit is direct opnieuw berekend.`)
    setTeVerwijderen(null)
  }

  /** Mag de huidige persona aanpassingen voor deze medewerker beheren? (PL: alleen eigen afdeling) */
  const magBeherenVoor = (medewerkerId: string): boolean => {
    if (!kanBewerken) return false
    if (persona.rol !== 'productieleider') return true
    const mw = data.medewerkers.find((m) => m.id === medewerkerId)
    return mw?.afdeling === persona.afdeling
  }

  const actieveMedewerkers = useMemo(
    () =>
      data.medewerkers
        .filter((m) => m.actief)
        .filter((m) => persona.rol !== 'productieleider' || m.afdeling === persona.afdeling)
        .slice()
        .sort((a, b) => a.naam.localeCompare(b.naam)),
    [data.medewerkers, persona],
  )

  // ---------- Rendering ----------

  return (
    <div className="p-6">
      <PaginaKop
        titel="Beschikbaarheid"
        uitleg="Netto inzetbare uren per medewerker — inclusief verlof, verzuim en tijdelijke aanpassingen — afgezet tegen de geplande taakuren uit de detailplanning."
        rechts={
          kanBewerken ? (
            <Knop variant="primary" onClick={openModal}>
              <Plus size={16} /> Beschikbaarheid aanpassen
            </Knop>
          ) : undefined
        }
      />

      {/* Bedieningsbalk */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-slate-300 shadow-sm">
          {(['week', 'maand'] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWeergave(w)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                weergave === w ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {w === 'week' ? 'Week' : 'Maand'}
            </button>
          ))}
        </div>

        <div className="ml-1 flex items-center gap-1">
          <Knop
            klein
            title={weergave === 'week' ? 'Vorige week' : 'Vier weken terug'}
            onClick={() => setWeekStart(addDagen(weekStart, -stap))}
          >
            <ChevronLeft size={15} />
          </Knop>
          <Knop klein disabled={weekStart === huidigeWeekStart} onClick={() => setWeekStart(huidigeWeekStart)}>
            <CalendarDays size={14} /> Vandaag
          </Knop>
          <Knop
            klein
            title={weergave === 'week' ? 'Volgende week' : 'Vier weken vooruit'}
            onClick={() => setWeekStart(addDagen(weekStart, stap))}
          >
            <ChevronRight size={15} />
          </Knop>
        </div>

        <span className="ml-1 text-sm font-medium tabular-nums text-slate-700">{periodeLabel}</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Keuze
            value={afdelingFilter}
            onChange={(e) => {
              const a = e.target.value as 'alle' | Afdeling
              setAfdelingFilter(a)
              if (a !== 'alle') {
                const t = data.teams.find((x) => x.id === teamFilter)
                if (t && t.afdeling !== a) setTeamFilter('alle')
              }
            }}
            className="!w-auto"
            title="Filter op afdeling"
          >
            <option value="alle">Alle afdelingen</option>
            {PRODUCTIE_AFDELINGEN.map((a) => (
              <option key={a} value={a}>
                {AFDELING_LABELS[a]}
              </option>
            ))}
          </Keuze>
          <Keuze
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="!w-auto"
            title="Filter op team"
          >
            <option value="alle">Alle teams</option>
            {teamOpties.map((t) => (
              <option key={t.id} value={t.id}>
                {t.naam}
              </option>
            ))}
          </Keuze>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
            <Invoer
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              placeholder="Zoek op naam…"
              className="!w-52 !pl-8"
            />
          </div>
        </div>
      </div>

      {/* Overzichtstabel */}
      <Kaart className="mb-5 overflow-hidden">
        <KaartKop
          titel={weergave === 'week' ? 'Weekoverzicht' : 'Maandoverzicht (4 weken)'}
          uitleg="Beschikbare capaciteit: netto inzetbare uren op basis van contracturen × beschikbaarheidspercentage, min verlof, verzuim en training. 'Gepland' telt de taakuren uit de detailplanning waar de medewerker als uitvoerende op staat."
          rechts={
            <span className="text-xs text-slate-500">
              {aantalMedewerkers} medewerker{aantalMedewerkers === 1 ? '' : 's'}
            </span>
          }
        />
        {groepen.length === 0 ? (
          <div className="p-4">
            <LegeStaat
              titel="Geen medewerkers gevonden"
              tekst="Er zijn geen medewerkers die aan de gekozen filters voldoen. Pas het afdelings- of teamfilter aan of wis de zoekterm."
              actie={
                <Knop
                  klein
                  onClick={() => {
                    setAfdelingFilter('alle')
                    setTeamFilter('alle')
                    setZoek('')
                  }}
                >
                  Filters wissen
                </Knop>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <th className="sticky left-0 z-10 w-52 min-w-52 bg-white px-4 py-2.5 font-medium">Medewerker</th>
                  <th className="sticky left-52 z-10 w-16 min-w-16 border-r border-slate-200 bg-white px-2 py-2.5 text-right font-medium">
                    <Tooltip tekst="Contracturen per week">
                      <span>Contract</span>
                    </Tooltip>
                  </th>
                  {weergave === 'week' ? (
                    <>
                      {dagen.map((datum, i) => {
                        const isVandaag = datum === vandaag
                        return (
                          <th
                            key={datum}
                            className={`min-w-16 px-2 py-2.5 text-center font-medium ${
                              isVandaag ? 'bg-brand-50 text-brand-800' : ''
                            }`}
                          >
                            <div>{DAG_NAMEN[i]}</div>
                            <div className={`font-normal normal-case ${isVandaag ? 'text-brand-600' : 'text-slate-400'}`}>
                              {formatDatumKort(datum)}
                            </div>
                          </th>
                        )
                      })}
                      <th className="min-w-24 px-2 py-2.5 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          Beschikbaar
                          <InfoTip tekst="Contracturen × beschikbaarheidspercentage in deze week, vóór aftrek van afwezigheid." />
                        </span>
                      </th>
                      <th className="min-w-20 px-2 py-2.5 text-right font-medium">Afwezig</th>
                      <th className="min-w-20 px-3 py-2.5 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          Netto
                          <InfoTip tekst="Netto capaciteit: beschikbare uren min afwezigheid. Dit is de capaciteit waarmee de planning rekent." />
                        </span>
                      </th>
                      <th className="min-w-20 px-2 py-2.5 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          Gepland
                          <InfoTip tekst="Geplande taakuren uit de detailplanning: taken waar deze medewerker als uitvoerende op staat, evenredig gespreid over de werkdagen van de taakperiode. Taken van schaduwprojecten tellen volledig mee en zijn in de tooltip gemarkeerd." />
                        </span>
                      </th>
                      <th className="min-w-20 px-3 py-2.5 pr-4 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          Bezetting
                          <InfoTip tekst="Geplande taakuren t.o.v. netto beschikbare uren: onder 85% ok, 85–100% druk, boven 100% overboekt." />
                        </span>
                      </th>
                    </>
                  ) : (
                    <>
                      {weekStarts.map((w) => {
                        const isHuidig = w === huidigeWeekStart
                        return (
                          <th
                            key={w}
                            className={`min-w-24 px-2 py-2.5 text-center font-medium ${
                              isHuidig ? 'bg-brand-50 text-brand-800' : ''
                            }`}
                          >
                            <div>Wk {weekNummer(w)}</div>
                            <div className={`font-normal normal-case ${isHuidig ? 'text-brand-600' : 'text-slate-400'}`}>
                              {formatDatumKort(w)} – {formatDatumKort(addDagen(w, 4))}
                            </div>
                          </th>
                        )
                      })}
                      <th className="min-w-20 px-3 py-2.5 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          Totaal
                          <InfoTip tekst="Som van de netto beschikbare uren over de vier getoonde weken." />
                        </span>
                      </th>
                      <th className="min-w-20 px-3 py-2.5 pr-4 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          Gepland
                          <InfoTip tekst="Som van de geplande taakuren uit de detailplanning over de vier getoonde weken. Rood omrand weekvakje = meer taakuren gepland dan er netto beschikbaar is." />
                        </span>
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {groepen.map((g) => {
                  const somContract = g.leden.reduce((s, mw) => s + mw.contracturen, 0)
                  return (
                    <Fragment key={g.id}>
                      {g.leden.map((mw) => {
                        const eigenTeam = teamNaam(mw.teamId) ?? AFDELING_LABELS[mw.afdeling]
                        const t = mw.tijdelijkTeam
                        const tijdelijkActief = t !== undefined && t.van <= periodeEind && t.tot >= weekStart
                        return (
                          <tr key={mw.id} className="group border-b border-slate-100 hover:bg-slate-50">
                            <td className="sticky left-0 z-10 bg-white px-4 py-2 group-hover:bg-slate-50">
                              <div className="font-medium text-slate-800">{mw.naam}</div>
                              <div className="text-xs text-slate-500">
                                {mw.functie} · {eigenTeam}
                              </div>
                              {tijdelijkActief && t && (
                                <Tooltip
                                  tekst={`Tijdelijk ingezet bij ${teamNaam(t.teamId) ?? t.teamId} van ${formatDatum(t.van)} t/m ${formatDatum(t.tot)}${t.reden ? ` — ${t.reden}` : ''}`}
                                >
                                  <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                                    <ArrowRight size={12} /> tijdelijk: {teamNaam(t.teamId) ?? t.teamId}
                                  </span>
                                </Tooltip>
                              )}
                            </td>
                            <td className="sticky left-52 z-10 border-r border-slate-200 bg-white px-2 py-2 text-right text-xs tabular-nums text-slate-500 group-hover:bg-slate-50">
                              {mw.contracturen}u
                            </td>
                            {weergave === 'week' ? (
                              <>
                                {dagen.map((datum) => (
                                  <td
                                    key={datum}
                                    className={`px-2 py-2 text-center ${datum === vandaag ? 'bg-brand-50/40' : ''}`}
                                  >
                                    <WeekCel data={data} m={mw} datum={datum} />
                                  </td>
                                ))}
                                {(() => {
                                  const bruto = brutoBeschikbaarInWeek(data, mw, weekStart)
                                  const afwezigUren = medewerkerAfwezigInWeek(data, mw, weekStart)
                                  const netto = medewerkerBeschikbaarInWeek(data, mw.id, weekStart)
                                  const gepland = medewerkerTaakUrenInWeek(data, mw.id, weekStart)
                                  return (
                                    <>
                                      <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                                        {formatUren(bruto)}
                                      </td>
                                      <td
                                        className={`px-2 py-2 text-right tabular-nums ${
                                          afwezigUren > 0 ? 'font-medium text-amber-700' : 'text-slate-400'
                                        }`}
                                      >
                                        {afwezigUren > 0 ? formatUren(afwezigUren) : '—'}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
                                        {formatUren(netto)}
                                      </td>
                                      <td className="px-2 py-2 text-right">
                                        <GeplandCel data={data} m={mw} weekStart={weekStart} />
                                      </td>
                                      <td className="px-3 py-2 pr-4 text-right">
                                        <BezettingBadge beschikbaar={netto} gepland={gepland} />
                                      </td>
                                    </>
                                  )
                                })()}
                              </>
                            ) : (
                              <>
                                {weekStarts.map((w) => (
                                  <td
                                    key={w}
                                    className={`px-2 py-2 text-center ${w === huidigeWeekStart ? 'bg-brand-50/40' : ''}`}
                                  >
                                    <MaandCel data={data} m={mw} weekStart={w} />
                                  </td>
                                ))}
                                {(() => {
                                  const nettoTotaal = weekStarts.reduce(
                                    (s, w) => s + medewerkerBeschikbaarInWeek(data, mw.id, w),
                                    0,
                                  )
                                  const geplandTotaal = weekStarts.reduce(
                                    (s, w) => s + medewerkerTaakUrenInWeek(data, mw.id, w),
                                    0,
                                  )
                                  const niveau = capaciteitsNiveau(bezettingsPct(nettoTotaal, geplandTotaal))
                                  return (
                                    <>
                                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
                                        {formatUren(nettoTotaal)}
                                      </td>
                                      <td
                                        className={`px-3 py-2 pr-4 text-right tabular-nums ${
                                          geplandTotaal <= 0
                                            ? 'text-slate-300'
                                            : niveau === 'overboekt'
                                              ? 'font-semibold text-red-600'
                                              : niveau === 'druk'
                                                ? 'font-medium text-amber-700'
                                                : 'text-slate-600'
                                        }`}
                                        title={
                                          geplandTotaal > 0
                                            ? `${formatUren(geplandTotaal)} uur aan taken gepland t.o.v. ${formatUren(nettoTotaal)} uur netto beschikbaar`
                                            : undefined
                                        }
                                      >
                                        {geplandTotaal > 0 ? formatUren(geplandTotaal) : '—'}
                                      </td>
                                    </>
                                  )
                                })()}
                              </>
                            )}
                          </tr>
                        )
                      })}
                      {/* Teamtotaal */}
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <td className="sticky left-0 z-10 bg-slate-50 px-4 py-1.5 text-xs font-semibold text-slate-600">
                          Totaal {g.label}
                        </td>
                        <td className="sticky left-52 z-10 border-r border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-xs tabular-nums text-slate-500">
                          {somContract}u
                        </td>
                        {weergave === 'week' ? (
                          <>
                            {dagen.map((datum) => (
                              <td
                                key={datum}
                                className={`px-2 py-1.5 text-center text-xs font-semibold tabular-nums text-slate-600 ${
                                  datum === vandaag ? 'bg-brand-50/40' : ''
                                }`}
                              >
                                {formatUren(g.leden.reduce((s, mw) => s + medewerkerUrenOpDag(data, mw, datum), 0))}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-right text-xs font-semibold tabular-nums text-slate-600">
                              {formatUren(g.leden.reduce((s, mw) => s + brutoBeschikbaarInWeek(data, mw, weekStart), 0))}
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs font-semibold tabular-nums text-slate-600">
                              {formatUren(g.leden.reduce((s, mw) => s + medewerkerAfwezigInWeek(data, mw, weekStart), 0))}
                            </td>
                            {(() => {
                              const nettoTotaal = g.leden.reduce(
                                (s, mw) => s + medewerkerBeschikbaarInWeek(data, mw.id, weekStart),
                                0,
                              )
                              const geplandTotaal = g.leden.reduce(
                                (s, mw) => s + medewerkerTaakUrenInWeek(data, mw.id, weekStart),
                                0,
                              )
                              return (
                                <>
                                  <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums text-slate-700">
                                    {formatUren(nettoTotaal)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-xs font-semibold tabular-nums text-slate-600">
                                    {geplandTotaal > 0 ? formatUren(geplandTotaal) : '—'}
                                  </td>
                                  <td className="px-3 py-1.5 pr-4 text-right">
                                    <BezettingBadge beschikbaar={nettoTotaal} gepland={geplandTotaal} />
                                  </td>
                                </>
                              )
                            })()}
                          </>
                        ) : (
                          <>
                            {weekStarts.map((w) => (
                              <td
                                key={w}
                                className={`px-2 py-1.5 text-center text-xs font-semibold tabular-nums text-slate-600 ${
                                  w === huidigeWeekStart ? 'bg-brand-50/40' : ''
                                }`}
                              >
                                {formatUren(g.leden.reduce((s, mw) => s + medewerkerBeschikbaarInWeek(data, mw.id, w), 0))}
                              </td>
                            ))}
                            <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums text-slate-700">
                              {formatUren(
                                g.leden.reduce(
                                  (s, mw) =>
                                    s + weekStarts.reduce((s2, w) => s2 + medewerkerBeschikbaarInWeek(data, mw.id, w), 0),
                                  0,
                                ),
                              )}
                            </td>
                            <td className="px-3 py-1.5 pr-4 text-right text-xs font-semibold tabular-nums text-slate-600">
                              {formatUren(
                                g.leden.reduce(
                                  (s, mw) =>
                                    s + weekStarts.reduce((s2, w) => s2 + medewerkerTaakUrenInWeek(data, mw.id, w), 0),
                                  0,
                                ),
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kaart>

      {/* Actieve aanpassingen */}
      <Kaart className="mb-5 overflow-hidden">
        <KaartKop
          titel="Actieve aanpassingen"
          uitleg="Tijdelijke aanpassingen van het beschikbaarheidspercentage (bijv. tijdelijk 80% inzetbaar). Verlof en verzuim registreer je in het scherm 'Verlof & verzuim' en telt hier automatisch mee; tijdelijke inzet bij een ander team regel je via 'Teams & medewerkers'."
          rechts={
            kanBewerken ? (
              <Knop klein onClick={openModal}>
                <Plus size={14} /> Nieuwe aanpassing
              </Knop>
            ) : undefined
          }
        />
        {actieveAanpassingen.length === 0 ? (
          <div className="p-4">
            <LegeStaat
              titel="Geen actieve of geplande aanpassingen"
              tekst="Voeg een aanpassing toe wanneer een medewerker tijdelijk minder (of weer meer) inzetbaar is, bijvoorbeeld door studie of re-integratie."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <th className="px-4 py-2.5 font-medium">Medewerker</th>
                  <th className="px-3 py-2.5 font-medium">Periode</th>
                  <th className="px-3 py-2.5 font-medium">Percentage</th>
                  <th className="px-3 py-2.5 font-medium">Reden</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  {kanBewerken && <th className="px-3 py-2.5 pr-4 text-right font-medium"></th>}
                </tr>
              </thead>
              <tbody>
                {actieveAanpassingen.map((a) => {
                  const mw = data.medewerkers.find((x) => x.id === a.medewerkerId)
                  const actief = a.van <= vandaag
                  return (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <div className="font-medium text-slate-800">{mw?.naam ?? 'Onbekende medewerker'}</div>
                        {mw && <div className="text-xs text-slate-500">{mw.functie}</div>}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-600">
                        {formatDatum(a.van)} t/m {formatDatum(a.tot)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge kleur="amber">{a.pct}%</Badge>
                      </td>
                      <td className="max-w-72 px-3 py-2 text-slate-600">{a.reden}</td>
                      <td className="px-3 py-2">
                        <Badge kleur={actief ? 'groen' : 'blauw'}>{actief ? 'Actief' : 'Gepland'}</Badge>
                      </td>
                      {kanBewerken && (
                        <td className="px-3 py-2 pr-4 text-right">
                          {magBeherenVoor(a.medewerkerId) && (
                            <Knop
                              klein
                              variant="ghost"
                              title="Aanpassing verwijderen"
                              className="!text-red-600 hover:!bg-red-50"
                              onClick={() => setTeVerwijderen(a)}
                            >
                              <Trash2 size={14} />
                            </Knop>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kaart>

      {/* Legenda */}
      <Kaart>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Legenda</span>
          <LegendaItem kleur="border-emerald-200 bg-emerald-50" label="Volledig beschikbaar" />
          <LegendaItem kleur="border-amber-200 bg-amber-50" label="Gedeeltelijk beschikbaar / tijdelijke aanpassing" />
          <LegendaItem kleur="border-sky-200 bg-sky-100" label="Vakantie" />
          <LegendaItem kleur="border-red-200 bg-red-100" label="Ziekte" />
          <LegendaItem kleur="border-purple-200 bg-purple-100" label="Training" />
          <LegendaItem kleur="border-slate-300 bg-slate-200" label="Kort verzuim · bijzonder verlof · overig" />
          <LegendaItem kleur="border-rose-200 bg-rose-50" label="Maandweergave: minder dan 50% van de contracturen" />
          <LegendaItem kleur="border-transparent ring-1 ring-red-400 bg-white" label="Meer taakuren gepland dan netto beschikbaar" />
          <span className="text-slate-500">
            Bezetting: geplande taakuren t.o.v. netto beschikbaar — onder 85% ok · 85–100% druk · boven 100% overboekt
          </span>
        </div>
      </Kaart>

      {/* Modal: aanpassing toevoegen */}
      <Modal
        open={modalOpen}
        titel="Beschikbaarheid aanpassen"
        onSluiten={sluitModal}
        voettekst={
          <>
            <Knop onClick={sluitModal}>Annuleren</Knop>
            <Knop variant="primary" onClick={opslaan}>
              Opslaan
            </Knop>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Leg een tijdelijk beschikbaarheidspercentage vast voor een medewerker. De capaciteitsberekening in alle
            planningsschermen wordt direct bijgewerkt.
          </p>
          <Veld label="Medewerker" verplicht fout={fouten.medewerkerId}>
            <Keuze value={form.medewerkerId} onChange={(e) => setForm({ ...form, medewerkerId: e.target.value })}>
              <option value="">— Kies een medewerker —</option>
              {actieveMedewerkers.map((mw) => (
                <option key={mw.id} value={mw.id}>
                  {mw.naam} — {mw.functie}
                </option>
              ))}
            </Keuze>
          </Veld>
          <div className="grid grid-cols-2 gap-3">
            <Veld label="Van" verplicht fout={fouten.van}>
              <Invoer type="date" value={form.van} onChange={(e) => setForm({ ...form, van: e.target.value })} />
            </Veld>
            <Veld label="Tot en met" verplicht fout={fouten.tot}>
              <Invoer
                type="date"
                value={form.tot}
                min={form.van || undefined}
                onChange={(e) => setForm({ ...form, tot: e.target.value })}
              />
            </Veld>
          </div>
          <Veld label="Tijdelijk beschikbaarheidspercentage" verplicht fout={fouten.pct}>
            <div className="flex items-center gap-2">
              <Invoer
                type="number"
                min={0}
                max={100}
                step={5}
                value={form.pct}
                onChange={(e) => setForm({ ...form, pct: e.target.value })}
                className="!w-24"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Bijvoorbeeld: 80% i.v.m. studie, of 50% = alleen ochtenden beschikbaar.
            </p>
          </Veld>
          <Veld label="Reden" verplicht fout={fouten.reden}>
            <Tekstvak
              rows={2}
              value={form.reden}
              onChange={(e) => setForm({ ...form, reden: e.target.value })}
              placeholder="Bijv. studie, re-integratie of mantelzorg"
            />
          </Veld>
        </div>
      </Modal>

      {/* Bevestiging: aanpassing verwijderen */}
      <BevestigDialog
        open={teVerwijderen !== null}
        titel="Aanpassing verwijderen"
        gevaarlijk
        bevestigLabel="Verwijderen"
        tekst={
          teVerwijderen
            ? `Weet je zeker dat je de aanpassing (${teVerwijderen.pct}%) voor ${medewerkerNaam(teVerwijderen.medewerkerId)} van ${formatDatum(teVerwijderen.van)} t/m ${formatDatum(teVerwijderen.tot)} wilt verwijderen? De capaciteit wordt direct opnieuw berekend.`
            : undefined
        }
        onBevestig={verwijderAanpassing}
        onAnnuleer={() => setTeVerwijderen(null)}
      />
    </div>
  )
}
