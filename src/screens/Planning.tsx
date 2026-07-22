// Planning-schil met drie weergaven: Tijdlijnplanning (Gantt), Capaciteitsplanning
// en Locatieplanning. De actieve weergave staat in de URL (?view=) zodat andere
// schermen er direct naartoe kunnen linken.

import { useSearchParams } from 'react-router-dom'
import { CalendarRange, Gauge, MapPin } from 'lucide-react'
import TijdlijnPlanning from '../components/planning/TijdlijnPlanning'
import CapaciteitsPlanning from '../components/planning/CapaciteitsPlanning'
import LocatiePlanning from '../components/planning/LocatiePlanning'

const WEERGAVEN = [
  { id: 'tijdlijn', label: 'Tijdlijnplanning', icoon: CalendarRange },
  { id: 'capaciteit', label: 'Capaciteitsplanning', icoon: Gauge },
  { id: 'locatie', label: 'Locatieplanning', icoon: MapPin },
] as const

type WeergaveId = (typeof WEERGAVEN)[number]['id']

export default function Planning() {
  const [params, setParams] = useSearchParams()
  const ruw = params.get('view')
  const actief: WeergaveId = ruw === 'capaciteit' || ruw === 'locatie' ? ruw : 'tijdlijn'

  const kies = (id: WeergaveId) => {
    const volgende = new URLSearchParams(params)
    volgende.set('view', id)
    setParams(volgende, { replace: true })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-6">
        {WEERGAVEN.map((w) => (
          <button
            key={w.id}
            onClick={() => kies(w.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              actief === w.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            <w.icoon size={15} />
            {w.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {actief === 'tijdlijn' && <TijdlijnPlanning />}
        {actief === 'capaciteit' && <CapaciteitsPlanning />}
        {actief === 'locatie' && <LocatiePlanning />}
      </div>
    </div>
  )
}
