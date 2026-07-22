// Instellingen: standaardscenario, fase-doorlooptijden, chassis/panelen-overlap en databeheer.

import { Fragment, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useApp } from '../store/AppState'
import {
  FASE_LABELS,
  SCENARIO_LABELS,
  type ComplexiteitNiveau,
  type FaseKey,
  type ScenarioMode,
} from '../lib/types'
import { uid } from '../lib/uid'
import { BevestigDialog, InfoTip, Invoer, Kaart, KaartKop, Keuze, Knop, PaginaKop, useToast, Veld } from '../components/ui'

const DOORLOOPTIJD_KEYS: Exclude<FaseKey, 'salesoverdracht'>[] = [
  'engineering',
  'chassis',
  'panelen',
  'spuiter',
  'afbouw',
  'kwaliteit',
]

// ---------- Complexiteitsniveaus ----------

function ComplexiteitsKaart() {
  const { data, dispatch } = useApp()
  const { toon } = useToast()
  const [niveaus, setNiveaus] = useState<ComplexiteitNiveau[]>(() =>
    [...data.complexiteitNiveaus].sort((a, b) => a.volgorde - b.volgorde),
  )

  // Lokale bewerking terugzetten wanneer de opgeslagen niveaus wijzigen (opslaan, undo, reset).
  useEffect(() => {
    setNiveaus([...data.complexiteitNiveaus].sort((a, b) => a.volgorde - b.volgorde))
  }, [data.complexiteitNiveaus])

  const projectie = (lijst: ComplexiteitNiveau[]) => JSON.stringify(lijst.map((n) => [n.id, n.naam, n.aanduiding]))
  const origineel = [...data.complexiteitNiveaus].sort((a, b) => a.volgorde - b.volgorde)
  const gewijzigd = projectie(niveaus) !== projectie(origineel)

  const wijzig = (idx: number, patch: Partial<ComplexiteitNiveau>) =>
    setNiveaus((lijst) => lijst.map((n, i) => (i === idx ? { ...n, ...patch } : n)))

  const verplaats = (idx: number, richting: -1 | 1) =>
    setNiveaus((lijst) => {
      const doel = idx + richting
      if (doel < 0 || doel >= lijst.length) return lijst
      const kopie = [...lijst]
      const tmp = kopie[idx]
      kopie[idx] = kopie[doel]
      kopie[doel] = tmp
      return kopie
    })

  const verwijder = (idx: number) =>
    setNiveaus((lijst) => (lijst.length <= 1 ? lijst : lijst.filter((_, i) => i !== idx)))

  const voegToe = () =>
    setNiveaus((lijst) => [
      ...lijst,
      { id: uid('niveau'), naam: 'Nieuw niveau', aanduiding: '', volgorde: lijst.length + 1 },
    ])

  const opslaan = () => {
    const schoon = niveaus.map((n, i) => ({
      ...n,
      naam: n.naam.trim() || `Niveau ${i + 1}`,
      aanduiding: n.aanduiding.trim(),
      volgorde: i + 1,
    }))
    dispatch({ type: 'COMPLEXITEIT_BIJWERKEN', niveaus: schoon })
    toon('succes', 'Complexiteitsniveaus bijgewerkt.')
  }

  return (
    <Kaart>
      <KaartKop
        titel="Complexiteitsniveaus"
        uitleg="Deze niveaus bepalen de complexiteit (laag → hoog) van producttemplates en worden in de projectwizard gebruikt. De volgorde in deze lijst is de complexiteitsvolgorde."
      />
      <div className="p-4">
        <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-x-3 gap-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Volgorde</div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Naam</div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Aanduiding</div>
          <div />
          {niveaus.map((n, i) => (
            <Fragment key={n.id}>
              <div className="flex items-center gap-1.5">
                <span className="w-4 text-center text-sm tabular-nums text-slate-400">{i + 1}</span>
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => verplaats(i, -1)}
                    disabled={i === 0}
                    title="Omhoog"
                    className="text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => verplaats(i, 1)}
                    disabled={i === niveaus.length - 1}
                    title="Omlaag"
                    className="text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
              </div>
              <Invoer value={n.naam} onChange={(e) => wijzig(i, { naam: e.target.value })} placeholder="Naam" />
              <Invoer
                value={n.aanduiding}
                onChange={(e) => wijzig(i, { aanduiding: e.target.value })}
                placeholder="bijv. lage complexiteit"
              />
              <button
                type="button"
                onClick={() => verwijder(i)}
                disabled={niveaus.length <= 1}
                title={niveaus.length <= 1 ? 'Er moet minstens één niveau blijven.' : 'Niveau verwijderen'}
                className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
              >
                <Trash2 size={15} />
              </button>
            </Fragment>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Knop klein variant="secondary" onClick={voegToe}>
            <Plus size={14} /> Niveau toevoegen
          </Knop>
          <Knop variant="primary" disabled={!gewijzigd} onClick={opslaan}>
            Niveaus opslaan
          </Knop>
        </div>
      </div>
    </Kaart>
  )
}

export default function Instellingen() {
  const { data, dispatch, permissies } = useApp()
  const { toon } = useToast()
  const [resetOpen, setResetOpen] = useState(false)
  const alleenLezen = !permissies.planningBewerken

  const inst = data.instellingen

  return (
    <div className="mx-auto max-w-3xl p-6">
      <PaginaKop
        titel="Instellingen"
        uitleg="Standaardwaarden voor nieuwe planningen en beheer van de lokale demodata."
      />

      <div className="flex flex-col gap-4">
        <Kaart>
          <KaartKop titel="Capaciteitsscenario" uitleg="Bepaalt hoe schaduwprojecten standaard meetellen in capaciteitsweergaven." />
          <div className="p-4">
            <Veld label="Standaardscenario">
              <Keuze
                value={inst.standaardScenario}
                disabled={alleenLezen}
                onChange={(e) => {
                  dispatch({ type: 'INSTELLINGEN_BIJWERKEN', patch: { standaardScenario: e.target.value as ScenarioMode } })
                  dispatch({ type: 'SET_SCENARIO', scenario: e.target.value as ScenarioMode })
                  toon('succes', 'Standaardscenario bijgewerkt.')
                }}
              >
                {Object.entries(SCENARIO_LABELS).map(([w, l]) => (
                  <option key={w} value={w}>{l}</option>
                ))}
              </Keuze>
            </Veld>
          </div>
        </Kaart>

        <Kaart>
          <KaartKop
            titel="Standaard faseplanning"
            uitleg="Deze doorlooptijden (in werkdagen) worden gebruikt wanneer een nieuw project met een voorlopige planning wordt aangemaakt."
          />
          <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3">
            {DOORLOOPTIJD_KEYS.map((key) => (
              <Veld key={key} label={`${FASE_LABELS[key]} (werkdagen)`}>
                <Invoer
                  type="number"
                  min={1}
                  max={60}
                  disabled={alleenLezen}
                  value={inst.doorlooptijden[key]}
                  onChange={(e) => {
                    const waarde = Math.max(1, Number(e.target.value) || 1)
                    dispatch({
                      type: 'INSTELLINGEN_BIJWERKEN',
                      patch: { doorlooptijden: { ...inst.doorlooptijden, [key]: waarde } },
                    })
                  }}
                />
              </Veld>
            ))}
          </div>
          <div className="border-t border-slate-100 p-4">
            <div className="flex items-center gap-1.5">
              <Veld label="Overlap chassisbouw → panelenbouw (werkdagen)" className="max-w-xs">
                <Invoer
                  type="number"
                  min={0}
                  max={15}
                  disabled={alleenLezen}
                  value={inst.chassisPanelenOverlapDagen}
                  onChange={(e) =>
                    dispatch({
                      type: 'INSTELLINGEN_BIJWERKEN',
                      patch: { chassisPanelenOverlapDagen: Math.max(0, Number(e.target.value) || 0) },
                    })
                  }
                />
              </Veld>
              <InfoTip tekst="Aantal werkdagen dat panelenbouw standaard eerder start dan het einde van chassisbouw, zodat beide fases gedeeltelijk parallel lopen." />
            </div>
          </div>
        </Kaart>

        {(permissies.templatesBeheren || permissies.planningBewerken) && <ComplexiteitsKaart />}

        <Kaart>
          <KaartKop titel="Databeheer" />
          <div className="flex items-center justify-between gap-4 p-4">
            <p className="text-sm text-slate-600">
              Alle wijzigingen worden lokaal in de browser opgeslagen (localStorage). Herstel de oorspronkelijke
              demodata om alle scenario&apos;s opnieuw te kunnen doorlopen.
            </p>
            <Knop
              variant="danger"
              disabled={alleenLezen}
              title={alleenLezen ? 'Alleen de planner kan de demodata herstellen.' : undefined}
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw size={15} /> Demodata herstellen
            </Knop>
          </div>
        </Kaart>

        <Kaart>
          <KaartKop titel="Buiten scope van dit MVP" />
          <div className="p-4 text-sm leading-relaxed text-slate-500">
            Voorraadbeheer, inkoop, financiële administratie, urenregistratie, machineplanning, klantenportaal,
            notificaties en integraties (o.a. Business Central, ClickUp) zijn bewust buiten deze eerste versie
            gehouden. De datastructuur is zo opgezet dat deze onderdelen later kunnen worden toegevoegd.
          </div>
        </Kaart>
      </div>

      <BevestigDialog
        open={resetOpen}
        titel="Demodata herstellen?"
        tekst="Alle lokale wijzigingen gaan verloren en de oorspronkelijke voorbeelddata wordt opnieuw geladen."
        bevestigLabel="Herstellen"
        gevaarlijk
        onAnnuleer={() => setResetOpen(false)}
        onBevestig={() => {
          dispatch({ type: 'RESET' })
          setResetOpen(false)
          toon('succes', 'Demodata is hersteld.')
        }}
      />
    </div>
  )
}
