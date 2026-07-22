// Template-editor: kopbalk met samenvatting, bewerkbare fases/taken (lijst), tijdlijnvoorbeeld en capaciteitsoverzicht.

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Archive, CheckCircle2, FilePlus2, Layers, Lock, Plus } from 'lucide-react'
import { useApp } from '../store/AppState'
import type { Afdeling, FaseKey, TemplateFase, TemplateTaak } from '../lib/types'
import { AFDELING_LABELS, FASE_LABELS, FASE_VOLGORDE, TEMPLATE_STATUS_LABELS } from '../lib/types'
import { kloonFases, nieuweVersieVan, templateTotalen } from '../lib/templates'
import { uid } from '../lib/uid'
import { formatDatum } from '../lib/dates'
import {
  Badge,
  Invoer,
  Kaart,
  Keuze,
  Knop,
  LegeStaat,
  Modal,
  Tabs,
  Tekstvak,
  Veld,
  useToast,
} from '../components/ui'
import TemplateFaseKaart from '../components/templates/TemplateFaseKaart'
import TemplateTijdlijn from '../components/templates/TemplateTijdlijn'
import TemplateCapaciteit from '../components/templates/TemplateCapaciteit'
import { hernummerFases, hernummerTaken, TEMPLATE_STATUS_KLEUR, type EditorActies, type Sleep } from '../components/templates/gedeeld'

