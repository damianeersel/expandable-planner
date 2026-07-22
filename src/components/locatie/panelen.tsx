// Zijpanelen van de locatieplanning: wachtrij "Te plaatsen trailers",
// compacte activiteitenfeed en het trailerdetailpaneel.

import { useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  History,
  MoveRight,
  StickyNote,
  Truck,
  X,
} from 'lucide-react'
import { useApp } from '../../store/AppState'
import {
  PRIORITEIT_LABELS,
  PROJECT_STATUS_LABELS,
  UNIT_STATUS_LABELS,
  type Unit,
  type UnitStatus,
} from '../../lib/types'
import { FASE_LABELS } from '../../lib/types'
import { formatDatum, formatDatumKort } from '../../lib/dates'
import { getHuidigeFase, getProjectVoortgang } from '../../lib/capacity'
import {
  dagenOpPlaats,
  getPlaatsInfo,
  getUnitWaarschuwingen,
  getWachtrij,
  productieVoltooid,
  trailerLabel,
  volgendeGeplandeLocatie,
} from '../../lib/locaties'
import { Badge, Keuze, Knop, Tekstvak, useToast, VoortgangsBalk } from '../ui'
import { formatTijdstip, huidigeLocatieLabel, projectVanUnit, STATUS_BADGE_KLEUR } from './helpers'

// ---------- Wachtrij ----------

