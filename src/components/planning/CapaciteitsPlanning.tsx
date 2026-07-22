// Capaciteitsplanning: teamcapaciteit (uren) en fysieke plaatscapaciteit (trailerplaatsen)
// naast elkaar. Sectie 1 toont de teambezetting per week volgens het gekozen scenario,
// sectie 2 de huidige en verwachte zonebezetting, sectie 3 een compacte vergelijking.

import { Fragment, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeftRight, CalendarClock, Info, Users, Warehouse } from 'lucide-react'
import { useApp } from '../../store/AppState'
import {
  AFDELING_LABELS,
  PRODUCTIE_AFDELINGEN,
  SCENARIO_LABELS,
  type Afdeling,
  type AppData,
  type ISODate,
  type Team,
  type Zone,
} from '../../lib/types'
import { addDagen, formatDatum, formatDatumMetDag, parseISO, weekNummer, weekReeks, vandaagISO } from '../../lib/dates'
import {
  afdelingBeschikbaarInWeek,
  afdelingGeplandInWeek,
  bezettingsPct,
  capaciteitsNiveau,
  scenarioBelasting,
  teamBeschikbaarInWeek,
  teamGeplandInWeek,
  teamLedenOpDag,
  type CapaciteitsNiveau,
  type GeplandeUren,
} from '../../lib/capacity'
import {
  volgendeGeplandeLocatie,
  zoneBezetting,
  zoneCapaciteitsConflict,
  zoneStromen,
  ZONE_AFBOUW,
  ZONE_CHASSIS,
  ZONE_OPSLAG,
  ZONE_PANELEN,
  type ZoneBezetting,
} from '../../lib/locaties'
import { Badge, InfoTip, Kaart, KaartKop, LegeStaat, type BadgeKleur } from '../ui'

// ---------- Lokale helpers ----------

const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function maandKort(iso: ISODate): string {
  return MAANDEN_KORT[parseISO(iso).getMonth()]
}

/** Eén cel in de teamcapaciteitsmatrix. */
interface TeamCel {
  beschikbaar: number
  gepland: GeplandeUren
  belasting: number
  pct: number
  niveau: CapaciteitsNiveau
}

function maakTeamCel(beschikbaar: number, gepland: GeplandeUren, belasting: number): TeamCel {
  const pct = bezettingsPct(beschikbaar, belasting)
  return { beschikbaar, gepland, belasting, pct, niveau: capaciteitsNiveau(pct) }
}

const NIVEAU_CEL_KLASSE: Record<CapaciteitsNiveau, string> = {
  ok: 'bg-emerald-50/60 text-emerald-700',
  druk: 'bg-amber-50 text-amber-700',
  overboekt: 'bg-red-50 text-red-700 font-semibold',
}

const NIVEAU_BADGE_KLEUR: Record<CapaciteitsNiveau, BadgeKleur> = {
  ok: 'groen',
  druk: 'amber',
  overboekt: 'rood',
}

const ZONE_NIVEAU_BADGE_KLEUR: Record<ZoneBezetting['niveau'], BadgeKleur> = {
  normaal: 'groen',
  bijna_vol: 'amber',
  vol: 'rood',
}

function celLabel(cel: TeamCel): string {
  if (cel.beschikbaar <= 0 && cel.belasting <= 0) return '—'
  if (cel.beschikbaar <= 0) return '∞'
  return `${cel.pct}%`
}

function celTitel(naam: string, maandag: ISODate, cel: TeamCel): string {
  const regels = [
    `Wk ${weekNummer(maandag)} (${formatDatumMetDag(maandag)}) · ${naam}`,
    `Beschikbaar: ${Math.round(cel.beschikbaar)} uur`,
    `Definitief gepland: ${Math.round(cel.gepland.definitief)} uur`,
    `Schaduw: ${Math.round(cel.gepland.schaduw)} uur`,
    `Kansgewogen schaduw: ${Math.round(cel.gepland.gewogen)} uur`,
    `Belasting volgens scenario: ${Math.round(cel.belasting)} uur`,
  ]
  if (cel.beschikbaar <= 0 && cel.belasting > 0) regels.push('Geen beschikbare uren, wel geplande uren.')
  return regels.join('\n')
}

