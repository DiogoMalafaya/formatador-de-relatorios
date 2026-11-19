/**
 * Norm profiles (DIO-10, reworked in DIO-43).
 *
 * A profile is what one Colégio da Ordem dos Médicos publishes about the
 * final-exam CV, translated into parameters the engine can apply — plus
 * where that came from and what the Colégio is *silent* on. Data, not code:
 * keyed by `id`, resolved from a specialty via `resolveRuleSetId`, never
 * hardcoded into the engine.
 *
 * The Ordem publishes three different things, hence `kind`:
 * - `explicit` — written norms (MFR, Pediatria). Every stated rule is binding.
 * - `template` — an official CV template (Oftalmologia). Its structure and
 *   limits are guidance; its look is Word's defaults, not a rule.
 * - `none` — nothing published (Anestesiologia, Cirurgia Geral, Ortopedia).
 *   These use the Lauda house standard, with the Colégio's own sources kept
 *   so the workspace can say *why* the house standard applies.
 *
 * Anything a profile is silent on (`silentOn`) falls back to the house
 * standard (PRD §6.2, `docs/prd-cv-output-quality.md`). Today the engine's
 * house standard is deliberately close to MFR's typography; the house
 * themes (DIO-56) and embedded open fonts (DIO-46) build on this shape.
 *
 * Sources were retrieved from each specialty's page on ordemdosmedicos.pt
 * (Colégios → Especialidades → <especialidade> → Internato → Currículo).
 * Never edit a profile from memory: re-read the source and bump
 * `retrievedOn`.
 */

export type FontFamily = "Arial" | "Times New Roman" | "Verdana";
export type TitleSizePt = 12 | 14;

export type NormKind = "explicit" | "template" | "none";

/** How the Colégio expects the CV delivered — drives duplex/blank-page defaults later (DIO-51). */
export type Delivery = "print" | "pdf";

/** Dimensions a profile can be silent on; silence means the house standard decides. */
export type NormDimension =
  | "typography"
  | "colour"
  | "images"
  | "tables"
  | "pageLimit"
  | "footer"
  | "cover"
  | "structure";

export interface Choice<T> {
  options: readonly T[];
  default: T;
}

export interface NormSource {
  /** pt-PT title of the document as the Ordem links it. */
  titlePt: string;
  url: string;
  /** Approval/version line, as printed in the document. */
  versionPt: string;
}

export interface PageMargins {
  topCm: number;
  rightCm: number;
  bottomCm: number;
  leftCm: number;
}

/** A section the norms cap in length. Checked as a warning, never a block. */
export interface SectionLimit {
  /** Section title as the norms name it (pt-PT). */
  titlePt: string;
  maxPages?: number;
  /** Characters *without spaces*, as Oftalmologia's template counts them. */
  maxCharactersNoSpaces?: number;
}

/**
 * The one section whose page cap the paginated render checks exactly today
 * (MFR "Resumo do currículo" ≤ 2, Pediatria "Síntese curricular" ≤ 3).
 * Other `sectionLimits` are carried as data for the checker in DIO-47.
 */
export interface SummarySectionRule {
  /** pt-PT name used in the warning, e.g. "O resumo do currículo". */
  labelPt: string;
  /** Matched against the heading text, lowercased and without accents. */
  headingPattern: RegExp;
  maxPages: number;
}

export interface RuleSet {
  id: string;
  /** pt-PT label, e.g. "Colégio de Medicina Física e de Reabilitação". */
  name: string;
  kind: NormKind;
  /** One pt-PT sentence for the workspace: whose rules apply and why. */
  provenancePt: string;
  /** Empty only for the house standard itself. */
  sources: readonly NormSource[];
  /** ISO date the sources were last read. */
  retrievedOn: string;
  silentOn: readonly NormDimension[];

  font: {
    family: Choice<FontFamily>;
    sizePt: number;
    color: string;
  };

  title: {
    bold: true;
    sizePt: Choice<TitleSizePt>;
  };

  lineSpacing: number;
  margins: PageMargins;

  page: {
    size: "A4";
    color: "white";
    duplex: boolean;
    delivery: Delivery;
  };

  footer: {
    includeCandidateName: boolean;
    includePageNumber: boolean;
  };

  header: {
    /** Optional in every profile seen so far — never required content. */
    allowed: boolean;
  };

  /** Generated front and back matter the norms require (DIO-50). */
  frontMatter: {
    /** Página de rosto signed by the Orientador de Formação and the Diretor do Serviço. */
    rostoSignaturesRequired: boolean;
    /** The candidate signs the last page. */
    candidateSignatureRequired: boolean;
  };

