// Gedeelde helpers en kleuren voor de template-editor (afdelingskleuren, hernummering, status-badges).

import type { Afdeling, TemplateFase, TemplateStatus, TemplateTaak } from '../../lib/types'
import type { BadgeKleur } from '../ui'

/** Badge-kleur per afdeling (voor fase-labels en tijdlijn-legenda). */
export const AFDELING_KLEUR: Record<Afdeling, BadgeKleur> = {
  engineering: 'paars',
  chassis: 'blauw',
  panelen: 'brand',
  afbouw: 'amber',
  kwaliteit: 'groen',
  extern: 'grijs',
}

/** Tailwind achtergrondkleur per afdeling (voor de tijdlijnbalken). */
export const AFDELING_BALK: Record<Afdeling, string> = {
  engineering: 'bg-purple-500',
  chassis: 'bg-sky-500',
  panelen: 'bg-brand-600',
  afbouw: 'bg-amber-500',
  kwaliteit: 'bg-emerald-500',
  extern: 'bg-slate-400',
}

/** Status-badge-kleur voor templates. */
export const TEMPLATE_STATUS_KLEUR: Record<TemplateStatus, BadgeKleur> = {
  concept: 'grijs',
  gepubliceerd: 'groen',
  gearchiveerd: 'amber',
}

/** Bron van een lopende drag-actie (taak wordt versleept). */
export interface Sleep {
  faseId: string
  taakId: string
}

/** Callbacks die de editor doorgeeft aan fase-kaarten en taakrijen. */
export interface EditorActies {
  hernoemFase: (faseId: string, naam: string) => void
  zetDoorlooptijd: (faseId: string, dagen: number) => void
  dupliceerFase: (faseId: string) => void
  verwijderFase: (faseId: string) => void
  verplaatsFase: (faseId: string, richting: -1 | 1) => void
  taakOpslaan: (faseId: string, taak: import('../../lib/types').TemplateTaak) => void
  taakPatch: (faseId: string, taakId: string, patch: Partial<import('../../lib/types').TemplateTaak>) => void
  taakVerwijder: (faseId: string, taakId: string) => void
  taakDupliceer: (faseId: string, taakId: string) => void
  taakVerplaatsRichting: (faseId: string, taakId: string, richting: -1 | 1) => void
  taakVerplaatsNaarFase: (bronFaseId: string, taakId: string, doelFaseId: string) => void
  dndStart: (faseId: string, taakId: string) => void
  dndDropOpTaak: (doelFaseId: string, doelTaakId: string) => void
  dndDropOpFase: (doelFaseId: string) => void
}

/** Zet volgorde-nummers opnieuw op basis van de array-index (1-based). */
export function hernummerFases(fases: TemplateFase[]): TemplateFase[] {
  return fases.map((f, i) => ({ ...f, volgorde: i + 1 }))
}

export function hernummerTaken(taken: TemplateTaak[]): TemplateTaak[] {
  return taken.map((t, i) => ({ ...t, volgorde: i + 1 }))
}
