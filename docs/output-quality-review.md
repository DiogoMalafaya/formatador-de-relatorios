# Output quality review — designer CVs vs. Lauda output

*2026-11-10. Compares the three designer-formatted CVs in `examples/finished/`
with a fictional multi-file CV rendered through our real pipeline (parse →
merge → format → cover "Clássica" → two-pass render, Arial, titles 14pt).*

> **Privacy:** the examples are real CVs with personal and patient data. This
> document refers to them only by specialty and never quotes their content.
> `examples/` is now in `.gitignore`. Do not commit this file without
> re-checking that it stays anonymous.

| Ref | Specialty | Pages | Palette | Type |
|---|---|---|---|---|
| **A** | Anestesiologia | 98 | Navy / mid-blue | Source Sans Pro Light body (~9–10pt), Abel condensed display, Minion Pro numerals |
| **B** | Cirurgia Geral | 286 (Volume I only) | Slate blue-grey + teal accents | Avenir 11pt body, Avenir Black small caps titles, Bodoni cover |
| **C** | Ortopedia | 210 | Teal + navy tables | Fira Sans Condensed Light 12pt body, DIN titles |
| **Ours** | MFR (fictional) | 9 | Black only | Arial 12pt, bold black titles |

**Most important caveat:** none of the three examples is MFR, and the only
norms we have encoded are the **MFR** ones. Each example follows its own
Colégio's rules, or none. Where an example contradicts the MFR norms, that
says nothing about whether it contradicts *its own* norms. ⚠ marks a
contradiction with the MFR rule set as encoded in `ruleSet.ts`.

---

## 1. Engine bugs (fix regardless of design direction)

These are defects, not taste. Rendering the fictional CV surfaced each of them.

