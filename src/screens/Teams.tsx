// Teams & medewerkers: teamkaarten per afdeling met weekmetrics, drag-and-drop
// van medewerkers tussen teams (definitief of tijdelijk), beheer van medewerkers
// en teams, en een doorzoekbare totaaltabel.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarOff,
  FolderKanban,
  GripVertical,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useApp } from '../store/AppState'
import {
  AFDELING_LABELS,
  AFWEZIGHEID_LABELS,
  PRODUCTIE_AFDELINGEN,
  SCENARIO_LABELS,
  type Afdeling,
  type ISODate,
  type Medewerker,
  type Team,
} from '../lib/types'
import { addDagen, formatDatum, formatDatumKort, startVanWeek, vandaagISO, weekLabel } from '../lib/dates'
import {
  bezettingsPct,
  getTeamWaarschuwingen,
  medewerkerTeamOpDag,
  scenarioBelasting,
  teamBeschikbaarInWeek,
  teamGeplandInWeek,
} from '../lib/capacity'
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
  Tooltip,
  Veld,
  useToast,
} from '../components/ui'

// ---------- Helpers ----------

function isLeidingFunctie(functie: string): boolean {
  return /productieleider|lead/i.test(functie)
}

function sorteerOpNaam(a: Medewerker, b: Medewerker): number {
  return a.naam.localeCompare(b.naam, 'nl')
}

/** Is de tijdelijke toewijzing van deze medewerker vandaag actief? */
function tijdelijkActief(m: Medewerker, vandaag: ISODate): boolean {
  return !!m.tijdelijkTeam && m.tijdelijkTeam.van <= vandaag && vandaag <= m.tijdelijkTeam.tot
}

const UITLEG_BESCHIKBAAR =
  'Beschikbare capaciteit: contracturen × beschikbaarheidspercentage van alle teamleden, min geregistreerde afwezigheid, voor deze week (ma t/m vr).'

const UITLEG_BEZETTING =
  'Bezetting = geplande uren gedeeld door beschikbare uren volgens het gekozen scenario. Boven 100% is het team overboekt: er staat meer werk gepland dan het team aankan. Schaduwplanning = uren van nog niet bevestigde orders; kansgewogen telt die uren mee naar rato van de verkoopkans.'

// ---------- Lid-chip ----------

function LidChip({
  medewerker: m,
  badge,
  gedimd = false,
  sleepbaar,
  klikbaar,
  onKlik,
  onSleepStart,
  onSleepEind,
}: {
  medewerker: Medewerker
  badge?: ReactNode
  gedimd?: boolean
  sleepbaar: boolean
  klikbaar: boolean
  onKlik: () => void
  onSleepStart: () => void
  onSleepEind: () => void
}) {
  return (
    <Tooltip
      tekst={
        m.vaardigheden.length > 0
          ? `Vaardigheden: ${m.vaardigheden.join(' · ')}`
          : 'Geen vaardigheden geregistreerd'
      }
    >
      <div
        draggable={sleepbaar}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', m.id)
          e.dataTransfer.effectAllowed = 'move'
          onSleepStart()
        }}
        onDragEnd={onSleepEind}
        onClick={klikbaar ? onKlik : undefined}
        className={`inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm transition-colors
          ${sleepbaar ? 'cursor-grab active:cursor-grabbing' : ''}
          ${klikbaar ? 'hover:border-brand-300 hover:bg-brand-50/40' : ''}
          ${klikbaar && !sleepbaar ? 'cursor-pointer' : ''}
          ${gedimd ? 'opacity-45' : ''}`}
      >
        {sleepbaar && <GripVertical size={12} className="shrink-0 text-slate-300" />}
        <span className="font-medium text-slate-700">{m.naam}</span>
        <span className="text-slate-400">{m.functie}</span>
        <span className="tabular-nums text-slate-400">{m.contracturen}u</span>
        {badge}
      </div>
    </Tooltip>
  )
}

// ---------- Teamkaart ----------

