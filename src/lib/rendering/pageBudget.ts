/**
 * Live page budget (DIO-54, PRD US7): "84 / 100 páginas" in the workspace.
 *
 * The count comes from the last paginated preview render, which knows it
 * exactly. Chapter dividers add a cost that is also exact and known before
 * any render (`chapterDividerPageCost`), so toggling them updates the budget
 * at once, without re-rendering: the last render's count, minus the
 * dividers it had, plus the dividers asked for now.
 *
 * A count is only used while the render it came from still matches the
 * session's inputs (`renderInputsKey`). Anything else — a file added, the
 * specialty or the cover changed — makes it unknown until the next preview,
 * never silently stale. A budget over the profile's cap blocks checkout.
 */

import { createHash } from "node:crypto";
import type { SessionRecord } from "../session/types.ts";

/**
 * Fingerprint of every session input that changes the rendered page count,
 * except the divider toggle, which the budget accounts for itself. A hash,
 * so the cover details (personal data) aren't copied into the artifacts.
 */
export function renderInputsKey(session: SessionRecord): string {
  const inputs = {
    sources: (session.sources ?? []).map((source) => source.index),
    upload: session.upload?.storageKey ?? null,
    masterIndex: session.masterIndex ?? null,
    specialtyId: session.specialtyId ?? null,
    coverId: session.coverId ?? null,
    coverDetails: session.coverDetails ?? null,
  };
  return createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
}

export interface PageBudget {
  /** Pages the document has with the current divider choice, when known. */
  pages?: number;
  /** True when `pages` is exactly what the last preview showed (not adjusted for a toggle since). */
  rendered: boolean;
  /** The profile's page cap, when it has one (MFR: 100). */
  maxPages?: number;
  /** Over the cap: checkout is blocked until the student cuts pages. */
  overCap: boolean;
  dividersOn: boolean;
  /** Pages the dividers add, when known: shown on the toggle before any render. */
  dividerPageCost?: number;
}

export interface PageBudgetInput {
  session: SessionRecord;
  maxPages?: number;
  /** The divider cost for the session's current inputs, when the caller computed it. Falls back to the last render's. */
  dividerPageCost?: number;
}

export function computePageBudget({ session, maxPages, dividerPageCost }: PageBudgetInput): PageBudget {
  const dividersOn = session.chapterDividers === true;
  const artifacts = session.artifacts;
  const fresh =
    artifacts?.renderedPageCount !== undefined &&
    artifacts.renderInputsKey !== undefined &&
    artifacts.renderInputsKey === renderInputsKey(session);

  const cost = dividerPageCost ?? (fresh ? artifacts.dividerPageCost : undefined);
  const base = { dividersOn, ...(maxPages !== undefined ? { maxPages } : {}), ...(cost !== undefined ? { dividerPageCost: cost } : {}) };

  if (!fresh) return { ...base, rendered: false, overCap: false };

  const renderedWithDividers = artifacts.renderedWithDividers === true;
  let pages = artifacts.renderedPageCount as number;
  if (renderedWithDividers !== dividersOn) {
    // Without a cost the adjustment is unknowable; say so rather than guess.
    if (cost === undefined) return { ...base, rendered: false, overCap: false };
    pages += dividersOn ? cost : -cost;
  }

  return {
    ...base,
    pages,
    rendered: renderedWithDividers === dividersOn,
    overCap: maxPages !== undefined && pages > maxPages,
  };
}

/** pt-PT reason checkout is refused while the budget is over the cap. */
export function pageCapBlockedMessagePt(budget: { pages?: number; maxPages?: number; dividersOn: boolean }): string {
  const remedy = budget.dividersOn ? "Desliga os separadores de capítulo ou reduz o conteúdo" : "Reduz o conteúdo";
  return `O currículo tem ${budget.pages} páginas e o limite do Colégio é ${budget.maxPages}. ${remedy} para poderes continuar.`;
}
