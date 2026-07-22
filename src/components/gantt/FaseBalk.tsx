// Eén fasebalk in de Gantt: versleepbaar (verplaatsen + einddatum oprekken)
// met snap op hele dagen, ghost-weergave tijdens het slepen en klik-popover.

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AlertTriangle, Check, Truck } from 'lucide-react'
import type { Fase, Project } from '../../lib/types'
import { addDagen, diffDagen, formatDatumKort } from '../../lib/dates'
import { Tooltip } from '../ui'

interface Props {
  fase: Fase
  project: Project
  x: (datum: string) => number
  dagBreedte: number
  kanBewerken: boolean
  /** Waarschuwingstekst als de fase te vroeg start t.o.v. een voorganger. */
  afhankelijkheidsWaarschuwing?: string
  onVerschuif: (faseId: string, deltaDagen: number) => void
  onResize: (faseId: string, deltaDagen: number) => void
  onKlik: (fase: Fase, positie: { x: number; y: number }) => void
}

type DragModus = 'verplaats' | 'resize'

export default function FaseBalk({
  fase,
  project,
  x,
  dagBreedte,
  kanBewerken,
  afhankelijkheidsWaarschuwing,
  onVerschuif,
  onResize,
  onKlik,
}: Props) {
  const [drag, setDrag] = useState<{ modus: DragModus; delta: number } | null>(null)
  const startX = useRef(0)
  const maxBeweging = useRef(0)
  const modusRef = useRef<DragModus>('verplaats')

  const duurDagen = diffDagen(fase.start, fase.eind) // inclusief eind → breedte = duur+1
  const extern = !!fase.externePartijId
  const schaduw = project.status === 'schaduw'
  const gereed = fase.status === 'gereed'
  const geblokkeerd = fase.status === 'geblokkeerd'
  const sleepbaar = kanBewerken && !gereed

  const beginDrag = (e: ReactPointerEvent<HTMLDivElement>, modus: DragModus) => {
    e.preventDefault()
    e.stopPropagation()
    startX.current = e.clientX
    maxBeweging.current = 0
    modusRef.current = modus
    if (sleepbaar) {
      e.currentTarget.setPointerCapture(e.pointerId)
      setDrag({ modus, delta: 0 })
    }
  }

  const tijdensDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const px = e.clientX - startX.current
    maxBeweging.current = Math.max(maxBeweging.current, Math.abs(px))
    let delta = Math.round(px / dagBreedte)
    if (drag.modus === 'resize') delta = Math.max(-duurDagen, delta) // eind nooit vóór start
    if (delta !== drag.delta) setDrag({ modus: drag.modus, delta })
  }

  const eindDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const wasKlik = maxBeweging.current < 4
    const d = drag
    setDrag(null)
    if (wasKlik) {
      onKlik(fase, { x: e.clientX, y: e.clientY })
      return
    }
    if (!d || d.delta === 0) return
    if (d.modus === 'verplaats') onVerschuif(fase.id, d.delta)
    else onResize(fase.id, d.delta)
  }

  // Positie incl. ghost-offset tijdens het slepen.
  const verplaatsDelta = drag?.modus === 'verplaats' ? drag.delta : 0
  const resizeDelta = drag?.modus === 'resize' ? drag.delta : 0
  const left = x(fase.start) + verplaatsDelta * dagBreedte
  const breedte = Math.max(dagBreedte, (duurDagen + 1 + resizeDelta) * dagBreedte)

  const ghostStart = addDagen(fase.start, verplaatsDelta)
  const ghostEind = addDagen(fase.eind, verplaatsDelta + resizeDelta)

  let balkKlasse = 'bg-brand-600'
  let tekstKlasse = 'text-white'
  if (extern) {
    balkKlasse = 'balk-extern'
    tekstKlasse = 'text-purple-800'
  } else if (schaduw) {
    balkKlasse = 'balk-schaduw'
    tekstKlasse = 'text-brand-900'
  }

  const titel = `${fase.naam} · ${project.projectnummer} · ${formatDatumKort(fase.start)} – ${formatDatumKort(fase.eind)} · ${fase.voortgang}%`

  return (
    <>
      {afhankelijkheidsWaarschuwing && (
        <span
          className="absolute top-1/2 z-10 -translate-y-1/2"
          style={{ left: left - 17 }}
        >
          <Tooltip tekst={afhankelijkheidsWaarschuwing}>
            <AlertTriangle size={13} className="text-amber-500" />
          </Tooltip>
        </span>
      )}
      <div
        role="button"
        title={titel}
        onPointerDown={(e) => beginDrag(e, 'verplaats')}
        onPointerMove={tijdensDrag}
        onPointerUp={eindDrag}
        className={`absolute top-1/2 h-5 -translate-y-1/2 select-none rounded-sm ${balkKlasse}
          ${gereed ? 'opacity-60' : ''}
          ${geblokkeerd ? 'outline outline-2 outline-red-500' : ''}
          ${drag ? 'z-20 opacity-80 shadow-lg' : ''}
          ${sleepbaar ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
        style={{ left, width: breedte, touchAction: 'none' }}
      >
        {/* Voortgangsvlak binnen definitieve balken */}
        {!extern && !schaduw && fase.voortgang > 0 && !gereed && (
          <div className="absolute inset-y-0 left-0 rounded-l-sm bg-brand-900/45" style={{ width: `${fase.voortgang}%` }} />
        )}
        <div className={`relative flex h-full items-center gap-1 overflow-hidden px-1.5 ${tekstKlasse}`}>
          {extern && <Truck size={12} className="shrink-0 text-purple-700" />}
          {gereed && <Check size={12} className={`shrink-0 ${extern || schaduw ? 'text-brand-800' : 'text-white'}`} />}
          {geblokkeerd && <AlertTriangle size={12} className="shrink-0 text-red-600" />}
          {breedte >= 70 && <span className="truncate text-[10px] font-medium leading-none">{fase.naam}</span>}
        </div>
        {/* Resize-handle rechts */}
        {sleepbaar && (
          <div
            onPointerDown={(e) => beginDrag(e, 'resize')}
            className="absolute inset-y-0 -right-0.5 w-2 cursor-ew-resize rounded-r-sm hover:bg-slate-900/20"
            title="Sleep om de einddatum te wijzigen"
          />
        )}
        {/* Datumlabel tijdens het slepen */}
        {drag && (
          <div className="pointer-events-none absolute -top-6 left-0 z-30 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white shadow">
            {formatDatumKort(ghostStart)} – {formatDatumKort(ghostEind)}
            {drag.delta !== 0 && ` (${drag.delta > 0 ? '+' : ''}${drag.delta} d)`}
          </div>
        )}
      </div>
    </>
  )
}
