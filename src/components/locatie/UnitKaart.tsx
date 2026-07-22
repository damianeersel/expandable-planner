// Visuele trailerkaart voor de locatieplanning: rechthoekige unitkaart met
// projectinfo, status, voortgang en waarschuwingen. Ondersteunt een compacte
// variant (opslag) en een gestreepte variant (geplande/voorspelde positie).

import type { DragEvent } from 'react'
import { AlertTriangle, Lock, Truck } from 'lucide-react'
import type { AppData, Unit } from '../../lib/types'
import { FASE_LABELS, UNIT_STATUS_LABELS } from '../../lib/types'
import { formatDatumKort } from '../../lib/dates'
import { getHuidigeFase, getProjectVoortgang } from '../../lib/capacity'
import { getUnitWaarschuwingen, trailerPrNummer, volgendeGeplandeLocatie } from '../../lib/locaties'
import { Badge, Tooltip } from '../ui'
import { projectVanUnit, STATUS_BADGE_KLEUR } from './helpers'

interface Props {
  data: AppData
  unit: Unit
  klein?: boolean
  /** Voorspelde positie in de modus "Geplande bezetting". */
  gestreept?: boolean
  geselecteerd?: boolean
  gedimd?: boolean
  sleepbaar?: boolean
  onKlik?: () => void
  onDragStart?: (e: DragEvent) => void
  onDragEnd?: () => void
}

export default function UnitKaart({
  data,
  unit,
  klein = false,
  gestreept = false,
  geselecteerd = false,
  gedimd = false,
  sleepbaar = false,
  onKlik,
  onDragStart,
  onDragEnd,
}: Props) {
  const project = projectVanUnit(data, unit)
  const fase = project ? getHuidigeFase(data, project.id) : undefined
  const waarschuwingen = getUnitWaarschuwingen(data, unit)
  const volgende = volgendeGeplandeLocatie(data, unit)
  const voortgang = project ? getProjectVoortgang(data, project.id) : 0
  const geblokkeerd = unit.status === 'geblokkeerd'
  // Het PR-nummer is de enige identificatie van de trailer.
  const prNummer = trailerPrNummer(data, unit) ?? 'Geen project'

  const basis = `relative flex h-full w-full flex-col gap-0.5 rounded-md border-2 px-1.5 py-1 text-left transition-shadow
    ${gestreept ? 'balk-schaduw border-brand-300/70 text-brand-950' : geblokkeerd ? 'border-red-400 bg-red-50' : 'border-brand-300 bg-white'}
    ${geselecteerd ? 'ring-2 ring-brand-500 shadow-md' : 'shadow-sm hover:shadow-md'}
    ${gedimd ? 'opacity-30' : ''}
    ${sleepbaar ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`

  return (
    <div
      draggable={sleepbaar}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation()
        onKlik?.()
      }}
      className={basis}
      title={`${prNummer}${project ? ` · ${project.klant}` : ''} · ${UNIT_STATUS_LABELS[unit.status]}`}
    >
      {/* Kopregel — PR-nummer is het meest prominente identificatie-element */}
      <div className="flex items-center gap-1">
        <Truck size={12} className={`shrink-0 ${gestreept ? 'text-brand-700' : 'text-brand-600'}`} />
        <span className="truncate text-xs font-bold text-slate-900">{prNummer}</span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {geblokkeerd && <Lock size={11} className="text-red-500" />}
          {waarschuwingen.length > 0 && (
            <Tooltip
              tekst={
                <span className="block max-w-56">
                  {waarschuwingen.map((w, i) => (
                    <span key={i} className="block">
                      • {w.tekst}
                    </span>
                  ))}
                </span>
              }
            >
              <AlertTriangle size={12} className="text-amber-500" />
            </Tooltip>
          )}
        </span>
      </div>

      {!klein && (
        <>
          {project ? (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[10px] font-medium text-slate-700">{project.klant}</div>
              <div className="truncate text-[10px] text-slate-400">{project.productModel}</div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 italic">Geen project gekoppeld</div>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-1">
            <Badge kleur={STATUS_BADGE_KLEUR[unit.status]}>{UNIT_STATUS_LABELS[unit.status]}</Badge>
            {fase && <span className="truncate text-[10px] text-slate-400">{FASE_LABELS[fase.key]}</span>}
          </div>

          {project && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${voortgang >= 100 ? 'bg-emerald-500' : 'bg-brand-600'}`}
                style={{ width: `${voortgang}%` }}
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-1 text-[9px] leading-tight text-slate-400">
            <span>
              {unit.opPlaatsSinds ? `sinds ${formatDatumKort(unit.opPlaatsSinds)}` : ''}
              {unit.geplandeVertrekdatum ? ` · vertrek ${formatDatumKort(unit.geplandeVertrekdatum)}` : ''}
            </span>
          </div>
          {volgende && (
            <div className="truncate text-[9px] leading-tight text-sky-700">
              → {volgende.zoneNaam} · {formatDatumKort(volgende.vanaf)}
            </div>
          )}
        </>
      )}

      {klein && (
        <div className="flex min-w-0 items-center gap-1">
          <Badge kleur={STATUS_BADGE_KLEUR[unit.status]}>{UNIT_STATUS_LABELS[unit.status]}</Badge>
          {project && <span className="truncate text-[10px] text-slate-500">{project.klant}</span>}
        </div>
      )}
    </div>
  )
}