function TeamKaart({
  team,
  weekStart,
  vandaag,
  magBeheren,
  sleepId,
  dropTeamId,
  onSleepStart,
  onSleepEind,
  onSleepOver,
  onSleepVerlaat,
  onSleepDrop,
  onLidKlik,
}: {
  team: Team
  weekStart: ISODate
  vandaag: ISODate
  magBeheren: boolean
  sleepId: string | null
  dropTeamId: string | null
  onSleepStart: (medewerkerId: string) => void
  onSleepEind: () => void
  onSleepOver: (teamId: string) => void
  onSleepVerlaat: (teamId: string) => void
  onSleepDrop: (teamId: string) => void
  onLidKlik: (medewerkerId: string) => void
}) {
  const { data, ui, dispatch } = useApp()
  const { toon } = useToast()

  const beschikbaar = teamBeschikbaarInWeek(data, team.id, weekStart)
  const gepland = teamGeplandInWeek(data, team.id, weekStart)
  const belasting = scenarioBelasting(gepland, ui.scenario)
  const pct = bezettingsPct(beschikbaar, belasting)
  const waarschuwingen = getTeamWaarschuwingen(data, team.id, weekStart)

  // Leden: eigen leden + tijdelijk ingeleende medewerkers (vandaag actief).
  const eigenLeden = data.medewerkers.filter((m) => m.actief && m.teamId === team.id).sort(sorteerOpNaam)
  const ingeleend = data.medewerkers
    .filter((m) => m.actief && m.teamId !== team.id && medewerkerTeamOpDag(m, vandaag) === team.id)
    .sort(sorteerOpNaam)

  // Huidige projecten: fases van dit team die vandaag lopen of deze week starten.
  const weekEind = addDagen(weekStart, 6)
  const huidigeProjecten = useMemo(() => {
    const gezien = new Map<string, { id: string; projectnummer: string; naam: string; faseNaam: string; schaduw: boolean }>()
    for (const f of data.fases) {
      if (f.teamId !== team.id) continue
      const looptVandaag = f.start <= vandaag && vandaag <= f.eind
      const startDezeWeek = f.start >= weekStart && f.start <= weekEind
      if (!looptVandaag && !startDezeWeek) continue
      const p = data.projecten.find((pr) => pr.id === f.projectId)
      if (!p || p.status === 'geannuleerd' || p.status === 'opgeleverd') continue
      if (!gezien.has(p.id)) {
        gezien.set(p.id, {
          id: p.id,
          projectnummer: p.projectnummer,
          naam: p.naam,
          faseNaam: f.naam,
          schaduw: p.status === 'schaduw',
        })
      }
    }
    return [...gezien.values()].sort((a, b) => a.projectnummer.localeCompare(b.projectnummer))
  }, [data.fases, data.projecten, team.id, vandaag, weekStart, weekEind])

  // Komende afwezigheid van leden binnen 4 weken.
  const ledenIds = new Set([...eigenLeden, ...ingeleend].map((m) => m.id))
  const grens = addDagen(vandaag, 28)
  const komendeAfwezigheid = data.afwezigheid
    .filter((a) => ledenIds.has(a.medewerkerId) && a.tot >= vandaag && a.van <= grens)
    .sort((a, b) => (a.van < b.van ? -1 : 1))
    .slice(0, 3)

  // Productieleider-keuze: medewerkers uit dezelfde afdeling, leidinggevenden eerst.
  const plKandidaten = data.medewerkers
    .filter((m) => m.actief && m.afdeling === team.afdeling)
    .sort((a, b) => {
      const la = isLeidingFunctie(a.functie) ? 0 : 1
      const lb = isLeidingFunctie(b.functie) ? 0 : 1
      return la !== lb ? la - lb : sorteerOpNaam(a, b)
    })
  const huidigePL = data.medewerkers.find((m) => m.id === team.productieleiderId)

  function wijzigProductieleider(nieuwId: string) {
    dispatch({ type: 'TEAM_BIJWERKEN', id: team.id, patch: { productieleiderId: nieuwId || undefined } })
    const nieuwe = data.medewerkers.find((m) => m.id === nieuwId)
    toon(
      'succes',
      nieuwe
        ? `${nieuwe.naam} is aangewezen als productieleider van ${team.naam}.`
        : `Productieleider van ${team.naam} is verwijderd.`,
    )
  }

  const isDropDoel = sleepId !== null && dropTeamId === team.id

  return (
    <div
      className="h-full"
      onDragOver={(e) => {
        if (!sleepId) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onSleepOver(team.id)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        onSleepVerlaat(team.id)
      }}
      onDrop={(e) => {
        if (!sleepId) return
        e.preventDefault()
        onSleepDrop(team.id)
      }}
    >
      <Kaart className={`flex h-full flex-col ${isDropDoel ? 'ring-2 ring-brand-400' : ''}`}>
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">{team.naam}</h3>
            <Badge kleur="brand">{AFDELING_LABELS[team.afdeling]}</Badge>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <span className="shrink-0">Productieleider</span>
            {magBeheren ? (
              <Keuze
                value={team.productieleiderId ?? ''}
                onChange={(e) => wijzigProductieleider(e.target.value)}
                className="!w-auto !py-1 !text-xs"
              >
                <option value="">— Geen productieleider —</option>
                {plKandidaten.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.naam}
                  </option>
                ))}
              </Keuze>
            ) : (
              <span className="font-medium text-slate-700">{huidigePL?.naam ?? '—'}</span>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          {/* Waarschuwingen */}
          {waarschuwingen.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {waarschuwingen.map((w, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs ${
                    w.soort === 'overboekt'
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                >
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  {w.tekst}
                </div>
              ))}
            </div>
          )}

          {/* Weekmetrics */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-slate-50 px-2.5 py-1.5">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                Beschikbaar deze week <InfoTip tekst={UITLEG_BESCHIKBAAR} />
              </div>
              <div className="text-sm font-semibold tabular-nums text-slate-800">{Math.round(beschikbaar)} u</div>
            </div>
            <div className="rounded-md bg-slate-50 px-2.5 py-1.5">
              <div className="text-[11px] text-slate-500">Definitief gepland</div>
              <div className="text-sm font-semibold tabular-nums text-slate-800">{Math.round(gepland.definitief)} u</div>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Bezetting <InfoTip tekst={UITLEG_BEZETTING} />
            </div>
            <div
              title={`Scenario "${SCENARIO_LABELS[ui.scenario]}": ${Math.round(belasting)} u gepland van ${Math.round(
                beschikbaar,
              )} u beschikbaar. Definitief ${Math.round(gepland.definitief)} u · schaduw ${Math.round(
                gepland.schaduw,
              )} u · kansgewogen ${Math.round(gepland.gewogen)} u.`}
            >
              <CapaciteitsBalk pct={pct} />
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Definitief {Math.round(gepland.definitief)} u · schaduw {Math.round(gepland.schaduw)} u · kansgewogen{' '}
              {Math.round(gepland.gewogen)} u
            </p>
          </div>

          {/* Leden */}
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Teamleden ({eigenLeden.length + ingeleend.length})
            </div>
            {eigenLeden.length + ingeleend.length === 0 ? (
              <p className="text-xs text-slate-400">Nog geen teamleden. Sleep een medewerker naar deze kaart.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {eigenLeden.map((m) => {
                  const elders = tijdelijkActief(m, vandaag) && m.tijdelijkTeam!.teamId !== team.id
                  const eldersTeam = elders ? data.teams.find((t) => t.id === m.tijdelijkTeam!.teamId) : undefined
                  return (
                    <LidChip
                      key={m.id}
                      medewerker={m}
                      gedimd={elders}
                      badge={
                        elders ? (
                          <Badge kleur="grijs" title={`Tijdelijk uitgeleend aan ${eldersTeam?.naam ?? 'ander team'}`}>
                            elders t/m {formatDatumKort(m.tijdelijkTeam!.tot)}
                          </Badge>
                        ) : undefined
                      }
                      sleepbaar={magBeheren}
                      klikbaar={magBeheren}
                      onKlik={() => onLidKlik(m.id)}
                      onSleepStart={() => onSleepStart(m.id)}
                      onSleepEind={onSleepEind}
                    />
                  )
                })}
                {ingeleend.map((m) => {
                  const eigenTeam = data.teams.find((t) => t.id === m.teamId)
                  return (
                    <LidChip
                      key={m.id}
                      medewerker={m}
                      badge={
                        <Badge kleur="amber" title={`Eigen team: ${eigenTeam?.naam ?? 'geen'}${m.tijdelijkTeam?.reden ? ` · reden: ${m.tijdelijkTeam.reden}` : ''}`}>
                          tijdelijk t/m {formatDatumKort(m.tijdelijkTeam!.tot)}
                        </Badge>
                      }
                      sleepbaar={magBeheren}
                      klikbaar={magBeheren}
                      onKlik={() => onLidKlik(m.id)}
                      onSleepStart={() => onSleepStart(m.id)}
                      onSleepEind={onSleepEind}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* Huidige projecten */}
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Projecten deze week</div>
            {huidigeProjecten.length === 0 ? (
              <p className="text-xs text-slate-400">Geen lopende projecten deze week.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {huidigeProjecten.map((h) => (
                  <Link
                    key={h.id}
                    to={`/projecten/${h.id}`}
                    title={`${h.naam} — fase: ${h.faseNaam}${h.schaduw ? ' · schaduwplanning (order nog niet bevestigd)' : ''}`}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:border-brand-300 hover:bg-brand-50"
                  >
                    <FolderKanban size={12} />
                    {h.projectnummer}
                    {h.schaduw && <span className="text-[10px] font-normal text-slate-400">(schaduw)</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Komende afwezigheid */}
          <div className="mt-auto">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Komende afwezigheid (4 weken)
            </div>
            {komendeAfwezigheid.length === 0 ? (
              <p className="text-xs text-slate-400">Geen afwezigheid gemeld.</p>
            ) : (
              <ul className="space-y-0.5">
                {komendeAfwezigheid.map((a) => {
                  const lid = data.medewerkers.find((m) => m.id === a.medewerkerId)
                  return (
                    <li key={a.id} className="flex items-center gap-1.5 text-xs text-slate-500">
                      <CalendarOff size={12} className="shrink-0 text-slate-400" />
                      <span className="font-medium text-slate-600">{lid?.naam}</span>
                      <span>
                        {AFWEZIGHEID_LABELS[a.type]} · {formatDatumKort(a.van)} – {formatDatumKort(a.tot)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </Kaart>
    </div>
  )
}

// ---------- Verplaats-dialoog (drag-and-drop) ----------

function VerplaatsDialoog({
  info,
  weekStart,
  onSluiten,
}: {
  info: { medewerkerId: string; doelTeamId: string } | null
  weekStart: ISODate
  onSluiten: () => void
}) {
  const { data, dispatch } = useApp()
  const { toon } = useToast()

  const [modus, setModus] = useState<'definitief' | 'tijdelijk'>('definitief')
  const [van, setVan] = useState<string>(weekStart)
  const [tot, setTot] = useState<string>(addDagen(weekStart, 4))
  const [reden, setReden] = useState('')
  const [fout, setFout] = useState('')

  useEffect(() => {
    if (!info) return
    setModus('definitief')
    setVan(weekStart)
    setTot(addDagen(weekStart, 4))
    setReden('')
    setFout('')
  }, [info, weekStart])

  const medewerker = info ? data.medewerkers.find((m) => m.id === info.medewerkerId) : undefined
  const doelTeam = info ? data.teams.find((t) => t.id === info.doelTeamId) : undefined
  const eigenTeam = medewerker?.teamId ? data.teams.find((t) => t.id === medewerker.teamId) : undefined

  function bevestig() {
    if (!info || !medewerker || !doelTeam) return
    if (modus === 'tijdelijk') {
      if (!van || !tot) {
        setFout('Vul een start- en einddatum in.')
        return
      }
      if (tot < van) {
        setFout('De einddatum moet op of na de startdatum liggen.')
        return
      }
      dispatch({
        type: 'TIJDELIJK_TEAM',
        medewerkerId: medewerker.id,
        toewijzing: { teamId: doelTeam.id, van, tot, reden: reden.trim() || undefined },
      })
      toon(
        'succes',
        `${medewerker.naam} is tijdelijk uitgeleend aan ${doelTeam.naam} t/m ${formatDatum(tot)}. De capaciteit van beide teams is bijgewerkt.`,
      )
    } else {
      // De reducer beëindigt hierbij ook een eventuele tijdelijke uitleen (één undo-stap).
      dispatch({ type: 'MEDEWERKER_NAAR_TEAM', medewerkerId: medewerker.id, teamId: doelTeam.id })
      toon(
        'succes',
        `${medewerker.naam} is definitief verplaatst naar ${doelTeam.naam}. De capaciteit van beide teams is bijgewerkt.`,
      )
    }
    onSluiten()
  }

  return (
    <BevestigDialog
      open={!!info && !!medewerker && !!doelTeam}
      titel="Medewerker naar ander team"
      bevestigLabel={modus === 'definitief' ? 'Definitief verplaatsen' : 'Tijdelijk uitlenen'}
      onBevestig={bevestig}
      onAnnuleer={onSluiten}
    >
      {medewerker && doelTeam && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">{medewerker.naam}</span>
            {eigenTeam ? ` (${eigenTeam.naam})` : ' (geen team)'} →{' '}
            <span className="font-medium text-slate-800">{doelTeam.naam}</span>
          </p>

          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors ${
              modus === 'definitief' ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              name="verplaats-modus"
              className="mt-0.5 accent-brand-700"
              checked={modus === 'definitief'}
              onChange={() => setModus('definitief')}
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">Definitief verplaatsen</span>
              <span className="block text-xs text-slate-500">
                {medewerker.naam} wordt vast lid van {doelTeam.naam}
                {eigenTeam ? ` en verlaat ${eigenTeam.naam}` : ''}.
                {medewerker.tijdelijkTeam ? ' Een lopende tijdelijke toewijzing wordt beëindigd.' : ''}
              </span>
            </span>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors ${
              modus === 'tijdelijk' ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              name="verplaats-modus"
              className="mt-0.5 accent-brand-700"
              checked={modus === 'tijdelijk'}
              onChange={() => setModus('tijdelijk')}
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">Tijdelijk uitlenen</span>
              <span className="block text-xs text-slate-500">
                {medewerker.naam} helpt {doelTeam.naam} voor een afgebakende periode en keert daarna automatisch terug
                {eigenTeam ? ` naar ${eigenTeam.naam}` : ''}.
              </span>
            </span>
          </label>

          {modus === 'tijdelijk' && (
            <div className="grid grid-cols-2 gap-3">
              <Veld label="Van" verplicht>
                <Invoer type="date" value={van} onChange={(e) => setVan(e.target.value)} />
              </Veld>
              <Veld label="Tot en met" verplicht>
                <Invoer type="date" value={tot} onChange={(e) => setTot(e.target.value)} />
              </Veld>
              <Veld label="Reden" className="col-span-2">
                <Invoer
                  value={reden}
                  onChange={(e) => setReden(e.target.value)}
                  placeholder="Bijv. extra capaciteit uitschuifsystemen"
                />
              </Veld>
            </div>
          )}

          {fout && <p className="text-xs text-red-600">{fout}</p>}
        </div>
      )}
    </BevestigDialog>
  )
}

// ---------- Medewerker-modal (nieuw + bewerken) ----------

function MedewerkerModal({
  open,
  medewerkerId,
  afdelingen,
  standaardAfdeling,
  onSluiten,
}: {
  open: boolean
  medewerkerId: string | null
  afdelingen: Afdeling[]
  standaardAfdeling: Afdeling
  onSluiten: () => void
}) {
  const { data, dispatch } = useApp()
  const { toon } = useToast()

  const bestaand = medewerkerId ? data.medewerkers.find((m) => m.id === medewerkerId) : undefined

  const [naam, setNaam] = useState('')
  const [functie, setFunctie] = useState('')
  const [afdeling, setAfdeling] = useState<Afdeling>(standaardAfdeling)
  const [teamId, setTeamId] = useState('')
  const [vaardigheden, setVaardigheden] = useState<string[]>([])
  const [nieuweVaardigheid, setNieuweVaardigheid] = useState('')
  const [contracturen, setContracturen] = useState('40')
  const [beschikbaarheidPct, setBeschikbaarheidPct] = useState('100')
  const [actief, setActief] = useState(true)
  const [fouten, setFouten] = useState<{ naam?: string; contracturen?: string; beschikbaarheidPct?: string }>({})

  useEffect(() => {
    if (!open) return
    const m = medewerkerId ? data.medewerkers.find((x) => x.id === medewerkerId) : undefined
    setNaam(m?.naam ?? '')
    setFunctie(m?.functie ?? '')
    setAfdeling(m?.afdeling ?? standaardAfdeling)
    setTeamId(m?.teamId ?? '')
    setVaardigheden(m?.vaardigheden ?? [])
    setNieuweVaardigheid('')
    setContracturen(String(m?.contracturen ?? 40))
    setBeschikbaarheidPct(String(m?.beschikbaarheidPct ?? 100))
    setActief(m?.actief ?? true)
    setFouten({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, medewerkerId])

  // Afdelingsopties: zichtbare afdelingen + eventueel de huidige afdeling van de medewerker.
  const afdelingOpties = useMemo(() => {
    const set = [...afdelingen]
    if (bestaand && !set.includes(bestaand.afdeling)) set.push(bestaand.afdeling)
    return set
  }, [afdelingen, bestaand])

  const teamOpties = data.teams.filter((t) => t.afdeling === afdeling)

  function kiesAfdeling(nieuw: Afdeling) {
    setAfdeling(nieuw)
    if (teamId && !data.teams.some((t) => t.id === teamId && t.afdeling === nieuw)) setTeamId('')
  }

  function voegVaardigheidToe() {
    const v = nieuweVaardigheid.trim()
    if (!v) return
    if (!vaardigheden.some((x) => x.toLowerCase() === v.toLowerCase())) setVaardigheden([...vaardigheden, v])
    setNieuweVaardigheid('')
  }

  function beeindigTijdelijk() {
    if (!bestaand) return
    dispatch({ type: 'TIJDELIJK_TEAM', medewerkerId: bestaand.id })
    toon('succes', `Tijdelijke toewijzing van ${bestaand.naam} is beëindigd; de teamcapaciteit is bijgewerkt.`)
  }

  function opslaan() {
    const nieuweFouten: typeof fouten = {}
    if (!naam.trim()) nieuweFouten.naam = 'Naam is verplicht.'
    const uren = Number(contracturen)
    if (!Number.isFinite(uren) || uren <= 0 || uren > 60)
      nieuweFouten.contracturen = 'Vul contracturen in tussen 1 en 60 uur per week.'
    const pct = Number(beschikbaarheidPct)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100)
      nieuweFouten.beschikbaarheidPct = 'Vul een beschikbaarheidspercentage in tussen 0 en 100.'
    if (Object.keys(nieuweFouten).length > 0) {
      setFouten(nieuweFouten)
      toon('fout', 'Controleer de gemarkeerde velden.')
      return
    }

    const teamNaam = data.teams.find((t) => t.id === teamId)?.naam
    if (bestaand) {
      dispatch({
        type: 'MEDEWERKER_BIJWERKEN',
        id: bestaand.id,
        patch: {
          naam: naam.trim(),
          functie: functie.trim(),
          afdeling,
          teamId: teamId || undefined,
          vaardigheden,
          contracturen: uren,
          beschikbaarheidPct: pct,
          actief,
        },
      })
      toon('succes', `Gegevens van ${naam.trim()} zijn bijgewerkt.`)
    } else {
      dispatch({
        type: 'MEDEWERKER_TOEVOEGEN',
        medewerker: {
          id: uid('mw'),
          naam: naam.trim(),
          functie: functie.trim(),
          afdeling,
          vaardigheden,
          contracturen: uren,
          beschikbaarheidPct: pct,
          teamId: teamId || undefined,
          actief: true,
        },
      })
      toon('succes', `${naam.trim()} is toegevoegd${teamNaam ? ` aan ${teamNaam}` : ''}.`)
    }
    onSluiten()
  }

  const tijdelijkTeamNaam = bestaand?.tijdelijkTeam
    ? data.teams.find((t) => t.id === bestaand.tijdelijkTeam!.teamId)?.naam ?? 'onbekend team'
    : undefined

  return (
    <Modal
      open={open}
      titel={bestaand ? 'Medewerker bewerken' : 'Nieuwe medewerker'}
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={opslaan}>
            {bestaand ? 'Opslaan' : 'Toevoegen'}
          </Knop>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Naam" verplicht fout={fouten.naam}>
            <Invoer value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Voor- en achternaam" />
          </Veld>
          <Veld label="Functie">
            <Invoer value={functie} onChange={(e) => setFunctie(e.target.value)} placeholder="Bijv. Lasser" />
          </Veld>
          <Veld label="Afdeling">
            <Keuze value={afdeling} onChange={(e) => kiesAfdeling(e.target.value as Afdeling)}>
              {afdelingOpties.map((a) => (
                <option key={a} value={a}>
                  {AFDELING_LABELS[a]}
                </option>
              ))}
            </Keuze>
          </Veld>
          <Veld label="Primair team">
            <Keuze value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Geen team</option>
              {teamOpties.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.naam}
                </option>
              ))}
            </Keuze>
          </Veld>
          <Veld label="Contracturen per week" fout={fouten.contracturen}>
            <Invoer
              type="number"
              min={1}
              max={60}
              value={contracturen}
              onChange={(e) => setContracturen(e.target.value)}
            />
          </Veld>
          <Veld label="Beschikbaarheid (%)" fout={fouten.beschikbaarheidPct}>
            <Invoer
              type="number"
              min={0}
              max={100}
              value={beschikbaarheidPct}
              onChange={(e) => setBeschikbaarheidPct(e.target.value)}
            />
          </Veld>
        </div>

        <Veld label="Vaardigheden">
          <div>
            {vaardigheden.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {vaardigheden.map((v) => (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600"
                  >
                    {v}
                    <button
                      type="button"
                      onClick={() => setVaardigheden(vaardigheden.filter((x) => x !== v))}
                      className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                      title={`${v} verwijderen`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <Invoer
                value={nieuweVaardigheid}
                onChange={(e) => setNieuweVaardigheid(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    voegVaardigheidToe()
                  }
                }}
                placeholder="Bijv. Lassen"
              />
              <Knop onClick={voegVaardigheidToe}>
                <Plus size={14} />
                Toevoegen
              </Knop>
            </div>
          </div>
        </Veld>

        {bestaand && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={actief}
              onChange={(e) => setActief(e.target.checked)}
              className="h-4 w-4 accent-brand-700"
            />
            Actief in de planning
            <InfoTip tekst="Inactieve medewerkers tellen niet mee in de beschikbare capaciteit en verschijnen niet op teamkaarten." />
          </label>
        )}

        {bestaand && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Tijdelijke toewijzing</div>
            {bestaand.tijdelijkTeam ? (
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs text-slate-600">
                  <span className="font-medium text-slate-800">Uitgeleend aan {tijdelijkTeamNaam}</span> —{' '}
                  {formatDatum(bestaand.tijdelijkTeam.van)} t/m {formatDatum(bestaand.tijdelijkTeam.tot)}
                  {bestaand.tijdelijkTeam.reden && (
                    <div className="mt-0.5 text-slate-500">Reden: {bestaand.tijdelijkTeam.reden}</div>
                  )}
                </div>
                <Knop klein onClick={beeindigTijdelijk}>
                  Beëindigen
                </Knop>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Geen tijdelijke toewijzing. Sleep de medewerker op het teamoverzicht naar een andere teamkaart om tijdelijk
                uit te lenen.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---------- Team-modal (nieuw team) ----------

function TeamModal({
  open,
  afdelingen,
  standaardAfdeling,
  onSluiten,
}: {
  open: boolean
  afdelingen: Afdeling[]
  standaardAfdeling: Afdeling
  onSluiten: () => void
}) {
  const { data, dispatch } = useApp()
  const { toon } = useToast()

  const [naam, setNaam] = useState('')
  const [afdeling, setAfdeling] = useState<Afdeling>(standaardAfdeling)
  const [productieleiderId, setProductieleiderId] = useState('')
  const [fout, setFout] = useState('')

  useEffect(() => {
    if (!open) return
    setNaam('')
    setAfdeling(standaardAfdeling)
    setProductieleiderId('')
    setFout('')
  }, [open, standaardAfdeling])

  const plKandidaten = data.medewerkers
    .filter((m) => m.actief && m.afdeling === afdeling)
    .sort((a, b) => {
      const la = isLeidingFunctie(a.functie) ? 0 : 1
      const lb = isLeidingFunctie(b.functie) ? 0 : 1
      return la !== lb ? la - lb : sorteerOpNaam(a, b)
    })

  function opslaan() {
    if (!naam.trim()) {
      setFout('Teamnaam is verplicht.')
      return
    }
    dispatch({
      type: 'TEAM_TOEVOEGEN',
      team: {
        id: uid('team'),
        naam: naam.trim(),
        afdeling,
        productieleiderId: productieleiderId || undefined,
        vaardigheden: [],
      },
    })
    toon('succes', `Team "${naam.trim()}" is aangemaakt in ${AFDELING_LABELS[afdeling]}.`)
    onSluiten()
  }

  return (
    <Modal
      open={open}
      titel="Nieuw team"
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={opslaan}>
            Team aanmaken
          </Knop>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Veld label="Teamnaam" verplicht fout={fout}>
          <Invoer value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijv. Chassis Team C" />
        </Veld>
        <Veld label="Afdeling">
          <Keuze
            value={afdeling}
            onChange={(e) => {
              setAfdeling(e.target.value as Afdeling)
              setProductieleiderId('')
            }}
          >
            {afdelingen.map((a) => (
              <option key={a} value={a}>
                {AFDELING_LABELS[a]}
              </option>
            ))}
          </Keuze>
        </Veld>
        <Veld label="Productieleider (optioneel)">
          <Keuze value={productieleiderId} onChange={(e) => setProductieleiderId(e.target.value)}>
            <option value="">— Nog geen productieleider —</option>
            {plKandidaten.map((k) => (
              <option key={k.id} value={k.id}>
                {k.naam} ({k.functie})
              </option>
            ))}
          </Keuze>
        </Veld>
      </div>
    </Modal>
  )
}

// ---------- Hoofdscherm ----------

export default function Teams() {
  const { data, ui, persona, permissies } = useApp()
  const { toon } = useToast()

  const vandaag = vandaagISO()
  const weekStart = startVanWeek(vandaag)
  const magBeheren = permissies.teamsBeheren

  const zichtbareAfdelingen: Afdeling[] =
    persona.rol === 'productieleider' && persona.afdeling ? [persona.afdeling] : PRODUCTIE_AFDELINGEN

  // Drag-and-drop-state
  const [sleepId, setSleepId] = useState<string | null>(null)
  const [dropTeamId, setDropTeamId] = useState<string | null>(null)
  const [verplaats, setVerplaats] = useState<{ medewerkerId: string; doelTeamId: string } | null>(null)

  // Modals
  const [bewerkId, setBewerkId] = useState<string | null>(null)
  const [nieuwMedewerkerOpen, setNieuwMedewerkerOpen] = useState(false)
  const [nieuwTeamOpen, setNieuwTeamOpen] = useState(false)

  // Tabel
  const [zoek, setZoek] = useState('')

  function handleSleepDrop(doelTeamId: string) {
    const id = sleepId
    setSleepId(null)
    setDropTeamId(null)
    if (!id) return
    const m = data.medewerkers.find((x) => x.id === id)
    if (!m) return
    if (m.teamId === doelTeamId) {
      toon(
        'info',
        tijdelijkActief(m, vandaag)
          ? `${m.naam} hoort hier al thuis. Beëindig de tijdelijke uitlening via het profiel om ${m.naam} terug te halen.`
          : `${m.naam} is al lid van dit team.`,
      )
      return
    }
    setVerplaats({ medewerkerId: id, doelTeamId })
  }

  function productieleidersVan(afd: Afdeling): Medewerker[] {
    const plIds = new Set(
      data.teams.filter((t) => t.afdeling === afd && t.productieleiderId).map((t) => t.productieleiderId as string),
    )
    return data.medewerkers
      .filter((m) => m.afdeling === afd && (plIds.has(m.id) || (!m.teamId && isLeidingFunctie(m.functie))))
      .sort(sorteerOpNaam)
  }

  // Tabelrijen
  const q = zoek.trim().toLowerCase()
  const tabelRijen = data.medewerkers
    .filter((m) => zichtbareAfdelingen.includes(m.afdeling))
    .filter((m) => {
      if (!q) return true
      const teamNaam = data.teams.find((t) => t.id === m.teamId)?.naam ?? ''
      return [m.naam, m.functie, AFDELING_LABELS[m.afdeling], teamNaam, m.vaardigheden.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    .sort(sorteerOpNaam)

  return (
    <div className="p-6">
      <PaginaKop
        titel="Teams & medewerkers"
        uitleg={`Weekbeeld ${weekLabel(weekStart)} (${formatDatumKort(weekStart)} – ${formatDatumKort(
          addDagen(weekStart, 4),
        )}) · scenario: ${SCENARIO_LABELS[ui.scenario]}${
          persona.rol === 'productieleider' && persona.afdeling ? ` · alleen ${AFDELING_LABELS[persona.afdeling]}` : ''
        }`}
        rechts={
          magBeheren ? (
            <>
              <Knop onClick={() => setNieuwTeamOpen(true)}>
                <Users size={15} />
                Nieuw team
              </Knop>
              <Knop variant="primary" onClick={() => setNieuwMedewerkerOpen(true)}>
                <UserPlus size={15} />
                Nieuwe medewerker
              </Knop>
            </>
          ) : undefined
        }
      />
      {magBeheren && (
        <p className="-mt-3 mb-5 text-xs text-slate-400">
          Tip: sleep een medewerker naar een andere teamkaart om definitief te verplaatsen of tijdelijk uit te lenen.
        </p>
      )}

      {zichtbareAfdelingen.map((afd) => {
        const afdTeams = data.teams.filter((t) => t.afdeling === afd)
        const productieleiders = productieleidersVan(afd)
        const aantalActief = data.medewerkers.filter((m) => m.afdeling === afd && m.actief).length
        return (
          <section key={afd} className="mb-8">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{AFDELING_LABELS[afd]}</h2>
              <Badge kleur="grijs">
                {afdTeams.length} {afdTeams.length === 1 ? 'team' : 'teams'} · {aantalActief} medewerkers
              </Badge>
            </div>

            {productieleiders.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Productieleiding:</span>
                {productieleiders.map((pl) => (
                  <LidChip
                    key={pl.id}
                    medewerker={pl}
                    gedimd={!pl.actief}
                    sleepbaar={magBeheren && pl.actief}
                    klikbaar={magBeheren}
                    onKlik={() => setBewerkId(pl.id)}
                    onSleepStart={() => setSleepId(pl.id)}
                    onSleepEind={() => {
                      setSleepId(null)
                      setDropTeamId(null)
                    }}
                  />
                ))}
              </div>
            )}

            {afdTeams.length === 0 ? (
              <LegeStaat
                titel={`Nog geen teams in ${AFDELING_LABELS[afd]}`}
                tekst={magBeheren ? 'Maak een team aan via de knop "Nieuw team" rechtsboven.' : undefined}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {afdTeams.map((team) => (
                  <TeamKaart
                    key={team.id}
                    team={team}
                    weekStart={weekStart}
                    vandaag={vandaag}
                    magBeheren={magBeheren}
                    sleepId={sleepId}
                    dropTeamId={dropTeamId}
                    onSleepStart={(id) => setSleepId(id)}
                    onSleepEind={() => {
                      setSleepId(null)
                      setDropTeamId(null)
                    }}
                    onSleepOver={(teamId) => setDropTeamId((huidig) => (huidig === teamId ? huidig : teamId))}
                    onSleepVerlaat={(teamId) => setDropTeamId((huidig) => (huidig === teamId ? null : huidig))}
                    onSleepDrop={handleSleepDrop}
                    onLidKlik={(id) => setBewerkId(id)}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}

      {/* Alle medewerkers */}
      <Kaart>
        <KaartKop
          titel={
            <>
              Alle medewerkers <span className="font-normal text-slate-400">({tabelRijen.length})</span>
            </>
          }
          rechts={
            <div className="relative w-64">
              <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
              <Invoer
                className="!pl-8"
                placeholder="Zoek op naam, functie, team…"
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
              />
            </div>
          }
        />
        {tabelRijen.length === 0 ? (
          <div className="p-4">
            <LegeStaat
              titel="Geen medewerkers gevonden"
              tekst={q ? `Geen resultaten voor "${zoek}". Pas de zoekterm aan.` : 'Er zijn nog geen medewerkers geregistreerd.'}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Naam</th>
                  <th className="px-4 py-2.5 font-medium">Functie</th>
                  <th className="px-4 py-2.5 font-medium">Afdeling</th>
                  <th className="px-4 py-2.5 font-medium">Team</th>
                  <th className="px-4 py-2.5 text-right font-medium">Contracturen</th>
                  <th className="px-4 py-2.5 text-right font-medium">Beschikbaarheid</th>
                  <th className="px-4 py-2.5 font-medium">Vaardigheden</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {tabelRijen.map((m) => {
                  const team = data.teams.find((t) => t.id === m.teamId)
                  const tijdelijk = tijdelijkActief(m, vandaag)
                    ? data.teams.find((t) => t.id === m.tijdelijkTeam!.teamId)
                    : undefined
                  return (
                    <tr
                      key={m.id}
                      onClick={magBeheren ? () => setBewerkId(m.id) : undefined}
                      className={`border-b border-slate-100 hover:bg-slate-50 ${magBeheren ? 'cursor-pointer' : ''} ${
                        !m.actief ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="px-4 py-2 font-medium text-slate-800">{m.naam}</td>
                      <td className="px-4 py-2 text-slate-600">{m.functie || '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{AFDELING_LABELS[m.afdeling]}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {team?.naam ?? '—'}
                        {tijdelijk && (
                          <span className="ml-1.5 text-xs text-amber-600">
                            (tijdelijk: {tijdelijk.naam} t/m {formatDatumKort(m.tijdelijkTeam!.tot)})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{m.contracturen} u</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{m.beschikbaarheidPct}%</td>
                      <td className="max-w-56 truncate px-4 py-2 text-slate-500" title={m.vaardigheden.join(', ')}>
                        {m.vaardigheden.length > 0 ? m.vaardigheden.join(', ') : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {m.actief ? <Badge kleur="groen">Actief</Badge> : <Badge kleur="grijs">Inactief</Badge>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kaart>

      {/* Dialogen */}
      <VerplaatsDialoog info={verplaats} weekStart={weekStart} onSluiten={() => setVerplaats(null)} />
      <MedewerkerModal
        open={nieuwMedewerkerOpen || bewerkId !== null}
        medewerkerId={bewerkId}
        afdelingen={zichtbareAfdelingen}
        standaardAfdeling={zichtbareAfdelingen[0]}
        onSluiten={() => {
          setNieuwMedewerkerOpen(false)
          setBewerkId(null)
        }}
      />
      <TeamModal
        open={nieuwTeamOpen}
        afdelingen={zichtbareAfdelingen}
        standaardAfdeling={zichtbareAfdelingen[0]}
        onSluiten={() => setNieuwTeamOpen(false)}
      />
    </div>
  )
}
