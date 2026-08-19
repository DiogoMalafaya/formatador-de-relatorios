# Formatador de Relatórios

Formats the end-of-internship **Curriculum Vitae** of Portuguese medical interns
according to the norms published by their specialty's Colégio da Ordem dos
Médicos: applies the required margins, fonts, spacing and title styles, adds a
compliant cover, shows a free watermarked preview, and charges once for the clean
PDF download.

No user accounts. Portuguese (pt-PT) only. Payments via Stripe.

> **Status:** early scaffold. The upload and formatting flow is not built yet —
> see the Linear project `Formatador de Relatórios` (DIO-5 … DIO-20).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in as the relevant tickets land
npm run dev
```

Open http://localhost:3000. `GET /api/health` reports service status and is also
the UTF-8 canary — if Portuguese diacritics are mangled anywhere in the stack,
they show up wrong there first.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Deployment

Built as a container (`Dockerfile`, Next.js standalone output) rather than a
serverless target, because the PDF renderer needs headless Chromium and a real
Node process.

Secrets are injected as environment variables — see `.env.example`. **This
repository is public: never commit real values.**

## Documentation

`CLAUDE.md` holds the domain rules extracted from the Colégio norms, the
architecture, and the project conventions.
