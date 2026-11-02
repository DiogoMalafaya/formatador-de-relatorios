# PRD: Frontend overhaul + multi-document merge pipeline

**0. Header**
- **Owner:** Diogo Malafaya
- **Status:** Draft
- **Stakeholders:** Diogo (product/eng); indirectly, medical interns preparing the Prova de Discussão Curricular
- **Last updated:** 2026-09-17 — initial version
- **Tier:** Full (revenue product; UX decisions are expensive to reverse once launched)
- **Sequencing:** This initiative precedes DIO-20 (formatting QA with real reports). QA against real
  CVs only makes sense once the product accepts real CVs — which are multi-file — and looks like
  something an intern would trust with €.

---

## 1. Working-backwards summary

An intern in their final internato year opens the site on the recommendation of a colleague. In
three guided steps they upload the twelve Word documents that make up their CV, drag them into
chapter order, pick their specialty and a cover. They land in a workspace that looks like a real
document tool: options on the left, a crisp, native-feeling paginated preview on the right — cover,
dedication, a regenerated Índice whose page numbers are actually correct, their name in the running
footer, roman numerals turning arabic exactly where the norms say. It looks like the signed PDF
they would otherwise spend a weekend assembling by hand in Word. They pay once and download it.
Nothing about the UI made them hesitate about whether the product was finished or trustworthy.

## 2. Problem & root cause

Two distinct problems, one initiative because they gate the same milestone (DIO-20 QA / launch):

**a) The product doesn't look finished, so it can't be trusted or tested.**
The UI is a single unstyled column of components with a bare `<iframe>` pointed at the preview
route. The iframe delegates rendering to the browser's built-in PDF viewer, so the centrepiece of
the product — the document — is framed by grey browser chrome that differs per browser/OS and
looks broken on mobile. Root cause: every ticket to date built *capability* (upload, rules,
render, pay); none built *product surface*. For a no-account, pay-per-use tool, the UI **is** the
trust signal — there is no brand, no reviews, no login relationship to fall back on.

**b) The upload model doesn't match how CVs are actually written.**
The pipeline assumes one `.docx` (`{sessionId}/upload.docx`, singular, hardcoded in the upload
route). Evidence: a real final CV (Volume I, 56 pages, MGF) is assembled from **12 separate Word
documents** — one master doc carrying cover/structure/dedication and 11 chapter docs (Saúde
Materna, SIJ, PF, DM, HTA, DRC, Saúde Mental, Prevenção Secundária, Comunidade, caracterização,
organização da consulta) — merged with a generated Índice, continuous pagination, roman-numeral
front matter, a running header with the candidate's name, and intentional blank pages for
double-sided printing. Root cause: the single-file assumption was a scaffolding simplification
that was never revisited against a real corpus. Asking users to merge in Word first outsources the
hardest, most error-prone step — the one the product exists to remove.

## 3. Goals & non-goals

**Goals (measurable):**
- G1 — A user can go from any number of source `.docx` files (one to the configured cap — the
  reference corpus happens to have 12) to a norm-compliant merged preview **without touching
  Word**: upload, order, merge, TOC, pagination, headers all in-product.
- G2 — The regenerated Índice page numbers match the rendered pages **exactly** (0 tolerance) on
  the reference corpus (the Mariana S. Oliveira Volume I set).
- G3 — Preview→checkout conversion is measurable and the funnel has no step with unexplained
  drop-off (instrumentation in place at launch; baseline collected in the first month).
- G4 — The preview renders with identical look and controls on Chrome, Safari, Firefox, and
  mobile Safari/Chrome (no browser-native PDF chrome anywhere).
- G5 — DIO-20 (real-report QA) becomes executable: the reference corpus round-trips through the
  product end-to-end.

**Non-goals:**
- Volumes II and III (comprovativos, trabalhos científicos) — separate numbered-file folders,
  out of scope; the product formats Volume I only.
