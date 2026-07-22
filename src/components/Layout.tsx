// Hoofdlayout: vaste linkernavigatie + topbalk met rolwisselaar en scenariokeuze.

import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  CalendarClock,
  CalendarOff,
  CalendarRange,
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
  Settings,
  Truck,
  UserCircle2,
  Users,
} from 'lucide-react'
import { useApp } from '../store/AppState'
import { PERSONAS, SCENARIO_LABELS, type ScenarioMode } from '../lib/types'
import { formatDatumLang, vandaagISO } from '../lib/dates'
import { InfoTip, Keuze } from './ui'

const NAV_ITEMS = [
  { pad: '/dashboard', label: 'Dashboard', icoon: LayoutDashboard },
  { pad: '/planning', label: 'Planning', icoon: CalendarRange },
  { pad: '/projecten', label: 'Projecten', icoon: FolderKanban },
  { pad: '/teams', label: 'Teams & medewerkers', icoon: Users },
  { pad: '/beschikbaarheid', label: 'Beschikbaarheid', icoon: CalendarClock },
  { pad: '/verlof', label: 'Verlof & verzuim', icoon: CalendarOff },
  { pad: '/extern', label: 'Externe partijen', icoon: Truck },
  { pad: '/templates', label: 'Planningstemplates', icoon: LayoutTemplate },
  { pad: '/instellingen', label: 'Instellingen', icoon: Settings },
]

const PAGINA_TITELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/planning': 'Planning',
  '/projecten': 'Projecten',
  '/teams': 'Teams & medewerkers',
  '/beschikbaarheid': 'Beschikbaarheid',
  '/verlof': 'Verlof & verzuim',
  '/extern': 'Externe partijen',
  '/templates': 'Planningstemplates',
  '/instellingen': 'Instellingen',
}

export default function Layout() {
  const { ui, dispatch, persona } = useApp()
  const locatie = useLocation()
  const basisPad = '/' + (locatie.pathname.split('/')[1] || 'dashboard')

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Zijbalk */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-700 text-sm font-bold text-white">E</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">Expandable</div>
            <div className="text-[11px] text-slate-500">Production Planner</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.pad}
              to={item.pad}
              className={({ isActive }) =>
                `mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                }`
              }
            >
              <item.icoon size={17} className="shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 px-4 py-3 text-[11px] leading-relaxed text-slate-400">
          MVP-prototype · lokale data
        </div>
      </aside>

      {/* Hoofdgedeelte */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-800">{PAGINA_TITELS[basisPad] ?? 'Expandable Production Planner'}</h2>
            <span className="hidden text-xs text-slate-400 md:inline">{formatDatumLang(vandaagISO())}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Scenario</span>
              <InfoTip tekst="Bepaalt hoe schaduwprojecten meetellen in capaciteitsweergaven. Kansgewogen: een project met 70% verkoopkans telt voor 70% mee (prognose, geen definitieve belasting)." />
              <Keuze
                value={ui.scenario}
                onChange={(e) => dispatch({ type: 'SET_SCENARIO', scenario: e.target.value as ScenarioMode })}
                className="!w-auto !py-1 !text-xs"
              >
                {Object.entries(SCENARIO_LABELS).map(([waarde, label]) => (
                  <option key={waarde} value={waarde}>
                    {label}
                  </option>
                ))}
              </Keuze>
            </div>
            <div className="h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <UserCircle2 size={20} className="text-slate-400" />
              <Keuze
                value={persona.id}
                onChange={(e) => dispatch({ type: 'SET_PERSONA', personaId: e.target.value })}
                className="!w-auto !py-1 !text-xs"
                title="Wissel van rol om verschillende gebruikersperspectieven te testen"
              >
                {PERSONAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.naam} — {p.label}
                  </option>
                ))}
              </Keuze>
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