/** Verwachte bezetting van één zone in één weekcel. */
interface ZoneWeekCel {
  maandag: ISODate
  verwacht: number
  aankomsten: number
  vertrekken: number
  tekort: number
}

interface ZoneRij {
  zone: Zone
  bezetting: ZoneBezetting
  cellen: ZoneWeekCel[]
  conflict?: string
  volOp?: ISODate
}

/**
 * Eerste datum binnen [van, tot] waarop de zone naar verwachting volledig bezet raakt,
 * afgeleid uit de geplande aankomsten en vertrekken. Undefined als de zone al vol is
 * of niet vol raakt binnen de horizon.
 */
function eersteVolleDatum(
  data: AppData,
  zoneId: string,
  bezetting: ZoneBezetting,
  van: ISODate,
  tot: ISODate,
): ISODate | undefined {
  if (bezetting.capaciteit <= 0 || bezetting.bezet >= bezetting.capaciteit) return undefined
  const { aankomsten, vertrekken } = zoneStromen(data, zoneId, van, tot)
  const deltasPerDatum = new Map<ISODate, number>()
  for (const unit of aankomsten) {
    const datum = volgendeGeplandeLocatie(data, unit)?.vanaf
    if (datum) deltasPerDatum.set(datum, (deltasPerDatum.get(datum) ?? 0) + 1)
  }
  for (const unit of vertrekken) {
    const datum = volgendeGeplandeLocatie(data, unit)?.vanaf
    if (datum) deltasPerDatum.set(datum, (deltasPerDatum.get(datum) ?? 0) - 1)
  }
  let lopend = bezetting.bezet
  const gesorteerd = [...deltasPerDatum.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  for (const [datum, delta] of gesorteerd) {
    lopend += delta
    if (lopend >= bezetting.capaciteit) return datum
  }
  return undefined
}

// ---------- Weekkop (gedeeld door beide matrixen) ----------

function WeekKop({ maandag, vorige, huidigeWeek }: { maandag: ISODate; vorige?: ISODate; huidigeWeek: ISODate }) {
  const isHuidig = maandag === huidigeWeek
  const nieuweMaand = !vorige || maandKort(maandag) !== maandKort(vorige)
  return (
    <th
      className={`border-b border-l border-slate-200 px-1 py-1.5 text-center font-normal ${isHuidig ? 'bg-brand-50' : ''}`}
      title={`Week van ${formatDatumMetDag(maandag)}${isHuidig ? ' (huidige week)' : ''}`}
    >
      <div className="text-[10px] tracking-wide text-slate-400 uppercase">{nieuweMaand ? maandKort(maandag) : ' '}</div>
      <div className={`text-xs tabular-nums ${isHuidig ? 'font-semibold text-brand-800' : 'font-medium text-slate-600'}`}>
        Wk {weekNummer(maandag)}
      </div>
    </th>
  )
}

// ---------- Zonebalkje (drempels 80% / 100%, anders dan de team-CapaciteitsBalk) ----------

function ZoneBalk({ bezetting }: { bezetting: ZoneBezetting }) {
  const kleur =
    bezetting.niveau === 'vol' ? 'bg-red-500' : bezetting.niveau === 'bijna_vol' ? 'bg-amber-500' : 'bg-emerald-500'
  const tekstKleur =
    bezetting.niveau === 'vol' ? 'text-red-600 font-semibold' : bezetting.niveau === 'bijna_vol' ? 'text-amber-600' : 'text-slate-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full min-w-12 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${kleur}`} style={{ width: `${Math.min(100, bezetting.pct)}%` }} />
      </div>
      <span className={`w-9 shrink-0 text-right text-xs tabular-nums ${tekstKleur}`}>{bezetting.pct}%</span>
    </div>
  )
}

// ---------- Hoofdcomponent ----------

const AANTAL_TEAM_WEKEN = 12
const AANTAL_ZONE_WEKEN = 8

