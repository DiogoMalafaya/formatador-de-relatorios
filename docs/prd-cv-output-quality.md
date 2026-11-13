# PRD: CV output quality — norm-aware, polished design

**0. Header**
- **Owner:** Diogo Malafaya
- **Status:** Draft
- **Stakeholders:** Diogo (product/eng); medical interns preparing the Prova de Discussão
  Curricular in the six launch specialties; indirectly, the júris who score the CV
- **Last updated:** 2026-11-13 — launch set is Anestesiologia, Cirurgia Geral, MFR, Oftalmologia,
  Ortopedia, Pediatria; student images now preserved unless the norms forbid them; Q1/Q2/Q5
  answered. (2026-11-10: initial version.)
- **Tier:** Full (revenue product; the output *is* the product, and design decisions baked into
  norm profiles are expensive to unwind once students have paid for and submitted CVs)
- **Inputs:** [`docs/output-quality-review.md`](output-quality-review.md) (designer CVs vs. our
  render, 2026-11-10); the Ordem dos Médicos' Colégio pages (retrieved 2026-11-10 and 2026-11-13,
  see §2c)
- **Sequencing:** follows the DIO-37…42 initiative (merged). Precedes DIO-20 (QA + launch): there
  is no point QA'ing output we already know looks unfinished.

---

## 1. Working-backwards summary

A Cirurgia Geral intern uploads the dozen Word files of their CV and picks *Cirurgia Geral*, one
of six specialties Lauda supports; the dropdown only shows those six. They pick a theme. The
preview looks like the CV a colleague paid a designer for: a confident cover in a display face, a
proper title page with signature lines for the orientador and the diretor de serviço, numbered
chapters that each open on a right-hand page behind a divider, compact tables with a filled header
row, the operative diagrams and service logos they pasted into Word placed and captioned cleanly,
a *Lista de tabelas* and *Lista de figuras*, justified text, page numbers on the outer edge. Their
friend in MFR gets the same craft in a stricter form: white cover, black text, Times New Roman
12pt, at most 100 pages, no photographs, because MFR's Colégio publishes norms and Lauda follows
them exactly. A Pediatria friend gets Verdana 10pt and a warning when the *Síntese curricular* runs
past its three-page limit. Each student sees which rules their CV follows and where they come
from. None of them opens Word again.

## 2. Problem & root cause

**a) The output looks like a Word default, so it can't be sold.**
Evidence (review, §3): our render is black Arial, ragged-right, with no section numbering, no
dividers, borderless tables with no cell padding, three front-matter sections crammed onto one
page, and a cover that is three lines of text. The three designer-made reference CVs (Anestesiologia,
Cirurgia Geral and Ortopedia, all three launch specialties) share a vocabulary we have
none of: hierarchical numbering, chapter dividers on recto pages, filler pages, filled table
headers, captions, glossary-style abbreviation lists, and mirrored page numbers. Presentation is
graded directly: Cirurgia Geral's final-exam grid awards **0–1 valor for "Apresentação e
organização do Curriculum Vitæ"**, and Pediatria's awards **0–1 for "Organização e capacidade de
estruturação do documento curricular"**. Interns already pay designers for this.
Root cause: every ticket so far encoded **Secção A parameters** (font, size, margins) and nothing
else. There is no design system, no layout primitives beyond "paragraph, heading, table", and no
concept of *what a specialty permits* as distinct from *what it requires*.

**b) Our specialty model doesn't match reality.**
The dropdown lists all 48 specialties, and every one silently gets the MFR rules (the `generic`
rule set *is* MFR). This promises compliance we can't vouch for, and it imposes MFR's restrictions
(no colour, no graphics, Arial/TNR 12) on specialties whose rules differ, e.g. Pediatria (Verdana
10). Root cause: decision D1 ("everything resolves to generic at launch") was a scaffolding
shortcut that was never revisited.

**c) What the Colégios actually publish** (each specialty page → *Internato* → *Currículo*):

