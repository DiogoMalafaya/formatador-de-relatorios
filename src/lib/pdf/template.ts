/**
 * HTML/PDF template builders (DIO-11).
 *
 * Kept free of any Chromium dependency so they can be unit-tested without a
 * browser. `render.ts` is the only caller.
 */

import type { FormattedDocument } from "../formatting/apply.ts";
import type { RuleSet } from "../formatting/ruleSet.ts";
import { escapeHtml } from "../html.ts";

/** Wraps the parsed document + rule-set CSS into a full page Chromium can load. */
export function buildHtmlDocument(document: FormattedDocument): string {
  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8" />
<style>${document.css}</style>
</head>
<body>
${document.html}
</body>
</html>`;
}

/**
 * The norms treat a header as optional and scoped to a section/subsection
 * reference (see `ruleSet.header.allowed`) — the engine has no per-page
 * section context to put there today, so every rule set gets an empty header
 * box. Revisit once a rule set actually requires header content.
 */
export function buildHeaderTemplate(): string {
  return "<div></div>";
}

/**
 * Footer per the rule set's `footer` flags: candidate name and/or a
 * sequential page number, nothing else (per the norms' own footer rule).
 * `.pageNumber` is a Puppeteer-recognised class Chromium fills in at print
 * time — see https://pptr.dev/api/puppeteer.pdfoptions.footertemplate.
 */
export function buildFooterTemplate(ruleSet: RuleSet, candidateName: string): string {
  if (!ruleSet.footer.includeCandidateName && !ruleSet.footer.includePageNumber) {
    return "<div></div>";
  }

  const parts: string[] = [];
  if (ruleSet.footer.includeCandidateName) {
    parts.push(escapeHtml(candidateName));
  }
  if (ruleSet.footer.includePageNumber) {
    parts.push('<span class="pageNumber"></span>');
  }

  return `<div style="width:100%; font-size:9px; font-family:Arial,sans-serif; text-align:center; color:#000;">${parts.join(" — ")}</div>`;
}