/** Bewerkbaar tekstveld dat op blur/Enter doorvoert. */
function TekstVeld({
  waarde,
  meerdereRegels,
  placeholder,
  verplicht,
  onCommit,
}: {
  waarde: string
  meerdereRegels?: boolean
  placeholder?: string
  verplicht?: boolean
  onCommit: (v: string) => void
}) {
  const [v, setV] = useState(waarde)
  useEffect(() => setV(waarde), [waarde])
  const commit = () => {
    const t = v.trim()
    if (verplicht && t === '') {
      setV(waarde)
      return
    }
    if (t !== waarde) onCommit(t)
    else setV(waarde)
  }
  if (meerdereRegels) {
    return (
      <Tekstvak
        rows={2}
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
      />
    )
  }
  return (
    <Invoer
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

export default function TemplateEditorScherm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, dispatch, persona, permissies } = useApp()
  const { toon } = useToast()
  const [tab, setTab] = useState('lijst')
  const [faseModalOpen, setFaseModalOpen] = useState(false)
  const sleep = useRef<Sleep | null>(null)

  const template = data.templates.find((t) => t.id === id)

  const ongedaan = { label: 'Ongedaan maken', onClick: () => dispatch({ type: 'UNDO' as const }) }

  if (!template) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <LegeStaat
          titel="Template niet gevonden"
          tekst="Deze templateversie bestaat niet (meer). Ga terug naar het overzicht om een template te kiezen."
          actie={
            <Link to="/templates">
              <Knop variant="primary">
                <ArrowLeft size={15} /> Terug naar templates
              </Knop>
            </Link>
          }
        />
      </div>
    )
  }

  const niveau = data.complexiteitNiveaus.find((n) => n.id === template.complexiteitId)
  const totalen = templateTotalen(template)
  const bewerkbaar = permissies.templatesBeheren && template.status === 'concept'
  const fases = [...template.fases].sort((a, b) => a.volgorde - b.volgorde)

  // ---------- Mutatie-helper ----------

  const zetFases = (nieuw: TemplateFase[]) => {
    dispatch({ type: 'TEMPLATE_BIJWERKEN', id: template.id, patch: { fases: nieuw } })
  }
  const mapFase = (faseId: string, fn: (f: TemplateFase) => TemplateFase) =>
    zetFases(template.fases.map((f) => (f.id === faseId ? fn(f) : f)))

  // ---------- Fase-acties ----------

  const verplaatsFaseInArray = (faseId: string, richting: -1 | 1) => {
    const arr = [...template.fases].sort((a, b) => a.volgorde - b.volgorde)
    const i = arr.findIndex((f) => f.id === faseId)
    const j = i + richting
    if (i < 0 || j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    zetFases(hernummerFases(arr))
  }

  // ---------- Taak verplaatsen (drag-and-drop en select) ----------

  const bouwVerplaatsing = (bronFaseId: string, taakId: string, doelFaseId: string, doelTaakId?: string): TemplateFase[] => {
    const bronFase = template.fases.find((f) => f.id === bronFaseId)
    const taak = bronFase?.taken.find((t) => t.id === taakId)
    if (!bronFase || !taak) return template.fases

    if (bronFaseId === doelFaseId) {
      let taken = bronFase.taken.filter((t) => t.id !== taak.id)
      let idx = doelTaakId ? taken.findIndex((t) => t.id === doelTaakId) : taken.length
      if (idx < 0) idx = taken.length
      taken = [...taken.slice(0, idx), taak, ...taken.slice(idx)]
      return template.fases.map((f) => (f.id === bronFaseId ? { ...f, taken: hernummerTaken(taken) } : f))
    }

    // Verplaatsing tussen fases: afhankelijkheden (binnen-fase) vervallen.
    const verplaatst: TemplateTaak = { ...taak, afhankelijkVan: [] }
    return template.fases.map((f) => {
      if (f.id === bronFaseId) {
        const taken = f.taken
          .filter((t) => t.id !== taak.id)
          .map((t) => ({ ...t, afhankelijkVan: t.afhankelijkVan.filter((d) => d !== taak.id) }))
        return { ...f, taken: hernummerTaken(taken) }
      }
      if (f.id === doelFaseId) {
        let taken = [...f.taken]
        let idx = doelTaakId ? taken.findIndex((t) => t.id === doelTaakId) : taken.length
        if (idx < 0) idx = taken.length
        taken = [...taken.slice(0, idx), verplaatst, ...taken.slice(idx)]
        return { ...f, taken: hernummerTaken(taken) }
      }
      return f
    })
  }

  const acties: EditorActies = {
    hernoemFase: (faseId, naam) => mapFase(faseId, (f) => ({ ...f, naam })),
    zetDoorlooptijd: (faseId, dagen) => mapFase(faseId, (f) => ({ ...f, doorlooptijdWerkdagen: Math.max(1, dagen) })),
    dupliceerFase: (faseId) => {
      const arr = [...template.fases].sort((a, b) => a.volgorde - b.volgorde)
      const i = arr.findIndex((f) => f.id === faseId)
      if (i < 0) return
      const kopie = kloonFases([arr[i]])[0]
      kopie.naam = `${arr[i].naam} (kopie)`
      arr.splice(i + 1, 0, kopie)
      zetFases(hernummerFases(arr))
      toon('succes', `Fase "${arr[i].naam}" gedupliceerd.`, ongedaan)
    },
    verwijderFase: (faseId) => {
      const fase = template.fases.find((f) => f.id === faseId)
      zetFases(hernummerFases(template.fases.filter((f) => f.id !== faseId)))
      toon('succes', `Fase "${fase?.naam ?? ''}" verwijderd.`, ongedaan)
    },
    verplaatsFase: verplaatsFaseInArray,
    taakOpslaan: (faseId, taak) =>
      mapFase(faseId, (f) => {
        const bestaat = f.taken.some((t) => t.id === taak.id)
        const taken = bestaat ? f.taken.map((t) => (t.id === taak.id ? taak : t)) : [...f.taken, taak]
        return { ...f, taken: hernummerTaken(taken) }
      }),
    taakPatch: (faseId, taakId, patch) =>
      mapFase(faseId, (f) => ({
        ...f,
        taken: f.taken.map((t) => (t.id === taakId ? { ...t, ...patch } : t)),
      })),
    taakVerwijder: (faseId, taakId) =>
      mapFase(faseId, (f) => ({
        ...f,
        taken: hernummerTaken(
          f.taken.filter((t) => t.id !== taakId).map((t) => ({ ...t, afhankelijkVan: t.afhankelijkVan.filter((d) => d !== taakId) })),
        ),
      })),
    taakDupliceer: (faseId, taakId) =>
      mapFase(faseId, (f) => {
        const i = f.taken.findIndex((t) => t.id === taakId)
        if (i < 0) return f
        const bron = f.taken[i]
        const kopie: TemplateTaak = {
          ...bron,
          id: uid('ttaak'),
          naam: `${bron.naam} (kopie)`,
          vaardigheden: [...bron.vaardigheden],
          afhankelijkVan: [...bron.afhankelijkVan],
        }
        const taken = [...f.taken]
        taken.splice(i + 1, 0, kopie)
        return { ...f, taken: hernummerTaken(taken) }
      }),
    taakVerplaatsRichting: (faseId, taakId, richting) =>
      mapFase(faseId, (f) => {
        const taken = [...f.taken].sort((a, b) => a.volgorde - b.volgorde)
        const i = taken.findIndex((t) => t.id === taakId)
        const j = i + richting
        if (i < 0 || j < 0 || j >= taken.length) return f
        ;[taken[i], taken[j]] = [taken[j], taken[i]]
        return { ...f, taken: hernummerTaken(taken) }
      }),
    taakVerplaatsNaarFase: (bronFaseId, taakId, doelFaseId) => {
      zetFases(bouwVerplaatsing(bronFaseId, taakId, doelFaseId))
      toon('succes', 'Taak verplaatst naar een andere fase.', ongedaan)
    },
    dndStart: (faseId, taakId) => {
      sleep.current = { faseId, taakId }
    },
    dndDropOpTaak: (doelFaseId, doelTaakId) => {
      const s = sleep.current
      sleep.current = null
      if (!s || (s.faseId === doelFaseId && s.taakId === doelTaakId)) return
      zetFases(bouwVerplaatsing(s.faseId, s.taakId, doelFaseId, doelTaakId))
    },
    dndDropOpFase: (doelFaseId) => {
      const s = sleep.current
      sleep.current = null
      if (!s) return
      zetFases(bouwVerplaatsing(s.faseId, s.taakId, doelFaseId))
    },
  }

  // ---------- Fase toevoegen ----------

  const voegFaseToe = (key: FaseKey, afdeling: Afdeling, naam: string, doorlooptijd: number) => {
    const nieuw: TemplateFase = {
      id: uid('tfase'),
      key,
      naam: naam.trim() || FASE_LABELS[key],
      afdeling,
      doorlooptijdWerkdagen: Math.max(1, doorlooptijd),
      volgorde: template.fases.length + 1,
      taken: [],
    }
    zetFases([...template.fases, nieuw])
    setFaseModalOpen(false)
    toon('succes', `Fase "${nieuw.naam}" toegevoegd.`, ongedaan)
  }

  // ---------- Kopbalk-acties ----------

  const publiceren = () => {
    dispatch({ type: 'TEMPLATE_PUBLICEREN', id: template.id })
    toon('succes', `${template.naam} v${template.versie} is gepubliceerd. Een eerdere gepubliceerde versie is gearchiveerd.`, ongedaan)
  }
  const archiveren = () => {
    dispatch({ type: 'TEMPLATE_ARCHIVEREN', id: template.id })
    toon('info', `${template.naam} v${template.versie} is gearchiveerd.`, ongedaan)
  }
  const nieuweConceptversie = () => {
    const nieuw = nieuweVersieVan(template, data.templates, persona.naam)
    dispatch({ type: 'TEMPLATE_TOEVOEGEN', template: nieuw })
    toon('succes', `Nieuwe conceptversie v${nieuw.versie} aangemaakt.`, ongedaan)
    navigate(`/templates/${nieuw.id}`)
  }

  const patchTemplate = (patch: { naam?: string; omschrijving?: string; opmerkingen?: string }) =>
    dispatch({ type: 'TEMPLATE_BIJWERKEN', id: template.id, patch })

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Terug-link */}
      <Link to="/templates" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
        <ArrowLeft size={15} /> Terug naar templates
      </Link>

      {/* Kopbalk */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold uppercase tracking-wide text-brand-700">{template.trailertype}</span>
            {niveau && <Badge kleur="blauw">{niveau.naam}</Badge>}
            <Badge kleur="grijs">v{template.versie}</Badge>
            <Badge kleur={TEMPLATE_STATUS_KLEUR[template.status]}>{TEMPLATE_STATUS_LABELS[template.status]}</Badge>
          </div>
          {bewerkbaar ? (
            <div className="mt-1 max-w-xl">
              <input
                key={`naam-${template.id}`}
                defaultValue={template.naam}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== template.naam) patchTemplate({ naam: v })
                  else e.target.value = template.naam
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-full rounded-md border border-transparent px-1 py-0.5 text-2xl font-semibold text-slate-900 hover:border-slate-200 focus:border-brand-500 focus:outline-none"
              />
            </div>
          ) : (
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">{template.naam}</h1>
          )}
          <p className="mt-0.5 text-xs text-slate-400">
            Laatst gewijzigd op {formatDatum(template.gewijzigdOp)} door {template.gewijzigdDoor}
            {template.geldigVanaf && template.status === 'gepubliceerd' && <> · geldig vanaf {formatDatum(template.geldigVanaf)}</>}
          </p>
        </div>

        {/* Rechts: statusknoppen */}
        {permissies.templatesBeheren && template.status === 'concept' && (
          <div className="flex items-center gap-2">
            <Knop onClick={archiveren}>
              <Archive size={15} /> Archiveren
            </Knop>
            <Knop variant="primary" onClick={publiceren}>
              <CheckCircle2 size={15} /> Publiceren
            </Knop>
          </div>
        )}
      </div>

      {/* Melding gepubliceerde versie */}
      {template.status === 'gepubliceerd' && (
        <Kaart className="mb-5 border-emerald-200 bg-emerald-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-start gap-2 text-sm text-emerald-800">
              <Lock size={16} className="mt-0.5 shrink-0" />
              <span>Gepubliceerde versie — bewerken maakt een nieuwe conceptversie.</span>
            </div>
            {permissies.templatesBeheren && (
              <Knop variant="primary" onClick={nieuweConceptversie}>
                <FilePlus2 size={15} /> Nieuwe conceptversie maken
              </Knop>
            )}
          </div>
        </Kaart>
      )}

      {/* Melding gearchiveerd / geen rechten */}
      {template.status === 'gearchiveerd' && (
        <div className="mb-5 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Archive size={16} className="mt-0.5 shrink-0" /> Gearchiveerde versie — alleen-lezen.
        </div>
      )}
      {template.status === 'concept' && !permissies.templatesBeheren && (
        <div className="mb-5 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <Lock size={16} className="mt-0.5 shrink-0" /> Je hebt geen rechten om templates te bewerken (alleen-lezen).
        </div>
      )}

      {/* Samenvatting-tegels */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SamenvattingTegel label="Totale uren" waarde={`${totalen.totaleUren}`} eenheid="u" />
        <SamenvattingTegel label="Engineeringuren" waarde={`${totalen.engineeringUren}`} eenheid="u" accent />
        <SamenvattingTegel label="Doorlooptijd" waarde={`${totalen.doorlooptijdWerkdagen}`} eenheid="werkdagen" />
        <SamenvattingTegel label="Taken" waarde={`${totalen.aantalTaken}`} eenheid={`${totalen.aantalOptioneel} optioneel`} />
        <SamenvattingTegel label="Benodigde engineers" waarde={`${totalen.benodigdeEngineers}`} eenheid="max" />
        <SamenvattingTegel label="Piekbezetting" waarde={`${totalen.piekBezetting}`} eenheid="mdw" />
      </div>

      {/* Bewerkbare omschrijving / opmerkingen */}
      {(bewerkbaar || template.omschrijving || template.opmerkingen) && (
        <Kaart className="mb-5">
          <div className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-2">
            <Veld label="Omschrijving">
              {bewerkbaar ? (
                <TekstVeld waarde={template.omschrijving ?? ''} meerdereRegels placeholder="Korte omschrijving van deze variant…" onCommit={(v) => patchTemplate({ omschrijving: v })} />
              ) : (
                <p className="text-sm text-slate-600">{template.omschrijving || '—'}</p>
              )}
            </Veld>
            <Veld label="Opmerkingen">
              {bewerkbaar ? (
                <TekstVeld waarde={template.opmerkingen ?? ''} meerdereRegels placeholder="Interne opmerkingen…" onCommit={(v) => patchTemplate({ opmerkingen: v })} />
              ) : (
                <p className="text-sm text-slate-600">{template.opmerkingen || '—'}</p>
              )}
            </Veld>
          </div>
        </Kaart>
      )}

      {/* Weergavewisselaar */}
      <div className="mb-4">
        <Tabs
          tabs={[
            { id: 'lijst', label: 'Lijst' },
            { id: 'tijdlijn', label: 'Tijdlijnvoorbeeld' },
            { id: 'capaciteit', label: 'Capaciteitsoverzicht' },
          ]}
          actief={tab}
          onKies={setTab}
        />
      </div>

      {/* Lijst */}
      {tab === 'lijst' && (
        <div className="space-y-3">
          {fases.length === 0 ? (
            <LegeStaat titel="Nog geen fases" tekst="Voeg de eerste fase toe om taken te kunnen plannen." />
          ) : (
            fases.map((fase, i) => (
              <TemplateFaseKaart
                key={fase.id}
                fase={fase}
                index={i}
                aantalFases={fases.length}
                teams={data.teams}
                alleFases={fases}
                bewerkbaar={bewerkbaar}
                acties={acties}
              />
            ))
          )}
          {bewerkbaar && (
            <Knop onClick={() => setFaseModalOpen(true)}>
              <Plus size={15} /> Fase toevoegen
            </Knop>
          )}
        </div>
      )}

      {/* Tijdlijn */}
      {tab === 'tijdlijn' && (
        <Kaart>
          <div className="px-4 py-4">
            <TemplateTijdlijn fases={template.fases} overlap={data.instellingen.chassisPanelenOverlapDagen} />
          </div>
        </Kaart>
      )}

      {/* Capaciteit */}
      {tab === 'capaciteit' && (
        <Kaart>
          <div className="px-4 py-4">
            <TemplateCapaciteit template={template} templates={data.templates} />
          </div>
        </Kaart>
      )}

      <FaseToevoegenModal open={faseModalOpen} onSluiten={() => setFaseModalOpen(false)} onToevoegen={voegFaseToe} />
    </div>
  )
}