1. **Content after the master's Índice breaks the chapter structure.**
   `mergeDocuments` emits blocks after the stale Índice as `<h1>` body
   (`levelShift: 0`), but chapters are demoted to `<h2>`. `partHeadingLevel`
   then picks level 1, so:
   - only that one heading gets a part break and a recto start, and **no
     chapter ever starts on a new page**;
   - the **running header shows the same text on every body page** ("Lista de
     abreviaturas e siglas" from page 2 to the end);
   - the abbreviations list (front matter in all three examples) is numbered
     as body page 1.

   All three examples put *Lista de abreviaturas* (and A also *Lista de
   tabelas*) right after the Índice, so this will hit most real uploads.
   Invariant #2 in `CLAUDE.md` describes the same failure mode, now coming
   from a different direction.
2. **The master's own cover text is printed again.** The documento principal's
   cover lines (name, "Curriculum Vitae", internato, hospital/years) appear as
   plain paragraphs at the top of page ii, right after our generated cover.
   The front-matter split needs to recognise and drop (or consume) the source
   cover.
3. **Table cells have no padding.** Adjacent columns touch:
   "2013-2019Mestrado…", "MusculoesqueléticaLombalgia".
4. **Table rows inherit 1.5 line spacing plus paragraph margins.** A 21-row
   casuística table takes about 1.5 pages. Each row is ~3 lines tall for one
   line of text.
5. **Table header rows don't repeat across page breaks.** The continuation on
   the next page starts mid-table with no column labels.
6. **Front-matter sections don't start new pages.** Nota prévia, Dedicatória
   and Índice share one page. In every example, each front-matter piece has
   its own page, and the Índice starts on a recto.
7. **Inconsistent chapter-title casing goes straight into the headings and the
   Índice** ("IDENTIFICAÇÃO", "VALORIZAÇÃO PROFISSIONAL" next to "Resumo do
   currículo"). Heading normalisation should unify case (title case or
   all-caps per theme).
8. **To verify:** whether merged cells (`rowspan`/`colspan`) survive mammoth.
   Two of the most valuable tables in A (the resumo and the year × month
   internship calendar) depend on vertically merged cells.

## 2. Compliance gaps in our output (the MFR norms require these and we lack them)

Independent of styling, the examples comply better than we do on these:

| Requirement (MFR norms, DIO-10) | Examples | Ours |
|---|---|---|
| Cover: name, "curriculum vitae", **local de formação**, date | All include specialty + hospital/city + year | **No local de formação.** `CoverFields` only has name + date |
| **Página de rosto** with name + exam designation, **signed by Orientador and Diretor do Serviço** | A, B, C all have a statement page + signature page (two signature blocks) | **Missing entirely** |
| **Last page signed by the candidate** | Not in A; B/C end with Considerações finais | **Missing** |
| Chronological order | Followed | Not checked (out of scope today) |

Recommendation: generate a *página de rosto* and a signature page from fields
we already collect (name, specialty, plus new fields: hospital, orientador,
diretor, years). Leave signature lines empty for wet signatures, or allow a
scanned signature (a signature is not a "photograph or graphic").

## 3. Design differences, area by area

### 3.1 Cover

- **Examples:** a full-bleed colour or tinted cover: A has a navy→blue
  gradient with white type; B a slate blue-grey block with a serif title; C a
  pale mint ground with a line-art illustration. Large, characterful title
  treatment ("CURRICULUM VITÆ" with a ligature, a big display numeral,
  hairline rules). The cover is followed by an **inside-cover blank** and then
  a **white title page that repeats the cover typography in the theme colour**.
  A and B also have a **back cover** in the theme colour.
- **Ours:** white page, three lines of black text, a large empty area, no
  local de formação, no title page, no back cover.
- ⚠ **Contradicts MFR:** "Capa: branca, texto a preto. Sem cores, fotografias
  ou símbolos." A coloured cover, a gradient, an illustration (C) or a
  numeral-as-ornament (A) is non-compliant for MFR.
- **Compliant upgrade for MFR:** better typography on a white cover (display
  serif, ligature, hairline rules, deliberate vertical rhythm, specialty and
  hospital lines), plus a white title page. Colour covers become a per-rule-set
  capability (`cover.colourAllowed`).

### 3.2 Front matter sequence and filler pages

Typical sequence in the examples (recto = odd):

| A | B | C |
|---|---|---|
| 1 cover · 2 blank · 3 title page · 4 blank · 5 rosto/statement · 6 blank · 7 signatures · 8 blank · 9 nota prévia · 10 blank · 11–13 Índice · 14–15 abreviaturas · 16 blank · 17 lista de tabelas · 18 blank | 1 cover · 2 blank · 3 title page (Volume I) · 4 blank · 5 rosto · 6 blank · 7 statement · 8 blank · 9 signatures · 10 blank · 11 epigraph · 12 blank · 13–14 agradecimentos · 15–17 Índice · 18 blank · 19–20 abreviaturas · 21–22 índice de tabelas · 23 introdução · 24 blank | 1 cover · 2 inner cover · 3 title page · 4 blank · 5 "Volume I" · 6 blank · 7 epigraph · 8 blank · 9 statement + signatures · 10 blank · 11–13 Índice · 14 blank · 15 siglas · 16 blank |

Patterns:
- **Every front-matter element starts on a recto**, and the verso before it is
  left blank.
- **Truly blank filler pages**: no "página intencionalmente deixada em branco"
  text, and at most a page number (A).
- Several items we don't produce: epigraph, agradecimentos, **lista de
  tabelas** (A, B, with numbered table captions), "Volume I" marker.
- **Ours:** cover → one page holding everything → body. No filler pages were
  inserted at all in this render (see bug 1.1). Our blanks print "página
  intencionalmente deixada em branco".

### 3.3 Chapter openers (biggest pagination difference)

- **All three examples use a divider for every chapter:**
  - A: recto divider with a huge serif numeral + chapter title in the theme
    colour + accent bar; then **a solid navy verso**; then content on the next
    recto.
  - B: recto divider "Capítulo IV — Formação Profissional" centred, small
    caps; blank verso. Sub-parts get their own divider with a mini Índice of
    their sections ("1. Internato Médico → 1.1, 1.2").
  - C: recto divider showing **the full chapter list with the current chapter
    highlighted** ("you are here"); then **a solid teal verso**.
- So each chapter costs 2–3 extra pages: divider + filler verso + recto
  content start, plus a blank verso at the end of the chapter if needed.
- **Ours:** chapters run on (bug 1.1). Even when fixed, we only do "recto
  start, insert blank if needed", with no divider.
- ⚠ **MFR:** solid colour pages break "página branca" and "sem cores"
  (arguably); dividers plus blanks eat into the **80-page cap**. A at 98 pages
  is itself over the MFR cap. A divider adds ~2 × chapters pages (~16 for 8
  chapters).
- **Recommendation:** offer dividers as a theme option (white divider with
  numeral + title for MFR; coloured verso only where allowed). Show the
  page-budget effect live in the workspace. Fix the
  invariant so the blank-page plan supports "divider on recto, content on
  next recto".

### 3.4 Section numbering

- **All examples number hierarchically** (A: "3.2.6.1."; B: "Capítulo IV",
  then "1.", "1.1 -"; C: "IV.", "1.", "3.1.4."). The numbering appears in the
  headings, the Índice, the side tabs and the dividers.
- **Ours:** no numbering anywhere.
- No conflict with the norms. **Recommendation:** automatic numbering
  (decimal default; roman chapters as an option), with detection and stripping
  of manual numbers students already typed ("3.1." in the source text) to avoid
  "3.1. 3.1. Formação".

### 3.5 Headings

- **Examples:** colour is the main hierarchy device.
  - A: H1 uppercase condensed (Abel) ~18pt **blue**; H2 bold uppercase blue
    with a **blue rule above**; H3 uppercase dark grey; H4 sentence case grey.
  - B: H1 Avenir Black **small caps, grey-blue, dotted rule below**; H2 with a
    decorative tilde glyph; table captions grey.
  - C: chapter titles **teal**, H2 teal bold.
- **Ours:** black bold Arial at 14pt (H1) and a little smaller below it. No
  colour, rules, case treatment or numbering.
- ⚠ **Contradicts MFR:** "Tipo de letra 12pt, preto" and "Títulos a negrito
  12 ou 14pt". Coloured titles and titles larger than 14pt (A's ~18pt, B's
  16–20pt) are non-compliant for MFR. Small caps and rules aren't addressed by
  the norms (likely fine).
