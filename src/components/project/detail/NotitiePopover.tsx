// Notitieteller met popover per niveau (fase/proces/taak): lijst bekijken,
// notitie toevoegen (met belangrijk-markering en koppeling aan medewerker/partner) en verwijderen.

import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Star, Trash2 } from 'lucide-react'
import type { NotitieNiveau } from '../../../lib/types'
import { formatDatum } from '../../../lib/dates'
import { uid } from '../../../lib/uid'
import { useApp } from '../../../store/AppState'
import { Keuze, Knop, Tekstvak } from '../../ui'

interface Props {
  projectId: string
  niveau: NotitieNiveau
  doelId: string
  doelNaam: string
}

function tijdLabel(tijdstip: string): string {
  const datum = tijdstip.slice(0, 10)
  const tijd = tijdstip.slice(11, 16)
  return tijd ? `${formatDatum(datum)} ${tijd}` : formatDatum(datum)
}

export default function NotitiePopover({ projectId, niveau, doelId, doelNaam }: Props) {
  const { data, dispatch, persona } = useApp()
  const [open, setOpen] = useState(false)
  const [coord, setCoord] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [tekst, setTekst] = useState('')
  const [belangrijk, setBelangrijk] = useState(false)
  const [medewerkerId, setMedewerkerId] = useState('')
  const [partijId, setPartijId] = useState('')

  const notities = data.projectNotities.filter(
    (n) => n.projectId === projectId && n.niveau === niveau && n.doelId === doelId,
  )
  const heeftBelangrijk = notities.some((n) => n.belangrijk)
  const magSchrijven = persona.rol !== 'management'

  useEffect(() => {
    if (!open) return
    const herpositioneer = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) setCoord({ top: r.bottom + 4, left: r.right })
    }
    herpositioneer()
    const opBuitenklik = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const opToets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', opBuitenklik)
    window.addEventListener('resize', herpositioneer)
    window.addEventListener('scroll', herpositioneer, true)
    window.addEventListener('keydown', opToets)
    return () => {
      window.removeEventListener('mousedown', opBuitenklik)
      window.removeEventListener('resize', herpositioneer)
      window.removeEventListener('scroll', herpositioneer, true)
      window.removeEventListener('keydown', opToets)
    }
  }, [open])

  const voegToe = () => {
    if (tekst.trim() === '') return
    dispatch({
      type: 'NOTITIE_TOEVOEGEN',
      notitie: {
        id: uid('not'),
        projectId,
        niveau,
        doelId,
        doelNaam,
        tekst: tekst.trim(),
        tijdstip: new Date().toISOString(),
        auteur: persona.naam,
        medewerkerId: medewerkerId || undefined,
        partijId: partijId || undefined,
        belangrijk: belangrijk || undefined,
      },
    })
    setTekst('')
    setBelangrijk(false)
    setMedewerkerId('')
    setPartijId('')
  }

  const naamVanMedewerker = (id?: string) => (id ? data.medewerkers.find((m) => m.id === id)?.naam : undefined)
  const naamVanPartij = (id?: string) => (id ? data.externePartijen.find((p) => p.id === id)?.naam : undefined)

  if (notities.length === 0 && !magSchrijven) return null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={notities.length === 0 ? 'Notitie toevoegen' : `${notities.length} notitie(s)`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-slate-100 ${
          heeftBelangrijk ? 'text-amber-600' : notities.length > 0 ? 'text-slate-500' : 'text-slate-400'
        } hover:text-slate-600`}
      >
        <MessageSquare size={14} />
        {notities.length > 0 && <span className="tabular-nums">{notities.length}</span>}
      </button>

      {open && coord && (
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: coord.top, left: coord.left, transform: 'translateX(-100%)' }}
          className="z-[70] w-96 max-w-[90vw] rounded-md border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Notities · {doelNaam}
          </div>

          <div className="max-h-64 overflow-y-auto">
            {notities.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400">Nog geen notities.</p>
            ) : (
              notities.map((n) => (
                <div key={n.id} className="border-b border-slate-100 px-3 py-2 last:border-0">
                  <div className="flex items-start gap-1.5">
                    {n.belangrijk && <Star size={13} className="mt-0.5 shrink-0 fill-amber-400 text-amber-400" />}
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-snug text-slate-700">{n.tekst}</p>
                    {magSchrijven && (
                      <button
                        type="button"
                        title="Notitie verwijderen"
                        onClick={() => dispatch({ type: 'NOTITIE_VERWIJDEREN', id: n.id })}
                        className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {n.auteur} · {tijdLabel(n.tijdstip)}
                    {naamVanMedewerker(n.medewerkerId) && <> · medewerker: {naamVanMedewerker(n.medewerkerId)}</>}
                    {naamVanPartij(n.partijId) && <> · partner: {naamVanPartij(n.partijId)}</>}
                  </div>
                </div>
              ))
            )}
          </div>

          {magSchrijven && (
            <div className="border-t border-slate-100 p-3">
              <Tekstvak
                rows={2}
                value={tekst}
                onChange={(e) => setTekst(e.target.value)}
                placeholder="Nieuwe notitie…"
                className="!text-xs"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={belangrijk}
                    onChange={(e) => setBelangrijk(e.target.checked)}
                    className="accent-brand-600"
                  />
                  Belangrijk
                </label>
                <Keuze
                  value={medewerkerId}
                  onChange={(e) => setMedewerkerId(e.target.value)}
                  className="!w-36 !py-1 !text-xs"
                  title="Optioneel: koppel een medewerker aan deze notitie"
                >
                  <option value="">Geen medewerker</option>
                  {data.medewerkers
                    .filter((m) => m.actief)
                    .sort((a, b) => a.naam.localeCompare(b.naam))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.naam}
                      </option>
                    ))}
                </Keuze>
                <Keuze
                  value={partijId}
                  onChange={(e) => setPartijId(e.target.value)}
                  className="!w-36 !py-1 !text-xs"
                  title="Optioneel: koppel een externe partner aan deze notitie"
                >
                  <option value="">Geen partner</option>
                  {data.externePartijen
                    .filter((p) => !p.gearchiveerd)
                    .sort((a, b) => a.naam.localeCompare(b.naam))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.naam}
                      </option>
                    ))}
                </Keuze>
                <Knop klein variant="primary" disabled={tekst.trim() === ''} onClick={voegToe} className="ml-auto">
                  Toevoegen
                </Knop>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
