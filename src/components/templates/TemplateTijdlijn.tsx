// Eenvoudige relatieve tijdlijn (productiedagen, geen kalenderdatums): fasebalken met taken eronder.

import type { TemplateFase } from '../../lib/types'
import { AFDELING_LABELS } from '../../lib/types'
import { AFDELING_BALK } from './gedeeld'

interface FaseLayout {
  fase: TemplateFase
  start: number
  eind: number
}

/** Berekent per fase een cumulatieve startdag; panelen mag overlappen met het einde van chassis. */
function berekenLayout(fases: TemplateFase[], overlap: number): FaseLayout[] {
  const gesorteerd = [...fases].sort((a, b) => a.volgorde - b.volgorde)
  const layout: FaseLayout[] = []
  let cursor = 0
  for (const fase of gesorteerd) {
    const duur = Math.max(1, fase.doorlooptijdWerkdagen)
    let start = cursor
    if (fase.key === 'panelen' && overlap > 0) start = Math.max(0, cursor - overlap)
    const eind = start + duur
    layout.push({ fase, start, eind })
    cursor = eind
  }
  return layout
}

export default function TemplateTijdlijn({ fases, overlap }: { fases: TemplateFase[]; overlap: number }) {
  if (fases.length === 0) return <p className="text-sm text-slate-400">Geen fases om weer te geven.</p>

  const layout = berekenLayout(fases, overlap)
  const totaal = Math.max(1, ...layout.map((l) => l.eind))
  const pct = (dag: number) => `${(dag / totaal) * 100}%`

  // Asmarkeringen ongeveer elke 10 dagen.
  const stap = totaal > 60 ? 20 : totaal > 30 ? 10 : 5
  const markeringen: number[] = []
  for (let d = 0; d <= totaal; d += stap) markeringen.push(d)

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Relatieve productieplanning in werkdagen (Dag 0 = start engineering). Doorlooptijd totaal:{' '}
        <span className="font-medium text-slate-700">{totaal} werkdagen</span>
        {overlap > 0 && <> · panelenbouw overlapt {overlap} dagen met chassisbouw</>}.
      </p>

      {/* As */}
      <div className="relative ml-44 h-4 border-b border-slate-200">
        {markeringen.map((d) => (
          <span key={d} className="absolute -translate-x-1/2 text-[10px] text-slate-400" style={{ left: pct(d) }}>
            Dag {d}
          </span>
        ))}
      </div>

      {/* Fasebalken */}
      <div className="space-y-2">
        {layout.map(({ fase, start, eind }) => {
          const taken = [...fase.taken].sort((a, b) => a.volgorde - b.volgorde)
          return (
            <div key={fase.id} className="flex items-start gap-2">
              <div className="w-44 shrink-0 pt-1">
                <div className="truncate text-xs font-medium text-slate-700" title={fase.naam}>
                  {fase.naam}
                </div>
                <div className="text-[10px] text-slate-400">{AFDELING_LABELS[fase.afdeling]}</div>
              </div>
              <div className="relative min-h-8 flex-1 py-1">
                {/* Fasebalk */}
                <div
                  className={`absolute top-1 flex h-5 items-center justify-center rounded ${AFDELING_BALK[fase.afdeling]} text-[10px] font-medium text-white`}
                  style={{ left: pct(start), width: pct(eind - start) }}
                  title={`${fase.naam}: dag ${start}–${eind}`}
                >
                  {eind - start}d
                </div>
                {/* Taakbalkjes onder de fasebalk */}
                <div className="relative mt-6 h-1.5">
                  {taken.map((taak) => {
                    const tStart = start + taak.startOffsetWerkdagen
                    const tEind = tStart + Math.max(1, taak.duurWerkdagen)
                    return (
                      <div
                        key={taak.id}
                        className={`absolute h-1.5 rounded-full opacity-70 ${AFDELING_BALK[taak.afdeling]}`}
                        style={{ left: pct(tStart), width: pct(tEind - tStart) }}
                        title={`${taak.naam}: dag ${tStart}–${tEind} (${taak.uren} u)`}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
