/**
 * Merges a cover template into a formatted document as its first page
 * (DIO-12) — the shared step future render callers (DIO-13's preview,
 * DIO-15's final download) use so a cover switch is just a different
 * `coverId` against the same already-parsed `FormattedDocument`, with no
 * re-upload or re-parse required.
 *
 * Returns the same `FormattedDocument` shape `renderPdf` (DIO-11) already
 * consumes, so no changes are needed there — the cover is just more HTML/CSS
 * ahead of the CV body, separated by a forced page break.
 */

import { escapeHtml } from "../html.ts";
import { COVER_TEMPLATES } from "./templates.ts";
import type { FormattedDocument } from "../formatting/apply.ts";

const FALLBACK_CANDIDATE_NAME = "Candidato(a)";

const COVER_PAGE_BASE_CSS = `
.cover-page {
  break-after: page;
  page-break-after: always;
}
`;

export interface MergeCoverOptions {
  /** Falls back to the first template in `COVER_TEMPLATES` when unset or unknown. */
  coverId?: string;
  /** Typically `FormattedDocument.extractedCandidateName`. Falls back to a placeholder when unset. */
  candidateName?: string;
  /** Defaults to today, formatted pt-PT. */
  dateLabel?: string;
}

export function mergeCoverWithDocument(
  document: FormattedDocument,
  options: MergeCoverOptions = {},
): FormattedDocument {
  const cover =
    (options.coverId ? COVER_TEMPLATES.find((template) => template.id === options.coverId) : undefined) ??
    COVER_TEMPLATES[0];

  const candidateName = options.candidateName?.trim() || FALLBACK_CANDIDATE_NAME;
  const dateLabel = options.dateLabel ?? formatTodayPt();

  const coverHtml = cover.buildHtml({
    candidateName: escapeHtml(candidateName),
    dateLabel: escapeHtml(dateLabel),
  });

  return {
    ...document,
    html: `<section class="cover-page cover-${cover.id}">${coverHtml}</section>\n${document.html}`,
    css: `${document.css}\n\n${COVER_PAGE_BASE_CSS}\n${cover.css}`,
  };
}

function formatTodayPt(): string {
  return new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
}
