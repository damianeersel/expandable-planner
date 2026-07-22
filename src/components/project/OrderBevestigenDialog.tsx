// Bevestigingsdialoog voor het omzetten van een schaduwproject naar de definitieve planning,
// inclusief capaciteitscontrole vooraf.

import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { Project } from '../../lib/types'
import { getCapaciteitsConflicten } from '../../lib/capacity'
import { useApp } from '../../store/AppState'
import { BevestigDialog, InfoTip, useToast } from '../ui'

export default function OrderBevestigenDialog({
  project,
  open,
  onSluiten,
}: {
  project: Project
  open: boolean
  onSluiten: () => void
}) {
  const { data, dispatch } = useApp()
  const { toon } = useToast()

  const conflicten = useMemo(() => getCapaciteitsConflicten(data, project.id), [data, project.id])

  const bevestig = () => {
    dispatch({ type: 'ORDER_BEVESTIGEN', projectId: project.id })
    toon('succes', 'Order bevestigd — project staat nu in de definitieve planning')
    if (conflicten.length > 0) {
      const teams = [...new Set(conflicten.map((c) => c.teamNaam))].join(', ')
      toon('waarschuwing', `Let op: ${teams} raakt hierdoor in ${conflicten.length} week/weken overboekt.`)
    }
    onSluiten()
  }

  return (
    <BevestigDialog
      open={open}
      titel="Order bevestigen en naar definitieve planning verplaatsen"
      bevestigLabel="Order bevestigen"
      onBevestig={bevestig}
      onAnnuleer={onSluiten}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Je bevestigt de order voor <span className="font-semibold text-slate-800">{project.naam}</span> (
          {project.projectnummer}). Alle datums, fases en teamtoewijzingen uit de schaduwplanning blijven behouden. Het
          project telt vanaf nu voor 100% mee in de definitieve capaciteit en de eerste engineeringfase wordt gestart.
        </p>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            Capaciteitscontrole
            <InfoTip tekst="Overboeking betekent dat een team in een week meer uren gepland heeft staan dan er netto beschikbaar zijn (contracturen minus afwezigheid). Dit project telt hier volledig mee, bovenop alle andere definitieve projecten." />
          </div>

          {conflicten.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 size={16} className="shrink-0" />
              Geen capaciteitsconflicten gevonden
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-red-200">
              <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                <AlertTriangle size={15} className="shrink-0" />
                {conflicten.length} week/weken met overboeking na bevestiging
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-1.5 font-medium">Team</th>
                    <th className="px-3 py-1.5 font-medium">Week</th>
                    <th className="px-3 py-1.5 text-right font-medium">Belasting</th>
                    <th className="px-3 py-1.5 text-right font-medium">Beschikbaar</th>
                    <th className="px-3 py-1.5 text-right font-medium">Bezetting</th>
                  </tr>
                </thead>
                <tbody>
                  {conflicten.map((c) => (
                    <tr key={`${c.teamId}-${c.weekStart}`} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-700">{c.teamNaam}</td>
                      <td className="px-3 py-1.5 text-slate-600">Wk {c.weekNr}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-700">{c.belasting} u</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{c.beschikbaar} u</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-red-600">{c.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </BevestigDialog>
  )
}
