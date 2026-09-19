/**
 * Page-map extraction (DIO-42).
 *
 * The two-pass render needs to know which page every heading lands on, using
 * the *printed* geometry, not an estimate (PRD G2: zero tolerance on Índice
 * page numbers). Chromium's `printToPDF` converts internal `<a href="#id">`
 * anchors into link annotations whose `/Dest` is a **named destination keyed
 * by the anchor id itself**, resolvable through the catalog's `/Dests`
 * dictionary (or `/Names` → `/Dests` name tree) to the target's page object.
 * So a probe section with one link per anchor (see `buildPageMapProbeHtml`)
 * turns the printed PDF itself into an exact anchor-id → page map: no
 * scripts, no rect-ordering heuristics, and immune to screen-vs-print layout
 * differences because it reads the print result. Verified against Chromium's
 * output: `/Dest /<anchor-id>` per link plus a catalog `/Dests` dictionary.
 *
 * The probe section starts with its own marker anchor, so the map also gives
 * the page where the probe begins — everything before it is real content.
 */

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFString, PDFHexString } from "pdf-lib";
import { PAGE_MAP_PROBE_START_ID } from "./template.ts";

export interface ExtractedPageMap {
  /** 1-based absolute page of each probed anchor id (anchors Chromium dropped are absent). */
  pages: Map<string, number>;
  /** 1-based page where the probe section starts. */
  probeStartPage: number;
  /** Pages before the probe — the document's real page count. */
  contentPageCount: number;
}

export class PageMapExtractionError extends Error {}

export async function extractPageMap(pdf: Buffer | Uint8Array, anchorIds: string[]): Promise<ExtractedPageMap> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });

  const pageIndexByRef = new Map<string, number>();
  doc.getPages().forEach((page, index) => pageIndexByRef.set(page.ref.toString(), index));

  const destinations = collectNamedDestinations(doc);

  const resolve = (name: string): number | undefined => {
    const dest = destinations.get(name);
    if (!dest || dest.size() === 0) return undefined;
    const first = dest.get(0);
    if (first instanceof PDFRef) {
      const index = pageIndexByRef.get(first.toString());
      return index === undefined ? undefined : index + 1;
    }
    if (first instanceof PDFNumber) return first.asNumber() + 1;
    return undefined;
  };

  const probeStartPage = resolve(PAGE_MAP_PROBE_START_ID);
  if (probeStartPage === undefined) {
    throw new PageMapExtractionError("page-map probe marker destination missing from the rendered PDF");
  }

  const pages = new Map<string, number>();
  for (const id of anchorIds) {
    const page = resolve(id);
    if (page !== undefined) pages.set(id, page);
  }

  return { pages, probeStartPage, contentPageCount: probeStartPage - 1 };
}

/** All named destinations: catalog `/Dests` dictionary plus the `/Names` → `/Dests` name tree. */
function collectNamedDestinations(doc: PDFDocument): Map<string, PDFArray> {
  const destinations = new Map<string, PDFArray>();

  const record = (name: string, value: unknown) => {
    const resolved = value instanceof PDFRef ? doc.context.lookup(value) : value;
    if (resolved instanceof PDFArray) {
      destinations.set(name, resolved);
      return;
    }
    // A destination may also be a dict with a /D array (PDF 1.2 form).
    if (resolved instanceof PDFDict) {
      const d = resolved.lookupMaybe(PDFName.of("D"), PDFArray);
      if (d) destinations.set(name, d);
    }
  };

  const destsDict = doc.catalog.lookupMaybe(PDFName.of("Dests"), PDFDict);
  if (destsDict) {
    for (const [key, value] of destsDict.entries()) {
      record(decodePdfName(key), value);
    }
  }

  const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const tree = names?.lookupMaybe(PDFName.of("Dests"), PDFDict);
  if (tree) walkNameTree(doc, tree, record);

  return destinations;
}

/** "/merged#2Dheading" → "merged-heading": strips the leading slash and decodes `#hh` escapes. */
function decodePdfName(name: PDFName): string {
  return name
    .asString()
    .replace(/^\//, "")
    .replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function walkNameTree(
  doc: PDFDocument,
  node: PDFDict,
  record: (name: string, value: unknown) => void,
): void {
  const nameArray = node.lookupMaybe(PDFName.of("Names"), PDFArray);
  if (nameArray) {
    for (let i = 0; i + 1 < nameArray.size(); i += 2) {
      const key = nameArray.get(i);
      if (key instanceof PDFString || key instanceof PDFHexString) {
        record(key.decodeText(), nameArray.get(i + 1));
      }
    }
  }

  const kids = node.lookupMaybe(PDFName.of("Kids"), PDFArray);
  if (kids) {
    for (let i = 0; i < kids.size(); i += 1) {
      const kid = kids.get(i);
      const resolved = kid instanceof PDFRef ? doc.context.lookup(kid) : kid;
      if (resolved instanceof PDFDict) walkNameTree(doc, resolved, record);
    }
  }
}