  constraints: {
    imagesForbidden: boolean;
    /** Tables allowed only for activity schematisation — flagged, not blocked. */
    tablesRestrictedToActivitySchematization: boolean;
    maxPages?: number;
    summarySection?: SummarySectionRule;
  };

  /** Ordered section names the norms/template prescribe (guidance; checked from DIO-47). */
  structurePt?: readonly string[];
  sectionLimits?: readonly SectionLimit[];
}

const ORDEM_FILES = "https://ordemdosmedicos.pt/files";
const COLEGIOS = "https://ordemdosmedicos.pt/a-ordem/orgaos-tecnicos/colegios/especialidades";

const UNIFORM_2_5CM: PageMargins = { topCm: 2.5, rightCm: 2.5, bottomCm: 2.5, leftCm: 2.5 };

/**
 * The Lauda house standard's engine parameters (PRD §6.2). Kept close to
 * the strictest published typography until the house themes land, so a
 * `none` specialty never looks *less* conservative than MFR by accident.
 * What differs today is what's allowed: images, unrestricted tables, no
 * hard page cap.
 */
const HOUSE_PARAMETERS = {
  font: {
    family: { options: ["Arial", "Times New Roman"], default: "Times New Roman" },
    sizePt: 12,
    color: "black",
  },
  title: { bold: true, sizePt: { options: [12, 14], default: 14 } },
  lineSpacing: 1.5,
  margins: UNIFORM_2_5CM,
  page: { size: "A4", color: "white", duplex: true, delivery: "print" },
  footer: { includeCandidateName: true, includePageNumber: true },
  header: { allowed: true },
  frontMatter: { rostoSignaturesRequired: false, candidateSignatureRequired: false },
  constraints: {
    imagesForbidden: false,
    tablesRestrictedToActivitySchematization: false,
  },
} as const satisfies Pick<
  RuleSet,
  "font" | "title" | "lineSpacing" | "margins" | "page" | "footer" | "header" | "frontMatter" | "constraints"
>;

const ALL_DIMENSIONS: readonly NormDimension[] = [
  "typography",
  "colour",
  "images",
  "tables",
  "pageLimit",
  "footer",
  "cover",
  "structure",
];

export const HOUSE_RULE_SET_ID = "lauda";

const HOUSE: RuleSet = {
  id: HOUSE_RULE_SET_ID,
  name: "Padrão Lauda",
  kind: "none",
  provenancePt: "Aplicámos o padrão Lauda.",
  sources: [],
  retrievedOn: "2026-11-13",
  silentOn: ALL_DIMENSIONS,
  ...HOUSE_PARAMETERS,
};

/**
 * Colégio de Medicina Física e de Reabilitação — `Normas_CV_MFR_final.pdf`
 * (2013) as amended by the Conselho Nacional on 3.12.2018, which raised the
 * page cap from 80 to 100 for the 5-year internato.
 */
const MFR: RuleSet = {
  id: "mfr",
  name: "Colégio de Medicina Física e de Reabilitação",
  kind: "explicit",
  provenancePt:
    "Segue as normas do Colégio de Medicina Física e de Reabilitação (2013, alteradas em 2018).",
  sources: [
    {
      titlePt: "Normas para a elaboração de um Curriculum Vitæ",
      url: `${ORDEM_FILES}/pdfs/PAHJ-Normas_CV_MFR_final.pdf`,
      versionPt: "Colégio de MFR, 2013",
    },
    {
      titlePt: "Alteração às regras vigentes para elaboração dos Curricula Vitarum",
      // The Ordem serves this file under a decomposed-accent (NFD) name; the
      // composed form of the same URL redirects to the homepage.
      url: `${ORDEM_FILES}/pdfs/7zbb-CV-normas-elaborac%CC%A7a%CC%83o-dos-CV-para-o-exame-de-atribuic%CC%A7a%CC%83o-do-ti%CC%81tulo-de-especialista.pdf`,
      versionPt: "Aprovado pelo Conselho Nacional em 3.12.2018",
    },
  ],
  retrievedOn: "2026-11-13",
  silentOn: [],
  font: {
    family: { options: ["Arial", "Times New Roman"], default: "Times New Roman" },
    sizePt: 12,
    color: "black",
  },
  title: { bold: true, sizePt: { options: [12, 14], default: 14 } },
  lineSpacing: 1.5,
  margins: UNIFORM_2_5CM,
  page: { size: "A4", color: "white", duplex: true, delivery: "print" },
  footer: { includeCandidateName: true, includePageNumber: true },
  header: { allowed: true },
  // The title page is signed by the orientador and the diretor de serviço, and
  // the last page by the candidate (PRD §3's summary of the MFR norms).
  frontMatter: { rostoSignaturesRequired: true, candidateSignatureRequired: true },
  constraints: {
    imagesForbidden: true,
    tablesRestrictedToActivitySchematization: true,
    maxPages: 100,
    summarySection: {
      labelPt: "O resumo do currículo",
      headingPattern: /^resumo( do curriculo)?$/,
      maxPages: 2,
    },
  },
  structurePt: [
    "Sumário",
    "Identificação",
    "Resumo do currículo",
    "Formação até ao ingresso no internato de formação específica",
    "Internato de formação específica",
    "Atividade assistencial",
    "Atividade científica",
    "Atividade docente",
    "Classificações anuais e classificação final do internato",
    "Sociedades ou organizações a que pertence",
  ],
  sectionLimits: [{ titlePt: "Resumo do currículo", maxPages: 2 }],
};