| Specialty | Published CV guidance | Implication |
|---|---|---|
| **Medicina Física e de Reabilitação** | Explicit norms (`Normas_CV_MFR_final.pdf`, 2013) **plus an amendment approved 3.12.2018 raising the page cap from 80 to 100**. Arial or TNR 12pt black, titles bold 12/14, 1.5 spacing, 2.5 cm margins, A4 white, duplex, spiral-bound; footer = name + page number only; sequential numbering; **no photographs or graphics**; tables only for activity schematisation; white cover with four fields; title page signed by orientador + diretor; last page signed by candidate | Strict profile. **Our rule set still enforces 80, so it's wrong today.** |
| **Pediatria** | Explicit recommendations (`pediatria-recomendacoes-elaboracao-cv.pdf`, approved 20.7.2018, in force from 2021): **Verdana 10pt, justified, 1.5 spacing, margins 2.5 cm top/bottom and 3 cm left/right**, A4; a 17-section order (rosto, siglas, índice, identificação, … agradecimentos, considerações finais, anexos as a separate volume) with **page caps per section** (síntese curricular ≤ 3 pp; instituição ≤ 3 pp; ≤ 2 pp per 3 months of each estágio; contributo ≤ 2 pp; agradecimentos ≤ 1 p; considerações finais ≤ 2 pp); prescribed summary table for scientific activity; Vancouver citations; **submitted electronically as PDF** (Portaria 79/2018, art. 70.º). Silent on colour, images, footer, overall page cap | Explicit profile for what it states; free where it's silent |
| **Oftalmologia** | An official **CV template** (`.docx`): fixed section tree, character limits per section, ~35 pre-built tables with grey header fills, a *Índice de quadros* and *Índice de figuras*, 2.5 cm margins, header "NOME \| CURRICULUM VITAE", footer with the internato name + page number. No stated font/colour rules (template uses Calibri 11 and Word's default blue headings) | Template profile: structure + limits are guidance, visual freedom within the template's spirit |
| **Anestesiologia** | None (the internato page holds idoneidade, estágio and Hospital Grupo I documents only) | Lauda house standard (§6.2) |
| **Cirurgia Geral** | None (only the evaluation grid; the "Normas" page holds clinical NOCs) | Lauda house standard (§6.2) |
| **Ortopedia** | None (the evaluation grid scores surgical volume and its distribution by anatomical region; the "Normas" page holds clinical NOCs) | Lauda house standard (§6.2); casuística tables by anatomical region matter most |

**d) Engine defects compound the visual problem** (review §1): content placed after the master's
Índice collapses the chapter structure (no chapter breaks, a stuck running header), the source
cover text is printed twice, tables have no padding and don't repeat their header row, and there
are no `@font-face` rules, so serverless Chromium (no Arial or Times New Roman installed) almost
certainly substitutes the fonts the norms mandate. Images are currently only *warned about*; how
they're placed and sized in the output has never been designed.

## 3. Goals & non-goals

**Goals (measurable):**
- **G1 — Looks professionally designed.** In a blind side-by-side of our render vs. a designer CV
  (same fictional content), ≥ 4 of 5 reviewers (interns / recent specialists) say they'd submit
  ours as-is. Run on the house standard (Cirurgia Geral) and on MFR.
- **G2 — Zero norm violations where norms exist.** An automated compliance check over the rendered
  PDF (embedded fonts, sizes, colour, margins, footer content, page cap, cover content, forbidden
  images) passes for MFR and Pediatria across the golden corpus. Any violation fails CI.
- **G3 — Every supported specialty has a sourced norm profile:** URL, retrieval date, document
  version, and type (explicit / template / none). No profile is invented from memory.
- **G4 — Structural correctness:** the review's engine bugs 1.1–1.7 each have a regression test,
  and every chapter of the golden multi-file corpus opens on a recto page with a correct running
  header.
- **G5 — Honest catalogue:** the specialty dropdown lists exactly the supported specialties
  (launch: 6).
- **G6 — Content fidelity:** every image in the student's sources appears in the output, unless
  the profile forbids it. Each removal is listed by name in the warnings.

**Non-goals:**
- Charts or graphics *generated by Lauda* (e.g. from casuística tables). Charts the student
  already has in their documents are content and follow G6.
- Volume II / annex assembly (scanned comprovativos). The "(Doc. N)" references stay plain text.
- Rewriting or restructuring the student's *content*: no AI rewording, no inventing sections. We
  restyle and reorganise layout only. (Card layouts for course lists are an open question, Q6.)
- Enforcing Secção B/C or Pediatria's section *order* beyond warnings.
- Specialties beyond the six. The profile mechanism must make adding one a config + sourcing task.
- Stock imagery added by Lauda (photos, illustrations, icons) in any theme.

