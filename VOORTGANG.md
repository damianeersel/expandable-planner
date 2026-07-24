# Voortgang — stand 24-07-2026

## Nieuw (24-07, branch `zoekbalk-slider-jm-plan`)

- **Zoekbalk in Planning** (tijdlijn): filtert projecten live op PR-nummer, naam of klant; "wisFilters" wist ook de zoekterm.
- **Voortgangsslider verwijderd** uit alle projectschermen (`VoortgangInvoer` bestaat niet meer): procesrijen tonen een statische balk; voor processen zonder taken is de voortgang instelbaar via een nummerveld in "Proces bewerken" (zelfde statusafleiding: 100% = gereed, >0% = bezig). De verkoopkans-slider in de wizard is bewust ongemoeid (ander control).
- **JM Construct-plan** (`JM-CONSTRUCT-PLAN.md`, concept 0.2): voorstel voor de aparte chassisplanning. Intern gevalideerd door Damian (24-07): PR-nummer direct bij orderplaatsing per chassis, IO = inkoopnummer, JM-ordernummer vult JM later zelf aan, gerede chassis blijven op voorraad bij JM tot Expandable ze oproept voor productie, revisie per order, één trailertype per order (§9 = vastgestelde uitgangspunten U1–U9). Nog NIET gebouwd — eerst §10 (afroeptermijn, slots, werkwijze) afstemmen met JM, daarna Fase A.

# Eerdere stand — 22-07-2026 (avond)

## Afgerond en werkend

1. **Basis-MVP**: dashboard, Gantt (tijdlijnplanning), projecten + wizard, projectdetail, teams, beschikbaarheid, verlof, externe partijen, instellingen, rollen.
2. **Locatieplanning**: plattegronden MH25 (vierkant, 6+4) / MH207 (langwerpig, 2×6) / Opslag (5×5), drag-and-drop, wachtrij, detailpaneel, historie, "Markeer als opgehaald".
3. **PR-nummers & modellen**: PR + 4 cijfers als enige identificatie; modellen E7P/E9P/E13T/E13H/E16TU/E16HU.
4. **Fase 1 templates**: Planningstemplates-scherm, template-editor, versies, wizard-integratie, complexiteitsniveaus in Instellingen.
5. **Fase 2 detailplanning**: taakmodel, `lib/taken.ts`, `lib/bestanden.ts` (IndexedDB), notities/historie/bestanden/partnerTypes, Detailplanning-schermen (FaseKaart/FasesTab/TaakModal e.d.), volledig partnerbeheer, Bestanden-tab. **Gemerged naar main via PR #1 (a81b0cf) → live op Vercel.**
6. **Fase 3** — **gemerged naar main via PR #2 (b03b57d) → live op Vercel**:
   - **Kanban-statusbord** in Fases & werkzaamheden: weergavewissel Fasekaarten ↔ Statusbord (`FasesTab`). Vier statuskolommen (te doen / in uitvoering / on hold / gereed) met tellers en uren, taakkaartjes met fase·proces-context, badges (extern/projectspecifiek/blokkade/prioriteit), on-hold-reden en toewijzing. Drag-and-drop wisselt de status met dezelfde regels als de taakrij: reden-dialoog bij on hold en heropenen, voorganger-/afhankelijkheids-waarschuwingen, historie + undo-toast. Fasefilter. Permissies: alleen taken van je eigen afdeling sleepbaar (productieleider), management volledig alleen-lezen, taaknaam klikbaar → TaakModal (alleen planner).
   - **Statuswissel-logica geëxtraheerd** naar `useTaakStatusWissel` (src/components/project/detail/), gedeeld door `TaakRij` (dropdown) en `TaakStatusBord` (drop) — geen duplicatie.
   - **Beschikbaarheid × detailplanning**: weekweergave heeft nu kolommen **Gepland** (taakuren uit de detailplanning, tooltip per taak met PR-nummer; schaduwprojecten gemarkeerd) en **Bezetting** (t.o.v. netto; <85% ok · 85–100% druk · >100% overboekt), incl. teamtotalen. Maandweergave: geplande uren in de weekcel-tooltip, rode ring bij overboekte weken, totaalkolom Gepland. Nieuw in `lib/taken.ts`: `medewerkerTaakBelastingInWeek` (details per taak); `medewerkerTaakUrenInWeek` somt die en slaat geannuleerde projecten nu over.
   - **Dev-tooling**: `vite.config.ts` + `.claude/launch.json` ondersteunen `autoPort`, zodat een tweede dev-server naast poort 5173 kan draaien.

## Verificatie (22-07, browser, verse seed)

- Statusbord: drop te_doen → in uitvoering zet `werkelijkeStart`, voortgang hernormaliseerd (83% → 77%), tellers live bijgewerkt; drop op On hold opent het reden-dialoog → kaart toont redenbox, toast met "Ongedaan maken".
- Permissies gecontroleerd: planner en productieleider Afbouw 5 sleepbare kaarten, productieleider Chassisbouw en management 0 (geen sleephint, naam niet klikbaar).
- TaakRij-dropdown na refactor: statuswissel + waarschuwing "Voorganger … is nog niet gereed" werken via de gedeelde hook.
- Beschikbaarheid: Pieter Hoekstra Gepland 14 u / Bezetting 35% met tooltip "PR3305 · Groepenkast aansluiten · 14 u"; deelweek-spreiding klopt (6 van 12 u bij taak die halverwege de week start); teamtotaal Afbouw Team A 20 u / 11%; maandweergave met Gepland-totalen. Geen console-fouten.
- LET OP: echte muis-drag is in het ingebedde Claude-browserpaneel niet te simuleren (CDP-beperking); de drop-handlers zijn geverifieerd met echte DragEvents via JavaScript. In een normale browser werkt slepen gewoon.

## Openstaande stappen

Geen harde openstaande stappen. Mogelijke vervolgideeën: sorteer-/prioriteitsvolgorde binnen bordkolommen, projectoverstijgend statusbord (alle projecten), bezettingssignaal per uitvoerende in de TaakModal-toewijzing hergebruiken vanuit `medewerkerTaakBelastingInWeek`.

## Weetjes

- Laatst gecommitte stand op origin/main = t/m Fase 3 (merge b03b57d, PR #2); werkboom schoon.
- Stale HMR-consolefouten na grote refactors zijn normaal; harde herlaad lost het op.
- localStorage bevat mogelijk oude seed; migratie vangt dit op, maar "Demodata herstellen" (Instellingen) geeft de nieuwste demoset. Elke dev-serverpoort is een eigen origin met eigen localStorage.