- Digital signature of the output PDF (the reference file is signed; signing stays the user's step).
- Editing document *content* in-product — we format and assemble, we never rewrite text.
- Accounts, saved drafts across sessions, or collaboration.
- New rule sets for other Colégios (config stays ready for them; authoring them is separate work).
- Pricing changes — one price, one download, unchanged.

## 4. Stakeholders & alignment

- **Decider:** Diogo — approved on 2026-09-17: pdf.js custom viewer, wizard→workspace flow,
  generate-structure merge scope, editorial/paper visual direction (see §11).
- **Come-up-for-air checkpoint:** after Phase 1 (FE overhaul) ships and before merge-engine work
  starts, review the workspace with at least one real intern (or Diogo's own corpus) — the merge
  UI (ordering, master-doc designation) must be validated on someone who didn't build it.
- **Tickets:** created 2026-09-17 as DIO-37 … DIO-42 (build order 1/6 … 6/6, see §12). The CLI
  cannot set delegation or priority: priority is carried in the `[P0]` title prefix; Diogo must
  delegate the tickets to `claudecode` in the Linear UI before the agent can pick them up.

## 5. Users & scenarios

- **Primary — final-year intern, deadline-driven.** Has chapters as separate Word files written
  over months, inconsistent styles between them. Wants the assembled, compliant Volume I without
  fighting Word's section breaks, TOC fields and page-number restarts. Mobile-curious, desktop for
  the real run.
- **Secondary — early-internato intern.** Uploads one or two files mid-training to see what the
  final product will look like; may not pay yet. The free watermarked preview is the acquisition
  hook — it must look great.
- **Tertiary — orientador de formação.** Sees the output PDF, not the tool; the output's fidelity
  to the norms is what they judge.

## 6. Requirements

### Epic A — Product surface (Phase 1)

- **US1 — Guided setup wizard.** As a user I move through numbered steps — (1) upload,
  (2) specialty, (3) cover — with a visible stepper, one decision per screen, back-navigation that
  preserves state, and pt-PT microcopy in the informal register.
  - AC: each step validates before advancing; refresh restores the current step from session state;
    steps completed are revisitable from the workspace.
- **US2 — Two-pane workspace.** After the wizard I land in a workspace: left rail with formatting
  summary, warnings, document list and cover choice; right pane dominated by the preview; a single
  clear primary action (checkout / download) anchored and always visible.
  - AC: preview occupies ≥60% of viewport width on desktop; changing an option updates the preview
    without losing scroll position; on mobile the rail collapses and the preview stacks first.
- **US3 — Native-feeling PDF viewer (pdf.js).** As a user I see the document as rendered pages
  with our own chrome: page thumbnails, zoom (fit-width/fit-page/steps), page x/y indicator,
  smooth scroll — no browser PDF UI, no download/print buttons on the watermarked preview.
  - AC: identical controls and rendering across Chrome/Safari/Firefox + mobile; watermark visible
    on every page; viewer never exposes a direct URL that returns the clean PDF pre-payment.
- **US4 — Editorial design system.** Warm-neutral palette, ink-dark text, one restrained accent,
  serif display headings over a clean sans body; tokens defined once (CSS custom properties) and
  used by every component; consistent spacing, radii, focus states.
  - AC: no component ships hardcoded colors; light-mode-first with contrast ≥ WCAG AA; the
    existing pt-PT error/empty/loading states (DIO-18) restyled, not rewritten.
- **US5 — Landing/first impression.** The entry screen explains what the product does, for whom,
  and the price, in three beats, with a visual of the output document — before asking for a file.
  - AC: legal footer (DIO-19) integrated; patient-data notice visible before upload.

### Epic B — Multi-document pipeline (Phase 2)

- **US6 — Multi-file upload with ordering.** As a user I upload up to N `.docx` files (N≥15),
  see them as a reorderable list (drag on desktop, buttons on mobile), and mark one as the
  **documento principal** (source of cover/dedication/front matter).
  - AC: per-file validation with pt-PT errors; combined size cap enforced; order and
    master-designation persist in the session record server-side; storage keys become
    `{sessionId}/source/{index}.docx` (purge job updated to match).
- **US7 — Merge engine.** The pipeline concatenates the ordered documents into one semantic HTML
  document before rule-set CSS is applied, normalising heading levels so each file slots into the
  section hierarchy (a file whose top heading is "SAÚDE MATERNA" becomes a subsection at its
  assigned depth, not a new H1).
  - AC: reference corpus merges without lost content (tables, lists, images-flagged-forbidden all
    surface in warnings as today); heading normalisation is deterministic and covered by tests on
    corpus-derived fixtures.
- **US8 — Generated Índice.** The product regenerates the table of contents from the merged
  heading tree, with dotted leaders and page numbers taken from the actual render.
  - AC: TOC page numbers match rendered pages exactly (G2); TOC respects the numbering scheme
    (front matter roman, body arabic); user's stale TOC in the master doc is detected and replaced,
    with a warning noting the replacement.
- **US9 — Compliant pagination & running furniture.** Front matter (cover, structure page,
  dedication, TOC) numbers in roman; body restarts at arabic 1; footer carries candidate name +
  page number per the norms; optional running header with section reference; blank pages inserted
  where double-sided printing requires a recto start ("página intencionalmente deixada em branco").
  - AC: two-pass render (render → extract page map → inject TOC/numbers → final render) completes
    within serverless limits for an 80-page document; the 80-page and 2-page-resumo validations run
    against the *merged* document.
- **US10 — Cross-document warnings.** Formatting summary and warnings (DIO-17/18) aggregate
  across all source files and attribute each finding to its source document by name.
  - AC: a warning like "imagem removida" names the file it came from.

## 7. Architecture / data-flow

```
N × .docx ──upload──► object store {sessionId}/source/{i}.docx
                              │
        session record: order[], masterIndex, specialty, coverChoice
                              │
                    ┌── merge service ──┐
                    │ parse each docx → semantic HTML fragments
                    │ normalise heading tree → single document
                    │ split front matter (from master) / body
                    └──────────┬────────┘
                               ▼
                rule-set CSS (per Colégio) + cover template
                               ▼
              Chromium printToPDF — pass 1 (page map)
                               ▼
              inject Índice + roman/arabic numbering + blanks
                               ▼
              Chromium printToPDF — pass 2 (final)
                     ▼                      ▼
         watermarked preview PDF      clean PDF (post-payment)
                     ▼                      ▼
        pdf.js viewer in workspace    download route (webhook-gated)
```

Client boundary unchanged: browser holds the session token only; ordering and master-designation
are session-record state, never client-asserted at render time.

## 8. Constraints

- All Colégio norms remain hard constraints on output (fonts, 12pt, 1.5 spacing, 2.5cm margins,
  A4, footer format, 80-page max, no photos/graphics, tables only for casuística).
- Uploads may contain patient data: multi-file store must stay inside the session prefix, inside
  the existing TTL/purge regime; no new logging of document content.
- Vercel serverless limits bound the two-pass render; if an 80-page double render can't fit one
  invocation, split passes across invocations with intermediate state in the object store — never
  in the client.
- Payment correctness is never-cut: webhook remains the source of truth; the pdf.js viewer must
  not create a new unauthenticated path to the clean PDF.
- pt-PT informal register everywhere; code/comments/commits in English.
- No accounts; nothing added to the session token payload.

## 9. Cut order / never-cut

Cut first → last:
1. Page thumbnails sidebar in the viewer (keep zoom + page indicator).
2. Running section header (optional in the norms anyway).
3. Automatic blank-page insertion (warn instead: "impressão frente e verso pode exigir páginas em branco").
4. Drag-to-reorder (fall back to up/down buttons only).
5. Landing-page polish beyond the three-beat explainer.

Never cut: watermark integrity pre-payment; webhook-gated download; TOC page-number correctness
(a wrong Índice is worse than no product — it's the exact failure the intern fears); purge
coverage of every stored source file; norm compliance of the output.

## 10. Quick-wins scan

- **Fold in:** persist wizard/session UI state so refresh doesn't lose progress — cheap, serves
  US1 directly, and the session record already exists to carry it.
- **Fold in:** name each uploaded file in the formatting summary (serves US10 with trivial extra
  plumbing once multi-file lands).
- **Defer:** basic funnel analytics events (upload/preview/checkout) — serves G3; small, but it's
  its own concern → backlog ticket alongside Phase 1.
- **Drop:** auto-detecting chapter order from filenames — tempting, unreliable across real-world
  naming ("SIJ.docx", "CV.MO. sem dedicatoria 2501.docx"), and manual ordering is already required
  UI.

## 11. Decision log

| Date | Decision | Why | Rejected |
|---|---|---|---|
| 2026-09-17 | Custom pdf.js viewer | Native feel, identical cross-browser, own watermark/chrome control | Browser iframe (inconsistent, "awful"); server page-images (bandwidth, no selection, more moving parts) |
| 2026-09-17 | Wizard → two-pane workspace | One decision per step for setup; preview permanently visible where decisions get revisited | Full multi-screen wizard (cramped preview); redesigned single page (no guidance) |
| 2026-09-17 | Generate structure (TOC, pagination, headers, blanks); cover/dedication from master doc or templates | A merge-only MVP ships wrong TOC numbers — undermines the core promise | Merge-only; keeping single-file as primary |
| 2026-09-17 | Editorial/paper visual direction | Echoes the artefact the product produces; professional + friendly without reading as hospital portal or generic SaaS | Clinical teal; modern-SaaS indigo |
| 2026-09-17 | FE overhaul (Phase 1) before merge pipeline (Phase 2) | Diogo's call: product must look finished before it's testable; Phase 1 has no dependency on Phase 2 | Parallel tracks (single developer; workspace layout shapes merge UI) |

## 12. Open questions

| # | Question | Owner | Needed by |
|---|---|---|---|
| 1 | Max source-file count and combined size cap (proposal: 20 files / 60 MB combined)? | Diogo | before US6 build |
| 2 | Should heading-depth assignment be automatic-with-override, or fully manual per file? (Proposal: infer from master doc's Índice when present, let user adjust.) | Diogo | before US7 build |
| 3 | Does the price change now that the product does assembly, not just formatting? (§3 says no for launch — confirm.) | Diogo | before launch |
| 4 | ~~Ticket split~~ Done — created 2026-09-17: DIO-37 (1/6 design system + landing + wizard), DIO-38 (2/6 workspace), DIO-39 (3/6 pdf.js viewer), DIO-40 (4/6 multi-file upload + ordering), DIO-41 (5/6 merge engine + Índice), DIO-42 (6/6 pagination + furniture + cross-doc warnings). Remaining: delegate them to `claudecode` in the Linear UI. | Diogo | before build starts |
| 5 | Reference corpus licensing/consent: the Mariana S. Oliveira set contains personal data — fine as private local fixtures, but confirm it never lands in the public repo (fixtures must be synthesised from its *structure*, not its content). | Diogo | before US7 tests |
