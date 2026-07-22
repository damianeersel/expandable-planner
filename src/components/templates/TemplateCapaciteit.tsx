// Capaciteitsoverzicht per afdeling: uren, aantal taken en piekbezetting; engineering apart benadrukt.

import { TrendingUp } from 'lucide-react'
import type { Afdeling, ProductTemplate } from '../../lib/types'
import { AFDELING_LABELS } from '../../lib/types'
import { templateTotalen, verschilMetStandaard } from '../../lib/templates'
import { Badge } from '../ui'
import { AFDELING_KLEUR } from './gedeeld'

interface AfdelingRij {
  afdeling: Afdeling
  uren: number
  taken: number
  piekBezetting: number
}

export default function TemplateCapaciteit({
  template,
  templates,
}: {
  template: ProductTemplate
  templates: ProductTemplate[]
}) {
  const totalen = templateTotalen(template)
  const verschil = verschilMetStandaard(templates, template)

  // Aggregatie per afdeling.
  const perAfdeling = new Map<Afdeling, AfdelingRij>()
  for (const fase of template.fases) {
    const faseBezetting = fase.taken.reduce((s, t) => s + t.aantalMedewerkers, 0)
    for (const taak of fase.taken) {
      const bestaand = perAfdeling.get(taak.afdeling) ?? {
        afdeling: taak.afdeling,
        uren: 0,
        taken: 0,
        piekBezetting: 0,
      }
      bestaand.uren += taak.uren
      bestaand.taken += 1
      perAfdeling.set(taak.afdeling, bestaand)
    }
    // Piekbezetting per afdeling = grootste fase-bezetting binnen die afdeling.
    const rij = perAfdeling.get(fase.afdeling)
    if (rij) rij.piekBezetting = Math.max(rij.piekBezetting, faseBezetting)
  }
  const rijen = [...perAfdeling.values()].sort((a, b) => b.uren - a.uren)

  return (
    <div className="space-y-5">
      {/* Kerncijfers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tegel label="Totale uren" waarde={`${totalen.totaleUren} u`} />
        <Tegel label="Engineeringuren" waarde={`${totalen.engineeringUren} u`} accent />
        <Tegel label="Benodigde engineers" waarde={String(totalen.benodigdeEngineers)} />
        <Tegel label="Piekbezetting" waarde={`${totalen.piekBezetting} mdw`} />
      </div>

      {/* Verschil met standaardvariant */}
      {verschil && (
        <div className="flex items-start gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <TrendingUp size={16} className="mt-0.5 shrink-0" />
          <span>
            Ten opzichte van de standaardvariant vraagt deze complexere variant{' '}
            <strong>{verschil.engineeringUren >= 0 ? '+' : ''}{verschil.engineeringUren} engineeringuren</strong>,{' '}
            {verschil.taken >= 0 ? '+' : ''}{verschil.taken} taken, {verschil.productiedagen >= 0 ? '+' : ''}
            {verschil.productiedagen} productiedagen en {verschil.reviews >= 0 ? '+' : ''}
            {verschil.reviews} extra reviews.
          </span>
        </div>
      )}

      {/* Tabel per afdeling */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-3 font-medium">Afdeling</th>
              <th className="py-1.5 pr-3 text-right font-medium">Uren</th>
              <th className="py-1.5 pr-3 text-right font-medium">Aantal taken</th>
              <th className="py-1.5 pr-3 text-right font-medium">Piekbezetting</th>
            </tr>
          </thead>
          <tbody>
            {rijen.map((r) => (
              <tr key={r.afdeling} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-3">
                  <Badge kleur={AFDELING_KLEUR[r.afdeling]}>{AFDELING_LABELS[r.afdeling]}</Badge>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{r.uren} u</td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{r.taken}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{r.piekBezetting} mdw</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-medium text-slate-700">
              <td className="py-2 pr-3">Totaal</td>
              <td className="py-2 pr-3 text-right tabular-nums">{totalen.totaleUren} u</td>
              <td className="py-2 pr-3 text-right tabular-nums">{totalen.aantalTaken}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{totalen.piekBezetting} mdw</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function Tegel({ label, waarde, accent }: { label: string; waarde: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'}`}>
      <div className={`text-lg font-semibold tabular-nums ${accent ? 'text-brand-700' : 'text-slate-800'}`}>{waarde}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}
