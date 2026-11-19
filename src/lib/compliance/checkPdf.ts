/**
 * PDF-level compliance checker (DIO-47).
 *
 * Reads the PDF we actually produced (not the HTML we meant to produce) and
 * checks it against the norm profile: the fonts that are really embedded,
 * the sizes and colour text is really drawn in, where it really sits on the
 * page, what the footer really says, the page count, the cover, and images.
 * A rule the profile is silent on (`silentOn`) is not checked.
 *
 * Messages are pt-PT and never quote document text. They can surface to the
 * student (via `renderWarnings`) and to logs, and a CV is personal data.
 */

import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { EMBEDDED_FONTS } from "../pdf/fonts.ts";
import type { FontFamily, NormDimension, RuleSet } from "../formatting/ruleSet.ts";
import type { FormattingWarning } from "../formatting/warnings.ts";

export type ComplianceCheckId =
  | "system-font"
  | "norm-font"
  | "font-size"
  | "text-colour"
  | "margins"
  | "footer-content"
  | "page-cap"
  | "cover-fields"
  | "images-forbidden"
  /** DIO-50: the página de rosto carries the orientador's and diretor's signature blocks. */
  | "rosto-signatures"
  /** DIO-50: the last page carries the candidate's signature block. */
  | "candidate-signature";

export interface ComplianceViolation {
  check: ComplianceCheckId;
  /** 1-based page, when the violation is on a specific page. */
  page?: number;
  messagePt: string;
}

export interface ComplianceOptions {
  ruleSet: RuleSet;
  /** The norm font the document was rendered in. */
  fontFamily: FontFamily;
  candidateName: string;
  /**
   * The local de formação the student gave (DIO-50), "Hospital …, Cidade".
   * When set, the cover must show it; MFR names it as a required cover field.
   */
  localDeFormacao?: string;
  /** Checks to leave out, e.g. images on a watermarked preview, whose watermark is an image. */
  skip?: readonly ComplianceCheckId[];
}

const POINTS_PER_CM = 72 / 2.54;
/** Slack for glyph side bearings and rounding, in points. */
const POSITION_TOLERANCE_PT = 2;
const SIZE_TOLERANCE_PT = 0.25;

const TEXT_OPS = new Set<number>([
  OPS.showText,
  OPS.showSpacedText,
  OPS.nextLineShowText,
  OPS.nextLineSetSpacingShowText,
]);
const IMAGE_OPS = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]);

const SHIPPED_FONT_PREFIXES = Object.values(EMBEDDED_FONTS).map((family) => family.cssFamily.replace(/\s+/g, ""));

interface TextItem {
  str: string;
  transform: number[];
  width: number;
}