- **Compliant upgrade for MFR:** hierarchy through case, spacing, rules and
  numbering at 12/14pt black. Colour only via a rule-set flag.

### 3.6 Body text

| | A | B | C | Ours |
|---|---|---|---|---|
| Size | ~9–10pt light | 11pt | 12pt light condensed | 12pt |
| Alignment | Justified | Justified | Justified | **Ragged right** |
| Paragraph separation | No space, new line | First-line indent, no space | Small space | **Full blank line + 1.5 leading** |
| Inline emphasis | Bold labels, italic for English terms, blue "(Doc. 51)" refs | Bold labels | Bold key numbers ("1581 cirurgias") | Whatever the source had |

- ⚠ **Contradicts MFR:** A's ~9–10pt and B's 11pt break the 12pt rule; none of
  the three uses Arial or Times New Roman for body text.
- **Recommendation (compliant):** justified text with hyphenation (`hyphens:
  auto` + `lang="pt-PT"`), and a smaller paragraph gap (0.4–0.6em) instead of a
  full line. Bold "Label:" in label–value lines (Identificação). Colour the
  "(Doc. N)" references (needs the colour flag), or at least keep them in a
  consistent style.

### 3.7 Tables (what you flagged; agree, and there is more)

The examples treat tables as the centrepiece of a CV. Concretely:

- **Header row:** solid theme-colour fill, white bold text, often uppercase
  (A navy, B slate, C navy).