## 4. Stakeholders & alignment

| Who | Signs off on | When |
|---|---|---|
| Diogo | This PRD; the house standard (§6.2); theme direction | Before US3+ tickets are cut |
| 3–6 interns / recent specialists, ideally one per launch specialty (Q3) | Blind review for G1; "would a jury accept this?" | Discovery checkpoint + before launch |
| Designer (optional, Q4) | Token values for the house theme(s) and cover layouts | Before US8–US11 |

**Discovery checkpoint ("come up for air"):** after US1–US4 land (correctness + profiles + catalogue
+ fonts), render the golden corpus with the first house theme and run a 3-person informal review
*before* building dividers, card layouts or extra themes. If reviewers already rate it
"submittable", cut scope from §9's cut list instead of adding polish.

## 5. Users & scenarios

- **S1 — Strict-norm student (MFR).** Needs certainty first: Arial/TNR 12pt, black, ≤ 100 pages,
  white cover with the four required fields, title page with both signatures, candidate signature
  last, no photographs or graphics. Polish comes from structure, rhythm and table craft, not colour.
- **S2 — Partly-specified student (Pediatria).** Verdana 10, specific margins, a prescribed section
  order with page caps. Free on colour and images. Submits a PDF file, not a printed copy.
- **S3 — Template student (Oftalmologia).** Already wrote into the Colégio's template; wants it to
  look finished without losing the template's structure. Wants a warning when a section exceeds its
  character limit.
- **S4 — No-norm student (Anestesiologia, Cirurgia Geral, Ortopedia).** Wants the designer look colleagues paid for: colour
  accent, dividers, styled tables, an expressive cover, and their own figures kept.
- **S5 — Student from an unsupported specialty.** Doesn't see their specialty; should get a clear
  "ainda não disponível" path (Q8), not a CV formatted to the wrong norms.

## 6. Requirements

### 6.1 User stories

**US1 — Supported-specialty catalogue.**
- The dropdown shows only specialties with a norm profile (launch: Anestesiologia, Cirurgia Geral,
  Medicina Física e de Reabilitação, Oftalmologia, Ortopedia, Pediatria), alphabetical, names exactly as the Ordem publishes them.
- A session whose stored `specialtyId` is no longer supported can't render silently with another
  profile; it's sent back to the specialty step with a pt-PT explanation.
- The landing/wizard copy says which specialties are supported.

**US2 — Sourced norm profiles.**
- Each supported specialty maps to one profile with: `kind` (`explicit` | `template` | `none`),
  source URL(s), retrieval date, document version/date, the constraints it imposes, and **what it is
  silent on** (silence = the house standard applies for that dimension).
- MFR profile = 2013 norms + the 3.12.2018 amendment (**page cap 100**; pós-graduações may sit under
  Atividade Científica §8).
- Pediatria profile = Verdana 10, justified, 1.5, margins 2.5/3 cm; section order and per-section
  page caps as *warnings*; delivery = PDF (affects US7).
- Oftalmologia profile carries the template's section tree and per-section character limits as
  *warnings*.
- `none` profiles resolve entirely to the Lauda house standard (§6.2).
- The workspace shows the profile in plain pt-PT: "Segue as normas do Colégio de MFR (2013,
  alteradas em 2018)" / "O Colégio não publica normas de formatação — aplicámos o padrão Lauda."

**US3 — Engine correctness** (the review's §1).
- Content after the master's Índice is classified correctly: front matter (abreviaturas, siglas,
  listas, nota prévia, agradecimentos) vs. body. Chapter level is independent of it, so every
  chapter gets a part break and the running header follows the current chapter.
- The source document's own cover text is detected and not reprinted.
- Each front-matter element starts on its own page (Índice on a recto).
- Chapter titles get one consistent case per theme, in the headings and the Índice.
- Each fix has a regression test against synthesised fixtures shaped like the reference corpus.

**US4 — Fonts are real (open fonts only).**
- Every font a profile allows or a theme uses is **embedded** via `@font-face` from open-licence
  files we ship (OFL/Apache). Arial → Arimo or Liberation Sans; Times New Roman → Tinos or
  Liberation Serif: metric-compatible, so line breaks and page counts match the originals.
- **Verdana (Pediatria) has no metric-compatible open equivalent.** Choose a lookalike and accept
  different metrics, or treat it as the one exception (Q2b).
