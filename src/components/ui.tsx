// Herbruikbare UI-bouwstenen: knoppen, badges, kaarten, modals, tooltips, toasts, formulier-velden.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, Info, X, XCircle } from 'lucide-react'

// ---------- Button ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const KNOP_STIJLEN: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 border border-transparent shadow-sm',
  secondary: 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 shadow-sm',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border border-transparent',
  danger: 'bg-red-600 text-white hover:bg-red-700 border border-transparent shadow-sm',
}

export function Knop({
  variant = 'secondary',
  klein = false,
  className = '',
  disabled,
  title,
  onClick,
  type = 'button',
  children,
}: {
  variant?: ButtonVariant
  klein?: boolean
  className?: string
  disabled?: boolean
  title?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  children: ReactNode
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors
        ${klein ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'}
        ${KNOP_STIJLEN[variant]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}`}
    >
      {children}
    </button>
  )
}

// ---------- Badge ----------

export type BadgeKleur = 'groen' | 'grijs' | 'amber' | 'rood' | 'blauw' | 'paars' | 'brand'

const BADGE_KLEUREN: Record<BadgeKleur, string> = {
  groen: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  grijs: 'bg-slate-100 text-slate-600 border-slate-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rood: 'bg-red-50 text-red-700 border-red-200',
  blauw: 'bg-sky-50 text-sky-700 border-sky-200',
  paars: 'bg-purple-50 text-purple-700 border-purple-200',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
}

export function Badge({ kleur = 'grijs', title, children }: { kleur?: BadgeKleur; title?: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE_KLEUREN[kleur]}`}
    >
      {children}
    </span>
  )
}

// ---------- Kaart ----------

export function Kaart({ className = '', children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border border-slate-200 bg-white shadow-sm ${onClick ? 'cursor-pointer transition-shadow hover:shadow-md' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function KaartKop({ titel, uitleg, rechts }: { titel: ReactNode; uitleg?: string; rechts?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        {titel}
        {uitleg && <InfoTip tekst={uitleg} />}
      </h3>
      {rechts}
    </div>
  )
}

// ---------- Tooltip ----------

export function Tooltip({ tekst, children }: { tekst: ReactNode; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-64 -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100"
      >
        {tekst}
      </span>
    </span>
  )
}

/** Klein vraagteken-icoon met uitleg-tooltip voor begrippen als “schaduwplanning”. */
export function InfoTip({ tekst }: { tekst: string }) {
  return (
    <Tooltip tekst={tekst}>
      <HelpCircle size={14} className="text-slate-400 hover:text-slate-600" />
    </Tooltip>
  )
}

// ---------- Voortgang ----------

export function VoortgangsBalk({ pct, className = '' }: { pct: number; className?: string }) {
  const kleur = pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-brand-600' : 'bg-slate-300'
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${kleur}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-500">{Math.round(pct)}%</span>
    </div>
  )
}

/** Capaciteitsbalkje: groen < 85%, amber 85–100%, rood > 100%. */
export function CapaciteitsBalk({ pct, className = '' }: { pct: number; className?: string }) {
  const kleur = pct > 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : 'bg-emerald-500'
  const tekst = pct > 100 ? 'text-red-600 font-semibold' : pct >= 85 ? 'text-amber-600' : 'text-slate-500'
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-2 w-full min-w-12 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${kleur}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`w-11 shrink-0 text-right text-xs tabular-nums ${tekst}`}>{pct}%</span>
    </div>
  )
}

// ---------- Modal ----------

