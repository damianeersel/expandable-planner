// Operationeel dashboard: KPI-tegels, capaciteitsoverzicht en actielijsten.

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  FolderKanban,
  Layers,
  MapPinOff,
  PackageCheck,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { useApp } from '../store/AppState'
import {
  afdelingLabel,
  AFDELING_LABELS,
  AFWEZIGHEID_LABELS,
  PRODUCTIE_AFDELINGEN,
  SCENARIO_LABELS,
  type AfwezigheidType,
  type AppData,
  type ISODate,
  type Unit,
} from '../lib/types'
import {
  PRODUCTIE_ZONES,
  ZONE_AFBOUW,
  ZONE_CHASSIS,
  ZONE_OPSLAG,
  ZONE_PANELEN,
  getUnitWaarschuwingen,
  getWachtrij,
  trailerLabel,
  zoneBezetting,
  zoneCapaciteitsConflict,
  type ZoneBezetting,
} from '../lib/locaties'
import {
  addDagen,
  formatDatum,
  formatDatumKort,
  startVanWeek,
  vandaagISO,
  weekLabel,
  weekNummer,
  weekReeks,
  werkdagenTussen,
} from '../lib/dates'
import {
  afdelingBeschikbaarInWeek,
  afdelingGeplandInWeek,
  bezettingsPct,
  capaciteitsNiveau,
  getProjectRisico,
  getVerwachteOplevering,
  scenarioBelasting,
  teamBeschikbaarInWeek,
  teamGeplandInWeek,
  type CapaciteitsNiveau,
  type ProjectRisico,
} from '../lib/capacity'
import {
  Badge,
  CapaciteitsBalk,
  InfoTip,
  Kaart,
  KaartKop,
  LegeStaat,
  PaginaKop,
  Skelet,
  Tooltip,
  type BadgeKleur,
} from '../components/ui'

const AANTAL_WEKEN = 12

const CEL_KLEUREN: Record<CapaciteitsNiveau, string> = {
  ok: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  druk: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
  overboekt: 'bg-red-100 text-red-700 font-semibold hover:bg-red-200',
}

const AFWEZIGHEID_BADGE: Record<AfwezigheidType, BadgeKleur> = {
  vakantie: 'blauw',
  ziekte: 'rood',
  kort_verzuim: 'amber',
  bijzonder_verlof: 'paars',
  training: 'brand',
  overig: 'grijs',
}

const afr = (n: number) => Math.round(n)

// ---------- Locatiebezetting ----------

const LOCATIE_RIJEN: { zoneId: string; label: string }[] = [
  { zoneId: ZONE_AFBOUW, label: 'MH25 · Afbouw' },
  { zoneId: ZONE_CHASSIS, label: 'MH207 · Chassisbouw' },
  { zoneId: ZONE_PANELEN, label: 'MH207 · Panelenbouw' },
  { zoneId: ZONE_OPSLAG, label: 'Opslag' },
]

const BEZETTING_BALK: Record<ZoneBezetting['niveau'], string> = {
  normaal: 'bg-emerald-500',
  bijna_vol: 'bg-amber-500',
  vol: 'bg-red-500',
}

const BEZETTING_TEKST: Record<ZoneBezetting['niveau'], string> = {
  normaal: 'text-emerald-700',
  bijna_vol: 'text-amber-700',
  vol: 'text-red-700',
}

interface LocatieSignaal {
  id: string
  icoon: LucideIcon
  kleur: string
  tekst: string
  doel: string
}

/** Max. drie PR-nummers, daarna een beletselteken. */
function unitLijstTekst(data: AppData, units: Unit[]): string {
  const namen = units.slice(0, 3).map((u) => trailerLabel(data, u))
  return namen.join(', ') + (units.length > 3 ? ', …' : '')
}

// ---------- KPI-tegel ----------

type KpiAccent = 'neutraal' | 'brand' | 'amber' | 'rood' | 'paars'

const KPI_KLEUREN: Record<KpiAccent, { vak: string; getal: string }> = {
  neutraal: { vak: 'bg-slate-100 text-slate-500', getal: 'text-slate-900' },
  brand: { vak: 'bg-brand-50 text-brand-700', getal: 'text-slate-900' },
  amber: { vak: 'bg-amber-50 text-amber-600', getal: 'text-amber-700' },
  rood: { vak: 'bg-red-50 text-red-600', getal: 'text-red-700' },
  paars: { vak: 'bg-purple-50 text-purple-600', getal: 'text-slate-900' },
}