/**
 * Colégio de Pediatria — "Recomendações para a elaboração do Curriculum
 * Vitae", approved 20.7.2018 by the Colégio's direction and by the Conselho
 * Nacional on 13.09.2018, in force from 2021. Fixes typography and
 * structure; silent on colour, images, footer, cover and an overall cap.
 * The CV is submitted electronically as PDF (Portaria 79/2018, art. 70.º).
 */
const PEDIATRIA: RuleSet = {
  id: "pediatria",
  name: "Colégio de Pediatria",
  kind: "explicit",
  provenancePt: "Segue as recomendações do Colégio de Pediatria (2018, em vigor desde 2021).",
  sources: [
    {
      titlePt: "Recomendações para a elaboração de um Curriculum Vitæ",
      url: `${ORDEM_FILES}/pdfs/tq8d-pediatria-recomendacoes-elaboracao-cv-1.pdf`,
      versionPt: "Aprovado pelo Conselho Nacional em 13.09.2018, em vigor em 2021",
    },
  ],
  retrievedOn: "2026-11-13",
  silentOn: ["colour", "images", "pageLimit", "footer", "cover"],
  font: {
    family: { options: ["Verdana"], default: "Verdana" },
    sizePt: 10,
    color: "black",
  },
  // Titles aren't specified; 12/14 keeps them clearly above the 10pt body.
  title: { bold: true, sizePt: { options: [12, 14], default: 12 } },
  lineSpacing: 1.5,
  margins: { topCm: 2.5, rightCm: 3, bottomCm: 2.5, leftCm: 3 },
  page: { size: "A4", color: "white", duplex: false, delivery: "pdf" },
  footer: { includeCandidateName: true, includePageNumber: true },
  header: { allowed: true },
  frontMatter: { rostoSignaturesRequired: false, candidateSignatureRequired: false },
  constraints: {
    imagesForbidden: false,
    tablesRestrictedToActivitySchematization: false,
    summarySection: {
      labelPt: "A síntese curricular",
      headingPattern: /^sintese curricular$/,
      maxPages: 3,
    },
  },
  structurePt: [
    "Página de Rosto",
    "Lista de Siglas e Abreviaturas",
    "Índice",
    "Identificação",
    "Percurso Académico e Profissional",
    "Síntese curricular",
    "Atividade Clínica",
    "Atividade Científica",
    "Outras Atividades Formativas e Pedagógicas",
    "Outras Atividades Desempenhadas no Âmbito Profissional",
    "Atividade Docente",
    "Atividade Investigacional",
    "Outras atividades de valorização pessoal",
    "Sociedades Científicas",
    "Agradecimentos",
    "Considerações Finais",
    "Anexos",
  ],
  sectionLimits: [
    { titlePt: "Síntese curricular", maxPages: 3 },
    { titlePt: "Descrição sumária da Instituição de Acolhimento", maxPages: 3 },
    // "máximo de 2 páginas A4 por cada período de 3 meses de estágio" —
    // depends on each estágio's length, so it can't be a fixed number here.
    { titlePt: "Contributo do trabalho do candidato para os serviços", maxPages: 2 },
    { titlePt: "Agradecimentos", maxPages: 1 },
    { titlePt: "Considerações Finais", maxPages: 2 },
  ],
};

