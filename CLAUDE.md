@AGENTS.md

# Lauda — Formatador de Relatórios

Webapp for Portuguese medical interns that assembles and reformats their
end-of-internship **Curriculum Vitae** to the formatting norms published by
their specialty's Colégio da Ordem dos Médicos, applies a compliant cover,
shows a free watermarked preview, and charges once for the clean PDF download.

No user accounts. Portuguese (pt-PT) only. Payments via Stripe.

The user-facing product name is **Lauda** (wordmark, `<title>`); the repository
and Vercel project are still `formatador-de-relatorios`.

## Tickets

Work is tracked in Linear, project **Formatador de Relatórios**, team `DIO`
(issues DIO-5 … DIO-42). Use the `linear-agent` CLI.

Two waves exist, and they number their build order differently:

- **DIO-5 … DIO-22** — the original build. Ticket bodies carry `Build order: N/16`.
- **DIO-37 … DIO-42** — the frontend-overhaul + multi-document initiative, all
  merged. Bodies carry `Build order: N/6` and a `PRD:` pointer.

Dependencies are prose, not enforced links — read the ticket before starting and
respect the stated order. `linear-agent list --delegated --json` shows what has
been handed to the agent.

Blockers and decisions only Diogo can make go on the ticket as a tagged comment,
not just in the terminal — see the Linear section of the global `~/.claude/CLAUDE.md`
for the mention format.

**Still open:** DIO-20 (formatting QA against real reports + launch checklist).
It was deliberately parked until the product could accept real multi-file CVs,
which it now can. It is the natural next ticket.

## Domain: what the norms actually require

Source for the first rule set: *Normas para a elaboração de um Curriculum Vitae*,
**Colégio de Medicina Física e de Reabilitação**. Full extraction is in the
DIO-10 comment thread. Key points that shape the code:

**Formatting (Secção A) — what the engine applies**

| Parameter | Value |
|---|---|
| Font family | Arial **or** Times New Roman — *user choice* |
| Font size | 12pt, black |
| Titles | Bold, 12pt **or** 14pt — *user choice* |
| Line spacing | 1.5 |
| Margins | 2.5 cm all sides |
| Page | A4, white, double-sided |
| Footer | Candidate name + sequential page number, nothing else |
| Header | Optional; section/subsection reference only |

**Constraints — validation, not formatting**

- Photographs and graphics are **forbidden**.
- Tables allowed only for schematizing activities (casuística, internato organization).
- Maximum **80 pages**.
- `Resumo do currículo` maximum 2 pages.
- Chronological ordering throughout.

**Cover** — white, black text only: candidate name, "curriculum vitae", local de
formação, date. No colours, photographs, or symbols. This is why DIO-12 is
typographic variants, not a design gallery.

Rule sets are per **Colégio**, not per Diário da República. Each specialty
publishes its own; the config must treat the above as one rule set among many,
with a documented default.

## Architecture

Single Next.js 16 app (App Router, TypeScript), deployed to Vercel (Hobby plan,
default `*.vercel.app` domain).

```
N × .docx ──► object store {sessionId}/source/{i}.docx
                     │   session record: sources[] order, masterIndex,
                     │   specialtyId, coverId, setupStep
                     ▼
        parse each source ──► per-file constraint warnings
                     ▼
   merge (master front matter + ordered chapters, heading normalisation)
                     ▼
        rule-set CSS + cover merge
                     ▼
   Chromium printToPDF pass 1 ──► page map ──► Índice numbers + blank pages
                     ▼
   Chromium printToPDF pass 2 ──► pdf-lib stamps footers/headers
            ▼                              ▼
   watermarked preview            clean PDF (webhook-gated)
            ▼                              ▼
   pdf.js viewer in the workspace    download route
                     ▼
            scheduled purge / TTL
```

**Serverless, not a container:** the scaffold originally assumed headless
Chromium needed a container with a real Node process. That constraint no longer
holds — Vercel raised the function bundle limit to 5GB for large functions
(fluid compute, on by default for new projects), which comfortably fits headless
Chromium. See the DIO-5 comment thread for the research behind the switch.

The `.docx → semantic HTML → rule-set CSS → Chromium printToPDF` pipeline is
**built** (DIO-10/DIO-11), and extended to multi-document input with a two-pass
render in DIO-42. CSS `@page` handles A4 and 2.5cm margins; footers and the
optional running header are stamped afterwards with pdf-lib (see below for why).
The alternative — editing OOXML and converting via LibreOffice — gives less
precise control over exactly the parameters the norms specify. Revisit if real
reports show structures that HTML conversion mangles.

## Multi-file sources and the merge pipeline

