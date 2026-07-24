// Gedeelde bouwstenen voor de projectdetailplanning (fase → proces → taak):
// statuskleuren, permissiecheck, kebab-menu, avatars, segment-keuze en voortgang-invoer.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'
import type { Fase, FaseStatus, Medewerker, TaakStatus } from '../../../lib/types'
import { Tooltip, type BadgeKleur } from '../../ui'

// ---------- Status- en badgekleuren ----------

export const FASE_STATUS_KLEUR: Record<FaseStatus, BadgeKleur> = {
  gepland: 'grijs',
  bezig: 'brand',
  gereed: 'groen',
  geblokkeerd: 'rood',
}

export const TAAK_STATUS_KLEUR: Record<TaakStatus, BadgeKleur> = {
  te_doen: 'grijs',
  in_uitvoering: 'blauw',
  on_hold: 'amber',
  gereed: 'groen',
}

/** Stijl per taakstatus voor de status-dropdown (select die als badge oogt). */
export const TAAK_STATUS_SELECT_STIJL: Record<TaakStatus, string> = {
  te_doen: 'border-slate-200 bg-slate-100 text-slate-600',
  in_uitvoering: 'border-sky-200 bg-sky-50 text-sky-700',
  on_hold: 'border-amber-200 bg-amber-50 text-amber-700',
  gereed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

// ---------- Permissies ----------

/** Mag de huidige persona voortgang/blokkades/taakstatussen van deze fase bijwerken? */
export function magVoortgangBijwerken(
  rol: string,
  afdeling: string | undefined,
  fase: Fase,
  voortgangPermissie: boolean,
  teamAfdeling?: string,
): boolean {
  if (!voortgangPermissie) return false
  // Productieleider mag ook fases bijwerken die door een team van zijn afdeling worden
  // uitgevoerd (bijv. de kwaliteitsfase, die bij een afbouwteam belegd is).
  if (rol === 'productieleider') return fase.afdeling === afdeling || teamAfdeling === afdeling
  if (rol === 'engineering_lead') return fase.afdeling === 'engineering'
  return true
}

// ---------- Kebab-menu ----------

export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  gevaarlijk?: boolean
}

/** Compact acties-menu met vaste positionering (ontsnapt aan tabel- en kaartoverflow). */
export function RijMenu({ items, title = 'Acties' }: { items: MenuItem[]; title?: string }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [coord, setCoord] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const herpositioneer = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) setCoord({ top: r.bottom + 4, left: r.right })
    }
    herpositioneer()
    const opBuitenklik = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return
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

  if (items.length === 0) return null
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <MoreVertical size={16} />
      </button>
      {open && coord && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: coord.top, left: coord.left, transform: 'translateX(-100%)' }}
          className="z-[70] w-60 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              disabled={it.disabled}
              title={it.title}
              onClick={(e) => {
                e.stopPropagation()
                if (it.disabled) return
                setOpen(false)
                it.onClick()
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                it.disabled
                  ? 'cursor-not-allowed text-slate-300'
                  : it.gevaarlijk
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// ---------- Avatars ----------

export function initialen(naam: string): string {
  const delen = naam.trim().split(/\s+/)
  if (delen.length === 1) return delen[0].slice(0, 2).toUpperCase()
  return (delen[0][0] + delen[delen.length - 1][0]).toUpperCase()
}

/** Rij initialen-avatars van uitvoerende medewerkers (tooltip = naam + uren-aandeel). */
export function AvatarRij({
  medewerkers,
  uren,
  max = 4,
}: {
  medewerkers: Medewerker[]
  uren?: Record<string, number>
  max?: number
}) {
  if (medewerkers.length === 0) return null
  const zichtbaar = medewerkers.slice(0, max)
  const extra = medewerkers.length - zichtbaar.length
  return (
    <span className="flex -space-x-1.5">
      {zichtbaar.map((m) => (
        <Tooltip
          key={m.id}
          tekst={
            uren && uren[m.id] !== undefined ? `${m.naam} · ${Math.round(uren[m.id] * 10) / 10} u` : m.naam
          }
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-100 text-[10px] font-semibold text-brand-800">
            {initialen(m.naam)}
          </span>
        </Tooltip>
      ))}
      {extra > 0 && (
        <Tooltip tekst={medewerkers.slice(max).map((m) => m.naam).join(', ')}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-semibold text-slate-600">
            +{extra}
          </span>
        </Tooltip>
      )}
    </span>
  )
}

// ---------- Segment-keuze (intern/extern) ----------

export function SegmentKeuze<T extends string>({
  waarde,
  opties,
  onKies,
}: {
  waarde: T
  opties: { id: T; label: string }[]
  onKies: (v: T) => void
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
      {opties.map((o, i) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onKies(o.id)}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${i > 0 ? 'border-l border-slate-300' : ''} ${
            waarde === o.id ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

