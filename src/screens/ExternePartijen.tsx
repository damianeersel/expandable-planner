// Externe partijen: spuiterkalender met slotbewaking + beheer van spuiters en onderaannemers.

import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  CalendarRange,
  Clock,
  Paintbrush,
  Pencil,
  Search,
  Truck,
  User,
} from 'lucide-react'
import { useApp } from '../store/AppState'
import {
  EXTERN_TYPE_LABELS,
  FASE_STATUS_LABELS,
  type ExternType,
  type ExternePartij,
  type Fase,
  type ISODate,
  type Project,
} from '../lib/types'
import {
  addDagen,
  formatDatumKort,
  formatDatumMetDag,
  parseISO,
  startVanWeek,
  vandaagISO,
  volgendeWerkdag,
  weekNummer,
  weekReeks,
  werkdagenTussen,
} from '../lib/dates'
import {
  Badge,
  InfoTip,
  Invoer,
  Kaart,
  KaartKop,
  Keuze,
  Knop,
  LegeStaat,
  Modal,
  PaginaKop,
  Tabs,
  Tekstvak,
  Veld,
  useToast,
} from '../components/ui'

// ---------- Lokale constanten & helpers ----------

const PARTIJ_STATUS_LABELS: Record<ExternePartij['status'], string> = {
  beschikbaar: 'Beschikbaar',
  vol: 'Vol',
  vertraagd: 'Vertraagd',
}

const PARTIJ_STATUS_KLEUR: Record<ExternePartij['status'], 'groen' | 'amber' | 'rood'> = {
  beschikbaar: 'groen',
  vol: 'amber',
  vertraagd: 'rood',
}

const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function maandKort(iso: ISODate): string {
  return MAANDEN_KORT[parseISO(iso).getMonth()]
}

interface ExternBlok {
  fase: Fase
  project: Project
  /** Bezette periode: transportHeen t/m transportTerug (fallback start/eind). */
  van: ISODate
  tot: ISODate
}

function blokPeriode(fase: Fase): { van: ISODate; tot: ISODate } {
  return { van: fase.transportHeen ?? fase.start, tot: fase.transportTerug ?? fase.eind }
}

function overlaptWeek(blok: ExternBlok, maandag: ISODate): boolean {
  const zondag = addDagen(maandag, 6)
  return blok.van <= zondag && blok.tot >= maandag
}

/** Aantal verschillende projecten dat in de week van `maandag` een slot bezet. */
function projectenInWeek(blokken: ExternBlok[], maandag: ISODate): number {
  return new Set(blokken.filter((b) => overlaptWeek(b, maandag)).map((b) => b.project.id)).size
}

/** Eerste datum vanaf vandaag waarop nog een slot vrij is (zoekt 26 weken vooruit). */
function eersteVrijeDatum(blokken: ExternBlok[], slotsPerWeek: number): ISODate | undefined {
  const basis = startVanWeek(vandaagISO())
  for (let i = 0; i < 26; i++) {
    const maandag = addDagen(basis, i * 7)
    if (projectenInWeek(blokken, maandag) < Math.max(1, slotsPerWeek)) {
      return i === 0 ? volgendeWerkdag(vandaagISO()) : maandag
    }
  }
  return undefined
}

function blokTitel(blok: ExternBlok): string {
  const regels = [
    `${blok.project.projectnummer} · ${blok.project.naam}`,
    `Klant: ${blok.project.klant}`,
  ]
  if (blok.fase.transportHeen) regels.push(`Vertrek (transport heen): ${formatDatumMetDag(blok.fase.transportHeen)}`)
  regels.push(`Start spuitwerk: ${formatDatumMetDag(blok.fase.start)}`)
  regels.push(`Verwachte doorlooptijd: ${werkdagenTussen(blok.fase.start, blok.fase.eind)} werkdagen`)
  if (blok.fase.transportTerug) regels.push(`Retour (transport terug): ${formatDatumMetDag(blok.fase.transportTerug)}`)
  regels.push(`Status fase: ${FASE_STATUS_LABELS[blok.fase.status]}`)
  return regels.join('\n')
}

// ---------- Formulier voor bewerken ----------

interface BewerkForm {
  contactpersoon: string
  slotsPerWeek: string
  status: ExternePartij['status']
  vertragingDagen: string
  notities: string
}

// ---------- Scherm ----------

