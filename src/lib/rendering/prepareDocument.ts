import { getObject } from "../storage/index.ts";
import {
  applyFormatting,
  collectConstraintWarnings,
  formatParsedDocument,
} from "../formatting/apply.ts";
import { parseDocxDocument } from "../formatting/parseDocx.ts";
import { getRuleSet, HOUSE_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { withSourceFilename } from "../formatting/warnings.ts";
import { getSpecialtyById, resolveRuleSetId } from "../specialties/index.ts";
import { mergeCoverWithDocument, resolveCandidateName } from "../covers/merge.ts";
import { formatLocalDeFormacao } from "../covers/details.ts";
import type { CoverDetails } from "../covers/details.ts";
import { mergeDocuments, GENERATED_TOC_CSS } from "../merge/index.ts";
import { GLOSSARY_CSS } from "../merge/glossary.ts";
import type { MergedHeading, MergeSource } from "../merge/types.ts";
import type { TableCaption } from "../formatting/tables.ts";
import type { NumberedCaption } from "../formatting/captions.ts";
import { applyImagePolicy } from "../formatting/images.ts";
import type { LowResolutionImage } from "../formatting/images.ts";
import { getMasterSource, getOrderedSources } from "../session/sources.ts";
import type { FormattedDocument } from "../formatting/apply.ts";
import type { SessionRecord } from "../session/types.ts";

/**
 * Thrown when a session isn't far enough along to render anything — no
 * upload yet, or a stored upload has expired out from under it. Callers
 * (preview, final download) each wrap this in their own named error so a
 * caller can tell which pipeline failed from the error type alone.
 */
export class DocumentNotReadyError extends Error {}

export interface PreparedDocument {
  document: FormattedDocument;
  candidateName: string;
  /** "Hospital …, Cidade" as printed on the cover, when given (DIO-50) — for the compliance check. */
  localDeFormacao?: string;
  /**
   * Present only for multi-file sessions: what the paginated two-pass render
   * (DIO-42) needs beyond the document itself. Absent for a single source,
   * which keeps the original single-file render path untouched.
   */
  merge?: {
    headings: MergedHeading[];
    tableCaptions: TableCaption[];
    figureCaptions: NumberedCaption[];
    /** Kept images below print resolution; the render names their page (DIO-49). */
    lowResolutionImages: AttributedLowResolutionImage[];
    /** Front-matter headings that open on a recto (DIO-50). */
    rectoHeadingIds: string[];
  };
}

/** A low-resolution image and the uploaded file it came from. */
export interface AttributedLowResolutionImage extends LowResolutionImage {
  sourceFilename: string;
}

export interface PrepareOptions {
  /**
   * The watermarked preview marks where each forbidden image was removed;
   * the final PDF must not (DIO-49).
   */
  imagePlaceholders?: boolean;
}

/**
 * Shared prefix of the preview (DIO-13) and final-download (DIO-15) render
 * pipelines: stored upload(s) → formatting → cover merge. The two diverge
 * after this — preview watermarks the result, final download doesn't.
 *
 * A single-file session takes exactly the pre-DIO-42 path. A multi-file
 * session parses every source, collects constraint warnings *per source* so
 * each finding names its original file (US10), merges the documento
 * principal with the ordered chapters (DIO-41), and formats the merged
 * model.
 */
export async function prepareDocument(session: SessionRecord, options: PrepareOptions = {}): Promise<PreparedDocument> {
  // All reads of uploaded files go through the sources helper (DIO-40):
  // it owns the `{sessionId}/source/{index}.docx` layout and still
  // understands a pre-multi-file session's single `upload` as source 0.
  const sources = getOrderedSources(session);
  const master = getMasterSource(session);
  if (!master || sources.length === 0) {
    throw new DocumentNotReadyError("session has no uploaded sources");
  }

  const ruleSetId = session.specialtyId ? resolveRuleSetId(session.specialtyId) : HOUSE_RULE_SET_ID;

  if (sources.length === 1) {
    const sourceBuffer = await getObject(master.storageKey);
    if (!sourceBuffer) {
      throw new DocumentNotReadyError("uploaded file is no longer in storage");
    }

    const formatted = await applyFormatting(sourceBuffer, {
      ruleSetId,
      imagePlaceholders: options.imagePlaceholders ?? false,
    });
    return withCover(formatted, coverOptionsFor(session));
  }

  // --- multi-file: parse everything, warn per file, merge, format ---------
  const buffers = await Promise.all(sources.map((source) => getObject(source.storageKey)));
  const missing = buffers.findIndex((buffer) => buffer === null);
  if (missing !== -1) {
    throw new DocumentNotReadyError("an uploaded file is no longer in storage");
  }

  const parsedSources = await Promise.all(
    sources.map(async (source, index) => ({
      id: `source-${source.index}`,
      filename: source.originalFilename,
      document: await parseDocxDocument(buffers[index] as Buffer),
    })),
  );

  return assembleMultiFileDocument({
    sources: parsedSources,
    masterPosition: sources.findIndex((source) => source.index === master.index),
    ruleSetId,
    ...coverOptionsFor(session),
    imagePlaceholders: options.imagePlaceholders ?? false,
  });
}

/** What the generated cover and rosto need from the session (DIO-50). */
function coverOptionsFor(session: SessionRecord): CoverOptions {
  const specialtyNamePt = session.specialtyId ? getSpecialtyById(session.specialtyId)?.name : undefined;
  return {
    coverId: session.coverId,
    ...(session.coverDetails ? { coverDetails: session.coverDetails } : {}),
    ...(specialtyNamePt ? { specialtyNamePt } : {}),
  };
}

interface CoverOptions {
  coverId?: string;
  dateLabel?: string;
  coverDetails?: CoverDetails;
  specialtyNamePt?: string;
}

/** One parsed source of a multi-file CV, still knowing which file it was. */
export interface ParsedSource extends MergeSource {
  /** The uploaded filename, for per-file warnings ("Em «SIJ.docx»: …"). */
  filename: string;
}

export interface AssembleOptions {
  /** Parsed sources in the student's order. */
  sources: ParsedSource[];
  /** Index into `sources` of the documento principal. */
  masterPosition: number;
  ruleSetId: string;
  coverId?: string;
  /** Cover date; defaults to today. Fixed by the golden corpus for stable output. */
  dateLabel?: string;
  /** See `PrepareOptions.imagePlaceholders`. */
  imagePlaceholders?: boolean;
  /** Local de formação, signatories, name override (DIO-50). */
  coverDetails?: CoverDetails;
  /** The specialty's display name, for the cover's internato and the rosto's exam line. */
  specialtyNamePt?: string;
}

/**
 * The pure part of the multi-file pipeline: per-file warnings, merge,
 * formatting, cover. No storage, no session — so the golden corpus
 * (DIO-47) renders through exactly the code production does.
 */
export function assembleMultiFileDocument(options: AssembleOptions): PreparedDocument {
  const { sources, masterPosition, ruleSetId } = options;
  const ruleSet = getRuleSet(ruleSetId);
  const perSourceWarnings = sources.flatMap((source) =>
    collectConstraintWarnings(source.document, ruleSet).map((warning) =>
      withSourceFilename(warning, source.filename),
    ),
  );

  // Images are kept or removed per source, before the merge, while "which
  // file" is still known (DIO-49). Counts stay those of the original parse,
  // so the omitted-image warnings above match what was removed.
  const lowResolutionImages: AttributedLowResolutionImage[] = [];
  const policed = sources.map((source, position) => {
    const policy = applyImagePolicy(source.document.html, source.document.images, {
      ruleSet,
      anchorPrefix: `src${position}`,
      placeholders: options.imagePlaceholders ?? false,
    });
    lowResolutionImages.push(...policy.lowResolution.map((image) => ({ ...image, sourceFilename: source.filename })));
    return { ...source, document: { ...source.document, html: policy.html } };
  });

  const merged = mergeDocuments(
    policed[masterPosition],
    policed.filter((_, index) => index !== masterPosition),
  );

  const formatted = formatParsedDocument(merged.document, { ruleSetId }, {
    constraintWarnings: perSourceWarnings,
    extraWarnings: merged.warnings,
  });

  // The merged document's first heading is a front-matter title, so the
  // name read off the master's own cover (DIO-45) wins over extraction.
  return withCover(
    {
      ...formatted,
      css: `${formatted.css}\n${GENERATED_TOC_CSS}\n${GLOSSARY_CSS}`,
      extractedCandidateName: merged.candidateName ?? formatted.extractedCandidateName,
    },
    {
      coverId: options.coverId,
      dateLabel: options.dateLabel,
      coverDetails: options.coverDetails,
      specialtyNamePt: options.specialtyNamePt,
    },
    {
      headings: merged.headings,
      tableCaptions: merged.tableCaptions,
      figureCaptions: merged.figureCaptions,
      lowResolutionImages,
      rectoHeadingIds: merged.rectoHeadingIds,
    },
  );
}

function withCover(
  formatted: FormattedDocument,
  cover: CoverOptions,
  merge?: PreparedDocument["merge"],
): PreparedDocument {
  const withCoverDocument = mergeCoverWithDocument(formatted, {
    coverId: cover.coverId,
    candidateName: formatted.extractedCandidateName,
    ...(cover.dateLabel ? { dateLabel: cover.dateLabel } : {}),
    ...(cover.coverDetails ? { details: cover.coverDetails } : {}),
    ...(cover.specialtyNamePt ? { specialtyNamePt: cover.specialtyNamePt } : {}),
  });

  return {
    document: withCoverDocument,
    ...(cover.coverDetails ? { localDeFormacao: formatLocalDeFormacao(cover.coverDetails) } : {}),
    // The same name everywhere: cover, rosto, footers, compliance check.
    candidateName: resolveCandidateName({
      candidateName: formatted.extractedCandidateName,
      details: cover.coverDetails,
    }),
    ...(merge ? { merge } : {}),
  };
}