- **Group/section rows** spanning the width in the theme colour ("ETAPAS
  ANTERIORES…", "DOENÇA BENIGNA").
- **Stub column** (first column) on a darker grey tint with coloured text
  (A).
- **Cell fill** light grey with **white gutters** instead of borders (A), or
  dotted separators (B), or alternating tints (C).
- **Compact:** ~9–10pt text, ~1.1–1.2 line height, small vertical padding.
  The A resumo fits ~45 rows on one page.
- **Numbers centred** or right-aligned; **totals row bold** with a strong rule
  or fill.
- **Caption above** ("Tabela 2. Calendarização…" with "Tabela 2." in the
  theme colour); **legend/abbreviations and footnotes below** in small type.
- **Merged cells** used heavily (calendar grid, grouped casuística).
- **Rotated column headers** on very wide casuística tables (A p.33).
- **Full text width**, consistent column widths.
- **Ours:** none of the above, plus bugs 1.3–1.5.
- ⚠ **MFR:** tables are allowed for activity schematisation. A **grey** header
  fill doesn't obviously break any rule; a **coloured** fill and coloured text
  touch "texto a preto". Table text below 12pt breaks the font-size rule if a
  jury reads it strictly. This is the most likely place a jury tolerates
  smaller type, but it's a judgement call for you.
- **Recommendation:** a table theme with header fill, compact rows, cell
  padding, `thead` repetition, `break-inside: avoid` for short tables, numeric
  alignment detection, auto-captioning ("Tabela N.") feeding a generated
  *Lista de tabelas*, and a bold last row when it starts with "Total".

### 3.8 Lists and repeated entries (courses, congresses, publications)

- **B** turns each course or congress into a **card**: a coloured title bar
  with the course name and the annex reference on the right, followed by
  label/value rows ("Data e Local", "Organização", "Resumo", "Classificação").
  Sections carry a count ("Internacionais — Total: 38").
- **A** uses a compact list: bold-italic title, then indented label lines,
  with blue "(Doc. N)".
- **C** uses grouped bullet lists with bold lead-ins.
- **Ours:** default bullets, 1.5 spacing, a full gap between items. Long
  course lists look like a wall.
- **Recommendation:** tighter list spacing (no blank line between items).
  Possibly detect "label: value" blocks and repeated entry shapes and render
  them as cards (high value, but needs a heuristic; see Q8).

### 3.9 Índice and auto-generated lists

- **Examples:** the Índice is styled by level (A: chapters bold blue
  uppercase with extra space before; sub-levels uppercase black; level 3+
  sentence case grey). B uses small caps for chapters and dotted rules. No
  dot leaders in A or B; right-aligned numbers. C has dot leaders. Separate
  **Lista de abreviaturas** (A: two columns, grouped A–Z with letter headings
  and rules, italics for English terms) and **Lista de tabelas**.
- **Ours:** a single-style Índice with dot leaders. All levels look the same
  except for indent. Abbreviations are plain paragraphs (and land in the body
  by bug 1.1).
- **Recommendation:** level-styled Índice; Índice depth control (A goes 4
  levels deep, B 3); generated Lista de tabelas; abbreviation list
  detection → two-column glossary layout.

### 3.10 Footer, header, page numbers

| | Footer | Page number | Header / side marker |
|---|---|---|---|
| A | "Short name \| Curriculum Vitae \| Volume 1" with a grey rule above | **Outer corner** (mirrored recto/verso) | **Outer-edge thumb tab**: blue block with chapter number + vertical chapter title |
| B | None | Outer corner | None |
| C | Vertical "Name \| Curriculum Vitae" in the outer margin | In a **grey box** at the outer bottom corner | Vertical chapter title in the outer margin |
| Ours | "Name — N", centred | Centred, inside the footer | Centred running header (stuck, bug 1.1) |

- ⚠ **Contradicts MFR:** "Rodapé: nome do candidato e número de página,
  **nada mais**". A adds "Curriculum Vitae | Volume 1". B omits the name. C
  moves the name out of the footer. Our footer is the compliant one.
- **Compliant upgrade:** **mirrored layout** for duplex printing (the norms
  require frente e verso): page number on the outer edge, name on the inner
  side, hairline rule above. A side thumb-tab with the chapter number
  arguably fits "Cabeçalho: opcional, referência à secção/subsecção". Worth
  confirming (Q5).

### 3.11 Page numbering scheme

- A: arabic from the cover (the cover counts as 1; blanks are counted).
- B: front matter unnumbered; arabic 1 starts at the Índice.
- C: arabic throughout, in a grey box.
- Ours: roman for front matter, arabic restarting at 1 for the body.
- None of the examples uses roman numerals. The norms only say "numeração
  sequencial". A strict reading ("sequential") favours one arabic sequence
  for everything (A/C), which our roman → arabic restart may not satisfy.
  See Q4.

### 3.12 Graphics, photos, logos

- B: bar and stacked charts of surgical activity. C: pie and bar charts,
  photographs (hospital building, service crest), institutional logos on
  declarations, a decorative tree illustration (cover, title page,
  statement page). A: none in the body.
- ⚠ **Contradicts MFR:** "Fotografias e gráficos são proibidos." We warn on
  images, which is correct for MFR. For other Colégios this may be allowed.
- Charts are something designers add and students value. If another rule set
  allows them, generating charts from casuística tables is a differentiator,
  but **not for MFR**.

### 3.13 Volumes and annex references

- All three are **Volume I**, with comprovativos in a Volume II referenced as
  "(Doc. 51)" (A), "(Anexo A3)" (B) or "[Vol. II, Secção I, Doc. 2]" (C). B
  places the reference right-aligned in each card's title bar.
- We don't model volumes. If students upload a Volume II (scans of
  certificates), it's all images and fails our checks.