A real CV is **not one file**. The reference corpus is one "documento principal"
(cover, structure page, dedication, an Índice) plus ~11 chapter files, which is
why DIO-40/41/42 exist.

- **Storage:** `{sessionId}/source/{index}.docx`. `src/lib/session/sources.ts`
  is the only module that knows this layout — everything reads through it, and
  it still understands a pre-multi-file session's single `upload` as source 0.
  Indexes are stable and never reused; reordering permutes the record, never
  renames objects.
- **Caps** (`src/lib/upload/validate.ts`, one place): 20 files, 60 MB combined,
  20 MB per file. **Provisional** — Diogo has not confirmed them (PRD §12 Q1).
- **API:** `POST /api/upload` appends one or more files; `/api/session/sources`
  does `GET` (list), `PATCH {order}` (reorder), `PATCH {masterIndex}` (set
  documento principal), `DELETE {index}`. Responses never expose storage keys.
- **Merge** (`src/lib/merge/`): `mergeDocuments(master, chapters, options)`
  splits the master's front matter, demotes each chapter's top heading to a
  configurable depth (default 1, i.e. `<h2>`) so chapters slot under the CV
  hierarchy instead of becoming new `<h1>`s, and emits one `ParsedDocument`.
  Per-file `chapterDepthOverrides` exist because automatic-vs-manual depth
  assignment is **still an open product question** (PRD §12 Q2) — the API
  supports both, only the UI commits.
- A stale Índice in the master is detected and replaced, with a pt-PT warning.
- **A missing source file fails the render loudly.** Silently rendering without
  a chapter would hand the candidate an incomplete CV that still looks finished.

### Two-pass render (`src/lib/pdf/`)

`renderPaginated.ts` is the orchestrator; `paginate.ts` is the pure math;
`pageMap.ts` reads the page map.

- **Page map:** a probe section links to every heading anchor. Chromium's
  `printToPDF` turns those links into *named destinations*, which pdf-lib
  resolves to page numbers. That yields **exact** pages, not estimates — the
  Índice has zero tolerance for being wrong. Probe pages are stripped before
  anything leaves the render.
- **Pass 1** prints with empty Índice placeholders and reads the map; **pass 2**
  prints with the Índice filled and blank pages in place. Both passes share one
  Chromium instance and one invocation; nothing is persisted between them.
  Converging in exactly **2 passes** is a tested property (`MAX_PASSES` is 3).
- **Numbering:** front matter in lowercase roman (cover footer suppressed), body
  restarting at arabic 1. Footers and the running header are stamped with
  pdf-lib *after* the final print, because Chromium's own footer template can
  only produce a single arabic sequence.
- **Blank pages** ("página intencionalmente deixada em branco") are inserted so
  the body and each major part open on a recto page.
- **Exact-count validations:** the 80-page cap and the 2-page resumo cap are
  checked against the real page count, superseding the estimate for a paginated
  render. Results land on the session record (`artifacts.renderWarnings`,
  `renderedPageCount`).
- **Warnings are attributed per source file** ("Em «SIJ.docx»: …") via
  `withSourceFilename` — collected before the merge, while "which file" is
  still known.

Three invariants in `paginate.ts` are easy to break and were each a real bug:

1. The blank-page plan is the **absolute** set, not a delta. Feeding a plan's
   own blanks back must reproduce it (a fixed point). An incremental plan can
   only ever add blanks, so a reflow stacks a second one instead of moving the
   first — the loop then oscillates and emits two blanks in a row.
2. "Major part" is the **shallowest arabic heading level actually present**, not
   level 1. The merge demotes chapters to level 2, so testing `level === 1`
   silently disables part breaks and recto starts on exactly the multi-file
   documents this code exists for.
3. The body-start marker **carries the page break** that opens the body's page,
   and the first part heading deliberately gets none (or it would leave a page
   holding just the 1px marker). Without this the body shares the front
   matter's last page and an inserted blank shifts it by two pages, not one.

## Frontend

- **Flow:** landing → guided wizard (upload → especialidade → capa) → two-pane
  workspace. `SetupWizard.tsx` owns the flow; `Workspace.tsx` is the final step:
  left rail (warnings, summary, document/specialty/cover with jump-backs) and a
  dominant preview pane, with one anchored primary action (checkout, then
  download). Mobile collapses the rail and stacks the preview first.
- **Wizard progress is server-side** (`setupStep` on the session record,
  `POST /api/session/setup-step`), so a refresh restores the step.
  `src/lib/wizard/initialStep.ts` resolves the opening step (a paid session
  opens straight on the workspace).
