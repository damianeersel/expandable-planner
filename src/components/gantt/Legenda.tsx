// Compacte legenda voor de Gantt-planning.

import { AlertTriangle, Check, Truck } from 'lucide-react'
import { InfoTip } from '../ui'

function Item({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {swatch}
      <span>{label}</span>
    </span>
  )
}

export default function Legenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 shadow-sm">
      <span className="font-semibold uppercase tracking-wide text-slate-400">Legenda</span>
      <Item swatch={<span className="h-3 w-6 rounded-sm bg-brand-600" />} label="Definitief" />
      <span className="inline-flex items-center gap-1">
        <Item swatch={<span className="balk-schaduw h-3 w-6 rounded-sm" />} label="Schaduwplanning" />
        <InfoTip tekst="Schaduwplanning: nog niet bevestigde order die alvast is ingepland. Telt afhankelijk van het scenario (deels) mee in de capaciteit." />
      </span>
      <Item
        swatch={
          <span className="balk-extern inline-flex h-3 w-6 items-center justify-center rounded-sm">
            <Truck size={9} className="text-purple-700" />
          </span>
        }
        label="Externe fase"
      />
      <Item
        swatch={
          <span className="inline-flex h-3 w-6 items-center justify-center rounded-sm bg-brand-600 opacity-60">
            <Check size={9} className="text-white" />
          </span>
        }
        label="Gereed"
      />
      <Item
        swatch={
          <span className="inline-flex h-3 w-6 items-center justify-center rounded-sm bg-brand-600 outline outline-2 outline-red-500">
            <AlertTriangle size={9} className="text-red-500" />
          </span>
        }
        label="Geblokkeerd"
      />
      <Item swatch={<span className="h-2 w-2 rotate-45 border-2 border-slate-500 bg-white" />} label="Gewenste oplevering" />
      <Item swatch={<span className="h-2 w-2 rotate-45 bg-brand-600" />} label="Verwachte oplevering" />
      <Item swatch={<span className="h-3 w-0.5 bg-red-500" />} label="Vandaag" />
    </div>
  )
}