export default function ExternePartijen() {
  const { data, ui, permissies } = useApp()
  const navigate = useNavigate()

  const [tab, setTab] = useState<'spuiters' | 'onderaannemers'>('spuiters')
  const [typeFilter, setTypeFilter] = useState<'alle' | ExternType>('alle')
  const [zoek, setZoek] = useState('')
  const [bewerkPartij, setBewerkPartij] = useState<ExternePartij | null>(null)

  const vandaag = vandaagISO()
  const huidigeWeek = startVanWeek(vandaag)
  const weken = useMemo(() => weekReeks(addDagen(vandaag, -14), 16), [vandaag])

  // Alle externe fases (elke key) gekoppeld aan een actieve partij, incl. project.
  const externeBlokken = useMemo<ExternBlok[]>(() => {
    const blokken: ExternBlok[] = []
    for (const fase of data.fases) {
      if (!fase.externePartijId) continue
      const project = data.projecten.find((p) => p.id === fase.projectId)
      if (!project || project.status === 'geannuleerd') continue
      blokken.push({ fase, project, ...blokPeriode(fase) })
    }
    return blokken
  }, [data.fases, data.projecten])

  // Blokken voor de spuiterkalender: alleen spuiterfases, en schaduw alleen als het scenario dat toelaat.
  const kalenderBlokken = useMemo(
    () =>
      externeBlokken.filter(
        (b) => b.fase.key === 'spuiter' && (ui.scenario !== 'definitief' || b.project.status !== 'schaduw'),
      ),
    [externeBlokken, ui.scenario],
  )

  const blokkenPerPartij = useMemo(() => {
    const map = new Map<string, ExternBlok[]>()
    for (const b of kalenderBlokken) {
      const lijst = map.get(b.fase.externePartijId!) ?? []
      lijst.push(b)
      map.set(b.fase.externePartijId!, lijst)
    }
    return map
  }, [kalenderBlokken])

  // ---------- Tegels ----------

  const nuExtern = useMemo(
    () => data.fases.filter((f) => f.key === 'spuiter' && f.externePartijId && f.status === 'bezig'),
    [data.fases],
  )
  const komende8Weken = useMemo(() => {
    const tot = addDagen(huidigeWeek, 8 * 7 - 1)
    return externeBlokken.filter(
      (b) => b.fase.status !== 'gereed' && b.van <= tot && b.tot >= huidigeWeek,
    )
  }, [externeBlokken, huidigeWeek])
  const vertraagdePartijen = data.externePartijen.filter((e) => e.vertragingDagen > 0)

  // ---------- Filteren ----------

  const gefilterd = useMemo(() => {
    const term = zoek.trim().toLowerCase()
    return data.externePartijen.filter((e) => {
      if (typeFilter !== 'alle' && e.type !== typeFilter) return false
      if (!term) return true
      return [e.naam, e.specialisme, e.contactpersoon, e.notities ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [data.externePartijen, typeFilter, zoek])

  const spuiters = gefilterd.filter((e) => e.type === 'spuiter')
  const onderaannemers = gefilterd.filter((e) => e.type !== 'spuiter')

  // Toegewezen (nog niet gerede) projecten per partij, voor de partijkaarten.
  const toegewezenProjecten = (partijId: string): Project[] => {
    const ids = new Set<string>()
    const lijst: Project[] = []
    for (const b of externeBlokken) {
      if (b.fase.externePartijId !== partijId || b.fase.status === 'gereed') continue
      if (b.project.status === 'opgeleverd') continue
      if (!ids.has(b.project.id)) {
        ids.add(b.project.id)
        lijst.push(b.project)
      }
    }
    return lijst.sort((a, b) => a.projectnummer.localeCompare(b.projectnummer))
  }

  return (
    <div className="p-6">
      <PaginaKop
        titel="Externe partijen"
        uitleg="Spuiterkalender met slotbewaking en het overzicht van alle externe spuiters en onderaannemers."
        rechts={<Badge kleur="grijs">{data.externePartijen.length} partijen</Badge>}
      />

      {/* Tegels */}
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Tegel
          icoon={<Truck size={18} className="text-brand-700" />}
          iconVlak="bg-brand-50"
          waarde={nuExtern.length}
          label="Trailers nu extern"
          uitleg="Spuiterfases die op dit moment in uitvoering zijn bij een externe spuiter."
          sub={
            nuExtern.length > 0
              ? nuExtern
                  .map((f) => data.projecten.find((p) => p.id === f.projectId)?.projectnummer)
                  .filter(Boolean)
                  .join(' · ')
              : 'Geen trailers onderweg of bij een spuiter'
          }
        />
        <Tegel
          icoon={<CalendarRange size={18} className="text-sky-700" />}
          iconVlak="bg-sky-50"
          waarde={komende8Weken.length}
          label="Geplande externe fases · komende 8 weken"
          uitleg="Alle nog niet afgeronde fases bij externe partijen die in de komende 8 weken (deels) gepland staan."
          sub={`Vanaf ${formatDatumKort(huidigeWeek)} t/m ${formatDatumKort(addDagen(huidigeWeek, 8 * 7 - 3))}`}
        />
        <Tegel
          icoon={<AlertTriangle size={18} className={vertraagdePartijen.length > 0 ? 'text-red-600' : 'text-slate-400'} />}
          iconVlak={vertraagdePartijen.length > 0 ? 'bg-red-50' : 'bg-slate-100'}
          waarde={vertraagdePartijen.length}
          label="Partijen met vertraging"
          uitleg="Externe partijen die op dit moment een vertraging in werkdagen hebben gemeld. Vertragingen tellen automatisch mee in de projectrisico's."
          sub={
            vertraagdePartijen.length > 0
              ? vertraagdePartijen.map((e) => `${e.naam} (+${e.vertragingDagen}d)`).join(' · ')
              : 'Geen gemelde vertragingen'
          }
          waardeKleur={vertraagdePartijen.length > 0 ? 'text-red-600' : undefined}
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
          <Invoer
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op naam, specialisme of contactpersoon…"
            className="w-80 pl-8"
          />
        </div>
        <Keuze
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'alle' | ExternType)}
          className="!w-auto"
          title="Filter op type externe partij"
        >
          <option value="alle">Alle typen</option>
          {Object.entries(EXTERN_TYPE_LABELS).map(([waarde, label]) => (
            <option key={waarde} value={waarde}>
              {label}
            </option>
          ))}
        </Keuze>
        {(zoek.trim() !== '' || typeFilter !== 'alle') && (
          <Knop
            klein
            variant="ghost"
            onClick={() => {
              setZoek('')
              setTypeFilter('alle')
            }}
          >
            Filters wissen
          </Knop>
        )}
      </div>

      <Tabs
        tabs={[
          { id: 'spuiters', label: `Externe spuiters (${spuiters.length})` },
          { id: 'onderaannemers', label: `Onderaannemers (${onderaannemers.length})` },
        ]}
        actief={tab}
        onKies={(id) => setTab(id as 'spuiters' | 'onderaannemers')}
      />

      {tab === 'spuiters' && (
        <div className="mt-4 flex flex-col gap-5">
          {/* Spuiterkalender */}
          <Kaart>
            <KaartKop
              titel={
                <>
                  <Paintbrush size={16} className="text-purple-600" />
                  Spuiterkalender
                </>
              }
              uitleg="Per spuiter geldt een vast aantal slots per week: het aantal trailers dat gelijktijdig in behandeling kan zijn (de beschikbare capaciteit). Staan er in één week meer projecten gepland dan er slots zijn, dan is er sprake van een dubbelboeking."
              rechts={
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-5 rounded-sm bg-brand-600" /> Definitief
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="balk-schaduw h-2.5 w-5 rounded-sm" /> Schaduw
                    <InfoTip tekst="Schaduwplanning: nog niet bevestigde orders die alvast in de planning zijn gereserveerd. Ze bezetten wel een spuiterslot zolang ze ingepland staan." />
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-5 rounded-sm border border-red-500 bg-red-50" /> Dubbelboeking
                    <InfoTip tekst="Overboeking: er zijn in die week meer projecten bij de spuiter gepland dan er slots (beschikbare capaciteit) zijn. Verplaats een spuiterfase of wijk uit naar een andere spuiter." />
                  </span>
                </div>
              }
            />
            {ui.scenario === 'definitief' && (
              <div className="flex items-center gap-1.5 border-b border-slate-100 bg-amber-50/60 px-4 py-2 text-xs text-amber-700">
                <AlertTriangle size={13} />
                Scenario “Alleen definitief” actief: schaduwprojecten worden niet getoond en tellen niet mee in de slotbezetting.
              </div>
            )}
            {ui.scenario === 'kansgewogen' && (
              <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
                <Clock size={13} />
                Slots zijn ondeelbaar: ook in het kansgewogen scenario telt een gepland schaduwproject als één volledige slotboeking.
                <InfoTip tekst="Kansgewogen capaciteit weegt schaduwprojecten mee naar hun verkoopkans (70% kans = 70% belasting). Dat werkt voor uren, maar een spuiterslot is óf bezet óf vrij en telt daarom altijd volledig mee." />
              </div>
            )}

            {spuiters.length === 0 ? (
              <div className="p-4">
                <LegeStaat
                  titel="Geen spuiters gevonden"
                  tekst="Er zijn geen externe spuiters die aan het huidige filter of de zoekterm voldoen."
                />
              </div>
            ) : (
              <div className="scrollbar-dun overflow-x-auto">
                <div
                  className="grid text-sm"
                  style={{ gridTemplateColumns: `190px repeat(${weken.length}, minmax(78px, 1fr))`, minWidth: `${190 + weken.length * 78}px` }}
                >
                  {/* Kop: maand + weeknummer */}
                  <div className="sticky left-0 z-10 border-b border-slate-200 bg-white" />
                  {weken.map((maandag, i) => {
                    const isHuidig = maandag === huidigeWeek
                    const nieuweMaand = i === 0 || maandKort(maandag) !== maandKort(weken[i - 1])
                    return (
                      <div
                        key={maandag}
                        className={`border-b border-l border-slate-200 px-1 py-1.5 text-center ${
                          isHuidig ? 'bg-brand-50' : ''
                        }`}
                      >
                        <div className="text-[10px] tracking-wide text-slate-400 uppercase">{nieuweMaand ? maandKort(maandag) : ' '}</div>
                        <div
                          className={`text-xs font-medium tabular-nums ${
                            isHuidig ? 'font-semibold text-brand-800' : 'text-slate-600'
                          }`}
                          title={`Week van ${formatDatumMetDag(maandag)}${isHuidig ? ' (huidige week)' : ''}`}
                        >
                          Wk {weekNummer(maandag)}
                        </div>
                      </div>
                    )
                  })}

                  {/* Rijen per spuiter */}
                  {spuiters.map((spuiter) => {
                    const blokken = blokkenPerPartij.get(spuiter.id) ?? []
                    const vrij = eersteVrijeDatum(blokken, spuiter.slotsPerWeek)
                    return (
                      <SpuiterRij
                        key={spuiter.id}
                        spuiter={spuiter}
                        blokken={blokken}
                        weken={weken}
                        huidigeWeek={huidigeWeek}
                        vrijVanaf={vrij}
                        onOpenProject={(projectId) => navigate(`/projecten/${projectId}`)}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </Kaart>

          {/* Partijkaarten spuiters */}
          {spuiters.length === 0 ? null : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {spuiters.map((partij) => (
                <PartijKaart
                  key={partij.id}
                  partij={partij}
                  projecten={toegewezenProjecten(partij.id)}
                  vrijVanaf={eersteVrijeDatum(blokkenPerPartij.get(partij.id) ?? [], partij.slotsPerWeek)}
                  magBewerken={permissies.externBeheren}
                  onBewerk={() => setBewerkPartij(partij)}
                  onOpenProject={(id) => navigate(`/projecten/${id}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'onderaannemers' && (
        <div className="mt-4">
          {onderaannemers.length === 0 ? (
            <LegeStaat
              titel="Geen onderaannemers gevonden"
              tekst="Er zijn geen onderaannemers die aan het huidige filter of de zoekterm voldoen. Pas het type-filter of de zoekterm aan."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {onderaannemers.map((partij) => (
                <PartijKaart
                  key={partij.id}
                  partij={partij}
                  projecten={toegewezenProjecten(partij.id)}
                  vrijVanaf={eersteVrijeDatum(
                    externeBlokken.filter((b) => b.fase.externePartijId === partij.id),
                    partij.slotsPerWeek,
                  )}
                  magBewerken={permissies.externBeheren}
                  onBewerk={() => setBewerkPartij(partij)}
                  onOpenProject={(id) => navigate(`/projecten/${id}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <BewerkModal partij={bewerkPartij} onSluiten={() => setBewerkPartij(null)} />
    </div>
  )
}

// ---------- Tegel ----------

function Tegel({
  icoon,
  iconVlak,
  waarde,
  label,
  uitleg,
  sub,
  waardeKleur,
}: {
  icoon: ReactNode
  iconVlak: string
  waarde: number
  label: string
  uitleg: string
  sub: string
  waardeKleur?: string
}) {
  return (
    <Kaart className="flex items-start gap-3 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${iconVlak}`}>{icoon}</div>
      <div className="min-w-0">
        <div className={`text-xl leading-6 font-semibold tabular-nums ${waardeKleur ?? 'text-slate-900'}`}>{waarde}</div>
        <div className="flex items-center gap-1 text-xs font-medium text-slate-600">
          {label}
          <InfoTip tekst={uitleg} />
        </div>
        <div className="mt-0.5 truncate text-[11px] text-slate-400" title={sub}>
          {sub}
        </div>
      </div>
    </Kaart>
  )
}

// ---------- Kalenderrij per spuiter ----------

function SpuiterRij({
  spuiter,
  blokken,
  weken,
  huidigeWeek,
  vrijVanaf,
  onOpenProject,
}: {
  spuiter: ExternePartij
  blokken: ExternBlok[]
  weken: ISODate[]
  huidigeWeek: ISODate
  vrijVanaf?: ISODate
  onOpenProject: (projectId: string) => void
}) {
  const slots = Math.max(1, spuiter.slotsPerWeek)
  return (
    <>
      {/* Hoofdrij met projectblokjes */}
      <div className="sticky left-0 z-10 flex min-h-14 flex-col justify-center gap-1 border-t border-slate-200 bg-white px-3 py-1.5">
        <span className="truncate text-xs font-semibold text-slate-800" title={spuiter.naam}>
          {spuiter.naam}
        </span>
        {vrijVanaf ? (
          <span className="w-fit">
            <Badge kleur="groen" title={`Eerste datum met een vrij slot: ${formatDatumMetDag(vrijVanaf)}`}>
              Vrij vanaf {formatDatumKort(vrijVanaf)}
            </Badge>
          </span>
        ) : (
          <span className="w-fit">
            <Badge kleur="amber" title="Geen vrij slot gevonden in de komende 26 weken">
              Geen slot vrij
            </Badge>
          </span>
        )}
      </div>
      {weken.map((maandag) => {
        const zondag = addDagen(maandag, 6)
        const celBlokken = blokken
          .filter((b) => b.van <= zondag && b.tot >= maandag)
          .sort((a, b) => (a.van === b.van ? a.project.projectnummer.localeCompare(b.project.projectnummer) : a.van < b.van ? -1 : 1))
        const aantal = new Set(celBlokken.map((b) => b.project.id)).size
        const overboekt = aantal > slots
        const isHuidig = maandag === huidigeWeek
        return (
          <div
            key={maandag}
            className={`relative flex min-h-14 flex-col gap-0.5 border-t border-l border-slate-100 p-1 ${
              isHuidig ? 'bg-brand-50/40' : ''
            } ${overboekt ? 'bg-red-50/50 outline-1 -outline-offset-1 outline-red-500' : ''}`}
          >
            {overboekt && (
              <span
                className="absolute top-0.5 right-0.5 z-[5] text-red-600"
                title={`Dubbelboeking: ${aantal} projecten, ${slots} slot(s)`}
              >
                <AlertTriangle size={12} />
              </span>
            )}
            {celBlokken.map((b) => {
              const definitiefStijl = b.project.status !== 'schaduw'
              return (
                <button
                  key={b.fase.id}
                  onClick={() => onOpenProject(b.project.id)}
                  title={blokTitel(b)}
                  className={`w-full cursor-pointer truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight font-medium transition-opacity hover:opacity-80 ${
                    definitiefStijl ? 'bg-brand-600 text-white' : 'balk-schaduw text-brand-900'
                  }`}
                >
                  {b.project.projectnummer}
                </button>
              )
            })}
          </div>
        )
      })}

      {/* Dunne bezettingsregel: gebruikte / beschikbare slots per week */}
      <div className="sticky left-0 z-10 flex items-center justify-end border-t border-slate-100 bg-white px-3 py-0.5">
        <span className="flex items-center gap-1 text-[10px] text-slate-400">
          bezetting
          <InfoTip tekst="Gebruikte slots / beschikbare slots per week. De beschikbare capaciteit van een spuiter wordt uitgedrukt in slots: het aantal trailers dat per week gelijktijdig in behandeling kan zijn." />
        </span>
      </div>
      {weken.map((maandag) => {
        const aantal = projectenInWeek(blokken, maandag)
        const kleur =
          aantal > slots
            ? 'text-red-600 font-semibold'
            : aantal === slots
              ? 'text-amber-600 font-medium'
              : aantal > 0
                ? 'text-slate-500'
                : 'text-slate-300'
        return (
          <div
            key={maandag}
            className={`border-t border-l border-slate-100 py-0.5 text-center text-[10px] tabular-nums ${kleur} ${
              maandag === huidigeWeek ? 'bg-brand-50/40' : ''
            }`}
            title={`Week ${weekNummer(maandag)}: ${aantal} van ${slots} slot(s) bezet`}
          >
            {aantal}/{slots}
          </div>
        )
      })}
    </>
  )
}

// ---------- Partijkaart ----------

function PartijKaart({
  partij,
  projecten,
  vrijVanaf,
  magBewerken,
  onBewerk,
  onOpenProject,
}: {
  partij: ExternePartij
  projecten: Project[]
  vrijVanaf?: ISODate
  magBewerken: boolean
  onBewerk: () => void
  onOpenProject: (projectId: string) => void
}) {
  return (
    <Kaart className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-800">{partij.naam}</span>
            <Badge kleur={partij.type === 'spuiter' ? 'paars' : 'blauw'}>{EXTERN_TYPE_LABELS[partij.type]}</Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <Building2 size={13} className="shrink-0 text-slate-400" />
            {partij.specialisme}
          </p>
        </div>
        {magBewerken && (
          <Knop klein variant="ghost" onClick={onBewerk} title={`Gegevens van ${partij.naam} bewerken`}>
            <Pencil size={14} />
            Bewerken
          </Knop>
        )}
      </div>

      <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <span className="text-slate-500">Status</span>
        <span>
          <Badge kleur={PARTIJ_STATUS_KLEUR[partij.status]}>{PARTIJ_STATUS_LABELS[partij.status]}</Badge>
        </span>

        <span className="text-slate-500">Contactpersoon</span>
        <span className="flex items-center gap-1 text-slate-700">
          <User size={13} className="text-slate-400" />
          {partij.contactpersoon}
        </span>

        <span className="flex items-center gap-1 text-slate-500">
          Slots per week
          <InfoTip tekst="Beschikbare capaciteit: het aantal projecten dat deze partij gelijktijdig per week kan behandelen." />
        </span>
        <span className="tabular-nums text-slate-700">{partij.slotsPerWeek}</span>

        <span className="text-slate-500">Vertraging</span>
        {partij.vertragingDagen > 0 ? (
          <span className="flex items-center gap-1 font-medium text-red-600">
            <AlertTriangle size={13} />
            {partij.vertragingDagen} werkdag{partij.vertragingDagen === 1 ? '' : 'en'}
          </span>
        ) : (
          <span className="text-slate-400">Geen</span>
        )}

        <span className="flex items-center gap-1 text-slate-500">
          Eerstvolgend vrij
          <InfoTip tekst="Eerste datum waarop nog een slot vrij is, afgeleid uit de geplande externe fases in de planning." />
        </span>
        {vrijVanaf ? (
          <span className="font-medium text-emerald-700">{formatDatumMetDag(vrijVanaf)}</span>
        ) : (
          <span className="text-amber-600">Niet binnen 26 weken</span>
        )}
      </div>

      <div className="mt-3">
        <div className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">Toegewezen projecten</div>
        {projecten.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">Geen actuele projecten toegewezen.</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1">
            {projecten.map((p) => (
              <button
                key={p.id}
                onClick={() => onOpenProject(p.id)}
                title={`${p.projectnummer} · ${p.naam} (${p.klant})`}
                className="cursor-pointer rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
              >
                {p.projectnummer}
              </button>
            ))}
          </div>
        )}
      </div>

      {partij.notities && (
        <p className="mt-3 rounded bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500 italic">{partij.notities}</p>
      )}
    </Kaart>
  )
}

// ---------- Bewerkmodal ----------

function BewerkModal({ partij, onSluiten }: { partij: ExternePartij | null; onSluiten: () => void }) {
  const { dispatch, permissies } = useApp()
  const { toon } = useToast()
  const [form, setForm] = useState<BewerkForm | null>(null)
  const [fouten, setFouten] = useState<Partial<Record<keyof BewerkForm, string>>>({})
  const [partijId, setPartijId] = useState<string | null>(null)

  // Formulier vullen zodra een (andere) partij geopend wordt.
  if (partij && partij.id !== partijId) {
    setPartijId(partij.id)
    setForm({
      contactpersoon: partij.contactpersoon,
      slotsPerWeek: String(partij.slotsPerWeek),
      status: partij.status,
      vertragingDagen: String(partij.vertragingDagen),
      notities: partij.notities ?? '',
    })
    setFouten({})
  }
  if (!partij && partijId !== null) {
    setPartijId(null)
    setForm(null)
  }

  if (!partij || !form || !permissies.externBeheren) return null

  const zet = <K extends keyof BewerkForm>(veld: K, waarde: BewerkForm[K]) =>
    setForm((f) => (f ? { ...f, [veld]: waarde } : f))

  const opslaan = () => {
    const nieuweFouten: Partial<Record<keyof BewerkForm, string>> = {}
    const contactpersoon = form.contactpersoon.trim()
    if (!contactpersoon) nieuweFouten.contactpersoon = 'Vul een contactpersoon in.'
    const slots = Number(form.slotsPerWeek)
    if (!Number.isFinite(slots) || slots < 1) nieuweFouten.slotsPerWeek = 'Slots per week moet een getal van minimaal 1 zijn.'
    const vertraging = Number(form.vertragingDagen)
    if (form.vertragingDagen.trim() === '' || !Number.isFinite(vertraging) || vertraging < 0)
      nieuweFouten.vertragingDagen = 'Vul een vertraging van 0 of meer werkdagen in.'
    setFouten(nieuweFouten)
    if (Object.keys(nieuweFouten).length > 0) return

    const nieuweVertraging = Math.round(vertraging)
    dispatch({
      type: 'EXTERN_BIJWERKEN',
      id: partij.id,
      patch: {
        contactpersoon,
        slotsPerWeek: Math.round(slots),
        status: form.status,
        vertragingDagen: nieuweVertraging,
        notities: form.notities.trim() || undefined,
      },
    })
    if (nieuweVertraging !== partij.vertragingDagen) {
      toon(
        nieuweVertraging > 0 ? 'waarschuwing' : 'succes',
        `${partij.naam} bijgewerkt. Vertraging is nu ${nieuweVertraging} werkdag(en); de projectrisico's zijn automatisch bijgewerkt.`,
      )
    } else {
      toon('succes', `Gegevens van ${partij.naam} bijgewerkt.`)
    }
    onSluiten()
  }

  return (
    <Modal
      open
      titel={`${partij.naam} bewerken`}
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={opslaan}>
            Opslaan
          </Knop>
        </>
      }
    >
      <div className="grid gap-3">
        <Veld label="Contactpersoon" verplicht fout={fouten.contactpersoon}>
          <Invoer
            value={form.contactpersoon}
            onChange={(e) => zet('contactpersoon', e.target.value)}
            placeholder="Naam contactpersoon"
          />
        </Veld>
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Slots per week" verplicht fout={fouten.slotsPerWeek}>
            <Invoer
              type="number"
              min={1}
              step={1}
              value={form.slotsPerWeek}
              onChange={(e) => zet('slotsPerWeek', e.target.value)}
            />
          </Veld>
          <Veld label="Status" verplicht>
            <Keuze value={form.status} onChange={(e) => zet('status', e.target.value as ExternePartij['status'])}>
              {(Object.keys(PARTIJ_STATUS_LABELS) as ExternePartij['status'][]).map((s) => (
                <option key={s} value={s}>
                  {PARTIJ_STATUS_LABELS[s]}
                </option>
              ))}
            </Keuze>
          </Veld>
        </div>
        <Veld label="Vertraging (werkdagen)" verplicht fout={fouten.vertragingDagen}>
          <Invoer
            type="number"
            min={0}
            step={1}
            value={form.vertragingDagen}
            onChange={(e) => zet('vertragingDagen', e.target.value)}
          />
        </Veld>
        <p className="-mt-1.5 text-[11px] text-slate-400">
          Een gemelde vertraging telt automatisch mee in de risicobepaling van alle projecten met een lopende of geplande fase
          bij deze partij.
        </p>
        <Veld label="Notities">
          <Tekstvak
            rows={3}
            value={form.notities}
            onChange={(e) => zet('notities', e.target.value)}
            placeholder="Bijv. reden van vertraging of afspraken over capaciteit"
          />
        </Veld>
      </div>
    </Modal>
  )
}