- **PDF preview is a custom pdf.js viewer** (`src/components/pdf-viewer/`), not
  an iframe: own chrome (thumbnails, fit-width/fit-page/stepped zoom, "página x
  de y"), identical across browsers, retina re-render, off-screen bitmap
  release. `viewerMath.ts` holds the pure zoom/visibility math and is tested.
  **No download/print affordance on the watermarked preview**, and the viewer
  must never introduce a path to the clean PDF.
- **Design system:** `src/app/globals.css` mirrors the **Lauda** design system's
  `tokens.json` one-to-one (Plus Jakarta Sans + Instrument Serif; display
  weights are regular 400). Shared pill buttons/status lines live in
  `src/styles/controls.module.css` via `composes`. Icons are inline
  Lucide-style SVG, no dependency. No component may ship hardcoded colours.
  This replaced the earlier editorial/paper palette from DIO-37.
- **Hero:** `HeroRenders.tsx` shows real pages produced by our own pipeline for
  three **fictional** CVs. Regenerate with `node scripts/render-hero-samples.mts`
  (macOS: uses `sips`).

## Conventions

- **Language:** all user-facing copy is pt-PT. Code, comments, and commits in
  English. Informal register ("o teu currículo") — see DIO-18.
- **Secrets:** declared and read only in `src/lib/env.ts`. Never import that
  module into a client component. The repository is **public** — a committed key
  is a leaked key.
- **Privacy:** uploads may contain patient data. Nothing persists beyond the
  retention window (DIO-6, DIO-16). Never log document contents, and never add a
  debug path that writes an upload outside the session store.
  **Test fixtures are always synthesised** (`testFixtures.ts` in `formatting/`
  and `merge/`) — invented names and content. The real reference corpus holds
  patient and personal data and must never reach this repo.
- **Payment correctness is never-cut:** no charging without delivering, no
  delivering without charging. The Stripe webhook, not the browser redirect, is
  the source of truth for payment state.
- Run `npm run lint`, `npm run typecheck`, and `npm run build` before committing.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run lint       # eslint
npm run typecheck  # next typegen && tsc --noEmit
npm test           # node --test, files named *.test.mts
```

Tests are `.test.mts` and run on Node's built-in runner with native TypeScript
stripping — no test framework. They import siblings with an explicit `.ts`
extension because Node's ESM resolver does not do extension search.
Current baseline: **274 tests passing** on `main`. Some suites launch a real
local Chrome (`src/lib/pdf/*`), so they are slower than the rest.

## Sessions

`src/lib/session/` implements the ephemeral, account-free session (DIO-7).

**The browser holds a session id and nothing else.** Storage keys, payment state
and everything else live server-side in the record; a token is `<id>.<hmac>` and
asserts nothing. Adding a payload to the token would invalidate the "cannot read
another session" argument, so don't.

Record fields worth knowing: `sources[]` + `masterIndex` (multi-file order and
documento principal, DIO-40), `specialtyId`, `coverId`, `setupStep` (wizard
progress, DIO-37), `payment`, and `artifacts` (preview/final storage keys plus
`renderWarnings` and `renderedPageCount` from the last paginated render).
`upload?` is deprecated but still read as source 0.

`InMemorySessionStore` is dev/test only — it loses state on restart and is not
shared between instances, so the Stripe webhook and the student's browser could
disagree about whether a session was paid. Production uses `FirestoreSessionStore`
(DIO-21), same Firebase project and service account as the object store (DIO-6),
via the shared `src/lib/firebase-app.ts` helper. Session `expiresAt` is stored as
a Firestore `Timestamp` and collected by a native TTL policy (configured in the
GCP console, not the SDK) instead of a cron-driven purge — see DIO-16 for why the
*file* purge job is still needed regardless.

In `next dev`, RSC pages and route handlers get separate module graphs, so the
in-memory store singleton would be duplicated and refresh-restore silently fail.
`src/lib/session/index.ts` anchors the dev store on `globalThis` to prevent that;
production Firestore is unaffected and the `setSessionStore` test seam still works.

## Known issues / decisions still open

- **Upload caps are unconfirmed** (20 files / 60 MB / 20 MB) — PRD §12 Q1.
- **Heading-depth assignment**: automatic-with-override is implemented and the
  default; fully-manual is still a live product option — PRD §12 Q2.
- **Tables render without borders** today, visible in the hero samples (e.g. the
  internato table). Noted in PR #25; no ticket yet.
- **The merge path has only ever run against synthesised fixtures.** DIO-20
  should exercise it with a real multi-file corpus before launch.
- The PRD for the DIO-37…42 initiative is at
  `docs/prd-fe-overhaul-and-merge-pipeline.md`, including the cut order and the
  never-cut list.