export function Modal({
  open,
  titel,
  onSluiten,
  breed = false,
  children,
  voettekst,
}: {
  open: boolean
  titel: ReactNode
  onSluiten: () => void
  breed?: boolean
  children: ReactNode
  voettekst?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onSluiten()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onSluiten])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onSluiten} />
      <div className={`relative flex max-h-[90vh] w-full flex-col rounded-lg bg-white shadow-xl ${breed ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-800">{titel}</h2>
          <button onClick={onSluiten} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {voettekst && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{voettekst}</div>}
      </div>
    </div>
  )
}

export function BevestigDialog({
  open,
  titel,
  tekst,
  bevestigLabel = 'Bevestigen',
  gevaarlijk = false,
  onBevestig,
  onAnnuleer,
  children,
}: {
  open: boolean
  titel: string
  tekst?: string
  bevestigLabel?: string
  gevaarlijk?: boolean
  onBevestig: () => void
  onAnnuleer: () => void
  children?: ReactNode
}) {
  return (
    <Modal
      open={open}
      titel={titel}
      onSluiten={onAnnuleer}
      voettekst={
        <>
          <Knop onClick={onAnnuleer}>Annuleren</Knop>
          <Knop variant={gevaarlijk ? 'danger' : 'primary'} onClick={onBevestig}>
            {bevestigLabel}
          </Knop>
        </>
      }
    >
      {tekst && <p className="text-sm text-slate-600">{tekst}</p>}
      {children}
    </Modal>
  )
}

// ---------- Formulier-velden ----------

export function Veld({ label, verplicht, fout, children, className = '' }: { label: string; verplicht?: boolean; fout?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {verplicht && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {fout && <span className="mt-1 block text-xs text-red-600">{fout}</span>}
    </label>
  )
}

const INPUT_STIJL =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400'

export function Invoer(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT_STIJL} ${props.className ?? ''}`} />
}

export function Keuze(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${INPUT_STIJL} ${props.className ?? ''}`} />
}

export function Tekstvak(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${INPUT_STIJL} ${props.className ?? ''}`} />
}

// ---------- Tabs ----------

export function Tabs({ tabs, actief, onKies }: { tabs: { id: string; label: string }[]; actief: string; onKies: (id: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onKies(t.id)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            actief === t.id
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ---------- Lege staat & skeleton ----------

export function LegeStaat({ titel, tekst, actie }: { titel: string; tekst?: string; actie?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-6 py-10 text-center">
      <Info size={22} className="text-slate-400" />
      <p className="text-sm font-medium text-slate-600">{titel}</p>
      {tekst && <p className="max-w-sm text-xs text-slate-500">{tekst}</p>}
      {actie}
    </div>
  )
}

export function Skelet({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />
}

// ---------- Toasts ----------

type ToastSoort = 'succes' | 'fout' | 'waarschuwing' | 'info'

interface ToastActie {
  label: string
  onClick: () => void
}

interface Toast {
  id: number
  soort: ToastSoort
  tekst: string
  actie?: ToastActie
}

const ToastContext = createContext<{ toon: (soort: ToastSoort, tekst: string, actie?: ToastActie) => void } | null>(null)

const TOAST_ICONEN: Record<ToastSoort, ReactNode> = {
  succes: <CheckCircle2 size={16} className="text-emerald-500" />,
  fout: <XCircle size={16} className="text-red-500" />,
  waarschuwing: <AlertTriangle size={16} className="text-amber-500" />,
  info: <Info size={16} className="text-sky-500" />,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const teller = useRef(0)

  const toon = (soort: ToastSoort, tekst: string, actie?: ToastActie) => {
    const id = ++teller.current
    setToasts((t) => [...t, { id, soort, tekst, actie }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), actie ? 7000 : 4500)
  }

  return (
    <ToastContext.Provider value={{ toon }}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 shadow-lg"
          >
            <span className="mt-0.5 shrink-0">{TOAST_ICONEN[t.soort]}</span>
            <span className="min-w-0 flex-1 leading-snug">{t.tekst}</span>
            {t.actie && (
              <button
                onClick={() => {
                  t.actie?.onClick()
                  setToasts((lijst) => lijst.filter((x) => x.id !== t.id))
                }}
                className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {t.actie.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast moet binnen ToastProvider gebruikt worden')
  return ctx
}

// ---------- Paginakop ----------

export function PaginaKop({ titel, uitleg, rechts }: { titel: string; uitleg?: string; rechts?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{titel}</h1>
        {uitleg && <p className="mt-0.5 text-sm text-slate-500">{uitleg}</p>}
      </div>
      {rechts && <div className="flex items-center gap-2">{rechts}</div>}
    </div>
  )
}
