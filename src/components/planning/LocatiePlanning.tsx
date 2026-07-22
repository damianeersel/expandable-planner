// Locatieplanning: visuele plattegrond van MH25, MH207 en Opslag met
// drag-and-drop van units, wachtrij, detailpaneel, filters en een
// voorspellende modus "Geplande bezetting".

import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ChevronRight, Filter, Lock, MapPin, Search, X } from 'lucide-react'
import { useApp } from '../../store/AppState'
import {
  AFDELING_LABELS,
  UNIT_STATUS_LABELS,
  type Afdeling,
  type Locatie,
  type Plaats,
  type Unit,
  type UnitStatus,
  type Zone,
} from '../../lib/types'
import { addDagen, formatDatum, startVanWeek, vandaagISO } from '../../lib/dates'
import {
  afdelingBeschikbaarInWeek,
  afdelingGeplandInWeek,
  bezettingsPct,
  scenarioBelasting,
} from '../../lib/capacity'
import {
  geplandeBezettingOpDatum,
  getUnitWaarschuwingen,
  unitOpPlaats,
  zoneBezetting,
  zoneCapaciteitsConflict,
  zonePlaatsen,
  zonesVanLocatie,
  zoneStromenDezeWeek,
  trailerLabel,
  ZONE_AFBOUW,
  ZONE_CHASSIS,
  ZONE_OPSLAG,
  ZONE_PANELEN,
  type GeplandeUnitPositie,
} from '../../lib/locaties'
import { Badge, InfoTip, Invoer, Kaart, Keuze, Knop, LegeStaat, Tooltip, useToast } from '../ui'
import UnitKaart from '../locatie/UnitKaart'
import { HistorieModal, OpgehaaldDialoog, VerplaatsDialoog, WisselDialoog } from '../locatie/dialogen'
import { ActiviteitenFeed, UnitDetailPaneel, WachtrijPaneel } from '../locatie/panelen'
import {
  heeftActieveFilters,
  LEGE_FILTERS,
  unitMatcht,
  type LocatieFilters,
} from '../locatie/helpers'
import { formatDatumKort } from '../../lib/dates'

type Dialoog =
  | { soort: 'verplaats'; unitId: string; plaatsId: string }
  | { soort: 'wissel'; unitId: string; doelUnitId: string }
  | { soort: 'opgehaald'; unitId: string }
  | { soort: 'historie'; unitId?: string }

const ZONE_NAAR_AFDELING: Record<string, Afdeling | undefined> = {
  'z-chassis': 'chassis',
  'z-panelen': 'panelen',
  'z-afbouw': 'afbouw',
}

const ZONE_GRID: Record<string, string> = {
  'z-afbouw': 'grid-cols-5',
  'z-chassis': 'grid-cols-3',
  'z-panelen': 'grid-cols-3',
  'z-opslag': 'grid-cols-5',
}

function filtersUitParams(params: URLSearchParams): LocatieFilters {
  const f = { ...LEGE_FILTERS }
  const zone = params.get('zone')
  if (zone) f.zone = zone
  switch (params.get('filter')) {
    case 'waarschuwing':
      f.metWaarschuwing = true
      break
    case 'wacht_afhaling':
      f.wachtAfhaling = true
      break
    case 'vrij':
      f.alleenVrij = true
      break
    case 'opgeleverd':
      f.opgeleverd = true
      break
    case 'zonder_project':
      f.zonderProject = true
      break
    case 'afwijking':
      f.afwijking = true
      break
    case 'zonder_plaats':
      f.zonderPlaats = true
      break
  }
  return f
}