function SamenvattingTegel({ label, waarde, eenheid, accent }: { label: string; waarde: string; eenheid?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'} shadow-sm`}>
      <div className={`flex items-baseline gap-1 ${accent ? 'text-brand-700' : 'text-slate-800'}`}>
        <span className="text-xl font-semibold tabular-nums">{waarde}</span>
        {eenheid && <span className="text-xs text-slate-400">{eenheid}</span>}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  )
}

// ---------- Fase toevoegen modal ----------

const AFDELING_PER_KEY: Record<FaseKey, Afdeling> = {
  salesoverdracht: 'engineering',
  engineering: 'engineering',
  chassis: 'chassis',
  panelen: 'panelen',
  spuiter: 'extern',
  afbouw: 'afbouw',
  kwaliteit: 'kwaliteit',
}
const ALLE_AFDELINGEN: Afdeling[] = ['engineering', 'chassis', 'panelen', 'afbouw', 'kwaliteit', 'extern']

function FaseToevoegenModal({
  open,
  onSluiten,
  onToevoegen,
}: {
  open: boolean
  onSluiten: () => void
  onToevoegen: (key: FaseKey, afdeling: Afdeling, naam: string, doorlooptijd: number) => void
}) {
  const [key, setKey] = useState<FaseKey>('engineering')
  const [afdeling, setAfdeling] = useState<Afdeling>('engineering')
  const [naam, setNaam] = useState('')
  const [doorlooptijd, setDoorlooptijd] = useState('10')
  const [fout, setFout] = useState<string>()

  useEffect(() => {
    if (!open) return
    setKey('engineering')
    setAfdeling('engineering')
    setNaam(FASE_LABELS.engineering)
    setDoorlooptijd('10')
    setFout(undefined)
  }, [open])

  const kiesKey = (k: FaseKey) => {
    setKey(k)
    setAfdeling(AFDELING_PER_KEY[k])
    setNaam(FASE_LABELS[k])
  }

  const toevoegen = () => {
    const n = Number(doorlooptijd)
    if (!Number.isFinite(n) || n < 1) {
      setFout('Doorlooptijd moet minimaal 1 werkdag zijn.')
      return
    }
    onToevoegen(key, afdeling, naam, Math.round(n))
  }

  return (
    <Modal
      open={open}
      titel="Fase toevoegen"
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={toevoegen}>
            <Layers size={15} /> Fase toevoegen
          </Knop>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Veld label="Fasetype">
          <Keuze value={key} onChange={(e) => kiesKey(e.target.value as FaseKey)}>
            {FASE_VOLGORDE.map((k) => (
              <option key={k} value={k}>
                {FASE_LABELS[k]}
              </option>
            ))}
          </Keuze>
        </Veld>
        <Veld label="Afdeling">
          <Keuze value={afdeling} onChange={(e) => setAfdeling(e.target.value as Afdeling)}>
            {ALLE_AFDELINGEN.map((a) => (
              <option key={a} value={a}>
                {AFDELING_LABELS[a]}
              </option>
            ))}
          </Keuze>
        </Veld>
        <Veld label="Fasenaam" verplicht className="col-span-2">
          <Invoer value={naam} onChange={(e) => setNaam(e.target.value)} />
        </Veld>
        <Veld label="Doorlooptijd (werkdagen)" verplicht fout={fout}>
          <Invoer type="number" min={1} value={doorlooptijd} onChange={(e) => setDoorlooptijd(e.target.value)} />
        </Veld>
      </div>
    </Modal>
  )
}
