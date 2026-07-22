// Tab "Fases & werkzaamheden": fasebeheer (toevoegen/dupliceren/verwijderen) en per fase
// de detailplanning met processen en taken.

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useApp } from '../../store/AppState'
import type { Project } from '../../lib/types'
import { getHuidigeFase, projectFases } from '../../lib/capacity'
import { Knop, LegeStaat } from '../ui'
import FaseKaart from './FaseKaart'
import FaseModal from './detail/FaseModal'

export default function FasesTab({ project }: { project: Project }) {
  const { data, permissies } = useApp()
  const [faseModalOpen, setFaseModalOpen] = useState(false)
  const fases = projectFases(data, project.id)
  const huidige = getHuidigeFase(data, project.id)

  return (
    <div className="space-y-3">
      {permissies.planningBewerken && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Fases zijn gesorteerd op startdatum. Processen en taken beheer je binnen de fasekaarten.
          </p>
          <Knop klein variant="primary" onClick={() => setFaseModalOpen(true)}>
            <Plus size={14} /> Fase toevoegen
          </Knop>
        </div>
      )}

      {fases.length === 0 ? (
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
    </div>
  )
}
