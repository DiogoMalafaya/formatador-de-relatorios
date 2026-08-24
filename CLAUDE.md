@AGENTS.md

# Formatador de Relatórios

Webapp for Portuguese medical interns that reformats their end-of-internship
**Curriculum Vitae** to the formatting norms published by their specialty's
Colégio da Ordem dos Médicos, applies a compliant cover, shows a free watermarked
preview, and charges once for the clean PDF download.

No user accounts. Portuguese (pt-PT) only. Payments via Stripe.

## Tickets

Work is tracked in Linear, project **Formatador de Relatórios**, team `DIO`
(issues DIO-5 … DIO-20). Use the `linear-agent` CLI. Every ticket body carries a
`Build order: N/16` line, a `Dependencies` section, and open questions.

Dependencies are prose, not enforced links — read the ticket before starting and
respect the stated order. `linear-agent list --delegated --json` shows what has
been handed to the agent.

Blockers and decisions only Diogo can make go on the ticket as a tagged comment,
not just in the terminal — see the Linear section of the global `~/.claude/CLAUDE.md`
for the mention format.

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
upload .docx → parse → apply rule set → merge cover → render PDF
             → watermarked preview → Stripe → clean PDF → scheduled purge
```

**Serverless, not a container:** the scaffold originally assumed headless
Chromium needed a container with a real Node process. That constraint no longer
holds — Vercel raised the function bundle limit to 5GB for large functions
(fluid compute, on by default for new projects), which comfortably fits headless
Chromium. See the DIO-5 comment thread for the research behind the switch.

**Proposed rendering pipeline (not yet built — DIO-10/DIO-11):** `.docx` →
semantic HTML → rule-set CSS → Chromium `printToPDF`, run inside a Vercel
serverless function. CSS `@page` handles A4, 2.5cm margins and the
name+page-number footer directly, which maps onto the norms almost one-to-one.
The alternative — editing OOXML and converting via LibreOffice — gives less
precise control over exactly the parameters the norms specify. Revisit if real
reports show structures that HTML conversion mangles.

## Conventions

- **Language:** all user-facing copy is pt-PT. Code, comments, and commits in
  English. Informal register ("o teu currículo") — see DIO-18.
- **Secrets:** declared and read only in `src/lib/env.ts`. Never import that
  module into a client component. The repository is **public** — a committed key
  is a leaked key.
- **Privacy:** uploads may contain patient data. Nothing persists beyond the
  retention window (DIO-6, DIO-16). Never log document contents, and never add a
  debug path that writes an upload outside the session store.
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

## Sessions

`src/lib/session/` implements the ephemeral, account-free session (DIO-7).

**The browser holds a session id and nothing else.** Storage keys, payment state
and everything else live server-side in the record; a token is `<id>.<hmac>` and
asserts nothing. Adding a payload to the token would invalidate the "cannot read
another session" argument, so don't.

`InMemorySessionStore` is dev/test only and `createSessionStore()` throws in
production rather than let it ship — it loses state on restart and is not shared
between instances, so the Stripe webhook and the student's browser could disagree
about whether a session was paid. A shared store with TTL is still to be chosen.