/**
 * Colégio de Oftalmologia — "Modelo de Curriculum Vitae (CV)", an official
 * Word template. Its section tree and character limits are guidance; its
 * typography (Calibri 11, Word's default blue headings) is the template's
 * default look, not a stated rule, so typography and colour stay with the
 * house standard. 2.5 cm margins match the template.
 */
const OFTALMOLOGIA: RuleSet = {
  id: "oftalmologia",
  name: "Colégio de Oftalmologia",
  kind: "template",
  provenancePt: "Segue o modelo de currículo publicado pelo Colégio de Oftalmologia.",
  sources: [
    {
      titlePt: "Modelo de Curriculum Vitae (CV)",
      url: `${ORDEM_FILES}/documents/sshg-modelo-de-curriculum-vitae-cv-oftalmologia.docx`,
      versionPt: "Modelo do Colégio de Oftalmologia",
    },
  ],
  retrievedOn: "2026-11-13",
  silentOn: ["typography", "colour", "images", "tables", "pageLimit", "cover"],
  ...HOUSE_PARAMETERS,
  structurePt: [
    "Abreviaturas e siglas",
    "Preâmbulo",
    "Nota vocacional",
    "Dados pessoais",
    "Resumo do Curriculum Vitae",
    "Formação académica",
    "Formação médica pós-graduada",
    "Comentários finais",
  ],
  sectionLimits: [
    { titlePt: "Preâmbulo", maxCharactersNoSpaces: 2000 },
    { titlePt: "Nota vocacional", maxCharactersNoSpaces: 1000 },
    { titlePt: "Resumo do Curriculum Vitae", maxCharactersNoSpaces: 4000 },
    { titlePt: "Introdução (Formação Especializada)", maxCharactersNoSpaces: 6000 },
    { titlePt: "Cada consulta", maxCharactersNoSpaces: 2000 },
    { titlePt: "Apoio à Enfermaria", maxCharactersNoSpaces: 1000 },
    { titlePt: "Apoio a Outros Serviços Hospitalares e/ou outros Hospitais", maxCharactersNoSpaces: 1000 },
    { titlePt: "Serviço de Urgência", maxCharactersNoSpaces: 2000 },
    { titlePt: "Introdução (Atividade Cirúrgica)", maxCharactersNoSpaces: 2000 },
    { titlePt: "Investigação Científica", maxCharactersNoSpaces: 2000 },
    { titlePt: "Outras Competências/Atividades científicas", maxCharactersNoSpaces: 4000 },
    { titlePt: "Comentários finais", maxCharactersNoSpaces: 4000 },
  ],
};

/** A specialty whose Colégio publishes no CV norms: house parameters, own provenance. */
function noNormsProfile(id: string, colegio: string, internatoPath: string): RuleSet {
  return {
    ...HOUSE,
    id,
    name: `Colégio de ${colegio}`,
    provenancePt: `O Colégio de ${colegio} não publica normas de formatação do currículo — aplicámos o padrão Lauda.`,
    sources: [
      {
        titlePt: `Internato Médico — ${colegio}`,
        url: `${COLEGIOS}/${internatoPath}/internato`,
        versionPt: "Página do Colégio, sem normas para o currículo",
      },
    ],
    retrievedOn: "2026-11-13",
  };
}

const RULE_SETS: Record<string, RuleSet> = Object.fromEntries(
  [
    HOUSE,
    MFR,
    PEDIATRIA,
    OFTALMOLOGIA,
    noNormsProfile("anestesiologia", "Anestesiologia", "anestesiologia"),
    noNormsProfile("cirurgia-geral", "Cirurgia Geral", "cirurgia-geral"),
    noNormsProfile("ortopedia", "Ortopedia", "ortopedia"),
  ].map((ruleSet) => [ruleSet.id, ruleSet]),
);

/**
 * Falls back to the house standard for an unknown id — never throws on
 * config drift, and never silently applies another Colégio's norms.
 */
export function getRuleSet(ruleSetId: string): RuleSet {
  return RULE_SETS[ruleSetId] ?? HOUSE;
}

/** Every profile, for tests and the catalogue (DIO-44). */
export function getAllRuleSets(): readonly RuleSet[] {
  return Object.values(RULE_SETS);
}

/** Margins in the shape `page.pdf({ margin })` expects. */
export function printMargins(margins: PageMargins): { top: string; right: string; bottom: string; left: string } {
  return {
    top: `${margins.topCm}cm`,
    right: `${margins.rightCm}cm`,
    bottom: `${margins.bottomCm}cm`,
    left: `${margins.leftCm}cm`,
  };
}
