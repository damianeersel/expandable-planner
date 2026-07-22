// Modal om de huidige projectplanning op te slaan als nieuw concepttemplate.
// Bouwt via projectAlsTemplate een zelfstandig template (diepe kopie) — het resultaat
// is altijd status "concept" en overschrijft nooit een gepubliceerd template.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutTemplate } from 'lucide-react'
import { useApp } from '../../store/AppState'
import { TEMPLATE_STATUS_LABELS, TRAILERTYPES, type Project } from '../../lib/types'
import { hoogsteVersie, projectAlsTemplate } from '../../lib/templates'
import { Invoer, Keuze, Knop, Modal, Veld, useToast } from '../ui'

const VRIJ = '__vrij__'

export default function OpslaanAlsTemplateModal({
  project,
  open,
  onSluiten,
}: {
  project: Project
  open: boolean
  onSluiten: () => void
}) {
  const { data, dispatch, persona } = useApp()
  const { toon } = useToast()
  const navigate = useNavigate()

  const niveaus = useMemo(
    () => [...data.complexiteitNiveaus].sort((a, b) => a.volgorde - b.volgorde),
    [data.complexiteitNiveaus],
  )

  // Alle fases van dit project (met hun werkpakketten), op startdatum gesorteerd.
  const projectFasesLijst = useMemo(
    () =>
      data.fases
        .filter((f) => f.projectId === project.id)
        .slice()
        .sort((a, b) => (a.start === b.start ? 0 : a.start < b.start ? -1 : 1)),
    [data.fases, project.id],
  )
  const alleWerkpakketIds = useMemo(
    () => projectFasesLijst.flatMap((f) => f.werkpakketten.map((wp) => wp.id)),
    [projectFasesLijst],
  )

  const [trailertype, setTrailertype] = useState('')
  const [vrijeType, setVrijeType] = useState(false)
  const [complexiteitId, setComplexiteitId] = useState('')
  const [modus, setModus] = useState<'nieuw' | 'versie'>('nieuw')
  const [basisTemplateId, setBasisTemplateId] = useState('')
  const [naam, setNaam] = useState('')
  const [naamAangepast, setNaamAangepast] = useState(false)
  const [geselecteerd, setGeselecteerd] = useState<Set<string>>(new Set())
  const [fout, setFout] = useState<string | undefined>()

  // Bestaande templates in dezelfde lijn (trailertype + complexiteit), hoogste versie eerst.
  const matchendeTemplates = useMemo(
    () =>
      data.templates
        .filter((t) => t.trailertype === trailertype.trim() && t.complexiteitId === complexiteitId)
        .sort((a, b) => b.versie - a.versie),
    [data.templates, trailertype, complexiteitId],
  )
  const kanVersie = matchendeTemplates.length > 0
  const nieuweVersieNr = hoogsteVersie(data.templates, trailertype.trim(), complexiteitId) + 1

  const niveauNaam = niveaus.find((n) => n.id === complexiteitId)?.naam ?? complexiteitId
  const voorstelNaam = trailertype.trim() ? `${trailertype.trim()} · ${niveauNaam}` : niveauNaam

  // Bij openen: velden vullen vanuit het project en alle taken aanzetten.
  useEffect(() => {
    if (!open) return
    const voorstelType = project.templateTrailertype ?? project.productModel ?? ''
    setVrijeType(voorstelType !== '' && !TRAILERTYPES.includes(voorstelType))
    setTrailertype(voorstelType)
    setComplexiteitId(
      project.templateComplexiteitId && niveaus.some((n) => n.id === project.templateComplexiteitId)
        ? project.templateComplexiteitId
        : niveaus[0]?.id ?? '',
    )
    setModus('nieuw')
    setNaam('')
    setNaamAangepast(false)
    setGeselecteerd(new Set(alleWerkpakketIds))
    setFout(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project.id])

  // Naamvoorstel bijhouden zolang de gebruiker de naam niet zelf heeft aangepast.
  useEffect(() => {
    if (open && !naamAangepast) setNaam(voorstelNaam)
  }, [open, naamAangepast, voorstelNaam])

  // Basiskeuze geldig houden wanneer de lijn (trailertype/complexiteit) verandert.
  useEffect(() => {
    setBasisTemplateId((prev) => (matchendeTemplates.some((t) => t.id === prev) ? prev : matchendeTemplates[0]?.id ?? ''))
  }, [matchendeTemplates])

  // Terugvallen op "nieuw" wanneer er geen bestaand template is om te versioneren.
  useEffect(() => {
    if (!kanVersie && modus === 'versie') setModus('nieuw')
  }, [kanVersie, modus])

  const toggle = (id: string) =>
    setGeselecteerd((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const opslaan = () => {
    const type = trailertype.trim()
    if (!type) {
      setFout('Kies of vul een trailertype in.')
      return
    }
    if (!complexiteitId) {
      setFout('Kies een complexiteitsniveau.')
      return
    }
    if (!naam.trim()) {
      setFout('Geef het template een naam.')
      return
    }
    if (geselecteerd.size === 0) {
      setFout('Selecteer minstens één taak om op te nemen.')
      return
    }

    const template = projectAlsTemplate(data, project, projectFasesLijst, {
      trailertype: type,
      complexiteitId,
      naam: naam.trim(),
      gebruiker: persona.naam,
      taakIds: geselecteerd,
    })
    // Nieuwe versie van een bestaande lijn: alleen het versienummer ophogen — het blijft
    // een nieuw concepttemplate en laat het bestaande (gepubliceerde) template ongemoeid.
    if (modus === 'versie' && kanVersie) {
      template.versie = hoogsteVersie(data.templates, type, complexiteitId) + 1
    }
    dispatch({ type: 'TEMPLATE_TOEVOEGEN', template })
    toon('succes', `Concepttemplate "${template.naam}" aangemaakt.`, {
      label: 'Bekijk templates',
      onClick: () => navigate('/templates'),
    })
    onSluiten()
  }

  const zonderTaken = projectFasesLijst.filter((f) => f.werkpakketten.length === 0)

  return (
    <Modal
      open={open}
      breed
      titel="Opslaan als nieuw template"
      onSluiten={onSluiten}
      voettekst={
        <>
          <Knop onClick={onSluiten}>Annuleren</Knop>
          <Knop variant="primary" onClick={opslaan}>
            <LayoutTemplate size={15} /> Concepttemplate aanmaken
          </Knop>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Bewaar de planning van <span className="font-semibold text-slate-800">{project.naam}</span> (
          {project.projectnummer}) als herbruikbaar template. Het wordt als{' '}
          <span className="font-medium text-slate-700">concept</span> opgeslagen; publiceren doe je later via
          Planningstemplates.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Veld label="Trailertype" verplicht>
            <div className="flex gap-2">
              <Keuze
                className="!w-40"
                value={vrijeType ? VRIJ : trailertype}
                onChange={(e) => {
                  if (e.target.value === VRIJ) {
                    setVrijeType(true)
                  } else {
                    setVrijeType(false)
                    setTrailertype(e.target.value)
                  }
                }}
              >
                {TRAILERTYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value={VRIJ}>Anders…</option>
              </Keuze>
              {vrijeType && (
                <Invoer
                  placeholder="Eigen type"
                  value={trailertype}
                  onChange={(e) => setTrailertype(e.target.value)}
                  className="!w-40"
                />
              )}
            </div>
          </Veld>

          <Veld label="Complexiteitsniveau" verplicht>
            <Keuze value={complexiteitId} onChange={(e) => setComplexiteitId(e.target.value)}>
              {niveaus.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.naam} — {n.aanduiding}
                </option>
              ))}
            </Keuze>
          </Veld>
        </div>

        <Veld label="Wat wil je maken?">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="template-modus"
                className="accent-brand-600"
                checked={modus === 'nieuw'}
                onChange={() => setModus('nieuw')}
              />
              Volledig nieuw template
            </label>
            <label
              className={`flex items-center gap-2 text-sm ${kanVersie ? 'text-slate-700' : 'text-slate-400'}`}
            >
              <input
                type="radio"
                name="template-modus"
                className="accent-brand-600"
                disabled={!kanVersie}
                checked={modus === 'versie'}
                onChange={() => setModus('versie')}
              />
              Nieuwe versie van bestaand template
              {!kanVersie && <span className="text-xs">(geen bestaand template voor deze combinatie)</span>}
            </label>
          </div>
        </Veld>

        {modus === 'versie' && kanVersie && (
          <Veld label="Bestaand template">
            <Keuze value={basisTemplateId} onChange={(e) => setBasisTemplateId(e.target.value)}>
              {matchendeTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.naam} — v{t.versie} ({TEMPLATE_STATUS_LABELS[t.status]})
                </option>
              ))}
            </Keuze>
            <p className="mt-1 text-xs text-slate-500">
              Wordt aangemaakt als concept <span className="font-medium text-slate-600">v{nieuweVersieNr}</span>. Het
              bestaande template blijft ongewijzigd.
            </p>
          </Veld>
        )}

        <Veld label="Templatenaam" verplicht>
          <Invoer
            value={naam}
            onChange={(e) => {
              setNaam(e.target.value)
              setNaamAangepast(true)
            }}
            placeholder={voorstelNaam}
          />
        </Veld>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">
              Taken opnemen ({geselecteerd.size}/{alleWerkpakketIds.length})
            </span>
            <div className="flex gap-3 text-xs">
              <button
                type="button"
                className="font-medium text-brand-700 hover:underline"
                onClick={() => setGeselecteerd(new Set(alleWerkpakketIds))}
              >
                Alles
              </button>
              <button
                type="button"
                className="font-medium text-slate-500 hover:underline"
                onClick={() => setGeselecteerd(new Set())}
              >
                Niets
              </button>
            </div>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/50 p-2">
            {projectFasesLijst.filter((f) => f.werkpakketten.length > 0).length === 0 && (
              <p className="px-1 py-2 text-xs text-slate-500">Dit project heeft geen taken om op te nemen.</p>
            )}
            {projectFasesLijst
              .filter((f) => f.werkpakketten.length > 0)
              .map((f) => {
                const aantalIn = f.werkpakketten.filter((wp) => geselecteerd.has(wp.id)).length
                return (
                  <div key={f.id} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                      <span className="text-xs font-semibold text-slate-600">{f.naam}</span>
                      <span className="text-xs tabular-nums text-slate-400">
                        {aantalIn}/{f.werkpakketten.length}
                      </span>
                    </div>
                    <ul>
                      {f.werkpakketten.map((wp) => (
                        <li key={wp.id} className="border-t border-slate-50 first:border-0">
                          <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-slate-50">
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-brand-600"
                              checked={geselecteerd.has(wp.id)}
                              onChange={() => toggle(wp.id)}
                            />
                            <span className="min-w-0 flex-1 truncate text-slate-700">{wp.naam}</span>
                            {wp.optioneel && <span className="text-xs text-amber-600">optioneel</span>}
                            <span className="shrink-0 text-xs tabular-nums text-slate-400">{wp.uren} u</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
          </div>
          {zonderTaken.length > 0 && (
            <p className="mt-1.5 text-xs text-slate-500">
              Fases zonder taken (zoals de externe spuiter) worden automatisch als fase overgenomen.
            </p>
          )}
        </div>

        {fout && <p className="text-xs font-medium text-red-600">{fout}</p>}
      </div>
    </Modal>
  )
}
