/**
 * Merges the generated cover, página de rosto and candidate signature into a
 * formatted document (DIO-12, extended in DIO-50) — the shared step the
 * preview and final-download pipelines use, so a cover switch is just a
 * different `coverId` against the same already-parsed `FormattedDocument`.
 *
 * - **Cover** (page 1): name, "Curriculum Vitae", internato, local de
 *   formação, date — MFR's four required fields plus the specialty.
 * - **Página de rosto** (the next recto): name, the exam it's submitted for,
 *   internato, local de formação, date, and signature blocks for the
 *   Orientador de Formação and the Diretor do Serviço — always where the
 *   profile requires them (MFR), elsewhere only when the student named them.
 * - **Candidate signature** at the end of the last page, where required (MFR).
 *
 * Signatures are empty lines for wet signatures (PRD Q10, default "no
 * signature images"). Returns the same `FormattedDocument` shape the renders
 * consume: the generated pages are just more HTML/CSS around the CV body.
 */

import { escapeHtml } from "../html.ts";
import { COVER_TEMPLATES } from "./templates.ts";
import { formatLocalDeFormacao } from "./details.ts";
import type { CoverDetails } from "./details.ts";
import type { FormattedDocument } from "../formatting/apply.ts";

const FALLBACK_CANDIDATE_NAME = "Candidato(a)";

/** Anchor of the marker before the rosto, so the paginated render can put it on a recto. */
export const ROSTO_START_MARKER_ID = "dio50-rosto-start";

export function buildRostoStartMarker(): string {
  return `<div id="${ROSTO_START_MARKER_ID}" class="page-map-marker" aria-hidden="true"></div>`;
}

const COVER_PAGE_BASE_CSS = `
.cover-page {
  break-after: page;
  page-break-after: always;
}
/* No break before: the cover breaks after itself, and on the paginated path
   the rosto's start marker carries a break too. A third would leave an empty page. */
.rosto-page {
  break-after: page;
  page-break-after: always;
  text-align: center;
  padding-top: 18%;
}
.rosto-page p { margin: 0 0 0.5em; }
.rosto-page .rosto-name { font-weight: bold; margin-bottom: 1.2em; }
.rosto-page .rosto-title { margin-bottom: 1.2em; }
.rosto-page .rosto-exam { margin: 2em 0; }
.signature-blocks {
  display: flex;
  justify-content: space-around;
  gap: 2em;
  margin-top: 4em;
  break-inside: avoid;
  page-break-inside: avoid;
}
.signature-block { flex: 1 1 0; max-width: 45%; text-align: center; }
.signature-line { border-top: 0.75pt solid #000; margin: 3em 0 0.4em; }
.signature-block p { margin: 0; }
.candidate-signature {
  margin-top: 3em;
  break-inside: avoid;
  page-break-inside: avoid;
}
.candidate-signature .signature-block { margin: 0 auto; max-width: 50%; }
`;

export interface MergeCoverOptions {
  /** Falls back to the first template in `COVER_TEMPLATES` when unset or unknown. */
  coverId?: string;
  /** Typically `FormattedDocument.extractedCandidateName`. Falls back to a placeholder when unset. */
  candidateName?: string;
  /** Defaults to today, formatted pt-PT. */
  dateLabel?: string;
  /** The specialty's display name, for the internato and exam lines. */
  specialtyNamePt?: string;
  /** What the student typed in the cover step (DIO-50). Its name overrides `candidateName`. */
  details?: CoverDetails;
}

export function mergeCoverWithDocument(
  document: FormattedDocument,
  options: MergeCoverOptions = {},
): FormattedDocument {
  const cover =
    (options.coverId ? COVER_TEMPLATES.find((template) => template.id === options.coverId) : undefined) ??
    COVER_TEMPLATES[0];

  const { details, specialtyNamePt } = options;
  const candidateName = resolveCandidateName(options);
  const dateLabel = options.dateLabel ?? formatTodayPt();
  const internatoPt = specialtyNamePt ? `Internato Médico de ${specialtyNamePt}` : "";
  const localPt = details ? formatLocalDeFormacao(details) : "";

  const coverHtml = cover.buildHtml({
    candidateName: escapeHtml(candidateName),
    dateLabel: escapeHtml(dateLabel),
    internatoPt: escapeHtml(internatoPt),
    localPt: escapeHtml(localPt),
  });

  const { frontMatter } = document.ruleSet;
  const rostoSignatures =
    frontMatter.rostoSignaturesRequired || !!details?.orientador || !!details?.diretor
      ? [
          signatureBlock("Orientador(a) de Formação", details?.orientador),
          signatureBlock("Diretor(a) do Serviço", details?.diretor),
        ]
      : [];

  const rostoHtml = [
    buildRostoStartMarker(),
    `<section class="rosto-page">`,
    `<p class="rosto-name">${escapeHtml(candidateName)}</p>`,
    `<p class="rosto-title">Curriculum Vitae</p>`,
    specialtyNamePt
      ? `<p class="rosto-exam">Exame final de habilitação ao grau de Especialista em ${escapeHtml(specialtyNamePt)}</p>`
      : "",
    internatoPt ? `<p>${escapeHtml(internatoPt)}</p>` : "",
    localPt ? `<p>${escapeHtml(localPt)}</p>` : "",
    `<p>${escapeHtml(dateLabel)}</p>`,
    rostoSignatures.length > 0 ? `<div class="signature-blocks">${rostoSignatures.join("")}</div>` : "",
    `</section>`,
  ]
    .filter((part) => part.length > 0)
    .join("\n");

  const candidateSignatureHtml = frontMatter.candidateSignatureRequired
    ? `<section class="candidate-signature">` +
      `<p>${escapeHtml(details ? `${details.city}, ${dateLabel}` : dateLabel)}</p>` +
      signatureBlock("O(A) Candidato(a)", candidateName) +
      `</section>`
    : "";

  return {
    ...document,
    html: [
      `<section class="cover-page cover-${cover.id}">${coverHtml}</section>`,
      rostoHtml,
      document.html,
      candidateSignatureHtml,
    ]
      .filter((part) => part.length > 0)
      .join("\n"),
    css: `${document.css}\n\n${COVER_PAGE_BASE_CSS}\n${cover.css}`,
  };
}

/** The name on the cover: the student's own entry, else the one read from the documents. */
export function resolveCandidateName(options: Pick<MergeCoverOptions, "candidateName" | "details">): string {
  return options.details?.candidateName?.trim() || options.candidateName?.trim() || FALLBACK_CANDIDATE_NAME;
}

function signatureBlock(rolePt: string, name: string | undefined): string {
  return (
    `<div class="signature-block">` +
    `<div class="signature-line"></div>` +
    `<p>${escapeHtml(rolePt)}</p>` +
    (name ? `<p>${escapeHtml(name)}</p>` : "") +
    `</div>`
  );
}

function formatTodayPt(): string {
  return new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
}