export function WachtrijPaneel({
  magSlepen,
  onSelecteer,
  onDragStart,
  onDragEnd,
}: {
  magSlepen: boolean
  onSelecteer: (unitId: string) => void
  onDragStart: (unitId: string, e: DragEvent) => void
  onDragEnd: () => void
}) {
  const { data } = useApp()
  const [open, setOpen] = useState(true)
  const items = getWachtrij(data)

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="text-sm font-semibold text-slate-800">Te plaatsen trailers</span>
        <span className="flex items-center gap-1.5">
          <Badge kleur={items.length > 0 ? 'amber' : 'groen'}>{items.length}</Badge>
          <span className="text-xs text-slate-400">{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-slate-100 p-2.5">
          {items.length === 0 && <p className="px-1 py-2 text-xs text-slate-400">Alle trailers hebben een plaats.</p>}
          {items.map((item) => {
            const prioKleur = item.prioriteit === 'hoog' ? 'rood' : item.prioriteit === 'laag' ? 'grijs' : 'blauw'
            return (
              <div
                key={item.unit.id}
                draggable={magSlepen}
                onDragStart={(e) => onDragStart(item.unit.id, e)}
                onDragEnd={onDragEnd}
                onClick={() => onSelecteer(item.unit.id)}
                className={`rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-left transition-shadow hover:shadow ${
                  magSlepen ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                }`}
                title={magSlepen ? 'Sleep naar een vrije plaats of klik voor details' : 'Klik voor details'}
              >
                <div className="flex items-center gap-1.5">
                  <Truck size={12} className="shrink-0 text-brand-600" />
                  <span className="text-xs font-semibold text-slate-800">{trailerLabel(data, item.unit)}</span>
                  <Badge kleur={prioKleur}>{PRIORITEIT_LABELS[item.prioriteit]}</Badge>
                </div>
                {item.project && (
                  <div className="mt-0.5 truncate text-[11px] text-slate-500">
                    {item.project.projectnummer} · {item.project.klant} · {item.project.productModel}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge kleur={STATUS_BADGE_KLEUR[item.unit.status]}>{UNIT_STATUS_LABELS[item.unit.status]}</Badge>
                  <span className="text-[11px] text-slate-500">
                    → {item.gewensteZoneNaam}
                    {item.gewensteDatum ? ` · ${formatDatumKort(item.gewensteDatum)}` : ''}
                  </span>
                </div>
                <div className="mt-1 text-[11px] leading-snug text-amber-700">{item.reden}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- Activiteitenfeed ----------

export function ActiviteitenFeed({ onVolledigeHistorie }: { onVolledigeHistorie: () => void }) {
  const { data } = useApp()
  const recent = data.locatieHistorie.slice(0, 8)

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-sm font-semibold text-slate-800">Recente verplaatsingen</span>
        <Knop klein variant="ghost" onClick={onVolledigeHistorie} title="Volledige locatiehistorie bekijken">
          <History size={13} /> Alles
        </Knop>
      </div>
      <div className="border-t border-slate-100 px-3 py-2">
        {recent.length === 0 && <p className="py-1 text-xs text-slate-400">Nog geen verplaatsingen.</p>}
        {recent.map((m) => (
          <div key={m.id} className="border-b border-slate-50 py-1.5 text-[11px] leading-snug last:border-0">
            <div className="flex items-center gap-1 font-medium text-slate-700">
              {m.projectnummer ?? 'Trailer zonder project'}
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <span className="max-w-24 truncate">{m.vanLabel}</span>
              <ArrowRight size={10} className="shrink-0" />
              <span className="max-w-28 truncate">{m.naarLabel}</span>
            </div>
            <div className="text-slate-400">
              {formatTijdstip(m.tijdstip)} · {m.gebruiker}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Unitdetailpaneel ----------

function Regel({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-50 py-1.5 text-xs last:border-0">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-700">{children ?? '—'}</span>
    </div>
  )
}

export function UnitDetailPaneel({
  unitId,
  magBewerken,
  onSluiten,
  onVerplaatsModus,
  onOpgehaald,
  onHistorie,
}: {
  unitId: string
  magBewerken: boolean
  onSluiten: () => void
  onVerplaatsModus: (unitId: string) => void
  onOpgehaald: (unitId: string) => void
  onHistorie: (unitId: string) => void
}) {
  const { data, dispatch } = useApp()
  const { toon } = useToast()
  const navigate = useNavigate()

  const unit = data.units.find((u) => u.id === unitId)
  const [nieuweStatus, setNieuweStatus] = useState<UnitStatus | ''>('')
  const [notitieOpen, setNotitieOpen] = useState(false)
  const [notitie, setNotitie] = useState(unit?.notities ?? '')

  if (!unit) return null

  const project = projectVanUnit(data, unit)
  const fase = project ? getHuidigeFase(data, project.id) : undefined
  const info = getPlaatsInfo(data, unit.plaatsId)
  const waarschuwingen = getUnitWaarschuwingen(data, unit)
  const volgende = volgendeGeplandeLocatie(data, unit)
  const historie = data.locatieHistorie.filter((m) => m.unitId === unit.id).slice(0, 5)
  const magOphalen =
    magBewerken &&
    (unit.status === 'wacht_afhaling' ||
      (unit.status === 'in_opslag' && !!project && productieVoltooid(data, project.id)))

  const statusOpslaan = () => {
    if (!nieuweStatus || nieuweStatus === unit.status) return
    dispatch({ type: 'UNIT_BIJWERKEN', id: unit.id, patch: { status: nieuweStatus } })
    toon('succes', `Trailerstatus van ${trailerLabel(data, unit)} gewijzigd naar “${UNIT_STATUS_LABELS[nieuweStatus]}”.`)
    setNieuweStatus('')
  }

  const notitieOpslaan = () => {
    dispatch({ type: 'UNIT_BIJWERKEN', id: unit.id, patch: { notities: notitie.trim() || undefined } })
    toon('succes', `Notitie bij ${trailerLabel(data, unit)} opgeslagen.`)
    setNotitieOpen(false)
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Truck size={15} className="text-brand-600" />
          <span className="text-sm font-bold text-slate-900">{trailerLabel(data, unit)}</span>
          <Badge kleur={STATUS_BADGE_KLEUR[unit.status]}>{UNIT_STATUS_LABELS[unit.status]}</Badge>
        </div>
        <button onClick={onSluiten} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <X size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {waarschuwingen.length > 0 && (
          <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
            {waarschuwingen.map((w, i) => (
              <div key={i} className="flex items-start gap-1.5 py-0.5 text-[11px] leading-snug text-amber-800">
                <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
                {w.tekst}
              </div>
            ))}
          </div>
        )}

        {project ? (
          <>
            <Regel label="PR-nummer">
              {project.projectnummer}
              <span className="block text-[11px] font-normal text-slate-400">{project.naam}</span>
            </Regel>
            <Regel label="Klant">{project.klant}</Regel>
            <Regel label="Model">{project.productModel}</Regel>
            <Regel label="Projectstatus">{PROJECT_STATUS_LABELS[project.status]}</Regel>
            <Regel label="Projectfase">{fase ? FASE_LABELS[fase.key] : '—'}</Regel>
          </>
        ) : (
          <Regel label="Project">Geen project gekoppeld</Regel>
        )}
        <Regel label="Huidige locatie">{info ? info.locatie.naam : huidigeLocatieLabel(data, unit)}</Regel>
        {info && (
          <>
            <Regel label="Zone">{info.zone.naam}</Regel>
            <Regel label="Plaats">{info.plaats.naam}</Regel>
          </>
        )}
        <Regel label="Op plaats sinds">
          {unit.opPlaatsSinds ? `${formatDatum(unit.opPlaatsSinds)} (${dagenOpPlaats(unit)} dagen)` : '—'}
        </Regel>
        <Regel label="Gepland vertrek">
          {unit.geplandeVertrekdatum ? formatDatum(unit.geplandeVertrekdatum) : '—'}
        </Regel>
        <Regel label="Volgende locatie">
          {volgende ? `${volgende.zoneNaam} · vanaf ${formatDatumKort(volgende.vanaf)}` : '—'}
        </Regel>
        {unit.opgehaaldOp && (
          <Regel label="Opgehaald op">
            {formatDatum(unit.opgehaaldOp)}
            {unit.transporteur && <span className="block text-[11px] font-normal text-slate-400">{unit.transporteur}</span>}
          </Regel>
        )}
        {project && (
          <div className="py-2">
            <span className="mb-1 block text-xs text-slate-400">Voortgang project</span>
            <VoortgangsBalk pct={getProjectVoortgang(data, project.id)} />
          </div>
        )}
        {unit.notities && !notitieOpen && (
          <div className="mt-1 rounded-md bg-slate-50 px-2.5 py-2 text-[11px] leading-snug text-slate-600">
            <StickyNote size={11} className="mr-1 inline text-slate-400" />
            {unit.notities}
          </div>
        )}

        {notitieOpen && (
          <div className="mt-2">
            <Tekstvak rows={3} value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="Notitie…" />
            <div className="mt-1.5 flex justify-end gap-1.5">
              <Knop klein onClick={() => setNotitieOpen(false)}>
                Annuleren
              </Knop>
              <Knop klein variant="primary" onClick={notitieOpslaan}>
                Opslaan
              </Knop>
            </div>
          </div>
        )}

        {magBewerken && (
          <div className="mt-3 border-t border-slate-100 pt-2.5">
            <span className="mb-1 block text-xs font-medium text-slate-500">Status wijzigen</span>
            <div className="flex gap-1.5">
              <Keuze value={nieuweStatus} onChange={(e) => setNieuweStatus(e.target.value as UnitStatus)} className="!py-1 !text-xs">
                <option value="">— Kies status —</option>
                {Object.entries(UNIT_STATUS_LABELS)
                  .filter(([w]) => w !== 'opgeleverd')
                  .map(([waarde, label]) => (
                    <option key={waarde} value={waarde}>
                      {label}
                    </option>
                  ))}
              </Keuze>
              <Knop klein disabled={!nieuweStatus || nieuweStatus === unit.status} onClick={statusOpslaan}>
                Toepassen
              </Knop>
            </div>
          </div>
        )}

        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <span className="mb-1 block text-xs font-medium text-slate-500">Recente locatiehistorie</span>
          {historie.length === 0 && <p className="text-[11px] text-slate-400">Nog geen verplaatsingen.</p>}
          {historie.map((m) => (
            <div key={m.id} className="border-b border-slate-50 py-1 text-[11px] leading-snug last:border-0">
              <span className="text-slate-400">{formatTijdstip(m.tijdstip)}</span>
              <div className="flex items-center gap-1 text-slate-600">
                <span className="max-w-24 truncate">{m.vanLabel}</span>
                <ArrowRight size={10} className="shrink-0" />
                <span className="max-w-28 truncate">{m.naarLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Acties */}
      <div className="flex flex-wrap gap-1.5 border-t border-slate-100 p-2.5">
        {project && (
          <Knop klein onClick={() => navigate(`/projecten/${project.id}`)}>
            <ExternalLink size={12} /> Naar project
          </Knop>
        )}
        {magBewerken && unit.status !== 'opgeleverd' && (
          <Knop klein variant="primary" onClick={() => onVerplaatsModus(unit.id)}>
            <MoveRight size={12} /> Trailer verplaatsen
          </Knop>
        )}
        <Knop klein onClick={() => onHistorie(unit.id)}>
          <History size={12} /> Historie
        </Knop>
        {magBewerken && (
          <Knop klein onClick={() => setNotitieOpen(true)}>
            <StickyNote size={12} /> Notitie
          </Knop>
        )}
        {magOphalen && (
          <Knop klein variant="primary" onClick={() => onOpgehaald(unit.id)}>
            <CheckCircle2 size={12} /> Markeer als opgehaald
          </Knop>
        )}
      </div>
    </div>
  )
}

export type { Unit }
