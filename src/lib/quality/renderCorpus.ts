/**
 * Renders a golden-corpus case through the production pipeline (DIO-47):
 * the same `assembleMultiFileDocument` and two-pass render a real session
 * uses, minus storage.
 */

import { assembleMultiFileDocument } from "../rendering/prepareDocument.ts";
import { renderPaginatedPdf } from "../pdf/renderPaginated.ts";
import type { PaginatedRenderResult } from "../pdf/renderPaginated.ts";
import type { PreparedDocument } from "../rendering/prepareDocument.ts";
import type { CorpusCase } from "./goldenCorpus.ts";

export interface RenderedCorpusCase {
  prepared: PreparedDocument;
  result: PaginatedRenderResult;
}

export async function renderCorpusCase(corpusCase: CorpusCase, coverId = "classica"): Promise<RenderedCorpusCase> {
  const prepared = assembleMultiFileDocument({
    sources: corpusCase.sources,
    masterPosition: corpusCase.masterPosition,
    ruleSetId: corpusCase.ruleSetId,
    coverId,
    dateLabel: corpusCase.dateLabel,
  });
  if (!prepared.merge) throw new Error("a golden corpus case is always multi-file");

  const result = await renderPaginatedPdf(prepared.document, {
    candidateName: prepared.candidateName,
    headings: prepared.merge.headings,
    tableCaptions: prepared.merge.tableCaptions,
    figureCaptions: prepared.merge.figureCaptions,
    lowResolutionImages: prepared.merge.lowResolutionImages,
  });
  return { prepared, result };
}