function KpiTegel({
  label,
  waarde,
  icoon: Icoon,
  accent,
  uitleg,
  onKlik,
}: {
  label: string
  waarde: number
  icoon: LucideIcon
  accent: KpiAccent
  uitleg?: string
  onKlik: () => void
}) {
  const k = KPI_KLEUREN[accent]
  return (
    <Kaart onClick={onKlik} className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-2xl font-semibold tabular-nums ${k.getal}`}>{waarde}</div>
          <div className="mt-0.5 flex items-center gap-1 text-xs font-medium leading-snug text-slate-500">
            <span>{label}</span>
            {uitleg && (
              <span onClick={(e) => e.stopPropagation()}>
                <InfoTip tekst={uitleg} />
              </span>
            )}
          </div>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${k.vak}`}>
          <Icoon size={17} />
        </div>
      </div>
    </Kaart>
  )
}

// ---------- Risico-indicator ----------

function RisicoStip({ risico }: { risico: ProjectRisico }) {
  const kleur =
    risico.niveau === 'hoog' ? 'bg-red-500' : risico.niveau === 'middel' ? 'bg-amber-500' : 'bg-emerald-500'
  const label =
    risico.niveau === 'hoog' ? 'Hoog risico' : risico.niveau === 'middel' ? 'Verhoogd risico' : 'Op schema'
  return (
    <Tooltip
      tekst={
        <div className="space-y-0.5">
          <div className="font-semibold">{label}</div>
          {risico.redenen.length === 0 ? (
            <div>Geen risicosignalen voor dit project.</div>
          ) : (
            risico.redenen.map((r, i) => <div key={i}>• {r}</div>)
          )}
        </div>
      }
    >
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${kleur}`} />
    </Tooltip>
  )
}

// ---------- Lijstrij ----------

function LijstRij({ onKlik, children }: { onKlik: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onKlik}
      className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-slate-50"
    >
      {children}
    </button>
  )
}

// ---------- Dashboard ----------

export default function Dashboard() {
  const { data, ui } = useApp()
  const navigate = useNavigate()
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setLaden(false), 300)
    return () => clearTimeout(t)
  }, [])

  const vandaag = vandaagISO()
  const dezeWeek = startVanWeek(vandaag)
  const weken = useMemo(() => weekReeks(vandaag, AANTAL_WEKEN), [vandaag])

  // Actieve projecten met afgeleide informatie (verwachte oplevering + risico).
  const projectInfos = useMemo(
    () =>
      data.projecten
        .filter((p) => p.status === 'definitief' || p.status === 'schaduw')
        .map((p) => ({
          project: p,
          verwacht: getVerwachteOplevering(data, p.id),
          risico: getProjectRisico(data, p),
        })),
    [data],
  )

  // KPI-cijfers.
  const kpi = useMemo(() => {
    const definitief = projectInfos.filter((x) => x.project.status === 'definitief').length
    const schaduw = projectInfos.filter((x) => x.project.status === 'schaduw').length
    const risico = projectInfos.filter((x) => x.risico.niveau === 'middel' || x.risico.niveau === 'hoog').length
    const overboekt = data.teams.filter((t) => {
      const beschikbaar = teamBeschikbaarInWeek(data, t.id, dezeWeek)
      const g = teamGeplandInWeek(data, t.id, dezeWeek)
      return bezettingsPct(beschikbaar, g.definitief) > 100
    }).length
    const weekEind = addDagen(dezeWeek, 4)
    const afwezig = new Set(
      data.afwezigheid
        .filter((a) => a.status !== 'concept' && a.van <= weekEind && a.tot >= dezeWeek)
        .map((a) => a.medewerkerId),
    ).size
    const bijSpuiter = data.fases.filter((f) => f.key === 'spuiter' && f.status === 'bezig').length
    return { definitief, schaduw, risico, overboekt, afwezig, bijSpuiter }
  }, [data, projectInfos, dezeWeek])

  // Capaciteitsmatrix: per afdeling × week de bezetting volgens het actieve scenario.
  const capaciteitsMatrix = useMemo(
    () =>
      PRODUCTIE_AFDELINGEN.map((afdeling) => ({
        afdeling,
        cellen: weken.map((week) => {
          const beschikbaar = afdelingBeschikbaarInWeek(data, afdeling, week)
          const g = afdelingGeplandInWeek(data, afdeling, week)
          const belasting = scenarioBelasting(g, ui.scenario)
          const pct = bezettingsPct(beschikbaar, belasting)
          return { week, beschikbaar, g, belasting, pct, niveau: capaciteitsNiveau(pct) }
        }),
      })),
    [data, ui.scenario, weken],
  )

  // Totalen per week voor "Definitief versus schaduw".
  const weekTotalen = useMemo(
    () =>
      weken.map((week, i) => {
        let definitief = 0
        let schaduw = 0
        let beschikbaar = 0
        for (const rij of capaciteitsMatrix) {
          const cel = rij.cellen[i]
          definitief += cel.g.definitief
          schaduw += cel.g.schaduw
          beschikbaar += cel.beschikbaar
        }
        return { week, definitief, schaduw, beschikbaar }
      }),
    [capaciteitsMatrix, weken],
  )
  const balkSchaal = Math.max(...weekTotalen.map((t) => Math.max(t.definitief + t.schaduw, t.beschikbaar)), 1)

  // Aankomende opleveringen (eerstvolgende 5 op verwachte opleverdatum).
  const opleveringen = useMemo(
    () => [...projectInfos].sort((a, b) => (a.verwacht < b.verwacht ? -1 : 1)).slice(0, 5),
    [projectInfos],
  )

  // Grootste capaciteitsknelpunten: team-weken met scenario-bezetting boven 85%.
  const knelpunten = useMemo(() => {
    const lijst: { teamId: string; teamNaam: string; week: ISODate; pct: number; beschikbaar: number; belasting: number }[] = []
    for (const team of data.teams) {
      for (const week of weken) {
        const beschikbaar = teamBeschikbaarInWeek(data, team.id, week)
        const g = teamGeplandInWeek(data, team.id, week)
        const belasting = scenarioBelasting(g, ui.scenario)
        if (belasting <= 0) continue
        const pct = bezettingsPct(beschikbaar, belasting)
        if (pct > 85) lijst.push({ teamId: team.id, teamNaam: team.naam, week, pct, beschikbaar, belasting })
      }
    }
    return lijst.sort((a, b) => b.pct - a.pct).slice(0, 5)
  }, [data, ui.scenario, weken])

  // Projecten met vertraging of risicosignalen.
  const risicoProjecten = useMemo(() => {
    const orde = { hoog: 0, middel: 1, laag: 2 } as const
    return projectInfos
      .filter((x) => x.risico.redenen.length > 0 || x.verwacht > x.project.gewensteOpleverdatum)
      .sort((a, b) =>
        orde[a.risico.niveau] === orde[b.risico.niveau]
          ? a.verwacht < b.verwacht
            ? -1
            : 1
          : orde[a.risico.niveau] - orde[b.risico.niveau],
      )
  }, [projectInfos])

  // Eerstvolgende spuiterslots (transport heen vanaf vandaag).
  const spuiterSlots = useMemo(() => {
    const actieveIds = new Set(projectInfos.map((x) => x.project.id))
    return data.fases
      .filter((f) => f.key === 'spuiter' && f.transportHeen && f.transportHeen >= vandaag && actieveIds.has(f.projectId))
      .sort((a, b) => (a.transportHeen! < b.transportHeen! ? -1 : 1))
      .slice(0, 5)
      .map((f) => ({
        fase: f,
        project: data.projecten.find((p) => p.id === f.projectId),
        partij: data.externePartijen.find((e) => e.id === f.externePartijId),
      }))
  }, [data, projectInfos, vandaag])

  // Locatiebezetting per zone (vaste volgorde: Afbouw, Chassisbouw, Panelenbouw, Opslag).
  const locatieRijen = useMemo(
    () => LOCATIE_RIJEN.map((rij) => ({ ...rij, bezetting: zoneBezetting(data, rij.zoneId) })),
    [data],
  )

  // Locatiesignalen: alleen signalen die daadwerkelijk optreden.
  const locatieSignalen = useMemo(() => {
    const signalen: LocatieSignaal[] = []
    const zoneNaam = (zoneId: string) => data.zones.find((z) => z.id === zoneId)?.naam ?? zoneId
    const alleZones = [...PRODUCTIE_ZONES, ZONE_OPSLAG]

    // 1 + 2. Volle of bijna volle zones (productiezones en Opslag).
    for (const zoneId of alleZones) {
      const b = zoneBezetting(data, zoneId)
      if (b.niveau === 'normaal') continue
      signalen.push({
        id: `bezet-${zoneId}`,
        icoon: zoneId === ZONE_OPSLAG ? Warehouse : AlertTriangle,
        kleur: b.niveau === 'vol' ? 'text-red-600' : 'text-amber-600',
        tekst: `${zoneNaam(zoneId)} is ${b.niveau === 'vol' ? 'vol' : 'bijna vol'}: ${b.bezet} van ${b.capaciteit} plaatsen bezet.`,
        doel: `/planning?view=locatie&zone=${zoneId}`,
      })
    }

    // 3. Gereed product dat nog een productieplaats bezet.
    const gereed = data.units.filter((u) => getUnitWaarschuwingen(data, u).some((w) => w.soort === 'gereed_bezet'))
    if (gereed.length > 0) {
      signalen.push({
        id: 'gereed-bezet',
        icoon: PackageCheck,
        kleur: 'text-amber-600',
        tekst:
          gereed.length === 1
            ? `1 gereed product bezet nog een productieplaats: ${unitLijstTekst(data, gereed)}.`
            : `${gereed.length} gerede producten bezetten nog een productieplaats: ${unitLijstTekst(data, gereed)}.`,
        doel: '/planning?view=locatie&filter=waarschuwing',
      })
    }

    // 4. Units zonder fysieke plaats (wachtrij-items zonder plaats, incl. bij externe spuiter).
    const zonderPlaats = getWachtrij(data)
      .filter((item) => !item.unit.plaatsId)
      .map((item) => item.unit)
    if (zonderPlaats.length > 0) {
      signalen.push({
        id: 'zonder-plaats',
        icoon: MapPinOff,
        kleur: 'text-amber-600',
        tekst:
          zonderPlaats.length === 1
            ? `1 trailer heeft geen fysieke plaats: ${unitLijstTekst(data, zonderPlaats)}.`
            : `${zonderPlaats.length} trailers hebben geen fysieke plaats: ${unitLijstTekst(data, zonderPlaats)}.`,
        doel: '/planning?view=locatie&filter=zonder_plaats',
      })
    }

    // 5. Fysieke locatie wijkt af van de projectplanning.
    const afwijkend = data.units.filter((u) => getUnitWaarschuwingen(data, u).some((w) => w.soort === 'afwijking'))
    if (afwijkend.length > 0) {
      signalen.push({
        id: 'afwijking',
        icoon: ArrowLeftRight,
        kleur: 'text-amber-600',
        tekst:
          afwijkend.length === 1
            ? `1 trailer staat niet waar de projectplanning verwacht: ${unitLijstTekst(data, afwijkend)}.`
            : `${afwijkend.length} trailers staan niet waar de projectplanning verwacht: ${unitLijstTekst(data, afwijkend)}.`,
        doel: '/planning?view=locatie&filter=afwijking',
      })
    }

    // 6. Komende locatiewisseling zonder beschikbare plaats.
    for (const zoneId of alleZones) {
      const conflict = zoneCapaciteitsConflict(data, zoneId)
      if (conflict) {
        signalen.push({
          id: `conflict-${zoneId}`,
          icoon: CalendarClock,
          kleur: 'text-red-600',
          tekst: conflict,
          doel: `/planning?view=locatie&zone=${zoneId}`,
        })
      }
    }

    return signalen
  }, [data])

  // Afwezigheden in de komende 4 weken.
  const verlofEind = addDagen(dezeWeek, 27)
  const afwezigheden = useMemo(
    () =>
      data.afwezigheid
        .filter((a) => a.van <= verlofEind && a.tot >= dezeWeek)
        .sort((a, b) => (a.van < b.van ? -1 : 1))
        .map((a) => ({ afw: a, medewerker: data.medewerkers.find((m) => m.id === a.medewerkerId) })),
    [data, dezeWeek, verlofEind],
  )
  const getoondeAfwezigheden = afwezigheden.slice(0, 7)

  // ---------- Laad-skeleton ----------

  if (laden) {
    return (
      <div className="p-6">
        <PaginaKop titel="Dashboard" uitleg="Actueel overzicht van projecten, capaciteit en risico's" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skelet key={i} className="h-[76px]" />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Skelet className="h-64 xl:col-span-2" />
          <Skelet className="h-72" />
          <Skelet className="h-72" />
          <Skelet className="h-72" />
          <Skelet className="h-56" />
          <Skelet className="h-56" />
          <Skelet className="h-56" />
          <Skelet className="h-56" />
        </div>
      </div>
    )
  }

  // ---------- Dashboard ----------

  return (
    <div className="p-6">
      <PaginaKop
        titel="Dashboard"
        uitleg={`Actueel overzicht van projecten, capaciteit en risico's — week ${weekNummer(vandaag)}`}
      />

      {/* KPI-tegels */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTegel
          label="Actieve definitieve projecten"
          waarde={kpi.definitief}
          icoon={FolderKanban}
          accent="brand"
          onKlik={() => navigate('/projecten')}
        />
        <KpiTegel
          label="In schaduwplanning"
          waarde={kpi.schaduw}
          icoon={Layers}
          accent="neutraal"
          uitleg="Schaduwplanning: projecten die alvast zijn ingepland terwijl de order nog niet definitief is. Ze claimen pas echt capaciteit zodra de order wordt bevestigd."
          onKlik={() => navigate('/projecten')}
        />
        <KpiTegel
          label="Projecten met opleverrisico"
          waarde={kpi.risico}
          icoon={AlertTriangle}
          accent={kpi.risico > 0 ? 'rood' : 'neutraal'}
          onKlik={() => navigate('/projecten')}
        />
        <KpiTegel
          label="Teams overbezet deze week"
          waarde={kpi.overboekt}
          icoon={Users}
          accent={kpi.overboekt > 0 ? 'rood' : 'neutraal'}
          uitleg="Overboeking: er zijn deze week meer definitieve uren op het team gepland dan er beschikbare capaciteit is (meer dan 100%)."
          onKlik={() => navigate('/teams')}
        />
        <KpiTegel
          label="Medewerkers afwezig deze week"
          waarde={kpi.afwezig}
          icoon={CalendarOff}
          accent={kpi.afwezig > 0 ? 'amber' : 'neutraal'}
          onKlik={() => navigate('/verlof')}
        />
        <KpiTegel
          label="Trailers bij externe partijen"
          waarde={kpi.bijSpuiter}
          icoon={Truck}
          accent="paars"
          onKlik={() => navigate('/extern')}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 1. Capaciteit per afdeling */}
        <Kaart className="xl:col-span-2">
          <KaartKop
            titel="Capaciteit per afdeling — komende 12 weken"
            uitleg="Bezettingspercentage per afdeling per week volgens het actieve scenario. Schaduwplanning telt hierin mee volgens de scenariokeuze: bij 'kansgewogen' naar rato van de verkoopkans (een project met 70% kans telt voor 70% van de uren mee)."
            rechts={<Badge kleur="brand">{SCENARIO_LABELS[ui.scenario]}</Badge>}
          />
          <div className="overflow-x-auto px-4 py-3">
            <div className="min-w-[860px]">
              <div className="grid gap-0.5" style={{ gridTemplateColumns: '8rem repeat(12, minmax(0, 1fr))' }}>
                <div />
                {weken.map((w) => (
                  <div key={w} className="pb-1 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
                    {weekLabel(w)}
                  </div>
                ))}
                {capaciteitsMatrix.map((rij) => (
                  <Fragment key={rij.afdeling}>
                    <div className="flex items-center pr-2 text-sm font-medium text-slate-700">
                      {AFDELING_LABELS[rij.afdeling]}
                    </div>
                    {rij.cellen.map((cel) => (
                      <Tooltip
                        key={cel.week}
                        tekst={
                          <div className="space-y-0.5">
                            <div className="font-semibold">
                              {AFDELING_LABELS[rij.afdeling]} · {weekLabel(cel.week)} ({formatDatumKort(cel.week)})
                            </div>
                            <div>Beschikbaar: {afr(cel.beschikbaar)} uur</div>
                            <div>Definitief gepland: {afr(cel.g.definitief)} uur</div>
                            <div>Schaduw: {afr(cel.g.schaduw)} uur</div>
                            <div>Kansgewogen schaduw: {afr(cel.g.gewogen)} uur</div>
                          </div>
                        }
                      >
                        <button
                          onClick={() => navigate('/planning')}
                          className={`w-full cursor-pointer rounded px-1 py-1.5 text-center text-xs tabular-nums transition-colors ${CEL_KLEUREN[cel.niveau]}`}
                        >
                          {cel.pct > 400 ? '400+' : cel.pct}%
                        </button>
                      </Tooltip>
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-emerald-200 bg-emerald-50" /> &lt; 85% — ruimte
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-amber-200 bg-amber-100" /> 85–100% — druk
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-red-200 bg-red-100" /> &gt; 100% — overboekt
              <InfoTip tekst="Overboekt: er is meer werk gepland dan de beschikbare capaciteit (contracturen minus afwezigheid) van de afdeling in die week." />
            </span>
            <span className="ml-auto text-slate-400">Klik op een cel voor de weekplanning</span>
          </div>
        </Kaart>

        {/* 1b. Locatiebezetting */}
        <Kaart>
          <KaartKop
            titel="Locatiebezetting"
            uitleg="Actuele bezetting van de fysieke plaatsen per zone. Klik op een zone om de locatieplanning te openen, of op een signaal om direct naar de betreffende zone of trailers te springen."
          />
          <div className="space-y-1 px-4 py-3">
            {locatieRijen.map((rij) => (
              <button
                key={rij.zoneId}
                onClick={() => navigate(`/planning?view=locatie&zone=${rij.zoneId}`)}
                title={`Open locatieplanning — ${rij.label}`}
                className="flex w-full items-center gap-3 rounded px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-slate-50"
              >
                <span className="w-44 shrink-0 truncate font-medium text-slate-700">{rij.label}</span>
                <span className="w-28 shrink-0 text-xs tabular-nums text-slate-500">
                  {rij.bezetting.bezet} van {rij.bezetting.capaciteit} plaatsen
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${BEZETTING_BALK[rij.bezetting.niveau]}`}
                    style={{ width: `${Math.min(100, rij.bezetting.pct)}%` }}
                  />
                </div>
                <span
                  className={`w-11 shrink-0 text-right text-xs font-semibold tabular-nums ${BEZETTING_TEKST[rij.bezetting.niveau]}`}
                >
                  {rij.bezetting.pct}%
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100">
            <div className="flex items-center gap-1 px-4 pb-1 pt-2.5 text-xs font-medium text-slate-500">
              <span className="uppercase tracking-wide">Locatiesignalen</span>
              <InfoTip tekst="Automatische signalen over de fysieke locaties: volle zones, gerede trailers op een productieplaats, trailers zonder plaats, afwijkingen van de projectplanning en komende locatiewisselingen zonder vrije plaats." />
            </div>
            {locatieSignalen.length === 0 ? (
              <div className="flex items-center gap-2 px-4 pb-3 pt-1 text-sm text-emerald-700">
                <CheckCircle2 size={15} className="shrink-0" />
                Geen locatiesignalen
              </div>
            ) : (
              <div className="pb-1">
                {locatieSignalen.map((s) => {
                  const Icoon = s.icoon
                  return (
                    <button
                      key={s.id}
                      onClick={() => navigate(s.doel)}
                      className="flex w-full items-start gap-2.5 border-b border-slate-100 px-4 py-2 text-left text-xs leading-relaxed text-slate-600 transition-colors last:border-b-0 hover:bg-slate-50"
                    >
                      <Icoon size={15} className={`mt-px shrink-0 ${s.kleur}`} />
                      <span className="min-w-0 flex-1">{s.tekst}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </Kaart>

        {/* 2. Definitief versus schaduw */}
        <Kaart>
          <KaartKop
            titel="Definitief versus schaduw"
            uitleg="Totaal geplande uren per week over alle productieafdelingen. De donkere balk is definitief werk, de gestreepte balk schaduwplanning (nog niet bevestigde orders). Het streepje markeert de beschikbare capaciteit."
          />
          <div className="space-y-1.5 px-4 py-3">
            {weekTotalen.map((t) => {
              const defPct = (t.definitief / balkSchaal) * 100
              const schPct = (t.schaduw / balkSchaal) * 100
              const capPct = Math.min(100, (t.beschikbaar / balkSchaal) * 100)
              return (
                <div
                  key={t.week}
                  className="flex items-center gap-2"
                  title={`${weekLabel(t.week)}: ${afr(t.definitief)} u definitief · ${afr(t.schaduw)} u schaduw · ${afr(t.beschikbaar)} u beschikbaar`}
                >
                  <span className="w-12 shrink-0 text-xs tabular-nums text-slate-500">{weekLabel(t.week)}</span>
                  <div className="relative h-4 flex-1 rounded bg-slate-100">
                    <div className="absolute inset-y-0 left-0 flex w-full overflow-hidden rounded">
                      <div className="h-full bg-brand-600" style={{ width: `${defPct}%` }} />
                      <div className="balk-schaduw h-full" style={{ width: `${schPct}%` }} />
                    </div>
                    <div
                      className="absolute inset-y-0 border-l-2 border-slate-700"
                      style={{ left: `${capPct}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500">
                    {afr(t.definitief + t.schaduw)} / {afr(t.beschikbaar)} u
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-brand-600" /> Definitief
            </span>
            <span className="flex items-center gap-1.5">
              <span className="balk-schaduw h-3 w-3 rounded" /> Schaduw
              <InfoTip tekst="Schaduwuren horen bij nog niet bevestigde orders. In het kansgewogen scenario tellen ze in capaciteitsberekeningen mee naar rato van de verkoopkans." />
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 border-l-2 border-slate-700" /> Beschikbare capaciteit
              <InfoTip tekst="Beschikbare capaciteit: som van de netto inzetbare uren (contracturen × beschikbaarheid, minus afwezigheid) van alle productieteams in die week." />
            </span>
          </div>
        </Kaart>

        {/* 3. Aankomende opleveringen */}
        <Kaart>
          <KaartKop titel="Aankomende opleveringen" uitleg="De eerstvolgende vijf projecten op verwachte opleverdatum (einddatum van de laatste fase). Een rode datum betekent later dan de gewenste opleverdatum." />
          {opleveringen.length === 0 ? (
            <div className="p-4">
              <LegeStaat titel="Geen aankomende opleveringen" tekst="Er zijn geen actieve projecten met een geplande oplevering." />
            </div>
          ) : (
            <div className="py-1">
              {opleveringen.map((o) => {
                const teLaat = o.verwacht > o.project.gewensteOpleverdatum
                const dagenTeLaat = teLaat ? Math.max(0, werkdagenTussen(o.project.gewensteOpleverdatum, o.verwacht) - 1) : 0
                return (
                  <LijstRij key={o.project.id} onKlik={() => navigate(`/projecten/${o.project.id}`)}>
                    <RisicoStip risico={o.risico} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-800">{o.project.projectnummer}</div>
                      <div className="truncate text-xs text-slate-500">{o.project.klant}</div>
                    </div>
                    <Badge kleur={o.project.status === 'definitief' ? 'brand' : 'grijs'}>
                      {o.project.status === 'definitief' ? 'Definitief' : 'Schaduw'}
                    </Badge>
                    {teLaat ? (
                      <Tooltip
                        tekst={`Gewenst: ${formatDatum(o.project.gewensteOpleverdatum)} — verwacht ${dagenTeLaat} werkdag(en) later`}
                      >
                        <span className="w-[76px] shrink-0 text-right text-xs font-semibold tabular-nums text-red-600">
                          {formatDatum(o.verwacht)}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="w-[76px] shrink-0 text-right text-xs tabular-nums text-slate-600">
                        {formatDatum(o.verwacht)}
                      </span>
                    )}
                  </LijstRij>
                )
              })}
            </div>
          )}
        </Kaart>

        {/* 4. Grootste capaciteitsknelpunten */}
        <Kaart>
          <KaartKop
            titel="Grootste capaciteitsknelpunten"
            uitleg="Team-weken met de hoogste bezetting (boven 85%) in de komende 12 weken, berekend volgens het actieve scenario."
            rechts={<Badge kleur="brand">{SCENARIO_LABELS[ui.scenario]}</Badge>}
          />
          {knelpunten.length === 0 ? (
            <div className="p-4">
              <LegeStaat
                titel="Geen knelpunten"
                tekst="Geen enkele team-week komt in de komende 12 weken boven 85% bezetting uit."
              />
            </div>
          ) : (
            <div className="py-1">
              {knelpunten.map((k) => (
                <LijstRij key={`${k.teamId}-${k.week}`} onKlik={() => navigate('/planning')}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">{k.teamNaam}</div>
                    <div className="text-xs text-slate-500">
                      {weekLabel(k.week)} · vanaf {formatDatumKort(k.week)} · {afr(k.belasting)} van {afr(k.beschikbaar)} u
                    </div>
                  </div>
                  <CapaciteitsBalk pct={k.pct} className="w-40 shrink-0" />
                </LijstRij>
              ))}
            </div>
          )}
        </Kaart>

        {/* 5. Projecten met vertraging of risico */}
        <Kaart>
          <KaartKop
            titel="Projecten met vertraging of risico"
            uitleg="Projecten waarvan de verwachte oplevering na de gewenste datum ligt, of waarvoor risicosignalen gelden zoals geblokkeerde fases, vertraging bij externe partijen of capaciteitsconflicten."
          />
          {risicoProjecten.length === 0 ? (
            <div className="p-4">
              <LegeStaat titel="Geen risicoprojecten" tekst="Alle actieve projecten liggen op schema zonder risicosignalen." />
            </div>
          ) : (
            <div className="py-1">
              {risicoProjecten.map((x) => (
                <LijstRij key={x.project.id} onKlik={() => navigate(`/projecten/${x.project.id}`)}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">
                      {x.project.projectnummer} · {x.project.naam}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {x.risico.redenen[0] ?? 'Verwachte oplevering later dan gewenst'}
                    </div>
                  </div>
                  <Badge kleur={x.risico.niveau === 'hoog' ? 'rood' : x.risico.niveau === 'middel' ? 'amber' : 'grijs'}>
                    {x.risico.niveau === 'hoog' ? 'Hoog' : x.risico.niveau === 'middel' ? 'Middel' : 'Laag'}
                  </Badge>
                </LijstRij>
              ))}
            </div>
          )}
        </Kaart>

        {/* 6. Komende slots externe spuiters */}
        <Kaart>
          <KaartKop
            titel="Komende slots externe spuiters"
            uitleg="Eerstvolgende spuiterfases met transport heen vanaf vandaag. Een rode badge betekent dat de partij op dit moment vertraging meldt."
          />
          {spuiterSlots.length === 0 ? (
            <div className="p-4">
              <LegeStaat titel="Geen geplande spuiterslots" tekst="Er staan geen transporten naar externe spuiters gepland vanaf vandaag." />
            </div>
          ) : (
            <div className="py-1">
              {spuiterSlots.map((s) => (
                <LijstRij key={s.fase.id} onKlik={() => navigate('/extern')}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">{s.partij?.naam ?? 'Onbekende partij'}</div>
                    <div className="truncate text-xs text-slate-500">
                      {s.project ? `${s.project.projectnummer} · ${s.project.klant}` : 'Onbekend project'}
                    </div>
                  </div>
                  {s.partij && s.partij.vertragingDagen > 0 && (
                    <Badge kleur="rood">Vertraagd +{s.partij.vertragingDagen} wd</Badge>
                  )}
                  <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-slate-600">
                    {formatDatumKort(s.fase.transportHeen!)}
                    <ArrowRight size={12} className="text-slate-400" />
                    {s.fase.transportTerug ? formatDatumKort(s.fase.transportTerug) : '—'}
                  </span>
                </LijstRij>
              ))}
            </div>
          )}
        </Kaart>

        {/* 7. Verlof & verzuim — komende 4 weken */}
        <Kaart>
          <KaartKop
            titel="Verlof & verzuim — komende 4 weken"
            uitleg="Alle afwezigheden die (deels) in de komende vier weken vallen. Goedgekeurde en geregistreerde afwezigheid is al van de beschikbare capaciteit afgetrokken."
          />
          {afwezigheden.length === 0 ? (
            <div className="p-4">
              <LegeStaat titel="Geen afwezigheden" tekst="Er valt geen verlof of verzuim in de komende vier weken." />
            </div>
          ) : (
            <div className="py-1">
              {getoondeAfwezigheden.map(({ afw, medewerker }) => (
                <LijstRij key={afw.id} onKlik={() => navigate('/verlof')}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">{medewerker?.naam ?? 'Onbekende medewerker'}</div>
                    <div className="truncate text-xs text-slate-500">
                      {medewerker ? afdelingLabel(medewerker.afdeling, data.overigeAfdelingen) : ''}
                      {afw.dagdeel !== 'heel' ? ` · alleen ${afw.dagdeel}` : ''}
                    </div>
                  </div>
                  <Badge kleur={AFWEZIGHEID_BADGE[afw.type]}>{AFWEZIGHEID_LABELS[afw.type]}</Badge>
                  <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-600">
                    {afw.van === afw.tot
                      ? formatDatumKort(afw.van)
                      : `${formatDatumKort(afw.van)} – ${formatDatumKort(afw.tot)}`}
                  </span>
                </LijstRij>
              ))}
              {afwezigheden.length > getoondeAfwezigheden.length && (
                <button
                  onClick={() => navigate('/verlof')}
                  className="w-full px-4 py-2 text-left text-xs font-medium text-brand-700 hover:bg-slate-50"
                >
                  + nog {afwezigheden.length - getoondeAfwezigheden.length} afwezigheid/afwezigheden — bekijk alles
                </button>
              )}
            </div>
          )}
        </Kaart>
      </div>
    </div>
  )
}