export async function checkPdfCompliance(pdf: Uint8Array, options: ComplianceOptions): Promise<ComplianceViolation[]> {
  const { ruleSet } = options;
  const skip = new Set(options.skip ?? []);
  const checks = (id: ComplianceCheckId, dimension?: NormDimension) =>
    !skip.has(id) && (dimension === undefined || !ruleSet.silentOn.includes(dimension));
  const violations: ComplianceViolation[] = [];

  // --- fonts (whole document) ---------------------------------------------
  const fontNames = await embeddedFontNames(pdf);
  if (checks("system-font") && fontNames.some((name) => !SHIPPED_FONT_PREFIXES.some((prefix) => name.startsWith(prefix)))) {
    violations.push({
      check: "system-font",
      messagePt: "O PDF contém um tipo de letra do sistema em vez dos tipos de letra incorporados.",
    });
  }
  const normPrefix = EMBEDDED_FONTS[options.fontFamily].cssFamily.replace(/\s+/g, "");
  if (checks("norm-font", "typography") && fontNames.some((name) => !name.startsWith(normPrefix))) {
    violations.push({
      check: "norm-font",
      messagePt: `O PDF usa um tipo de letra diferente de ${options.fontFamily}, o exigido pelas normas.`,
    });
  }

  // --- per page -------------------------------------------------------------
  const loadingTask = getDocument({
    data: new Uint8Array(pdf), // pdf.js detaches the buffer it is given
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  /** Normalised text of every page, for the checks that look across pages. */
  const pageTexts: string[] = [];

  try {
    if (checks("page-cap", "pageLimit") && ruleSet.constraints.maxPages !== undefined && doc.numPages > ruleSet.constraints.maxPages) {
      violations.push({
        check: "page-cap",
        messagePt: `O documento tem ${doc.numPages} páginas — a norma permite no máximo ${ruleSet.constraints.maxPages}.`,
      });
    }

    const margins = {
      top: ruleSet.margins.topCm * POINTS_PER_CM,
      right: ruleSet.margins.rightCm * POINTS_PER_CM,
      bottom: ruleSet.margins.bottomCm * POINTS_PER_CM,
      left: ruleSet.margins.leftCm * POINTS_PER_CM,
    };
    const minSize = ruleSet.font.sizePt;
    const maxSize = Math.max(ruleSet.font.sizePt, ...ruleSet.title.sizePt.options);

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const [, , width, height] = page.view;
      const content = await page.getTextContent();
      const items = (content.items as TextItem[]).filter((item) => typeof item.str === "string" && item.str.trim().length > 0);

      const footer: TextItem[] = [];
      const body: TextItem[] = [];
      for (const item of items) {
        const y = item.transform[5];
        if (y < margins.bottom - POSITION_TOLERANCE_PT) footer.push(item);
        else if (y > height - margins.top + POSITION_TOLERANCE_PT) continue; // running header: a section reference, allowed
        else body.push(item);
      }

      if (checks("margins")) {
        const outside = body.some((item) => {
          const x = item.transform[4];
          return x < margins.left - POSITION_TOLERANCE_PT || x + item.width > width - margins.right + POSITION_TOLERANCE_PT;
        });
        if (outside) {
          violations.push({ check: "margins", page: pageNumber, messagePt: `Página ${pageNumber}: há texto fora das margens.` });
        }
      }

      // The cover follows its own rules (checked below), not the body's sizes.
      if (checks("font-size", "typography") && pageNumber > 1) {
        const sizes = body.map((item) => Math.hypot(item.transform[0], item.transform[1]));
        if (sizes.some((size) => size < minSize - SIZE_TOLERANCE_PT || size > maxSize + SIZE_TOLERANCE_PT)) {
          violations.push({
            check: "font-size",
            page: pageNumber,
            messagePt: `Página ${pageNumber}: há texto fora dos tamanhos permitidos (${minSize}–${maxSize} pt).`,
          });
        }
      }

      if (checks("footer-content", "footer") && footer.length > 0) {
        const text = normalizeSpaces(footer.map((item) => item.str).join(" "));
        if (!footerMatches(text, options.candidateName, ruleSet)) {
          violations.push({
            check: "footer-content",
            page: pageNumber,
            messagePt: `Página ${pageNumber}: o rodapé deve conter apenas o nome e o número da página.`,
          });
        }
      }

      const needsOps = checks("text-colour", "colour") || (checks("images-forbidden", "images") && ruleSet.constraints.imagesForbidden);
      if (needsOps) {
        const ops = await page.getOperatorList();
        if (checks("text-colour", "colour") && drawsNonBlackText(ops.fnArray, ops.argsArray)) {
          violations.push({
            check: "text-colour",
            page: pageNumber,
            messagePt: `Página ${pageNumber}: há texto que não está a preto.`,
          });
        }
        if (ruleSet.constraints.imagesForbidden && checks("images-forbidden", "images") && ops.fnArray.some((fn) => IMAGE_OPS.has(fn))) {
          violations.push({
            check: "images-forbidden",
            page: pageNumber,
            messagePt: `Página ${pageNumber}: contém uma imagem, e as normas não permitem fotografias ou gráficos.`,
          });
        }
      }

      pageTexts.push(normalizeForMatch(items.map((item) => item.str).join(" ")));

      if (pageNumber === 1 && checks("cover-fields", "cover")) {
        // Whitespace removed: letter-spaced cover type extracts as "C U R R I …".
        const cover = normalizeForMatch(items.map((item) => item.str).join(" ")).replace(/\s+/g, "");
        const missing = [
          cover.includes(normalizeForMatch(options.candidateName).replace(/\s+/g, "")) ? null : "o nome",
          /curriculumvit/.test(cover) ? null : "«Curriculum Vitae»",
          /(19|20)\d{2}/.test(cover) ? null : "a data",
          !options.localDeFormacao || cover.includes(normalizeForMatch(options.localDeFormacao).replace(/\s+/g, ""))
            ? null
            : "o local de formação",
        ].filter((field): field is string => field !== null);
        if (missing.length > 0) {
          violations.push({ check: "cover-fields", page: 1, messagePt: `A capa não inclui ${missing.join(", ")}.` });
        }
      }

      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  // --- generated front/back matter the profile requires (DIO-50) ------------
  if (ruleSet.frontMatter.rostoSignaturesRequired && checks("rosto-signatures")) {
    const rosto = pageTexts.find((text) => text.includes("exame final de habilitacao"));
    const signed = rosto && /orientador\(a\) de formacao/.test(rosto) && /diretor\(a\) do servico/.test(rosto);
    if (!signed) {
      violations.push({
        check: "rosto-signatures",
        messagePt: "A página de rosto não tem os espaços para as assinaturas do orientador de formação e do diretor do serviço.",
      });
    }
  }
  if (ruleSet.frontMatter.candidateSignatureRequired && checks("candidate-signature")) {
    const last = pageTexts.at(-1) ?? "";
    if (!/candidato\(a\)/.test(last)) {
      violations.push({
        check: "candidate-signature",
        page: pageTexts.length,
        messagePt: "A última página não tem o espaço para a assinatura do candidato.",
      });
    }
  }

  return violations;
}

/**
 * Runs the checker on a real render and turns findings into warnings for the
 * student. It never throws: a checker failure must not cost the student a
 * preview, so it is logged (check ids only, never document content) and
 * the render carries on without findings.
 */
export async function complianceWarnings(
  pdf: Uint8Array,
  options: ComplianceOptions,
): Promise<FormattingWarning[]> {
  try {
    const found = await checkPdfCompliance(pdf, options);
    if (found.length > 0) {
      console.warn("[compliance] violations", found.map((violation) => violation.check).join(","));
    }
    return found.map((violation) => ({
      code: "compliance-violation",
      messagePt: `Verificação automática: ${violation.messagePt}`,
    }));
  } catch (error) {
    console.error("[compliance] checker failed", error instanceof Error ? error.message : "unknown error");
    return [];
  }
}

/** BaseFont names in the PDF, subset prefix ("ABCDEF+") stripped. */
async function embeddedFontNames(pdf: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const names = new Set<string>();
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict && object.get(PDFName.of("Type"))?.toString() === "/Font") {
      const baseFont = object.get(PDFName.of("BaseFont"));
      if (baseFont) names.add(baseFont.toString().replace(/^\/([A-Z]{6}\+)?/, ""));
    }
  }
  return [...names];
}

/** Walks the operator list tracking the fill colour (with save/restore) at every text-showing operator. */
function drawsNonBlackText(fnArray: number[], argsArray: unknown[][]): boolean {
  let fill = "#000000";
  const stack: string[] = [];
  for (let i = 0; i < fnArray.length; i += 1) {
    const fn = fnArray[i];
    if (fn === OPS.save) stack.push(fill);
    else if (fn === OPS.restore) fill = stack.pop() ?? "#000000";
    else if (fn === OPS.setFillRGBColor || fn === OPS.setFillGray || fn === OPS.setFillCMYKColor) {
      fill = colourToHex(argsArray[i]);
    } else if (TEXT_OPS.has(fn) && fill !== "#000000") {
      return true;
    }
  }
  return false;
}

/** pdf.js hands fill colours over as a "#rrggbb" string; older builds as numbers. */
function colourToHex(args: unknown[]): string {
  const [first] = args;
  if (typeof first === "string") return first.toLowerCase();
  const numbers = args.filter((value): value is number => typeof value === "number");
  if (numbers.length === 1) return numbers[0] === 0 ? "#000000" : "#other";
  if (numbers.length >= 3 && numbers.slice(0, 3).every((value) => value === 0)) return "#000000";
  return "#other";
}

/** The footer may hold the candidate's name and/or a page label (arabic or roman), and nothing else. */
function footerMatches(text: string, candidateName: string, ruleSet: RuleSet): boolean {
  const name = normalizeForMatch(candidateName);
  const label = "(\\d+|[ivxlcdm]+)";
  const parts: string[] = [];
  if (ruleSet.footer.includeCandidateName) parts.push(escapeRegExp(name));
  if (ruleSet.footer.includePageNumber) parts.push(label);
  if (parts.length === 0) return text.length === 0;
  return new RegExp(`^${parts.join("\\s*[—–-]\\s*")}$`).test(normalizeForMatch(text));
}

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(text: string): string {
  return normalizeSpaces(text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase());
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