export default function LocatiePlanning() {
  const { data, ui, permissies, persona } = useApp()
  const { toon } = useToast()
  const [params, setParams] = useSearchParams()

  const magBewerken = permissies.unitsVerplaatsen
  const vandaag = vandaagISO()

  const [modus, setModus] = useState<'actueel' | 'gepland'>('actueel')
  const [grootte, setGrootte] = useState<'compact' | 'normaal' | 'groot'>('normaal')
  const [geplandeDatum, setGeplandeDatum] = useState(() => addDagen(vandaag, 14))
  // Hoogte van de trailerplaatsen per weergavegrootte (bouwhal vs. compacte opslag).
  const bouwHoogte = grootte === 'compact' ? 'min-h-[5.5rem]' : grootte === 'groot' ? 'min-h-[9.5rem]' : 'min-h-[7.25rem]'
  const opslagHoogte = grootte === 'compact' ? 'min-h-11' : grootte === 'groot' ? 'min-h-[4.75rem]' : 'min-h-14'
  const [filters, setFilters] = useState<LocatieFilters>(() => filtersUitParams(params))
  const [filterOpen, setFilterOpen] = useState(false)
  const [dicht, setDicht] = useState<Set<string>>(new Set())
  const [dragUnitId, setDragUnitId] = useState<string | null>(null)
  const [hoverPlaatsId, setHoverPlaatsId] = useState<string | null>(null)
  const [verplaatsUnitId, setVerplaatsUnitId] = useState<string | null>(null)
  const [detailUnitId, setDetailUnitId] = useState<string | null>(() => params.get('unit'))
  const [dialoog, setDialoog] = useState<Dialoog | null>(null)

  // Eénmalig toegepaste deep-link-parameters opruimen zodat verdere navigatie schoon is.
  useEffect(() => {
    if (params.get('zone') || params.get('filter') || params.get('unit')) {
      const schoon = new URLSearchParams(params)
      schoon.delete('zone')
      schoon.delete('filter')
      schoon.delete('unit')
      setParams(schoon, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc annuleert de verplaatsmodus.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVerplaatsUnitId(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const actueleUnits = useMemo(() => data.units.filter((u) => u.status !== 'opgeleverd'), [data.units])
  const opgeleverdeUnits = useMemo(() => data.units.filter((u) => u.status === 'opgeleverd'), [data.units])

  const unitPerPlaats = useMemo(() => {
    const m = new Map<string, Unit>()
    for (const u of actueleUnits) if (u.plaatsId) m.set(u.plaatsId, u)
    return m
  }, [actueleUnits])

  // Geplande bezetting (alleen in modus 'gepland').
  const geplandePosities = useMemo(
    () => (modus === 'gepland' ? geplandeBezettingOpDatum(data, geplandeDatum) : []),
    [data, modus, geplandeDatum],
  )
  const geplandPerPlaats = useMemo(() => {
    const m = new Map<string, GeplandeUnitPositie>()
    for (const p of geplandePosities) if (p.plaatsId && p.zoneId) m.set(p.plaatsId, p)
    return m
  }, [geplandePosities])
  const geplandeInstroom = useMemo(() => {
    const m = new Map<string, GeplandeUnitPositie[]>()
    for (const p of geplandePosities) {
      if (p.extern || !p.zoneId || p.plaatsId) continue
      m.set(p.zoneId, [...(m.get(p.zoneId) ?? []), p])
    }
    return m
  }, [geplandePosities])
  const geplandExtern = useMemo(() => geplandePosities.filter((p) => p.extern), [geplandePosities])

  const filtersActief = heeftActieveFilters(filters)
  const isGedimd = (unit: Unit) => {
    if (filters.alleenVrij) return true // focus op vrije plaatsen: alle units dimmen
    if (!filtersActief) return false
    return !unitMatcht(data, unit, filters)
  }

  // ---------- Verplaats-orkestratie ----------

  const plaatsGekozen = (unitId: string, plaatsId: string) => {
    const unit = data.units.find((u) => u.id === unitId)
    if (!unit || unit.plaatsId === plaatsId) return
    const bezet = unitOpPlaats(data, plaatsId)
    setVerplaatsUnitId(null)
    if (bezet) setDialoog({ soort: 'wissel', unitId, doelUnitId: bezet.id })
    else setDialoog({ soort: 'verplaats', unitId, plaatsId })
  }

  const beginDrag = (unitId: string, e: DragEvent) => {
    e.dataTransfer.setData('text/plain', unitId)
    e.dataTransfer.effectAllowed = 'move'
    setDragUnitId(unitId)
  }
  const eindeDrag = () => {
    setDragUnitId(null)
    setHoverPlaatsId(null)
  }

  const dropOpPlaats = (plaatsId: string, e: DragEvent) => {
    e.preventDefault()
    const unitId = e.dataTransfer.getData('text/plain') || dragUnitId
    eindeDrag()
    if (!unitId) return
    if (!magBewerken) {
      toon('fout', 'Jouw rol mag trailers niet verplaatsen.')
      return
    }
    plaatsGekozen(unitId, plaatsId)
  }

  // ---------- Plaatsvak ----------

  function PlaatsVak({ plaats, zone }: { plaats: Plaats; zone: Zone }) {
    const unit = unitPerPlaats.get(plaats.id)
    const gepland = modus === 'gepland' ? geplandPerPlaats.get(plaats.id) : undefined
    const sleepActief = (dragUnitId ?? verplaatsUnitId) !== null
    const sleepUnit = dragUnitId ?? verplaatsUnitId
    const isEigenPlaats = !!sleepUnit && unit?.id === sleepUnit
    const vrij = !unit
    const isHover = hoverPlaatsId === plaats.id
    const klein = zone.id === ZONE_OPSLAG

    const dropKlasse =
      modus === 'actueel' && sleepActief && !isEigenPlaats
        ? vrij
          ? isHover
            ? 'ring-2 ring-brand-500 bg-brand-50'
            : 'ring-2 ring-emerald-300 bg-emerald-50/40'
          : isHover
            ? 'ring-2 ring-amber-400'
            : 'opacity-70'
        : ''

    const inhoud =
      modus === 'gepland' ? (
        gepland ? (
          <UnitKaart data={data} unit={gepland.unit} klein={klein} gestreept onKlik={() => setDetailUnitId(gepland.unit.id)} />
        ) : null
      ) : unit ? (
        <UnitKaart
          data={data}
          unit={unit}
          klein={klein}
          geselecteerd={detailUnitId === unit.id || verplaatsUnitId === unit.id}
          gedimd={isGedimd(unit)}
          sleepbaar={magBewerken && modus === 'actueel'}
          onKlik={() => setDetailUnitId(unit.id)}
          onDragStart={(e) => beginDrag(unit.id, e)}
          onDragEnd={eindeDrag}
        />
      ) : null

    return (
      <div
        onDragOver={(e) => {
          if (modus !== 'actueel') return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setHoverPlaatsId(plaats.id)
        }}
        onDragLeave={() => setHoverPlaatsId((h) => (h === plaats.id ? null : h))}
        onDrop={(e) => dropOpPlaats(plaats.id, e)}
        onClick={() => {
          if (verplaatsUnitId && modus === 'actueel') plaatsGekozen(verplaatsUnitId, plaats.id)
        }}
        className={`rounded-md transition-all ${klein ? opslagHoogte : bouwHoogte} ${dropKlasse} ${
          verplaatsUnitId && vrij && modus === 'actueel' ? 'cursor-pointer' : ''
        }`}
        title={vrij ? `${plaats.naam} · vrij` : undefined}
      >
        {inhoud ?? (
          <div
            className={`flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed py-1.5 ${
              filters.alleenBezet ? 'opacity-30' : ''
            } ${sleepActief ? 'border-emerald-400' : 'border-slate-300'} bg-slate-50/50`}
          >
            {/* Subtiele trailercontour */}
            <div className={`${klein ? 'h-3 w-8' : 'h-5 w-14'} rounded-sm border border-slate-300/80`} />
            <span className="text-[10px] font-medium text-slate-500">{plaats.naam}</span>
            <span className="text-[9px] text-emerald-600">Vrij</span>
          </div>
        )}
      </div>
    )
  }

  // ---------- Zone: kopregel met bezetting, waarschuwingen en conflicten ----------

  function zoneGedimd(zone: Zone): boolean {
    return (
      (filters.zone !== 'alle' && filters.zone !== zone.id) ||
      (filters.locatie !== 'alle' && filters.locatie !== zone.locatieId)
    )
  }

  function ZoneKop({ zone }: { zone: Zone }) {
    const bezetting = zoneBezetting(data, zone.id)
    const stromen = zoneStromenDezeWeek(data, zone.id)
    const conflict = zoneCapaciteitsConflict(data, zone.id)
    const plaatsen = zonePlaatsen(data, zone.id)
    const waarschuwingen = plaatsen.reduce((n, p) => {
      const u = unitPerPlaats.get(p.id)
      return n + (u && getUnitWaarschuwingen(data, u).length > 0 ? 1 : 0)
    }, 0)
    const afdeling = ZONE_NAAR_AFDELING[zone.id]
    const maandag = startVanWeek(vandaag)
    const teamPct = afdeling
      ? bezettingsPct(
          afdelingBeschikbaarInWeek(data, afdeling, maandag),
          scenarioBelasting(afdelingGeplandInWeek(data, afdeling, maandag), ui.scenario),
        )
      : undefined
    const kleurBadge = bezetting.niveau === 'vol' ? 'rood' : bezetting.niveau === 'bijna_vol' ? 'amber' : 'groen'
    const verwachtTotaal = modus === 'gepland' ? geplandePosities.filter((p) => p.zoneId === zone.id && !p.extern).length : 0
    const geplandTekort = modus === 'gepland' ? Math.max(0, verwachtTotaal - bezetting.capaciteit) : 0

    return (
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-700">{zone.naam}</span>
          <Badge kleur={kleurBadge}>
            {bezetting.bezet} van {bezetting.capaciteit} bezet · {bezetting.pct}%
          </Badge>
          {waarschuwingen > 0 && (
            <Badge kleur="amber" title="Trailers met een waarschuwing in deze zone">
              <AlertTriangle size={11} /> {waarschuwingen}
            </Badge>
          )}
          <span className="text-[11px] text-slate-500" title="Verwachte aankomsten en vertrekken deze week">
            deze week: +{stromen.aankomsten.length} / −{stromen.vertrekken.length}
          </span>
          {teamPct !== undefined && (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">
              Teamcapaciteit {teamPct}% · Plaatsen {bezetting.pct}%
              <InfoTip tekst="Personeels- en plaatscapaciteit zijn verschillende capaciteiten: het team kan vol zitten terwijl er fysiek nog plaats is, en andersom." />
            </span>
          )}
        </div>
        {conflict && modus === 'actueel' && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
            {conflict}
          </div>
        )}
        {modus === 'gepland' && geplandTekort > 0 && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-red-500" />
            Verwacht {verwachtTotaal} trailers voor {bezetting.capaciteit} plaatsen — tekort van {geplandTekort} plaats(en)
            op {formatDatum(geplandeDatum)}.
          </div>
        )}
      </div>
    )
  }

  /** Blok met verwachte instroom (gestreepte kaarten) in modus 'gepland'. */
  function InstroomBlok({ zone }: { zone: Zone }) {
    if (modus !== 'gepland') return null
    const instroom = geplandeInstroom.get(zone.id) ?? []
    if (instroom.length === 0) return null
    return (
      <div className="mt-2 rounded-md border border-brand-200 bg-brand-50/50 p-2">
        <span className="mb-1.5 block text-[11px] font-medium text-brand-800">
          Verwachte instroom op {formatDatum(geplandeDatum)} (nog geen plaats toegewezen)
        </span>
        <div className="grid grid-cols-4 gap-2">
          {instroom.map((p) => (
            <UnitKaart key={p.unit.id} data={data} unit={p.unit} klein gestreept onKlik={() => setDetailUnitId(p.unit.id)} />
          ))}
        </div>
      </div>
    )
  }

  /** Horizontale rij trailerplaatsen (gebruikt in de gebouwplattegronden). */
  function PlaatsRij({ zone, plaatsen, cols = 'grid-cols-6', className = '' }: { zone: Zone; plaatsen: Plaats[]; cols?: string; className?: string }) {
    return (
      <div className={`grid gap-2 ${cols} ${className}`}>
        {plaatsen.map((p) => (
          <PlaatsVak key={p.id} plaats={p} zone={zone} />
        ))}
      </div>
    )
  }

  // ---------- MH207: lang, rechthoekig pand met twee horizontale rijen ----------

  function Mh207Plattegrond() {
    const chassis = data.zones.find((z) => z.id === ZONE_CHASSIS)
    const panelen = data.zones.find((z) => z.id === ZONE_PANELEN)
    if (!chassis || !panelen) return null
    return (
      <div className="overflow-x-auto scrollbar-dun">
        <div className="min-w-[760px] rounded-xl border-2 border-slate-300 bg-gradient-to-b from-slate-50/40 to-white p-4 shadow-inner">
          {/* Bovenste rij — Chassisbouw */}
          <div className={zoneGedimd(chassis) ? 'opacity-35' : ''}>
            <ZoneKop zone={chassis} />
            <PlaatsRij zone={chassis} plaatsen={zonePlaatsen(data, chassis.id)} className="mt-2" />
            <InstroomBlok zone={chassis} />
          </div>
          {/* Centrale rijroute / werkruimte */}
          <div className="my-4 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            <span className="h-px flex-1 bg-slate-300" />
            Centrale rijroute · werkruimte
            <span className="h-px flex-1 bg-slate-300" />
          </div>
          {/* Onderste rij — Panelenbouw */}
          <div className={zoneGedimd(panelen) ? 'opacity-35' : ''}>
            <ZoneKop zone={panelen} />
            <PlaatsRij zone={panelen} plaatsen={zonePlaatsen(data, panelen.id)} className="mt-2" />
            <InstroomBlok zone={panelen} />
          </div>
        </div>
      </div>
    )
  }

  // ---------- MH25: vierkant pand, 6 plaatsen boven + 4 onder met centrale ruimte ----------

  function Mh25Plattegrond() {
    const afbouw = data.zones.find((z) => z.id === ZONE_AFBOUW)
    if (!afbouw) return null
    const plaatsen = zonePlaatsen(data, afbouw.id)
    const boven = plaatsen.slice(0, 6)
    const onder = plaatsen.slice(6)
    return (
      <div className="overflow-x-auto scrollbar-dun">
        <div
          className={`mx-auto min-w-[620px] max-w-4xl rounded-xl border-2 border-slate-300 bg-gradient-to-b from-slate-50/40 to-white p-4 shadow-inner ${
            zoneGedimd(afbouw) ? 'opacity-35' : ''
          }`}
        >
          <ZoneKop zone={afbouw} />
          {/* Bovenste zijde: 6 plaatsen naast elkaar */}
          <PlaatsRij zone={afbouw} plaatsen={boven} className="mt-2" />
          {/* Centrale werk- en manoeuvreerruimte */}
          <div className="my-4 flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100/60 py-5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Centrale werk- en manoeuvreerruimte
          </div>
          {/* Andere zijde: 4 plaatsen, gecentreerd */}
          <PlaatsRij zone={afbouw} plaatsen={onder} cols="grid-cols-4" className="mx-auto w-2/3" />
          <InstroomBlok zone={afbouw} />
        </div>
      </div>
    )
  }

  // ---------- Opslag: buitenterrein-raster ----------

  function OpslagTerrein({ zone }: { zone: Zone }) {
    return (
      <div className={zoneGedimd(zone) ? 'opacity-35' : ''}>
        <ZoneKop zone={zone} />
        <div className="mt-2 rounded-xl border-2 border-dashed border-slate-300 bg-[repeating-linear-gradient(45deg,rgba(100,116,139,0.05)_0,rgba(100,116,139,0.05)_10px,transparent_10px,transparent_20px)] p-3">
          <PlaatsRij zone={zone} plaatsen={zonePlaatsen(data, zone.id)} cols="grid-cols-5" />
        </div>
        <InstroomBlok zone={zone} />
      </div>
    )
  }

  // ---------- Locatiesectie (kiest de juiste plattegrond per locatie) ----------

  function LocatieSectie({ locatie }: { locatie: Locatie }) {
    const zones = zonesVanLocatie(data, locatie.id)
    const isDicht = dicht.has(locatie.id)
    const totaal = zones.reduce(
      (acc, z) => {
        const b = zoneBezetting(data, z.id)
        return { bezet: acc.bezet + b.bezet, capaciteit: acc.capaciteit + b.capaciteit }
      },
      { bezet: 0, capaciteit: 0 },
    )
    return (
      <Kaart className="overflow-hidden">
        <button
          onClick={() =>
            setDicht((s) => {
              const kopie = new Set(s)
              if (kopie.has(locatie.id)) kopie.delete(locatie.id)
              else kopie.add(locatie.id)
              return kopie
            })
          }
          className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-slate-50"
        >
          {isDicht ? <ChevronRight size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          <MapPin size={15} className="text-brand-600" />
          <span className="text-sm font-semibold text-slate-900">{locatie.naam}</span>
          {locatie.adres && <span className="text-xs text-slate-400">· {locatie.adres}</span>}
          <span className="ml-auto text-xs text-slate-500">
            {totaal.bezet} van {totaal.capaciteit} plaatsen bezet
          </span>
        </button>
        {!isDicht && (
          <div className="border-t border-slate-100 p-3">
            <p className="mb-2 px-1 text-[11px] text-slate-400">{locatie.functie}</p>
            {locatie.id === 'loc-mh207' ? (
              <Mh207Plattegrond />
            ) : locatie.id === 'loc-mh25' ? (
              <Mh25Plattegrond />
            ) : locatie.id === 'loc-opslag' ? (
              zones.map((z) => <OpslagTerrein key={z.id} zone={z} />)
            ) : (
              zones.map((z) => (
                <div key={z.id} className="mb-3">
                  <ZoneKop zone={z} />
                  <PlaatsRij zone={z} plaatsen={zonePlaatsen(data, z.id)} cols={ZONE_GRID[z.id] ?? 'grid-cols-5'} className="mt-2" />
                  <InstroomBlok zone={z} />
                </div>
              ))
            )}
          </div>
        )}
      </Kaart>
    )
  }

  // ---------- Filters ----------

  const modellen = useMemo(() => [...new Set(data.projecten.map((p) => p.productModel))].sort(), [data.projecten])
  const klanten = useMemo(() => [...new Set(data.projecten.map((p) => p.klant))].sort(), [data.projecten])
  const pms = useMemo(() => [...new Set(data.projecten.map((p) => p.projectmanager))].sort(), [data.projecten])
  const productieleiders = useMemo(
    () =>
      [
        ...new Set(
          data.teams
            .map((t) => data.medewerkers.find((m) => m.id === t.productieleiderId)?.naam)
            .filter((n): n is string => !!n),
        ),
      ].sort(),
    [data.teams, data.medewerkers],
  )

  const zetFilter = <K extends keyof LocatieFilters>(k: K, v: LocatieFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }))

  const verplaatsUnit = verplaatsUnitId ? data.units.find((u) => u.id === verplaatsUnitId) : undefined

  const sluitDialoog = () => setDialoog(null)

  return (
    <div className="flex items-start gap-4 p-6">
      {/* Hoofdkolom */}
      <div className="min-w-0 flex-1">
        {/* Werkbalk */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-slate-300">
            {(['actueel', 'gepland'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModus(m)}
                className={`px-3 py-1.5 text-xs font-medium ${
                  modus === m ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {m === 'actueel' ? 'Actuele bezetting' : 'Geplande bezetting'}
              </button>
            ))}
          </div>
          {modus === 'gepland' && (
            <Invoer
              type="date"
              value={geplandeDatum}
              min={vandaag}
              onChange={(e) => e.target.value && setGeplandeDatum(e.target.value)}
              className="!w-40 !py-1 !text-xs"
              title="Peildatum voor de geplande bezetting"
            />
          )}
          {/* Weergavegrootte */}
          <div className="flex overflow-hidden rounded-md border border-slate-300" title="Grootte van de plattegrond en trailerkaarten">
            {(['compact', 'normaal', 'groot'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGrootte(g)}
                className={`px-2.5 py-1.5 text-xs font-medium capitalize ${
                  grootte === g ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute top-1/2 left-2 -translate-y-1/2 text-slate-400" />
            <Invoer
              value={filters.zoek}
              onChange={(e) => zetFilter('zoek', e.target.value)}
              placeholder="Zoek op PR-nummer, klant, model…"
              className="!w-56 !py-1 !pl-7 !text-xs"
            />
          </div>
          <Knop klein variant={filterOpen || filtersActief ? 'primary' : 'secondary'} onClick={() => setFilterOpen((o) => !o)}>
            <Filter size={13} /> Filters
          </Knop>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={filters.alleenVrij}
              onChange={(e) => zetFilter('alleenVrij', e.target.checked)}
              className="accent-brand-600"
            />
            Alleen vrije plaatsen tonen
          </label>
          {!magBewerken && (
            <Badge kleur="grijs" title="Jouw rol mag trailers niet verplaatsen">
              <Lock size={11} /> Alleen lezen
            </Badge>
          )}
          {filtersActief && (
            <Knop klein variant="ghost" onClick={() => setFilters({ ...LEGE_FILTERS })}>
              <X size={12} /> Filters wissen
            </Knop>
          )}
        </div>

        {/* Filterpaneel */}
        {filterOpen && (
          <Kaart className="mb-3 p-3">
            <div className="grid grid-cols-4 gap-3">
              <Keuze value={filters.locatie} onChange={(e) => zetFilter('locatie', e.target.value)} className="!text-xs">
                <option value="alle">Alle locaties</option>
                {data.locaties.map((l) => (
                  <option key={l.id} value={l.id}>{l.naam}</option>
                ))}
              </Keuze>
              <Keuze value={filters.zone} onChange={(e) => zetFilter('zone', e.target.value)} className="!text-xs">
                <option value="alle">Alle zones</option>
                {data.zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.naam}</option>
                ))}
              </Keuze>
              <Keuze value={filters.status} onChange={(e) => zetFilter('status', e.target.value as UnitStatus | 'alle')} className="!text-xs">
                <option value="alle">Alle trailerstatussen</option>
                {Object.entries(UNIT_STATUS_LABELS).map(([w, l]) => (
                  <option key={w} value={w}>{l}</option>
                ))}
              </Keuze>
              <Keuze value={filters.model} onChange={(e) => zetFilter('model', e.target.value)} className="!text-xs">
                <option value="alle">Alle modellen</option>
                {modellen.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Keuze>
              <Keuze value={filters.klant} onChange={(e) => zetFilter('klant', e.target.value)} className="!text-xs">
                <option value="alle">Alle klanten</option>
                {klanten.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </Keuze>
              <Keuze value={filters.projectmanager} onChange={(e) => zetFilter('projectmanager', e.target.value)} className="!text-xs">
                <option value="alle">Alle projectmanagers</option>
                {pms.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Keuze>
              <Keuze value={filters.productieleider} onChange={(e) => zetFilter('productieleider', e.target.value)} className="!text-xs">
                <option value="alle">Alle productieleiders</option>
                {productieleiders.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Keuze>
              <div className="flex flex-col gap-1 text-xs text-slate-600">
                {(
                  [
                    ['alleenBezet', 'Alleen bezette plaatsen'],
                    ['metWaarschuwing', 'Met waarschuwing'],
                    ['zonderProject', 'Zonder gekoppeld project'],
                    ['wachtAfhaling', 'Wacht op afhaling'],
                    ['opgeleverd', 'Opgeleverde trailers'],
                  ] as const
                ).map(([sleutel, label]) => (
                  <label key={sleutel} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={filters[sleutel]}
                      onChange={(e) => zetFilter(sleutel, e.target.checked)}
                      className="accent-brand-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </Kaart>
        )}

        {/* Verplaatsmodus-banner */}
        {verplaatsUnit && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-900">
            <MapPin size={15} className="shrink-0 text-brand-700" />
            Kies een vrije plaats voor <strong>{trailerLabel(data, verplaatsUnit)}</strong> (Esc om te annuleren)
            <Knop klein variant="ghost" className="ml-auto" onClick={() => setVerplaatsUnitId(null)}>
              Annuleren
            </Knop>
          </div>
        )}

        {/* Prognose-banner */}
        {modus === 'gepland' && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            <InfoTip tekst="De geplande bezetting is een prognose op basis van de project- en faseplanning. Gestreepte kaarten zijn verwachte posities, geen werkelijke." />
            Prognose voor {formatDatum(geplandeDatum)} op basis van de projectplanning — gestreepte kaarten zijn verwachte
            posities, geen werkelijke. Verplaatsen kan alleen in “Actuele bezetting”.
            {geplandExtern.length > 0 && (
              <span className="ml-auto whitespace-nowrap">
                Extern (spuiter): {geplandExtern.map((p) => trailerLabel(data, p.unit)).join(', ')}
              </span>
            )}
          </div>
        )}

        {/* Opgeleverde trailers */}
        {filters.opgeleverd && (
          <Kaart className="mb-3">
            <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">
              Opgeleverde trailers
            </div>
            {opgeleverdeUnits.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400">Nog geen opgeleverde trailers.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs tracking-wide text-slate-500 uppercase">
                    <th className="px-4 py-2 font-medium">PR-nummer</th>
                    <th className="px-3 py-2 font-medium">Klant</th>
                    <th className="px-3 py-2 font-medium">Opgehaald op</th>
                    <th className="px-3 py-2 font-medium">Transporteur</th>
                  </tr>
                </thead>
                <tbody>
                  {opgeleverdeUnits.map((u) => {
                    const project = u.projectId ? data.projecten.find((p) => p.id === u.projectId) : undefined
                    return (
                      <tr
                        key={u.id}
                        onClick={() => setDetailUnitId(u.id)}
                        className="cursor-pointer border-b border-slate-50 hover:bg-slate-50"
                      >
                        <td className="px-4 py-2 text-xs font-medium text-slate-800">{trailerLabel(data, u)}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{project ? project.klant : '—'}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{u.opgehaaldOp ? formatDatum(u.opgehaaldOp) : '—'}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{u.transporteur ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Kaart>
        )}

        {/* Plattegrond */}
        <div className="flex flex-col gap-4">
          {[...data.locaties]
            .sort((a, b) => a.volgorde - b.volgorde)
            .map((l) => (
              <LocatieSectie key={l.id} locatie={l} />
            ))}
        </div>

        {/* Legenda */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[11px] text-slate-500">
          <span className="font-medium tracking-wide text-slate-400 uppercase">Legenda</span>
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 w-6 rounded-sm border-2 border-brand-300 bg-white" /> Bezette plaats
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 w-6 rounded-sm border-2 border-dashed border-slate-300 bg-slate-50" /> Vrije plaats
          </span>
          <span className="flex items-center gap-1.5">
            <span className="balk-schaduw h-3.5 w-6 rounded-sm" /> Geplande positie (prognose)
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-amber-500" /> Waarschuwing of afwijking
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 w-6 rounded-sm border-2 border-red-400 bg-red-50" /> Geblokkeerd
          </span>
        </div>
      </div>

      {/* Rechterkolom */}
      <div className="sticky top-4 flex w-80 shrink-0 flex-col gap-3 self-start">
        {detailUnitId ? (
          <UnitDetailPaneel
            unitId={detailUnitId}
            magBewerken={magBewerken && modus === 'actueel'}
            onSluiten={() => setDetailUnitId(null)}
            onVerplaatsModus={(id) => {
              setVerplaatsUnitId(id)
              setDetailUnitId(null)
            }}
            onOpgehaald={(id) => setDialoog({ soort: 'opgehaald', unitId: id })}
            onHistorie={(id) => setDialoog({ soort: 'historie', unitId: id })}
          />
        ) : (
          <>
            <WachtrijPaneel
              magSlepen={magBewerken && modus === 'actueel'}
              onSelecteer={(id) => setDetailUnitId(id)}
              onDragStart={beginDrag}
              onDragEnd={eindeDrag}
            />
            <ActiviteitenFeed onVolledigeHistorie={() => setDialoog({ soort: 'historie' })} />
          </>
        )}
      </div>

      {/* Dialogen */}
      {dialoog?.soort === 'verplaats' && (
        <VerplaatsDialoog unitId={dialoog.unitId} plaatsId={dialoog.plaatsId} onSluiten={sluitDialoog} />
      )}
      {dialoog?.soort === 'wissel' && (
        <WisselDialoog
          unitId={dialoog.unitId}
          doelUnitId={dialoog.doelUnitId}
          onSluiten={sluitDialoog}
          onAnderePlaats={(unitId) => setVerplaatsUnitId(unitId)}
        />
      )}
      {dialoog?.soort === 'opgehaald' && <OpgehaaldDialoog unitId={dialoog.unitId} onSluiten={sluitDialoog} />}
      {dialoog?.soort === 'historie' && <HistorieModal unitId={dialoog.unitId} onSluiten={sluitDialoog} />}
    </div>
  )
}
