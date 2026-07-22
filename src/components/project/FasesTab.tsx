// Tab "Fases & werkzaamheden": fasebeheer (toevoegen/dupliceren/verwijderen) en per fase
// de detailplanning met processen en taken, plus een kanban-statusbord over alle taken.

import { useState } from 'react'
import { LayoutList, Plus, SquareKanban } from 'lucide-react'
import { useApp } from '../../store/AppState'
import type { Project } from '../../lib/types'
import type { TaakPlek } from '../../lib/taken'
import { getHuidigeFase, projectFases } from '../../lib/capacity'
import { Knop, LegeStaat } from '../ui'
import FaseKaart from './FaseKaart'
import FaseModal from './detail/FaseModal'
import TaakModal from './detail/TaakModal'
import TaakStatusBord from './detail/TaakStatusBord'

type Weergave = 'fases' | 'bord'

export default function FasesTab({ project }: { project: Project }) {
  const { data, permissies } = useApp()
  const [faseModalOpen, setFaseModalOpen] = useState(false)
  const [weergave, setWeergave] = useState<Weergave>('fases')
  const [bordPlek, setBordPlek] = useState<TaakPlek | null>(null)
  const fases = projectFases(data, project.id)
  const huidige = getHuidigeFase(data, project.id)

  return (
    <div className="space-y-3">
      {/* Kopbalk: uitleg, weergavewissel en fase-actie */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {weergave === 'fases'
            ? 'Fases zijn gesorteerd op startdatum. Processen en taken beheer je binnen de fasekaarten.'
            : 'Statusbord: alle taken van dit project, gegroepeerd op taakstatus.'}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-slate-300 shadow-sm">
            {(
              [
                { id: 'fases', label: 'Fasekaarten', icon: <LayoutList size={14} /> },
                { id: 'bord', label: 'Statusbord', icon: <SquareKanban size={14} /> },
              ] as { id: Weergave; label: string; icon: React.ReactNode }[]
            ).map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWeergave(w.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                  weergave === w.id ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {w.icon}
                {w.label}
              </button>
            ))}
          </div>
          {permissies.planningBewerken && weergave === 'fases' && (
            <Knop klein variant="primary" onClick={() => setFaseModalOpen(true)}>
              <Plus size={14} /> Fase toevoegen
            </Knop>
          )}
        </div>
      </div>

      {weergave === 'bord' ? (
        <TaakStatusBord project={project} onTaakBewerken={setBordPlek} />
      ) : fases.length === 0 ? (
        <LegeStaat
          titel="Geen fases"
          tekst="Voor dit project zijn nog geen fases aangemaakt."
          actie={
            permissies.planningBewerken ? (
              <Knop klein variant="primary" onClick={() => setFaseModalOpen(true)}>
                <Plus size={14} /> Fase toevoegen
              </Knop>
            ) : undefined
          }
        />
      ) : (
        fases.map((f) => <FaseKaart key={f.id} fase={f} standaardOpen={f.id === huidige?.id} />)
      )}

      <FaseModal open={faseModalOpen} projectId={project.id} onSluiten={() => setFaseModalOpen(false)} />

      {/* Taak bewerken vanaf het statusbord */}
      {bordPlek && (
        <TaakModal
          open
          project={project}
          plek={bordPlek}
          initFaseId={bordPlek.fase.id}
          onSluiten={() => setBordPlek(null)}
        />
      )}
    </div>
  )
}