export default function CapaciteitsPlanning() {
  const { data, ui } = useApp()
  const navigate = useNavigate()

  const vandaag = vandaagISO()
  const weken = useMemo(() => weekReeks(vandaag, AANTAL_TEAM_WEKEN), [vandaag])
  const zoneWeken = useMemo(() => weken.slice(0, AANTAL_ZONE_WEKEN), [weken])
  const huidigeWeek = weken[0]

  // ---------- Sectie 1: teamcapaciteit ----------

  const afdelingsGroepen = useMemo(
    () =>
      PRODUCTIE_AFDELINGEN.map((afdeling) => ({
        afdeling,
        teams: data.teams.filter((t) => t.afdeling === afdeling).sort((a, b) => a.naam.localeCompare(b.naam)),
      })).filter((g) => g.teams.length > 0),
    [data.teams],
  )

  // Cellen per team-id en per afdeling ('afd:<afdeling>'), in dezelfde weekvolgorde als `weken`.
  const teamMatrix = useMemo(() => {
    const matrix = new Map<string, TeamCel[]>()
    for (const groep of afdelingsGroepen) {
      for (const team of groep.teams) {
        matrix.set(
          team.id,
          weken.map((maandag) => {
            const gepland = teamGeplandInWeek(data, team.id, maandag)
            return maakTeamCel(teamBeschikbaarInWeek(data, team.id, maandag), gepland, scenarioBelasting(gepland, ui.scenario))
          }),
        )
      }
      matrix.set(
        `afd:${groep.afdeling}`,
        weken.map((maandag) => {
          const gepland = afdelingGeplandInWeek(data, groep.afdeling, maandag)
          return maakTeamCel(
            afdelingBeschikbaarInWeek(data, groep.afdeling, maandag),
            gepland,
            scenarioBelasting(gepland, ui.scenario),
          )
        }),
      )
    }
    return matrix
  }, [data, ui.scenario, afdelingsGroepen, weken])

  // ---------- Sectie 2: fysieke plaatscapaciteit ----------

  const zoneRijen = useMemo<ZoneRij[]>(() => {
    const horizonEind = addDagen(zoneWeken[zoneWeken.length - 1], 6)
    return [ZONE_CHASSIS, ZONE_PANELEN, ZONE_AFBOUW, ZONE_OPSLAG]
      .map((zoneId) => data.zones.find((z) => z.id === zoneId))
      .filter((z): z is Zone => z !== undefined)
      .map((zone) => {
        const bezetting = zoneBezetting(data, zone.id)
        let lopend = bezetting.bezet
        const cellen = zoneWeken.map<ZoneWeekCel>((maandag) => {
          const { aankomsten, vertrekken } = zoneStromen(data, zone.id, maandag, addDagen(maandag, 6))
          lopend += aankomsten.length - vertrekken.length
          const verwacht = Math.max(0, lopend)
          return {
            maandag,
            verwacht,
            aankomsten: aankomsten.length,
            vertrekken: vertrekken.length,
            tekort: Math.max(0, verwacht - bezetting.capaciteit),
          }
        })
        return {
          zone,
          bezetting,
          cellen,
          conflict: zoneCapaciteitsConflict(data, zone.id),
          volOp: eersteVolleDatum(data, zone.id, bezetting, zoneWeken[0], horizonEind),
        }
      })
  }, [data, zoneWeken])

  // ---------- Sectie 3: vergelijking per productiezone ----------

  const vergelijkingen = useMemo(() => {
    const paren: { zoneId: string; afdeling: Afdeling }[] = [
      { zoneId: ZONE_CHASSIS, afdeling: 'chassis' },
      { zoneId: ZONE_PANELEN, afdeling: 'panelen' },
      { zoneId: ZONE_AFBOUW, afdeling: 'afbouw' },
    ]
    return paren.map(({ zoneId, afdeling }) => {
      const zone = data.zones.find((z) => z.id === zoneId)
      const beschikbaar = afdelingBeschikbaarInWeek(data, afdeling, huidigeWeek)
      const gepland = afdelingGeplandInWeek(data, afdeling, huidigeWeek)
      const belasting = scenarioBelasting(gepland, ui.scenario)
      const teamPct = bezettingsPct(beschikbaar, belasting)
      return {
        zoneId,
        afdeling,
        naam: zone?.naam ?? AFDELING_LABELS[afdeling],
        teamPct,
        teamNiveau: capaciteitsNiveau(teamPct),
        beschikbaar,
        belasting,
        plaats: zoneBezetting(data, zoneId),
      }
    })
  }, [data, ui.scenario, huidigeWeek])

  const legenda = (
    <div className="flex items-center gap-3 text-[11px] text-slate-500">
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-4 rounded-sm border border-emerald-200 bg-emerald-50" /> &lt; 85%
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-4 rounded-sm border border-amber-200 bg-amber-50" /> 85–100%
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-4 rounded-sm border border-red-200 bg-red-50" /> &gt; 100%
      </span>
    </div>
  )

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Uitlegregel: twee verschillende capaciteiten */}
      <div className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <Info size={15} className="mt-0.5 shrink-0 text-sky-600" />
        <p>
          <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
            Teamcapaciteit (uren)
            <InfoTip tekst="Beschikbare uren van de interne teams per week: contracturen × beschikbaarheidspercentage, minus goedgekeurde afwezigheid. Hiertegenover staan de geplande fase-uren." />
          </span>{' '}
          en{' '}
          <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
            fysieke plaatscapaciteit (trailerplaatsen)
            <InfoTip tekst="Het aantal fysieke trailerplaatsen in een zone in de fabriek. Een plaats is óf bezet óf vrij; uren spelen hierbij geen rol." />
          </span>{' '}
          zijn verschillende capaciteiten. Een team kan uren overhebben terwijl de zone vol staat — of andersom. Bijvoorbeeld:
          “Teamcapaciteit Panelenbouw: 90% · Plaatscapaciteit Panelenbouw: 100%”.
        </p>
      </div>

      {/* Sectie 1: teamcapaciteit per week */}
      <Kaart>
        <KaartKop
          titel={
            <>
              <Users size={16} className="text-brand-700" />
              Teamcapaciteit per week
            </>
          }
          uitleg="Bezettingspercentage per team per week: geplande fase-uren volgens het gekozen scenario gedeeld door de beschikbare uren. De afdelingsrij telt alle teams van die afdeling op."
          rechts={legenda}
        />
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          <CalendarClock size={13} className="shrink-0" />
          Bezetting volgens scenario “{SCENARIO_LABELS[ui.scenario]}”
          <InfoTip tekst="Het scenario kies je in de topbalk. “Alleen definitief” telt alleen bevestigde orders; “Definitief + schaduw” telt schaduwprojecten volledig mee; “Definitief + kansgewogen” weegt schaduwprojecten mee naar hun verkoopkans." />
        </div>

        {afdelingsGroepen.length === 0 ? (
          <div className="p-4">
            <LegeStaat titel="Geen teams gevonden" tekst="Er zijn nog geen interne teams aangemaakt. Voeg teams toe via de Teams-pagina." />
          </div>
        ) : (
          <div className="scrollbar-dun overflow-x-auto">
            <table
              className="w-full border-separate border-spacing-0 text-sm"
              style={{ minWidth: `${224 + AANTAL_TEAM_WEKEN * 64}px` }}
            >
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-slate-200 bg-white px-3 py-1.5 text-left align-bottom text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                    Team
                  </th>
                  {weken.map((maandag, i) => (
                    <WeekKop key={maandag} maandag={maandag} vorige={weken[i - 1]} huidigeWeek={huidigeWeek} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {afdelingsGroepen.map((groep) => {
                  const afdelingCellen = teamMatrix.get(`afd:${groep.afdeling}`) ?? []
                  return (
                    <Fragment key={groep.afdeling}>
                      {/* Afdelingstotaalrij */}
                      <tr>
                        <td className="sticky left-0 z-[5] border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
                          {AFDELING_LABELS[groep.afdeling]}
                          <span className="ml-1 font-normal text-slate-400">· totaal</span>
                        </td>
                        {afdelingCellen.map((cel, i) => (
                          <td
                            key={weken[i]}
                            title={celTitel(`${AFDELING_LABELS[groep.afdeling]} (afdeling)`, weken[i], cel)}
                            className={`border-b border-l border-slate-200 bg-slate-50 px-1 py-1.5 text-center text-xs font-medium tabular-nums ${NIVEAU_CEL_KLASSE[cel.niveau]}`}
                          >
                            {celLabel(cel)}
                          </td>
                        ))}
                      </tr>
                      {/* Teamrijen */}
                      {groep.teams.map((team: Team) => {
                        const cellen = teamMatrix.get(team.id) ?? []
                        const leden = teamLedenOpDag(data, team.id, huidigeWeek).length
                        return (
                          <tr
                            key={team.id}
                            onClick={() => navigate('/teams')}
                            className="group cursor-pointer"
                            title={`Open de Teams-pagina voor ${team.naam}`}
                          >
                            <td className="sticky left-0 z-[5] border-b border-slate-100 bg-white px-3 py-1.5 transition-colors group-hover:bg-slate-50">
                              <span className="block truncate text-xs font-medium text-slate-700 group-hover:text-brand-700">
                                {team.naam}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {leden} medewerker{leden === 1 ? '' : 's'}
                              </span>
                            </td>
                            {cellen.map((cel, i) => (
                              <td
                                key={weken[i]}
                                title={celTitel(team.naam, weken[i], cel)}
                                className={`border-b border-l border-slate-100 px-1 py-1.5 text-center text-xs tabular-nums ${NIVEAU_CEL_KLASSE[cel.niveau]}`}
                              >
                                {celLabel(cel)}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kaart>

      {/* Sectie 2: fysieke plaatscapaciteit per zone */}
      <Kaart>
        <KaartKop
          titel={
            <>
              <Warehouse size={16} className="text-brand-700" />
              Fysieke plaatscapaciteit per zone
            </>
          }
          uitleg="Links de huidige bezetting van elke zone (bezette trailerplaatsen). Rechts de verwachte bezetting per week: de huidige bezetting plus de geplande aankomsten minus de geplande vertrekken, cumulatief opgeteld vanuit de faseplanning."
          rechts={
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-4 rounded-sm border border-amber-200 bg-amber-50" /> ≥ 80%
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-4 rounded-sm border border-red-200 bg-red-50" /> vol / tekort
              </span>
            </div>
          }
        />
        {zoneRijen.length === 0 ? (
          <div className="p-4">
            <LegeStaat titel="Geen zones gevonden" tekst="Er zijn geen productiezones met trailerplaatsen ingericht." />
          </div>
        ) : (
          <div className="scrollbar-dun overflow-x-auto">
            <table
              className="w-full border-separate border-spacing-0 text-sm"
              style={{ minWidth: `${200 + 190 + AANTAL_ZONE_WEKEN * 64}px` }}
            >
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-slate-200 bg-white px-3 py-1.5 text-left align-bottom text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                    Zone
                  </th>
                  <th className="border-b border-slate-200 px-3 py-1.5 text-left align-bottom">
                    <span className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                      Huidige bezetting
                      <InfoTip tekst="Aantal trailerplaatsen dat op dit moment fysiek bezet is. Groen < 80%, amber 80–99%, rood 100% (vol)." />
                    </span>
                  </th>
                  {zoneWeken.map((maandag, i) => (
                    <WeekKop key={maandag} maandag={maandag} vorige={zoneWeken[i - 1]} huidigeWeek={huidigeWeek} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {zoneRijen.map((rij) => {
                  const meldingen: { soort: 'conflict' | 'vol'; tekst: string }[] = []
                  if (rij.conflict) meldingen.push({ soort: 'conflict', tekst: rij.conflict })
                  if (rij.volOp)
                    meldingen.push({
                      soort: 'vol',
                      tekst: `${rij.zone.naam} is naar verwachting op ${formatDatum(rij.volOp)} volledig bezet.`,
                    })
                  return (
                    <Fragment key={rij.zone.id}>
                      <tr
                        onClick={() => navigate(`/planning?view=locatie&zone=${rij.zone.id}`)}
                        className="group cursor-pointer"
                        title={`Open de Locatieplanning voor ${rij.zone.naam}`}
                      >
                        <td
                          className={`sticky left-0 z-[5] bg-white px-3 py-2 transition-colors group-hover:bg-slate-50 ${meldingen.length === 0 ? 'border-b border-slate-100' : ''}`}
                        >
                          <span className="block text-xs font-semibold text-slate-800 group-hover:text-brand-700">{rij.zone.naam}</span>
                          <span className="text-[10px] text-slate-400">
                            {rij.bezetting.vrij} plaats{rij.bezetting.vrij === 1 ? '' : 'en'} vrij
                          </span>
                        </td>
                        <td className={`px-3 py-2 group-hover:bg-slate-50 ${meldingen.length === 0 ? 'border-b border-slate-100' : ''}`}>
                          <div className="mb-1 text-xs tabular-nums text-slate-600">
                            <span className="font-medium text-slate-800">{rij.bezetting.bezet}</span> van {rij.bezetting.capaciteit}{' '}
                            plaatsen
                          </div>
                          <ZoneBalk bezetting={rij.bezetting} />
                        </td>
                        {rij.cellen.map((cel) => {
                          const pctVerwacht =
                            rij.bezetting.capaciteit > 0 ? Math.round((cel.verwacht / rij.bezetting.capaciteit) * 100) : 0
                          const klasse =
                            cel.tekort > 0
                              ? 'bg-red-50 text-red-700 font-semibold'
                              : pctVerwacht >= 100
                                ? 'bg-red-50 text-red-600'
                                : pctVerwacht >= 80
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'text-slate-600'
                          const titel = [
                            `Wk ${weekNummer(cel.maandag)}: verwacht ${cel.verwacht} van ${rij.bezetting.capaciteit} plaatsen bezet`,
                            `${cel.aankomsten} geplande aankomst(en) · ${cel.vertrekken} gepland(e) vertrek(ken)`,
                            ...(cel.tekort > 0 ? [`Tekort van ${cel.tekort} plaats(en): meer units verwacht dan er plaatsen zijn.`] : []),
                          ].join('\n')
                          return (
                            <td
                              key={cel.maandag}
                              title={titel}
                              className={`border-l border-slate-100 px-1 py-2 text-center align-middle text-xs tabular-nums ${klasse} ${meldingen.length === 0 ? 'border-b border-slate-100' : ''}`}
                            >
                              <div>
                                {cel.verwacht}/{rij.bezetting.capaciteit}
                              </div>
                              {cel.tekort > 0 && <div className="text-[10px] leading-tight">tekort {cel.tekort}</div>}
                            </td>
                          )
                        })}
                      </tr>
                      {meldingen.length > 0 && (
                        <tr>
                          <td colSpan={2 + AANTAL_ZONE_WEKEN} className="border-b border-slate-100 px-3 pt-0 pb-2">
                            <div className="flex flex-col gap-1">
                              {meldingen.map((m, i) => (
                                <span
                                  key={i}
                                  className={`flex items-center gap-1.5 text-xs ${m.soort === 'conflict' ? 'text-red-600' : 'text-amber-700'}`}
                                >
                                  <AlertTriangle size={13} className="shrink-0" />
                                  {m.tekst}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kaart>

      {/* Sectie 3: vergelijking team- versus plaatscapaciteit */}
      <Kaart>
        <KaartKop
          titel={
            <>
              <ArrowLeftRight size={16} className="text-brand-700" />
              Team- versus plaatscapaciteit · deze week
            </>
          }
          uitleg="Per productiezone naast elkaar: de urenbezetting van de bijbehorende afdeling (volgens het gekozen scenario) en de fysieke plaatsbezetting van de zone. Zo zie je in één oogopslag of het knelpunt bij mensen of bij plaatsen ligt."
        />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {vergelijkingen.map((v) => (
            <div key={v.zoneId} className="rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-slate-700">{v.naam}</span>
                <button
                  onClick={() => navigate(`/planning?view=locatie&zone=${v.zoneId}`)}
                  className="shrink-0 cursor-pointer text-[11px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
                  title={`Open de Locatieplanning voor ${v.naam}`}
                >
                  Naar zone
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge
                  kleur={NIVEAU_BADGE_KLEUR[v.teamNiveau]}
                  title={`Afdeling ${AFDELING_LABELS[v.afdeling]}: ${Math.round(v.belasting)} van ${Math.round(v.beschikbaar)} beschikbare uren gepland deze week (scenario “${SCENARIO_LABELS[ui.scenario]}”)`}
                >
                  Teamcapaciteit {v.beschikbaar <= 0 && v.belasting > 0 ? '∞' : `${v.teamPct}%`}
                </Badge>
                <span className="text-slate-400">·</span>
                <Badge
                  kleur={ZONE_NIVEAU_BADGE_KLEUR[v.plaats.niveau]}
                  title={`${v.naam}: ${v.plaats.bezet} van ${v.plaats.capaciteit} trailerplaatsen bezet`}
                >
                  Plaatscapaciteit {v.plaats.pct}%
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Kaart>
    </div>
  )
}