- Covers may use a **display face** distinct from the body font where the profile doesn't fix the
  font for the whole document (Q2a).
- The compliance check (US12) reads the embedded font names from the output PDF.
- Students can actually choose the font family and title size where the norms offer a choice
  (today `prepareDocument` never passes the choice, so it's always TNR/14).

**US5 — Front matter that matches the norms and the genre.**
- Generated **cover** with name, "Curriculum Vitae", specialty/internato, **local de formação**
  (hospital + city), and date. New wizard fields as needed.
- Generated **página de rosto**: name, exam designation ("Exame final de habilitação ao grau de
  Especialista em …"), and signature blocks for **Orientador de Formação** and **Diretor do
  Serviço** where the profile requires them (MFR); optional elsewhere.
- A **candidate signature block** on the last page (MFR).
- Generated **Lista de tabelas** and **Lista de figuras** from captions. The abbreviations list is
  rendered as a glossary (term / expansion, optionally two columns grouped by letter).
- Optional epigraph/dedication page when the master has one (recto, alone on its page).

**US6 — Numbering and the Índice.**
- Automatic hierarchical numbering (decimal default, e.g. `3.2.1`; roman chapters as a theme
  option), shown in headings and the Índice.
- Manual numbers already typed by the student ("3.1. Formação") are detected and stripped before
  ours are applied, so no "3.1. 3.1.".
- The Índice is styled by level (chapter vs. section vs. subsection) with a configurable depth
  (default 3).

**US7 — Chapter openers, recto starts and filler pages.**
- Each chapter opens on a recto page. Optional **divider page** (number + title, theme-styled; in
  the house theme optionally with a colour verso).
- **Filler pages are truly blank**: no text, no footer, no page number printed. They still count in
  the page sequence and toward the page total.
- Recto starts and filler pages are on by default for print-delivered profiles (MFR: duplex,
  spiral-bound). For **PDF-delivered profiles (Pediatria)** the default is off, since blank pages in
  an on-screen PDF read as errors (Q12).
- The workspace shows a live **page budget** (e.g. "84 / 100 páginas"). Turning dividers on/off
  shows the cost before render; exceeding a profile's cap is a blocking warning.

**US8 — Tables.**
- Theme table style: filled header row (grey in strict profiles, accent colour where allowed),
  compact rows (~1.15 line height, real cell padding), numeric columns aligned, bold "Total" row,
  light row separators or zebra fill, full text width.
- Header row repeats on every page; short tables (≤ ~12 rows) don't split.
- Captions above ("Tabela N. …") feed the Lista de tabelas; legends/notes below in small type.
- Merged cells (`rowspan`/`colspan`) survive the pipeline (verify mammoth; fix if not).
- Wide tables: column-width heuristic first; rotated header text as a later option.

**US9 — Body typography.**
- Justified text with pt-PT hyphenation; paragraph spacing reduced from a blank line to ~0.4–0.6em
  (or first-line indent per theme); list items without blank lines between them.
- "Label: value" lines (Identificação, course entries) render the label in bold.
- Explicit profiles keep the norm's size/line spacing exactly; the house standard uses its own
  scale (§6.2).

**US10 — Header, footer and page numbers.**
- **One arabic sequence from the cover** for every profile. The cover is page 1 and counts, but
  shows no number. Blank filler pages show nothing. Every other page shows its number. This replaces
  today's roman front matter + arabic body (DIO-42), and also satisfies MFR's "numeração sequencial".
- Mirrored layout for print profiles: page number on the outer edge, name on the inner side,
  hairline rule. PDF-delivered profiles may use a non-mirrored layout.
- Footer content is exactly what the profile allows (MFR: name + number, nothing else).
- Running header (section reference) on the outer side, or an outer-edge chapter tab where the
  profile allows a header (Q7).

**US11 — Themes and covers.**
- A theme is a set of design tokens (type, scale, colour, table style, image style, cover layout,
  divider style). A profile **constrains** tokens (allowed fonts, sizes, colour on/off, cover colour
  on/off). A constrained theme degrades to a compliant variant automatically, never to a violation.
- Launch: ≥ 2 house themes (e.g. a sober serif and a modern sans) each with a strict-mode variant;
  ≥ 3 cover layouts per mode.
- **Covers can be expressive**: display typefaces, large type, rules, colour fields. Colour covers
  only where the profile allows colour (not MFR). Display faces only where the profile doesn't fix
  the font (Q2a). Covers are typographic: no stock imagery.

**US12 — Images, logos and illustrations from the sources.**
- Every image in the uploaded documents is carried into the output **unless the profile forbids
  it**. Charts, diagrams, logos, photographs and illustrations all count as images.
- Placement follows the source position; images are scaled to the text width (never upscaled past
  their resolution), kept with their caption, and never split across pages.
- Captions: a source caption is kept; otherwise "Figura N." is offered. Captioned images feed the
  Lista de figuras (US5).
- Low-resolution images (below ~150 dpi at the placed size) produce a warning naming the file and
  page.
- **Where the profile forbids images (MFR: photographs and graphics)**, they're left out of the
  output, and every omission is listed in the warnings ("Em «Capítulo 3.docx»: removida 1 imagem —
  as normas de MFR não permitem fotografias ou gráficos"). The preview shows a placeholder where each
  was, so the student can see what went. Nothing is dropped silently.
- Images inside tables survive as well.

**US13 — Quality gate.**
- **Golden corpus:** synthesised multi-file CVs (one per launch specialty, shaped like the examples:
  master + ~10 chapters, abbreviations after the Índice, large casuística tables, long course lists,
  embedded synthetic images and a logo-like graphic). Never real data.
- **Visual regression:** rendering the corpus produces page images compared against approved
  baselines, so a design change is a reviewed diff.
- **Compliance check:** a PDF-level checker per profile (embedded fonts, min/max sizes, text colour,
  margins via text bounding boxes, footer content, page count, cover fields, images present/absent
  as allowed). It runs in CI and on each real render (results land in `renderWarnings`).

### 6.2 The Lauda house standard

Applies in full to `none` profiles (launch: Anestesiologia, Cirurgia Geral, Ortopedia), and to any dimension an `explicit` or
`template` profile is silent on (e.g. colour and images for Pediatria). It's deliberately
**conservative on the things all known norms agree on** and **free on the things that make a CV
look designed**. Values are targets for the first theme. A designer may tune them within these
bounds (Q4).

| Area | House standard | Why |
|---|---|---|
| Page | A4, white, duplex, mirrored margins 2.5 cm outer / 3 cm inner (binding) | MFR norms require spiral binding and duplex; every example is duplex |
| Body type | One open-licence text family (sans or serif), **11–12pt**, line height 1.4–1.5, justified, hyphenated | Readable; within what examples use; avoids the 9pt extreme |
| Headings | Bold or semibold, **may use one accent colour**, numbered, scale ≤ 1.6× body for H1 (dividers excepted) | Colour is the strongest hierarchy cue in the examples |
| Colour | **One accent + neutrals.** Accent for headings, table headers, rules, dividers. Body text always black/near-black | Restraint reads as professional; avoids a "template" look |
| Tables | Accent or grey filled header, white header text on accent, 9.5–10pt, padded cells, captions + legends | The examples' strongest visual asset |
| Images | Kept, scaled to text width, captioned "Figura N.", never split | Fidelity to the student's content (G6) |
| Chapter openers | Divider page on recto (numeral + title); verso truly blank or accent-filled | Present in all three examples |
| Cover | Expressive: display typeface, colour field allowed; typographic (no stock imagery) | Polish without licensing or likeness risk |
| Footer | Name + page number (outer edge); nothing else | Keeps the one rule we know juries already expect |
| Header | Optional section reference or outer-edge chapter tab | Matches the examples; compatible with MFR's "referência à secção" |
| Numbering | One arabic sequence from the cover; nothing printed on the cover or on blanks | Decision 2026-11-13 |
| Page cap | No hard cap; soft warning above 100 pages | No published limit; the largest published one (MFR) is 100 |

## 7. Architecture / data-flow

```
Colégio sources (URL, date, version) ──► Norm profile  {kind, constraints, silences,
                                                         structure, limits, delivery}
                                                │
Specialty catalogue (supported only) ──► session.specialtyId ──► profile
                                                │
           Theme (design tokens) ──► constrain(theme, profile ∪ house standard) ──► effective tokens
                                                │
N × .docx ─► parse (text + images) ─► front-matter classification ─► merge (chapters, numbering)
                                                │       ─► semantic model (tables w/ captions, figures,
                                                ▼          glossary, label/value lines, dividers)
             image policy (keep | omit + warn per image) ◄── profile
                                                ▼
                   CSS from effective tokens + @font-face (shipped open fonts)
                                                ▼
   generated cover + rosto + signature pages ─► two-pass Chromium render ─► page map ─► Índice /
                                                │                          lists / blanks / dividers
                                                ▼
               pdf-lib stamping (one arabic sequence; mirrored when print-delivered)
                                                ▼
          compliance check (profile vs. PDF) ──► renderWarnings ──► workspace (page budget, status)
                                                ▼
                         watermarked preview / clean PDF (unchanged gating)
```

HOW lives in the tickets/SPECs. Expected touch points: `formatting/ruleSet.ts` (becomes norm
profiles), `specialties/data.ts`, `formatting/parseDocx.ts` (image extraction), `merge/merge.ts`
(front-matter classification), `formatting/styles.ts` (tokens → CSS), `covers/`, `pdf/paginate.ts` +
`renderPaginated.ts` (dividers, numbering scheme, stamping), plus a new `compliance/` module.

## 8. Constraints

- **Where a Colégio publishes a rule, it wins over any theme.** No option, toggle or theme may
  produce a violation of a stated rule. Strict mode is the only mode for those dimensions.
- **Profiles are sourced, never invented.** Each carries a citation. Changing a profile is a reviewed
  config change with a new retrieval date.
- **Open-licence fonts only** (OFL/Apache), shipped in the repo and embedded server-side. The
  commercial faces in the examples (Avenir, Gotham, DIN, Minion) are out.
- **Privacy unchanged:** test fixtures (including images) are synthesised; the real examples stay in
  the gitignored `examples/`. No real CV content is committed, nor any visual baseline derived from
  one. Uploaded images are subject to the same retention window as the documents, and are never
  logged.
- **Payment correctness unchanged:** no design work may change preview/clean gating.
- **The two-pass invariants in `CLAUDE.md` stay true.** Dividers and recto starts extend the
  blank-page plan; they must keep it absolute and a fixed point. The numbering change (arabic from
  the cover) replaces the roman/arabic split those invariants currently assume; update
  `CLAUDE.md` with it.
- **Render budget:** Vercel function limits. Images, fonts and extra passes must keep a ~100-page
  render within the current timeout envelope.
- pt-PT copy, informal register.

## 9. Cut order / never-cut

**Never cut:**
1. Engine correctness (US3) and real embedded fonts (US4).
2. Compliance with every stated rule of MFR and Pediatria, including MFR's 100-page cap and the
   required cover/rosto/signature content (US2, US5 required parts).
3. Honest catalogue (US1).
4. Image fidelity, and no silent removals (US12, keep/omit + per-image warnings).
5. The compliance check for explicit rules (US13, compliance part).

**Cut first → last under pressure:**
1. Rotated table headers; glossary two-column layout.
2. Additional themes beyond one (keep one theme + its strict variant).
3. Colour-verso dividers (keep white dividers).
4. Low-resolution image warnings; Lista de figuras.
5. Oftalmologia character-limit and Pediatria page-cap warnings (keep the profiles; drop the
   checkers).
6. Visual-regression baselines (keep the compliance check; review renders manually).
7. Dividers entirely (keep recto starts + numbering).

## 10. Quick-wins scan

| Win | Route | Why |
|---|---|---|
| MFR page cap 80 → 100 (one config value + test) | **Fold in** (US2) | Correctness bug against the published amendment; trivial |
| Table cell padding + `thead { display: table-header-group }` + row line-height | **Fold in** (US8, first ticket) | Two CSS rules fix the worst-looking defect in the render |
| Pass the student's font/title-size choice through `prepareDocument` | **Fold in** (US4) | The option exists in the engine and is silently ignored |
| "Avisa-me quando a minha especialidade estiver disponível" email capture | **Defer** | Useful demand signal; needs a store + consent copy; not about output quality |

## 11. Decision log

| Date | Decision | Why | Alternatives rejected |
|---|---|---|---|
| 2026-11-13 | Launch with **6 specialties: Anestesiologia, Cirurgia Geral, MFR, Oftalmologia, Ortopedia, Pediatria**; hide the rest | User decision: the three with designer reference CVs, plus MFR, Oftalmologia and Pediatria. Honest catalogue beats a silent wrong rule set | Keep 48 on generic (misleading) |
| 2026-11-10 | Norm profiles have a `kind`: explicit / template / none, and record what they're silent on | The Ordem publishes three different things, and explicit ones (Pediatria) still leave dimensions open | Treat the template as norms (over-constrains); treat silence as forbidden (needlessly austere) |
| 2026-11-10 | Specialties without norms use a Lauda house standard defined here | User decision | Default them to MFR (imposes restrictions that don't apply) |
| 2026-11-10 | Themes are constrained by profiles, never the reverse | Stated norms are the product's credibility | Let students override stated rules with a warning |
| 2026-11-13 | **Student images are kept** unless the profile forbids them. Where forbidden, they're omitted *with a per-image warning and preview placeholder* | User decision. Fidelity to content; forbidden images must not reach the jury; no silent loss | Always keep + warn (DIO-10's default, now superseded: violates MFR); strip silently |
| 2026-11-13 | **One arabic page sequence from the cover**, nothing printed on cover/blanks | User decision (Q1). Matches MFR's "numeração sequencial" and two of three examples | Roman front matter + arabic body (DIO-42) |
| 2026-11-13 | **Open fonts only**; metric-compatible substitutes for Arial/TNR | User decision (Q2). Licensing in a public repo; identical metrics | Licensing the Microsoft originals |
| 2026-11-13 | **Filler pages are truly blank** | User decision (Q5). Matches the examples | "Página intencionalmente deixada em branco" |
| 2026-11-10 | No charts or stock imagery *generated or added by Lauda* | Not needed for polish; MFR forbids graphics; likeness/licensing risk | Generate charts from casuística (future initiative) |
| 2026-11-10 | Restyle, don't rewrite content | Trust; scope | AI restructuring of sections |

## 12. Open questions

| # | Question | Owner | Needed by |
|---|---|---|---|
| Q2a | **Cover display fonts under explicit font rules.** MFR's font rule ("Letra do tipo Arial ou Times New Roman") governs "a formatação do currículo" as a whole, and its cover paragraph doesn't override it; Pediatria's Verdana rule is document-wide. Expressive cover fonts: only for the profiles that don't fix a font, i.e. Anestesiologia, Cirurgia Geral, Oftalmologia and Ortopedia (recommended)? Or also MFR/Pediatria as an opt-in with a warning? | Diogo | Before US11 |
| Q2b | **Verdana for Pediatria:** no open metric-compatible equivalent exists. Use the closest open lookalike (different metrics, different name in the PDF), or make Verdana the single licensed exception? | Diogo | Before US4 |
| Q3 | **Reviewers for G1:** who are the 3–5 interns/recent specialists for the blind review (ideally one per launch specialty)? | Diogo | Discovery checkpoint |
| Q4 | **Designer:** hire one to set the house-theme tokens and cover layouts, or design in-house from the review? | Diogo | Before US11 |
| Q6 | **Card layout for course/congress lists** (one example's best feature): worth a detection heuristic, or out of scope as "restructuring"? | Diogo | Before US9 |
| Q7 | **Outer-edge chapter tabs:** acceptable as MFR's "cabeçalho com referência à secção", or house-standard only? | Diogo | Before US10 |
| Q8 | **Unsupported specialties:** hide silently, show "brevemente" disabled entries, or capture an email? | Diogo | Before US1 |
| Q9 | For **template** (Oftalmologia) and **none** profiles: may a student opt out of a theme constraint (e.g. smaller table text) with a warning? | Diogo | Before US11 |
| Q10 | **Signatures:** empty lines for wet signatures only, or allow an uploaded signature image? Under MFR a signature isn't a photograph or graphic, but the image policy must treat it as an exception explicitly | Diogo | Before US5 |
| Q11 | **Re-verify sources before launch:** the Ordem site moves files (Ortopedia's links point at a `staging.` host, and filenames use decomposed accents). Who re-checks profile sources, and how often? | Diogo | Before launch |
| Q12 | **PDF-delivered profiles (Pediatria):** blank recto-padding pages off by default (recommended), or keep print layout because students print anyway? | Diogo | Before US7 |
| Q13 | **MFR image omission granularity:** the norms forbid "fotografias ou gráficos". Do logos and simple diagrams count? Recommendation: treat every embedded image as forbidden for MFR, with the per-image warning, rather than guessing a category | Diogo | Before US12 |
