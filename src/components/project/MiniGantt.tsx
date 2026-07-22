// Compacte read-only Gantt van de fases van één project (weekgebaseerd).

import type { AppData, Fase, ISODate, Project } from '../../lib/types'
import { AFDELING_LABELS } from '../../lib/types'
import { getVerwachteOplevering, projectFases } from '../../lib/capacity'
import {
  addDagen,
  diffDagen,
  formatDatum,
  formatDatumKort,
  maxISO,
  minISO,
  startVanWeek,
  vandaagISO,
  weekLabel,
} from '../../lib/dates'
import { LegeStaat } from '../ui'

const LABEL_B = 176 // breedte labelkolom (w-44)
const WEEK_B = 56
const DAG_B = WEEK_B / 7

function balkKlasse(fase: Fase, project: Project): string {
  const basis = 'absolute top-2 h-5 rounded-sm'
  const blokkade = fase.status === 'geblokkeerd' ? ' ring-2 ring-red-500' : ''
  if (fase.status === 'gereed') {
    return `${basis} ${fase.externePartijId ? 'balk-extern opacity-40' : 'bg-brand-600 opacity-35'}`
  }
  if (fase.externePartijId) return `${basis} balk-extern${blokkade}`
  if (project.status === 'schaduw') return `${basis} balk-schaduw${blokkade}`
  return `${basis} bg-brand-600${blokkade}`
}

function MarkerLabel({ x, kleur, tekst, onder = false }: { x: number; kleur: string; tekst: string; onder?: boolean }) {
  return (
    <span
      className={`absolute ${onder ? 'bottom-0' : 'top-0'} -translate-x-1/2 whitespace-nowrap text-[10px] font-medium ${kleur}`}
      style={{ left: x }}
    >
      {tekst}
    </span>
  )
}

export default function MiniGantt({ data, project }: { data: AppData; project: Project }) {
  const fases = projectFases(data, project.id)
  if (fases.length === 0) {
    return <LegeStaat titel="Geen fases gepland" tekst="Voor dit project zijn nog geen fases aangemaakt." />
  }

  const vandaag = vandaagISO()
  const verwacht = getVerwachteOplevering(data, project.id)
  const minStart = fases.reduce((min, f) => minISO(min, f.start), fases[0].start)
  const maxEind = [verwacht, project.gewensteOpleverdatum, vandaag].reduce(
    (max, d) => maxISO(max, d),
    fases.reduce((max, f) => maxISO(max, f.eind), fases[0].eind),
  )
  const bereikStart = startVanWeek(minISO(minStart, vandaag))
  const aantalWeken = Math.floor(diffDagen(bereikStart, maxEind) / 7) + 1
  const weken: ISODate[] = Array.from({ length: aantalWeken }, (_, i) => addDagen(bereikStart, i * 7))
  const chartBreedte = aantalWeken * WEEK_B
  const totaal = LABEL_B + chartBreedte

  const pos = (d: ISODate) => diffDagen(bereikStart, d) * DAG_B
  const teLaat = verwacht > project.gewensteOpleverdatum
  const gridAchtergrond = `repeating-linear-gradient(to right, #f1f5f9 0px, #f1f5f9 1px, transparent 1px, transparent ${WEEK_B}px)`

  return (
    <div>
      <div className="overflow-x-auto scrollbar-dun">
        <div className="relative" style={{ width: totaal, minWidth: '100%' }}>
          {/* Labelstrook voor mijlpalen */}
          <div className="relative h-9" style={{ width: totaal }}>
            <MarkerLabel x={LABEL_B + pos(vandaag)} kleur="text-red-600" tekst="Vandaag" />
            <MarkerLabel x={LABEL_B + pos(project.gewensteOpleverdatum)} kleur="text-slate-500" tekst={`Gewenst ${formatDatumKort(project.gewensteOpleverdatum)}`} onder />
            <MarkerLabel
              x={LABEL_B + pos(verwacht)}
              kleur={teLaat ? 'text-red-600' : 'text-emerald-600'}
              tekst={`Verwacht ${formatDatumKort(verwacht)}`}
            />
          </div>

          {/* Weekkoppen */}
          <div className="flex border-y border-slate-200">
            <div className="sticky left-0 z-10 w-44 shrink-0 border-r border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Fase
            </div>
            {weken.map((w) => (
              <div key={w} style={{ width: WEEK_B }} className="shrink-0 border-r border-slate-100 py-1 text-center">
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{weekLabel(w)}</div>
                <div className="text-[10px] text-slate-400">{formatDatumKort(w)}</div>
              </div>
            ))}
          </div>

          {/* Faserijen */}
          {fases.map((f) => (
            <div key={f.id} className="flex border-b border-slate-100">
              <div className="sticky left-0 z-10 w-44 shrink-0 border-r border-slate-200 bg-white px-3 py-1.5">
                <div className="truncate text-xs font-medium text-slate-700">{f.naam}</div>
                <div className="text-[10px] text-slate-400">{AFDELING_LABELS[f.afdeling]}</div>
              </div>
              <div className="relative h-9" style={{ width: chartBreedte, backgroundImage: gridAchtergrond }}>
                <div
                  className={balkKlasse(f, project)}
                  style={{ left: pos(f.start), width: Math.max(6, (diffDagen(f.start, f.eind) + 1) * DAG_B) }}
                  title={`${f.naam}: ${formatDatum(f.start)} – ${formatDatum(f.eind)} · ${f.voortgang}% gereed`}
                />
              </div>
            </div>
          ))}

          {/* Verticale mijlpaallijnen over de hele hoogte */}
          <div className="pointer-events-none absolute bottom-0 top-9 w-0.5 bg-red-400/80" style={{ left: LABEL_B + pos(vandaag) }} />
          <div
            className="pointer-events-none absolute bottom-0 top-9 border-l border-dashed border-slate-500/70"
            style={{ left: LABEL_B + pos(project.gewensteOpleverdatum) }}
          />
          <div
            className={`pointer-events-none absolute bottom-0 top-9 w-px ${teLaat ? 'bg-red-500/80' : 'bg-emerald-500/80'}`}
            style={{ left: LABEL_B + pos(verwacht) }}
          />
        </div>
      </div>

      {/* Legenda */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded-sm bg-brand-600" /> Definitieve fase</span>
        <span className="flex items-center gap-1.5"><span className="balk-schaduw h-3 w-6 rounded-sm" /> Schaduwfase</span>
        <span className="flex items-center gap-1.5"><span className="balk-extern h-3 w-6 rounded-sm" /> Externe fase</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-6 rounded-sm bg-brand-600 opacity-35" /> Gereed</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-red-400" /> Vandaag</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-px border-l border-dashed border-slate-500" /> Gewenste oplevering</span>
        <span className="flex items-center gap-1.5"><span className={`h-3 w-px ${teLaat ? 'bg-red-500' : 'bg-emerald-500'}`} /> Verwachte oplevering</span>
      </div>
    </div>
  )
}