- ⚠ **Page count:** A (98), B (286) and C (210) are all far over MFR's 80
  pages for Volume I alone. Either their Colégios allow more, or nobody
  enforces it.

## 4. Summary — example features vs. MFR norms

| Feature (from examples) | MFR verdict | Notes |
|---|---|---|
| Coloured / gradient / illustrated cover | ❌ forbidden | Explicit: white, black text, no colours/symbols |
| Title page in colour | ❌ likely | Same "black text" principle |
| Coloured titles | ❌ | "Letra a preto" |
| Titles > 14pt | ❌ | 12 or 14pt only |
| Body < 12pt, or fonts other than Arial/TNR | ❌ | |
| Solid colour divider versos | ❌ likely | Page must be white |
| Chapter dividers (white) | ✅ | Costs pages against the 80 cap |
| Blank filler pages | ✅ | Implied by duplex; costs pages |
| Section numbering | ✅ | |
| Grey table header / cell fill | ⚠️ grey zone | Not forbidden; "preto" is about text |
| Coloured table header + white text | ❌ likely | |
| Compact table text (< 12pt) | ⚠️ grey zone | |
| Justified text, hyphenation | ✅ | |
| Mirrored outer-edge page numbers | ✅ | |
| Footer extra text ("Curriculum Vitae \| Volume 1") | ❌ | "nada mais" |
| Side thumb-tab with section number | ⚠️ probably ✅ | As a header, section reference only |
| Charts | ❌ | "gráficos proibidos" |
| Photos, logos, illustrations | ❌ | Signature scans are probably fine |
| > 80 pages | ❌ | All three examples exceed it |

**The pattern:** almost everything that makes the examples look "designed"
(colour on the cover, titles and tables) is what MFR forbids. The
improvements that are both safe and high-impact for MFR are **structure and
rhythm**: numbering, dividers, recto starts, compact well-built tables,
justified text, a real title page, mirrored footers, a level-styled Índice and
generated lists. Colour should be a **per-rule-set capability**, so we can
style specialties that allow it without making MFR output non-compliant.

## 5. Suggested priority

1. Engine bugs 1.1–1.7 (correctness; 1.1 hits most real uploads).
2. Compliance gaps (§2): local de formação on the cover, página de rosto,
   signature page.
3. Tables (§3.7) and body rhythm (§3.6), all compliant for MFR.
4. Numbering + level-styled Índice + Lista de tabelas (§3.4, §3.9).
5. Chapter dividers + filler-page policy (§3.3), with a page-budget display.
6. Themes with colour, gated by rule set (§3.1, §3.5, §3.7), once we have a
   non-MFR rule set that allows it.

## 6. Open questions for Diogo

1. **Which Colégios do we target at launch?** The examples are Anestesiologia,
   Cirurgia Geral and Ortopedia, but our only encoded norms are MFR. Do you
   have those three Colégios' normas? Without them we can't tell "designer
   flair" from "allowed".
2. **Colour vs. compliance:** do you want colour themes (cover, titles,
   tables) even where the norms forbid them, as the user's choice with a
   warning? Or strictly norm-compliant output, with colour only where a
   Colégio allows it?
3. **How strictly do juries apply the norms in practice?** All three examples
   break MFR-style rules (page count, colour, font size), presumably without
   consequences. That decides whether "compliant" or "beautiful" is the
   default.
4. **Page numbering:** one arabic sequence from the cover (A, C), unnumbered
   front matter then arabic (B), or our current roman → arabic?
5. **Side thumb-tabs** (chapter number on the outer edge): do they count as
   an allowed "header", or are they a risk?
6. **Chapter dividers:** on by default? They roughly add 2 pages per chapter
   against an 80-page cap.
7. **Volume II:** in scope? Students will want the "(Doc. N)" references to
   line up with an annex volume.
8. **Structured entries** (B's course/congress cards): worth a heuristic that
   restructures the student's content, or is restyling what they wrote the
   limit of what Lauda should do?
9. **Signatures:** empty lines for wet signatures, or let students upload a
   signature scan?
10. **Table text size:** may tables go below 12pt (e.g. 10pt) to stay compact?
