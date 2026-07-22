# Expandable Production Planner

Nederlandstalig, desktop-first MVP-prototype voor productieplanning van uitschuifbare trailers (Expandable). Alle UI-teksten in het Nederlands; datums dd-mm-jjjj; weken beginnen op maandag.

## Stack & commando's

- Vite 7 + React 19 + TypeScript strict + Tailwind CSS v4 (`@tailwindcss/vite`, thema in `src/index.css`) + lucide-react + react-router-dom v7. Geen backend.
- Node/npm/gh staan in `~/.local/bin` (Node 22, gh CLI — ingelogd als damianeersel).
- Typecheck: `npx tsc --noEmit` · Build: `npx vite build` · Dev-server via `.claude/launch.json` (naam `planner-dev`, poort 5173) — start die via de preview-tools, niet via Bash.
- GitHub: https://github.com/damianeersel/expandable-planner (main) · Live: https://expandable-planner.vercel.app — push naar main = automatische Vercel-deploy. Voor features: branch + PR via `gh pr create`.

## Architectuur (belangrijkste bestanden)

- `src/lib/types.ts` — alle domeinmodellen + labels. `src/store/AppState.tsx` — reducer + alle acties, localStorage (`expandable-planner-v1`), globale undo (stack, `UNDO`), migraties (`migreerData` = locaties → templates → detailplanning).
- `src/lib/` — `dates.ts` (ISO-datumstrings), `capacity.ts` (teamcapaciteit, risico), `locaties.ts` (fysieke plaatsen/zones, `trailerLabel`), `templates.ts` (producttemplates, `genereerProjectVanTemplate` = deep copy), `taken.ts` (Fase→Proces→Taak, `normaliseerFase`, afhankelijkheden, `telTaken`), `bestanden.ts` (IndexedDB-blobs; metadata in store), `seed.ts` (demodata relatief aan vandaag; herstel via Instellingen → Demodata herstellen).
- Schermen in `src/screens/`, gedeelde UI-kit in `src/components/ui.tsx` (Knop/Badge/Kaart/Modal/Keuze/useToast met undo-actie).

## Kernconcepten

- PR-nummer (`PR3315`, PR + 4 cijfers) is de ENIGE zichtbare identificatie van project én fysieke trailer (geen unit-/serienummers tonen). Modellen: E7P/E9P/E11H/E13T/E13H/E16H/E16TU/E16HU.
- Schaduw- vs. definitieve planning met kansgewogen capaciteitsscenario's; rolwisselaar rechtsboven (permissies in `getPermissies`).
- Planning heeft 3 tabs via `?view=`: tijdlijn (Gantt), capaciteit, locatie (plattegronden MH25/MH207/Opslag, drag-and-drop trailers).
- Producttemplates per trailertype × complexiteit met versies (concept/gepubliceerd/gearchiveerd); project = zelfstandige deep copy ("Losgekoppeld van template").
- Fase 2 detailplanning: Fase → Proces (Werkpakket) → Taak (statussen te_doen/in_uitvoering/on_hold/gereed; blokkade is aparte eigenschap; `externeActie` voor uitbestede taken). Reducer normaliseert uren automatisch → capaciteit werkt door. Notities (project/fase/proces/taak), projecthistorie (auto-gelogd), bestanden (IndexedDB), partnerbeheer (type = string, `externTypeLabel`, archiveren, custom `partnerTypes`).

## Actuele status (2026-07-22)

Zie VOORTGANG.md voor de laatste stand en openstaande stappen.
