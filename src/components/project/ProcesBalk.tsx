// Horizontale stappenbalk met het volledige productieproces van een project.

import { AlertTriangle, Check } from 'lucide-react'
import type { AppData, Fase, FaseKey, Project } from '../../lib/types'
import { getVerwachteOplevering, projectFases } from '../../lib/capacity'
import { formatDatumKort } from '../../lib/dates'
import { Kaart, Tooltip } from '../ui'

type StapStatus = 'gereed' | 'bezig' | 'geblokkeerd' | 'gepland'

interface Stap {
  label: string
  status: StapStatus
  sub?: string
  tooltip?: string
}

function faseStap(fases: Fase[], key: FaseKey, label: string): Stap {
  const f = fases.find((x) => x.key === key)
  if (!f) return { label, status: 'gepland' }
  const status: StapStatus =
    f.status === 'gereed' ? 'gereed' : f.status === 'geblokkeerd' ? 'geblokkeerd' : f.status === 'bezig' ? 'bezig' : 'gepland'
  return {
    label,
    status,
    sub: `${formatDatumKort(f.start)} – ${formatDatumKort(f.eind)}`,
    tooltip:
      status === 'geblokkeerd'
        ? `Geblokkeerd${f.blokkadeNotitie ? `: ${f.blokkadeNotitie}` : ''}`
        : status === 'bezig'
          ? `In uitvoering — ${f.voortgang}% gereed`
          : undefined,
  }
}

const CIRKEL_STIJL: Record<StapStatus, string> = {
  gereed: 'bg-emerald-500 text-white',
  bezig: 'bg-brand-600 text-white ring-4 ring-brand-100',
  geblokkeerd: 'bg-red-500 text-white ring-4 ring-red-100',
  gepland: 'border-2 border-slate-300 bg-white text-slate-300',
}

export default function ProcesBalk({ data, project }: { data: AppData; project: Project }) {
  const fases = projectFases(data, project.id)
  const kwaliteit = fases.find((f) => f.key === 'kwaliteit')
  const verwacht = getVerwachteOplevering(data, project.id)
  const bevestigd = project.status === 'definitief' || project.status === 'opgeleverd'

  const stappen: Stap[] = [
    { label: 'Salesoverdracht', status: 'gereed', sub: formatDatumKort(project.aangemaaktOp) },
    bevestigd
      ? { label: 'Schaduwplanning', status: 'gereed', sub: project.bevestigdOp ? `Bevestigd ${formatDatumKort(project.bevestigdOp)}` : 'Bevestigd' }
      : {
          label: 'Schaduwplanning',
          status: project.status === 'schaduw' ? 'bezig' : 'gepland',
          sub: `Verkoopkans ${project.verkoopkans}%`,
          tooltip: 'Het project staat nog in de schaduwplanning: capaciteit is gereserveerd, maar de order is nog niet bevestigd.',
        },
    faseStap(fases, 'engineering', 'Engineering'),
    faseStap(fases, 'chassis', 'Chassisbouw'),
    faseStap(fases, 'panelen', 'Panelenbouw'),
    faseStap(fases, 'spuiter', 'Externe spuiter'),
    faseStap(fases, 'afbouw', 'Afbouw'),
    faseStap(fases, 'kwaliteit', 'Kwaliteitscontrole'),
    {
      label: 'Oplevering',
      status: kwaliteit?.status === 'gereed' || project.status === 'opgeleverd' ? 'gereed' : 'gepland',
      sub: `Verwacht ${formatDatumKort(verwacht)}`,
    },
  ]

  return (
    <Kaart className="mb-5 overflow-x-auto px-4 py-3 scrollbar-dun">
      <div className="flex min-w-[980px] items-start">
        {stappen.map((stap, i) => (
          <div key={stap.label} className={`flex items-start ${i > 0 ? 'flex-1' : ''}`}>
            {i > 0 && (
              <div
                className={`mt-[13px] h-0.5 min-w-4 flex-1 ${stappen[i - 1].status === 'gereed' ? 'bg-emerald-400' : 'bg-slate-200'}`}
              />
            )}
            <Tooltip tekst={stap.tooltip ?? `${stap.label}${stap.sub ? ` · ${stap.sub}` : ''}`}>
              <div className="flex w-24 shrink-0 flex-col items-center text-center">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${CIRKEL_STIJL[stap.status]}`}>
                  {stap.status === 'gereed' && <Check size={15} strokeWidth={3} />}
                  {stap.status === 'bezig' && <span className="h-2 w-2 rounded-full bg-white" />}
                  {stap.status === 'geblokkeerd' && <AlertTriangle size={13} />}
                  {stap.status === 'gepland' && <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
                </span>
                <span
                  className={`mt-1.5 text-[11px] font-medium leading-tight ${
                    stap.status === 'gepland' ? 'text-slate-400' : stap.status === 'geblokkeerd' ? 'text-red-600' : 'text-slate-700'
                  }`}
                >
                  {stap.label}
                </span>
                {stap.sub && <span className="mt-0.5 text-[10px] leading-tight text-slate-400">{stap.sub}</span>}
              </div>
            </Tooltip>
          </div>
        ))}
      </div>
    </Kaart>
  )
}
