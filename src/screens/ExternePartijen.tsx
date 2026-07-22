// Externe partijen: spuiterkalender met slotbewaking + volledig partnerbeheer + overzicht van externe acties.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Building2,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  Clock,
  Copy,
  Mail,
  MapPin,
  MoreVertical,
  Paintbrush,
  Pencil,
  Phone,
  Plus,
  Search,
  Timer,
  Trash2,
  Truck,
  User,
} from 'lucide-react'
import { useApp } from '../store/AppState'
import {
  EXTERN_TYPE_LABELS,
  EXTERNE_ACTIE_LABELS,
  externTypeLabel,
  FASE_STATUS_LABELS,
  TAAK_STATUS_LABELS,
  type ExterneActieStatus,
  type ExternePartij,
  type Fase,
  type ISODate,
  type Project,
  type Taak,
  type TaakStatus,
} from '../lib/types'
import {
  addDagen,
  formatDatum,
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
  Tabs,
  Tekstvak,
  Veld,
  useToast,
  type BadgeKleur,
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

const ACTIE_STATUS_KLEUR: Record<ExterneActieStatus, BadgeKleur> = {
  niet_aangevraagd: 'grijs',
  aangevraagd: 'amber',
  wacht_bevestiging: 'amber',
  bevestigd: 'blauw',
  in_uitvoering: 'blauw',
  on_hold: 'amber',
  gereed: 'groen',
  vertraagd: 'rood',
}

const TAAK_STATUS_KLEUR: Record<TaakStatus, BadgeKleur> = {
  te_doen: 'grijs',
  in_uitvoering: 'blauw',
  on_hold: 'amber',
  gereed: 'groen',
}

/** Sentinel-waarde in het typeveld van de partnermodal: gebruiker voegt een eigen type toe. */
const NIEUW_TYPE = '__nieuw_type__'

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

/** Projecten en externe taken die aan één partner gekoppeld zijn. */
interface Koppelingen {
  projecten: Project[]
  taken: { project: Project; taak: Taak }[]
}

const LEGE_KOPPELINGEN: Koppelingen = { projecten: [], taken: [] }

/** Eén rij in het overzicht "Externe acties": een taak met uitvoering 'extern'. */
interface ActieRij {
  project: Project
  fase: Fase
  taak: Taak
}

type ArchiefFilter = 'actief' | 'gearchiveerd' | 'alles'

// ---------- Scherm ----------

export default function ExternePartijen() {
  const { data, ui, permissies, dispatch } = useApp()
  const navigate = useNavigate()
  const { toon } = useToast()

  const [tab, setTab] = useState<'spuiters' | 'onderaannemers'>('spuiters')
  const [typeFilter, setTypeFilter] = useState<string>('alle')
  const [archiefFilter, setArchiefFilter] = useState<ArchiefFilter>('actief')
  const [zoek, setZoek] = useState('')
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [bewerkPartij, setBewerkPartij] = useState<ExternePartij | null>(null)
  const [archiveerPartij, setArchiveerPartij] = useState<ExternePartij | null>(null)
  const [verwijderPartij, setVerwijderPartij] = useState<ExternePartij | null>(null)

  const metUndo = { label: 'Ongedaan maken', onClick: () => dispatch({ type: 'UNDO' }) }

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

  // Partij-ids die ergens in gebruik zijn (fases, processen, externe taken of units) — verwijderen is dan geblokkeerd.
  const inGebruikIds = useMemo(() => {
    const ids = new Set<string>()
    for (const f of data.fases) {
      if (f.externePartijId) ids.add(f.externePartijId)
      for (const wp of f.werkpakketten) {
        if (wp.externePartijId) ids.add(wp.externePartijId)
        for (const t of wp.taken) if (t.externeActie?.partijId) ids.add(t.externeActie.partijId)
      }
    }
    for (const u of data.units) if (u.bijExternePartijId) ids.add(u.bijExternePartijId)
    return ids
  }, [data.fases, data.units])

  // "Gekoppeld aan" per partner: projecten (via fases/processen) en externe taken.
  const koppelingenPerPartij = useMemo(() => {
    const map = new Map<string, Koppelingen>()
    const voorPartij = (id: string): Koppelingen => {
      let k = map.get(id)
      if (!k) {
        k = { projecten: [], taken: [] }
        map.set(id, k)
      }
      return k
    }
    const projectVan = new Map(data.projecten.map((p) => [p.id, p]))
    const voegProject = (partijId: string, project: Project) => {
      const k = voorPartij(partijId)
      if (!k.projecten.some((p) => p.id === project.id)) k.projecten.push(project)
    }
    for (const fase of data.fases) {
      const project = projectVan.get(fase.projectId)
      if (!project) continue
      if (fase.externePartijId) voegProject(fase.externePartijId, project)
      for (const wp of fase.werkpakketten) {
        if (wp.externePartijId) voegProject(wp.externePartijId, project)
        for (const taak of wp.taken) {
          if (taak.externeActie?.partijId) voorPartij(taak.externeActie.partijId).taken.push({ project, taak })
        }
      }
    }
    for (const k of map.values()) k.projecten.sort((a, b) => a.projectnummer.localeCompare(b.projectnummer))
    return map
  }, [data.fases, data.projecten])

  // Alle externe taken over alle projecten, gesorteerd op startdatum.
  const externeActies = useMemo<ActieRij[]>(() => {
    const rijen: ActieRij[] = []
    const projectVan = new Map(data.projecten.map((p) => [p.id, p]))
    for (const fase of data.fases) {
      const project = projectVan.get(fase.projectId)
      if (!project) continue
      for (const wp of fase.werkpakketten) {
        for (const taak of wp.taken) {
          if (taak.uitvoering === 'extern') rijen.push({ project, fase, taak })
        }
      }
    }
    rijen.sort((a, b) => {
      const sa = a.taak.start ?? '9999-12-31'
      const sb = b.taak.start ?? '9999-12-31'
      if (sa !== sb) return sa < sb ? -1 : 1
      return a.project.projectnummer.localeCompare(b.project.projectnummer)
    })
    return rijen
  }, [data.fases, data.projecten])

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
  const vertraagdePartijen = data.externePartijen.filter((e) => !e.gearchiveerd && e.vertragingDagen > 0)

  // ---------- Filteren ----------

  const gefilterd = useMemo(() => {
    const term = zoek.trim().toLowerCase()
    return data.externePartijen.filter((e) => {
      if (archiefFilter === 'actief' && e.gearchiveerd) return false
      if (archiefFilter === 'gearchiveerd' && !e.gearchiveerd) return false
      if (typeFilter !== 'alle' && e.type !== typeFilter) return false
      if (!term) return true
      return [e.naam, e.specialisme, e.contactpersoon, e.email ?? '', e.telefoon ?? '', e.adres ?? '', e.notities ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [data.externePartijen, typeFilter, archiefFilter, zoek])

  const spuiters = gefilterd.filter((e) => e.type === 'spuiter')
  const onderaannemers = gefilterd.filter((e) => e.type !== 'spuiter')

  const filtersActief = zoek.trim() !== '' || typeFilter !== 'alle' || archiefFilter !== 'actief'

  // ---------- Partneracties ----------

  const dupliceer = (partij: ExternePartij) => {
    const kopie: ExternePartij = { ...partij, id: uid('ext'), naam: `${partij.naam} (kopie)`, gearchiveerd: false }
    dispatch({ type: 'PARTNER_TOEVOEGEN', partij: kopie })
    toon('succes', `${partij.naam} gedupliceerd als “${kopie.naam}”.`, metUndo)
  }

  const activeer = (partij: ExternePartij) => {
    dispatch({ type: 'EXTERN_BIJWERKEN', id: partij.id, patch: { gearchiveerd: false } })
    toon('succes', `${partij.naam} is opnieuw geactiveerd en weer selecteerbaar bij nieuwe koppelingen.`, metUndo)
  }

  const archiveerBevestigd = () => {
    if (!archiveerPartij) return
    dispatch({ type: 'EXTERN_BIJWERKEN', id: archiveerPartij.id, patch: { gearchiveerd: true } })
    toon('succes', `${archiveerPartij.naam} gearchiveerd. Deze partner is niet meer selecteerbaar bij nieuwe koppelingen.`, metUndo)
    setArchiveerPartij(null)
  }

  const verwijderBevestigd = () => {
    if (!verwijderPartij) return
    if (inGebruikIds.has(verwijderPartij.id)) {
      toon('fout', `${verwijderPartij.naam} is inmiddels gekoppeld aan projecten of taken en kan niet worden verwijderd.`)
      setVerwijderPartij(null)
      return
    }
    dispatch({ type: 'PARTNER_VERWIJDEREN', id: verwijderPartij.id })
    toon('succes', `${verwijderPartij.naam} verwijderd.`, metUndo)
    setVerwijderPartij(null)
  }

  const partijKaartVoor = (partij: ExternePartij, vrijVanaf?: ISODate) => (
    <PartijKaart
      key={partij.id}
      partij={partij}
      koppelingen={koppelingenPerPartij.get(partij.id) ?? LEGE_KOPPELINGEN}
      vrijVanaf={vrijVanaf}
      magBewerken={permissies.externBeheren}
      verwijderbaar={!inGebruikIds.has(partij.id)}
      onBewerk={() => setBewerkPartij(partij)}
      onDupliceer={() => dupliceer(partij)}
      onArchiveer={() => setArchiveerPartij(partij)}
      onActiveer={() => activeer(partij)}
      onVerwijder={() => setVerwijderPartij(partij)}
      onOpenProject={(id) => navigate(`/projecten/${id}`)}
    />
  )

  return (
    <div className="p-6">
      <PaginaKop
        titel="Externe partijen"
        uitleg="Spuiterkalender met slotbewaking en het overzicht van alle externe spuiters en onderaannemers."
        rechts={
          <>
            <Badge kleur="grijs">{data.externePartijen.length} partijen</Badge>
            {permissies.externBeheren && (
              <Knop variant="primary" onClick={() => setNieuwOpen(true)}>
                <Plus size={16} />
                Nieuwe externe partner
              </Knop>
            )}
          </>
        }
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
          onChange={(e) => setTypeFilter(e.target.value)}
          className="!w-auto"
          title="Filter op type externe partij"
        >
          <option value="alle">Alle typen</option>
          {Object.entries(EXTERN_TYPE_LABELS).map(([waarde, label]) => (
            <option key={waarde} value={waarde}>
              {label}
            </option>
          ))}
          {data.partnerTypes
            .filter((t) => !(t in EXTERN_TYPE_LABELS))
            .map((t) => (
              <option key={t} value={t}>
                {externTypeLabel(t)}
              </option>
            ))}
        </Keuze>
        <Keuze
          value={archiefFilter}
          onChange={(e) => setArchiefFilter(e.target.value as ArchiefFilter)}
          className="!w-auto"
          title="Toon actieve of gearchiveerde partners. Gearchiveerde partners zijn niet meer selecteerbaar bij nieuwe koppelingen."
        >
          <option value="actief">Actief</option>
          <option value="gearchiveerd">Gearchiveerd</option>
          <option value="alles">Alles</option>
        </Keuze>
        {filtersActief && (
          <Knop
            klein
            variant="ghost"
            onClick={() => {
              setZoek('')
              setTypeFilter('alle')
              setArchiefFilter('actief')
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
                        <div className="text-[10px] tracking-wide text-slate-400 uppercase">{nieuweMaand ? maandKort(maandag) : ' '}</div>
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
              {spuiters.map((partij) =>
                partijKaartVoor(partij, eersteVrijeDatum(blokkenPerPartij.get(partij.id) ?? [], partij.slotsPerWeek)),
              )}
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
              {onderaannemers.map((partij) =>
                partijKaartVoor(
                  partij,
                  eersteVrijeDatum(
                    externeBlokken.filter((b) => b.fase.externePartijId === partij.id),
                    partij.slotsPerWeek,
                  ),
                ),
              )}
            </div>
          )}
        </div>
      )}

      {/* Externe acties over alle projecten */}
      <div className="mt-5">
        <ExterneActiesKaart
          rijen={externeActies}
          partijen={data.externePartijen}
          onOpenProject={(id) => navigate(`/projecten/${id}`)}
        />
      </div>

      {(nieuwOpen || bewerkPartij !== null) && (
        <PartnerModal
          key={bewerkPartij?.id ?? 'nieuw'}
          partij={bewerkPartij}
          onSluiten={() => {
            setNieuwOpen(false)
            setBewerkPartij(null)
          }}
        />
      )}

      <BevestigDialog
        open={archiveerPartij !== null}
        titel="Partner archiveren"
        tekst={
          archiveerPartij
            ? `Weet je zeker dat je ${archiveerPartij.naam} wilt archiveren? Gearchiveerde partners zijn niet meer selecteerbaar bij nieuwe koppelingen; bestaande planningen en taken blijven ongewijzigd. Je kunt de partner later opnieuw activeren.`
            : undefined
        }
        bevestigLabel="Archiveren"
        onBevestig={archiveerBevestigd}
        onAnnuleer={() => setArchiveerPartij(null)}
      />

      <BevestigDialog
        open={verwijderPartij !== null}
        titel="Partner verwijderen"
        gevaarlijk
        tekst={
          verwijderPartij
            ? `Weet je zeker dat je ${verwijderPartij.naam} definitief wilt verwijderen? Deze partner is nergens gekoppeld; het verwijderen kan direct via de melding ongedaan worden gemaakt.`
            : undefined
        }
        bevestigLabel="Verwijderen"
        onBevestig={verwijderBevestigd}
        onAnnuleer={() => setVerwijderPartij(null)}
      />
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
        <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-800" title={spuiter.naam}>
          {spuiter.naam}
          {spuiter.gearchiveerd && <Badge kleur="amber">Gearchiveerd</Badge>}
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

// ---------- Rij-actiemenu (kebab) ----------

interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  gevaarlijk?: boolean
}

/** Compact acties-menu met vaste positionering (ontsnapt aan kaart- en tabel-overflow). */
function RijMenu({ items, titel = 'Acties' }: { items: MenuItem[]; titel?: string }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [coord, setCoord] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const herpositioneer = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) setCoord({ top: r.bottom + 4, left: r.right })
    }
    herpositioneer()
    const opBuitenklik = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const opToets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', opBuitenklik)
    window.addEventListener('resize', herpositioneer)
    window.addEventListener('scroll', herpositioneer, true)
    window.addEventListener('keydown', opToets)
    return () => {
      window.removeEventListener('mousedown', opBuitenklik)
      window.removeEventListener('resize', herpositioneer)
      window.removeEventListener('scroll', herpositioneer, true)
      window.removeEventListener('keydown', opToets)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        title={titel}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreVertical size={16} />
      </button>
      {open && coord && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: coord.top, left: coord.left, transform: 'translateX(-100%)' }}
          className="z-[70] w-64 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((it, i) => (
            <button
              key={i}
              disabled={it.disabled}
              title={it.title}
              onClick={(e) => {
                e.stopPropagation()
                if (it.disabled) return
                setOpen(false)
                it.onClick()
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                it.disabled
                  ? 'cursor-not-allowed text-slate-300'
                  : it.gevaarlijk
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="shrink-0">{it.icon}</span>
              <span className="flex-1">{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// ---------- Partijkaart ----------

function PartijKaart({
  partij,
  koppelingen,
  vrijVanaf,
  magBewerken,
  verwijderbaar,
  onBewerk,
  onDupliceer,
  onArchiveer,
  onActiveer,
  onVerwijder,
  onOpenProject,
}: {
  partij: ExternePartij
  koppelingen: Koppelingen
  vrijVanaf?: ISODate
  magBewerken: boolean
  verwijderbaar: boolean
  onBewerk: () => void
  onDupliceer: () => void
  onArchiveer: () => void
  onActiveer: () => void
  onVerwijder: () => void
  onOpenProject: (projectId: string) => void
}) {
  const doorlooptijd = partij.standaardDoorlooptijdDagen
  return (
    <Kaart className={`flex flex-col p-4 ${partij.gearchiveerd ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-800">{partij.naam}</span>
            <Badge kleur={partij.type === 'spuiter' ? 'paars' : 'blauw'}>{externTypeLabel(partij.type)}</Badge>
            {partij.gearchiveerd && (
              <Badge kleur="amber" title="Gearchiveerd: niet meer selecteerbaar bij nieuwe koppelingen. Via het actiemenu opnieuw te activeren.">
                Gearchiveerd
              </Badge>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <Building2 size={13} className="shrink-0 text-slate-400" />
            {partij.specialisme || '—'}
          </p>
        </div>
        {magBewerken && (
          <RijMenu
            titel={`Acties voor ${partij.naam}`}
            items={[
              { label: 'Bewerken', icon: <Pencil size={14} />, onClick: onBewerk },
              { label: 'Dupliceren', icon: <Copy size={14} />, onClick: onDupliceer },
              partij.gearchiveerd
                ? { label: 'Opnieuw activeren', icon: <ArchiveRestore size={14} />, onClick: onActiveer }
                : {
                    label: 'Archiveren',
                    icon: <Archive size={14} />,
                    onClick: onArchiveer,
                    title: 'Gearchiveerde partners zijn niet meer selecteerbaar bij nieuwe koppelingen.',
                  },
              {
                label: 'Verwijderen',
                icon: <Trash2 size={14} />,
                gevaarlijk: true,
                disabled: !verwijderbaar,
                title: verwijderbaar
                  ? undefined
                  : 'Deze partner is gekoppeld aan projecten of taken en kan niet worden verwijderd — archiveer in plaats daarvan.',
                onClick: onVerwijder,
              },
            ]}
          />
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
          {partij.contactpersoon || '—'}
        </span>

        {partij.email && (
          <>
            <span className="text-slate-500">E-mail</span>
            <a
              href={`mailto:${partij.email}`}
              className="flex min-w-0 items-center gap-1 text-slate-700 hover:text-brand-700 hover:underline"
              title={`E-mail sturen naar ${partij.email}`}
            >
              <Mail size={13} className="shrink-0 text-slate-400" />
              <span className="truncate">{partij.email}</span>
            </a>
          </>
        )}

        {partij.telefoon && (
          <>
            <span className="text-slate-500">Telefoon</span>
            <a
              href={`tel:${partij.telefoon}`}
              className="flex items-center gap-1 text-slate-700 hover:text-brand-700 hover:underline"
              title={`Bellen met ${partij.naam}`}
            >
              <Phone size={13} className="shrink-0 text-slate-400" />
              {partij.telefoon}
            </a>
          </>
        )}

        {partij.adres && (
          <>
            <span className="text-slate-500">Adres</span>
            <span className="flex min-w-0 items-center gap-1 text-slate-700" title={partij.adres}>
              <MapPin size={13} className="shrink-0 text-slate-400" />
              <span className="truncate">{partij.adres}</span>
            </span>
          </>
        )}

        {partij.beschikbaarheid && (
          <>
            <span className="text-slate-500">Beschikbaarheid</span>
            <span className="flex items-start gap-1 text-slate-700">
              <CalendarClock size={13} className="mt-0.5 shrink-0 text-slate-400" />
              {partij.beschikbaarheid}
            </span>
          </>
        )}

        {doorlooptijd != null && (
          <>
            <span className="flex items-center gap-1 text-slate-500">
              Doorlooptijd
              <InfoTip tekst="Standaard doorlooptijd in dagen die deze partner nodig heeft voor een opdracht." />
            </span>
            <span className="flex items-center gap-1 tabular-nums text-slate-700">
              <Timer size={13} className="text-slate-400" />
              {doorlooptijd} {doorlooptijd === 1 ? 'dag' : 'dagen'}
            </span>
          </>
        )}

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
        <div className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
          Gekoppeld aan
          <InfoTip tekst="Projecten met een fase of proces bij deze partner, plus alle externe taken die aan deze partner zijn uitbesteed. Klik om het project te openen." />
        </div>
        {koppelingen.projecten.length === 0 && koppelingen.taken.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">Geen projecten of externe taken gekoppeld.</p>
        ) : (
          <>
            {koppelingen.projecten.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {koppelingen.projecten.map((p) => (
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
            {koppelingen.taken.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {koppelingen.taken.map(({ project, taak }) => (
                  <button
                    key={taak.id}
                    onClick={() => onOpenProject(project.id)}
                    title={`Externe taak · ${taak.naam} (${project.projectnummer} · ${project.naam})`}
                    className="max-w-full cursor-pointer truncate rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 transition-colors hover:border-sky-300 hover:bg-sky-100"
                  >
                    {project.projectnummer} · {taak.naam}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {partij.notities && (
        <p className="mt-3 rounded bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500 italic">{partij.notities}</p>
      )}
    </Kaart>
  )
}

// ---------- Partnermodal (nieuw & bewerken) ----------

interface PartnerForm {
  naam: string
  type: string
  nieuwType: string
  specialisme: string
  contactpersoon: string
  email: string
  telefoon: string
  adres: string
  beschikbaarheid: string
  slotsPerWeek: string
  standaardDoorlooptijdDagen: string
  status: ExternePartij['status']
  vertragingDagen: string
  notities: string
}

type PartnerFout = 'naam' | 'nieuwType' | 'email' | 'slotsPerWeek' | 'standaardDoorlooptijdDagen' | 'vertragingDagen'

function initPartnerForm(partij: ExternePartij | null): PartnerForm {
  if (partij) {
    return {
      naam: partij.naam,
      type: partij.type,
      nieuwType: '',
      specialisme: partij.specialisme,
      contactpersoon: partij.contactpersoon,
      email: partij.email ?? '',
      telefoon: partij.telefoon ?? '',
      adres: partij.adres ?? '',
      beschikbaarheid: partij.beschikbaarheid ?? '',
      slotsPerWeek: String(partij.slotsPerWeek),
      standaardDoorlooptijdDagen: partij.standaardDoorlooptijdDagen != null ? String(partij.standaardDoorlooptijdDagen) : '',
      status: partij.status,
      vertragingDagen: String(partij.vertragingDagen),
      notities: partij.notities ?? '',
    }
  }
  return {
    naam: '',
    type: 'spuiter',
    nieuwType: '',
    specialisme: '',
    contactpersoon: '',
    email: '',
    telefoon: '',
    adres: '',
    beschikbaarheid: '',
    slotsPerWeek: '1',
    standaardDoorlooptijdDagen: '',
    status: 'beschikbaar',
    vertragingDagen: '0',
    notities: '',
  }
}

function PartnerModal({ partij, onSluiten }: { partij: ExternePartij | null; onSluiten: () => void }) {
  const { data, dispatch, permissies } = useApp()
  const { toon } = useToast()
  const [form, setForm] = useState<PartnerForm>(() => initPartnerForm(partij))
  const [fouten, setFouten] = useState<Partial<Record<PartnerFout, string>>>({})

  const metUndo = { label: 'Ongedaan maken', onClick: () => dispatch({ type: 'UNDO' }) }

  const typeOpties = useMemo(() => {
    const opties: { waarde: string; label: string }[] = Object.entries(EXTERN_TYPE_LABELS).map(([waarde, label]) => ({
      waarde,
      label,
    }))
    for (const t of data.partnerTypes) if (!opties.some((o) => o.waarde === t)) opties.push({ waarde: t, label: externTypeLabel(t) })
    if (partij && !opties.some((o) => o.waarde === partij.type)) opties.push({ waarde: partij.type, label: externTypeLabel(partij.type) })
    return opties
  }, [data.partnerTypes, partij])

  if (!permissies.externBeheren) return null

  const zet = <K extends keyof PartnerForm>(veld: K, waarde: PartnerForm[K]) => setForm((f) => ({ ...f, [veld]: waarde }))

  const opslaan = () => {
    const nieuweFouten: Partial<Record<PartnerFout, string>> = {}

    const naam = form.naam.trim()
    if (!naam) nieuweFouten.naam = 'Vul een bedrijfsnaam in.'

    let type = form.type
    let typeIsNieuw = false
    if (form.type === NIEUW_TYPE) {
      const invoer = form.nieuwType.trim()
      if (!invoer) {
        nieuweFouten.nieuwType = 'Vul een naam voor het nieuwe partnertype in.'
      } else {
        // Hergebruik een bestaand type met dezelfde naam (hoofdletterongevoelig) in plaats van een duplicaat.
        const bekendeKey = Object.entries(EXTERN_TYPE_LABELS).find(([, label]) => label.toLowerCase() === invoer.toLowerCase())?.[0]
        const bestaandEigen = data.partnerTypes.find((t) => t.toLowerCase() === invoer.toLowerCase())
        type = bekendeKey ?? bestaandEigen ?? invoer
        typeIsNieuw = !bekendeKey && !bestaandEigen
      }
    }

    const slots = Number(form.slotsPerWeek)
    if (form.slotsPerWeek.trim() === '' || !Number.isFinite(slots) || slots < 0)
      nieuweFouten.slotsPerWeek = 'Slots per week moet een getal van 0 of meer zijn.'

    const vertraging = Number(form.vertragingDagen)
    if (form.vertragingDagen.trim() === '' || !Number.isFinite(vertraging) || vertraging < 0)
      nieuweFouten.vertragingDagen = 'Vul een vertraging van 0 of meer werkdagen in.'

    let doorlooptijd: number | undefined
    if (form.standaardDoorlooptijdDagen.trim() !== '') {
      const dl = Number(form.standaardDoorlooptijdDagen)
      if (!Number.isFinite(dl) || dl < 0) nieuweFouten.standaardDoorlooptijdDagen = 'Vul een doorlooptijd van 0 of meer dagen in.'
      else doorlooptijd = Math.round(dl)
    }

    const email = form.email.trim()
    if (email !== '' && !/^\S+@\S+\.\S+$/.test(email)) nieuweFouten.email = 'Vul een geldig e-mailadres in.'

    setFouten(nieuweFouten)
    if (Object.keys(nieuweFouten).length > 0) return

    if (typeIsNieuw) dispatch({ type: 'PARTNERTYPE_TOEVOEGEN', naam: type })

    const velden: Omit<ExternePartij, 'id' | 'gearchiveerd'> = {
      naam,
      type,
      specialisme: form.specialisme.trim(),
      contactpersoon: form.contactpersoon.trim(),
      email: email || undefined,
      telefoon: form.telefoon.trim() || undefined,
      adres: form.adres.trim() || undefined,
      beschikbaarheid: form.beschikbaarheid.trim() || undefined,
      slotsPerWeek: Math.round(slots),
      standaardDoorlooptijdDagen: doorlooptijd,
      vertragingDagen: Math.round(vertraging),
      status: form.status,
      notities: form.notities.trim() || undefined,
    }

    if (partij) {
      dispatch({ type: 'EXTERN_BIJWERKEN', id: partij.id, patch: velden })
      if (velden.vertragingDagen !== partij.vertragingDagen) {
        toon(
          velden.vertragingDagen > 0 ? 'waarschuwing' : 'succes',
          `${naam} bijgewerkt. Vertraging is nu ${velden.vertragingDagen} werkdag(en); de projectrisico's zijn automatisch bijgewerkt.`,
          metUndo,
        )
      } else {
        toon('succes', `Gegevens van ${naam} bijgewerkt.`, metUndo)
      }
    } else {
      dispatch({ type: 'PARTNER_TOEVOEGEN', partij: { id: uid('ext'), gearchiveerd: false, ...velden } })
      toon('succes', `${naam} toegevoegd als externe partner.`, metUndo)
    }
    onSluiten()
  }

  return (
    <Modal
      open
      titel={partij ? `${partij.naam} bewerken` : 'Nieuwe externe partner'}
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={opslaan}>
            {partij ? 'Opslaan' : 'Partner toevoegen'}
          </Knop>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Bedrijfsnaam" verplicht fout={fouten.naam}>
            <Invoer
              autoFocus
              value={form.naam}
              onChange={(e) => zet('naam', e.target.value)}
              placeholder="Bijv. Coatingcenter Venlo"
            />
          </Veld>
          <Veld label="Partnertype" verplicht>
            <Keuze value={form.type} onChange={(e) => zet('type', e.target.value)}>
              {typeOpties.map((o) => (
                <option key={o.waarde} value={o.waarde}>
                  {o.label}
                </option>
              ))}
              <option value={NIEUW_TYPE}>Nieuw type…</option>
            </Keuze>
          </Veld>
        </div>
        {form.type === NIEUW_TYPE && (
          <Veld label="Naam nieuw partnertype" verplicht fout={fouten.nieuwType}>
            <Invoer
              value={form.nieuwType}
              onChange={(e) => zet('nieuwType', e.target.value)}
              placeholder="Bijv. Zonweringspecialist"
            />
          </Veld>
        )}
        <Veld label="Specialisme">
          <Invoer
            value={form.specialisme}
            onChange={(e) => zet('specialisme', e.target.value)}
            placeholder="Bijv. spuitwerk trailers & chassis"
          />
        </Veld>
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Contactpersoon">
            <Invoer
              value={form.contactpersoon}
              onChange={(e) => zet('contactpersoon', e.target.value)}
              placeholder="Naam contactpersoon"
            />
          </Veld>
          <Veld label="E-mailadres" fout={fouten.email}>
            <Invoer
              type="email"
              value={form.email}
              onChange={(e) => zet('email', e.target.value)}
              placeholder="naam@bedrijf.nl"
            />
          </Veld>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Telefoonnummer">
            <Invoer value={form.telefoon} onChange={(e) => zet('telefoon', e.target.value)} placeholder="Bijv. 040-1234567" />
          </Veld>
          <Veld label="Adres">
            <Invoer value={form.adres} onChange={(e) => zet('adres', e.target.value)} placeholder="Straat 1, Plaats" />
          </Veld>
        </div>
        <Veld label="Beschikbaarheid">
          <Invoer
            value={form.beschikbaarheid}
            onChange={(e) => zet('beschikbaarheid', e.target.value)}
            placeholder="Bijv. ma t/m vr, aanvraag 3 dagen vooraf"
          />
        </Veld>
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Slots per week" verplicht fout={fouten.slotsPerWeek}>
            <Invoer
              type="number"
              min={0}
              step={1}
              value={form.slotsPerWeek}
              onChange={(e) => zet('slotsPerWeek', e.target.value)}
              title="Maximale capaciteit: het aantal projecten dat deze partner gelijktijdig per week kan behandelen."
            />
          </Veld>
          <Veld label="Standaard doorlooptijd (dagen)" fout={fouten.standaardDoorlooptijdDagen}>
            <Invoer
              type="number"
              min={0}
              step={1}
              value={form.standaardDoorlooptijdDagen}
              onChange={(e) => zet('standaardDoorlooptijdDagen', e.target.value)}
              placeholder="Optioneel"
            />
          </Veld>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Veld label="Status" verplicht>
            <Keuze value={form.status} onChange={(e) => zet('status', e.target.value as ExternePartij['status'])}>
              {(Object.keys(PARTIJ_STATUS_LABELS) as ExternePartij['status'][]).map((s) => (
                <option key={s} value={s}>
                  {PARTIJ_STATUS_LABELS[s]}
                </option>
              ))}
            </Keuze>
          </Veld>
          <Veld label="Actuele vertraging (werkdagen)" verplicht fout={fouten.vertragingDagen}>
            <Invoer
              type="number"
              min={0}
              step={1}
              value={form.vertragingDagen}
              onChange={(e) => zet('vertragingDagen', e.target.value)}
            />
          </Veld>
        </div>
        <p className="-mt-1.5 text-[11px] text-slate-400">
          Een gemelde vertraging telt automatisch mee in de risicobepaling van alle projecten met een lopende of geplande fase
          bij deze partner.
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

// ---------- Externe acties (alle projecten) ----------

function ExterneActiesKaart({
  rijen,
  partijen,
  onOpenProject,
}: {
  rijen: ActieRij[]
  partijen: ExternePartij[]
  onOpenProject: (projectId: string) => void
}) {
  const [partijFilter, setPartijFilter] = useState<string>('alle')
  const [statusFilter, setStatusFilter] = useState<'alle' | ExterneActieStatus>('alle')

  const partijOpties = useMemo(() => {
    const ids = new Set<string>()
    for (const r of rijen) if (r.taak.externeActie?.partijId) ids.add(r.taak.externeActie.partijId)
    return partijen.filter((p) => ids.has(p.id)).sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
  }, [rijen, partijen])
  const heeftZonderPartner = rijen.some((r) => !r.taak.externeActie?.partijId)

  const zichtbaar = useMemo(
    () =>
      rijen.filter((r) => {
        const pid = r.taak.externeActie?.partijId
        if (partijFilter === 'geen' && pid) return false
        if (partijFilter !== 'alle' && partijFilter !== 'geen' && pid !== partijFilter) return false
        const status = r.taak.externeActie?.status ?? 'niet_aangevraagd'
        if (statusFilter !== 'alle' && status !== statusFilter) return false
        return true
      }),
    [rijen, partijFilter, statusFilter],
  )

  const filtersActief = partijFilter !== 'alle' || statusFilter !== 'alle'

  return (
    <Kaart>
      <KaartKop
        titel={
          <>
            <ClipboardList size={16} className="text-sky-700" />
            Externe acties
            <Badge kleur="grijs">{rijen.length}</Badge>
          </>
        }
        uitleg="Alle taken die in de detailplanning van een project als “Extern” zijn gemarkeerd, met de status van de aanvraag en uitvoering bij de externe partner."
        rechts={
          rijen.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Keuze
                value={partijFilter}
                onChange={(e) => setPartijFilter(e.target.value)}
                className="!w-auto"
                title="Filter op externe partner"
              >
                <option value="alle">Alle partners</option>
                {partijOpties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.naam}
                  </option>
                ))}
                {heeftZonderPartner && <option value="geen">Zonder partner</option>}
              </Keuze>
              <Keuze
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'alle' | ExterneActieStatus)}
                className="!w-auto"
                title="Filter op actiestatus"
              >
                <option value="alle">Alle actiestatussen</option>
                {Object.entries(EXTERNE_ACTIE_LABELS).map(([waarde, label]) => (
                  <option key={waarde} value={waarde}>
                    {label}
                  </option>
                ))}
              </Keuze>
              {filtersActief && (
                <Knop
                  klein
                  variant="ghost"
                  onClick={() => {
                    setPartijFilter('alle')
                    setStatusFilter('alle')
                  }}
                >
                  Wissen
                </Knop>
              )}
            </div>
          ) : undefined
        }
      />

      {rijen.length === 0 ? (
        <div className="p-4">
          <LegeStaat
            titel="Nog geen externe acties"
            tekst="Markeer een taak als “Extern” in de detailplanning van een project; alle externe uitbestedingen verschijnen dan automatisch in dit overzicht."
          />
        </div>
      ) : zichtbaar.length === 0 ? (
        <div className="p-4">
          <LegeStaat
            titel="Geen externe acties gevonden"
            tekst="Er zijn geen externe acties die aan de huidige filters voldoen. Pas de partner- of statusfilter aan."
          />
        </div>
      ) : (
        <div className="scrollbar-dun overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="px-3 py-2.5">Project</th>
                <th className="px-3 py-2.5">Taak</th>
                <th className="px-3 py-2.5">Partner</th>
                <th className="px-3 py-2.5">Actiestatus</th>
                <th className="px-3 py-2.5">Taakstatus</th>
                <th className="px-3 py-2.5">Periode</th>
                <th className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    Verwachte retour
                    <InfoTip tekst="Datum waarop het werk volgens de externe partner gereed of retour wordt verwacht." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map((r) => {
                const actie = r.taak.externeActie
                const partner = actie?.partijId ? partijen.find((p) => p.id === actie.partijId) : undefined
                const actieStatus: ExterneActieStatus = actie?.status ?? 'niet_aangevraagd'
                const periode =
                  r.taak.start && r.taak.eind
                    ? `${formatDatumKort(r.taak.start)} – ${formatDatumKort(r.taak.eind)}`
                    : r.taak.start
                      ? `vanaf ${formatDatumKort(r.taak.start)}`
                      : undefined
                const periodeTitel =
                  r.taak.start && r.taak.eind ? `${formatDatum(r.taak.start)} t/m ${formatDatum(r.taak.eind)}` : undefined
                return (
                  <tr
                    key={r.taak.id}
                    onClick={() => onOpenProject(r.project.id)}
                    className="cursor-pointer border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className="font-medium text-brand-700 hover:underline"
                        title={`${r.project.projectnummer} · ${r.project.naam} (${r.project.klant})`}
                      >
                        {r.project.projectnummer}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-slate-800">{r.taak.naam}</span>
                      <span className="block text-[11px] text-slate-400">{r.fase.naam}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {partner ? (
                        <span title={partner.contactpersoon ? `Contactpersoon: ${partner.contactpersoon}` : undefined}>
                          {partner.naam}
                          {partner.gearchiveerd && <span className="ml-1 text-[10px] text-amber-600">(gearchiveerd)</span>}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge kleur={ACTIE_STATUS_KLEUR[actieStatus]}>{EXTERNE_ACTIE_LABELS[actieStatus]}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge kleur={TAAK_STATUS_KLEUR[r.taak.status]}>{TAAK_STATUS_LABELS[r.taak.status]}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap tabular-nums text-slate-600" title={periodeTitel}>
                      {periode ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap tabular-nums text-slate-600">
                      {actie?.verwachteRetour ? (
                        <span title={formatDatum(actie.verwachteRetour)}>{formatDatumKort(actie.verwachteRetour)}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Kaart>
  )
}
