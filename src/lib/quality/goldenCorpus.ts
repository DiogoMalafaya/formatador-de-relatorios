/**
 * Golden corpus (DIO-47): one fictional multi-file CV per launch specialty.
 *
 * Shaped like the designer-made reference CVs (see
 * `docs/output-quality-review.md`): a documento principal with its own cover
 * lines, nota prévia, dedication, a stale Índice and front-matter lists after
 * it, plus chapter files with a summary table, a chronogram, a large
 * casuística table, long course lists, publications and embedded images.
 *
 * PRIVACY: everything here is invented. The reference CVs contain personal and
 * patient data and must never reach this public repository. No real name,
 * hospital, colleague or case appears below, and none ever should.
 */

import { parseDocxDocument } from "../formatting/parseDocx.ts";
import {
  buildDocx,
  bulletItem,
  heading,
  imageParagraph,
  paragraph,
  simpleTable,
} from "../formatting/testFixtures.ts";
import { resolveRuleSetId } from "../specialties/index.ts";
import type { ParsedSource } from "../rendering/prepareDocument.ts";

export interface CorpusCase {
  specialtyId: string;
  ruleSetId: string;
  candidateName: string;
  sources: ParsedSource[];
  /** The documento principal is always first in the corpus. */
  masterPosition: 0;
  /** Fixed, so renders are reproducible. */
  dateLabel: string;
}

interface Flavour {
  specialtyId: string;
  internatoPt: string;
  candidateName: string;
  /** The summary section's title as that specialty's norms name it. */
  summaryTitle: string;
  areas: readonly string[];
}

/** One flavour per launch specialty, all invented. */
const FLAVOURS: readonly Flavour[] = [
  {
    specialtyId: "anestesiologia",
    internatoPt: "Internato Médico de Anestesiologia",
    candidateName: "Rita Inventada Soares",
    summaryTitle: "Resumo curricular",
    areas: ["Bloco operatório", "Anestesia regional", "Dor aguda", "Medicina intensiva", "Emergência"],
  },
  {
    specialtyId: "cirurgia-geral",
    internatoPt: "Internato Médico de Cirurgia Geral",
    candidateName: "Tomás Fictício Lopes",
    summaryTitle: "Resumo curricular",
    areas: ["Parede abdominal", "Cirurgia colorretal", "Cirurgia hepatobiliar", "Mama", "Urgência"],
  },
  {
    specialtyId: "medicina-fisica-e-de-reabilitacao",
    internatoPt: "Internato Médico de Medicina Física e de Reabilitação",
    candidateName: "Inês Carvalho Moreira",
    summaryTitle: "Resumo do currículo",
    areas: ["Musculoesquelética", "Neurológica", "Pediátrica", "Cardiorrespiratória", "Amputados"],
  },
  {
    specialtyId: "oftalmologia",
    internatoPt: "Formação Especializada do Internato Médico de Oftalmologia",
    candidateName: "Duarte Imaginário Paiva",
    summaryTitle: "Resumo do Curriculum Vitae",
    areas: ["Catarata", "Glaucoma", "Retina médica", "Córnea", "Oculoplástica"],
  },
  {
    specialtyId: "ortopedia",
    internatoPt: "Internato Médico de Ortopedia e Traumatologia",
    candidateName: "Joana Exemplo Vaz",
    summaryTitle: "Resumo curricular",
    areas: ["Coluna vertebral", "Membro superior", "Anca", "Joelho", "Pé e tornozelo"],
  },
  {
    specialtyId: "pediatria",
    internatoPt: "Internato Médico de Pediatria",
    candidateName: "Miguel Suposto Reis",
    summaryTitle: "Síntese curricular",
    areas: ["Neonatologia", "Urgência pediátrica", "Gastrenterologia", "Neuropediatria", "Pneumologia"],
  },
];

export const GOLDEN_SPECIALTY_IDS: readonly string[] = FLAVOURS.map((flavour) => flavour.specialtyId);

const prose = (topic: string) =>
  `Durante este período participei de forma ativa em ${topic}, assumindo progressivamente maior ` +
  `autonomia na avaliação, na definição de planos terapêuticos e na articulação com a equipa ` +
  `multidisciplinar. Esta experiência consolidou competências de comunicação com o doente e a ` +
  `família, bem como de planeamento da alta, em estreita colaboração com os cuidados de saúde primários.`;

async function source(id: string, filename: string, children: Parameters<typeof buildDocx>[0]): Promise<ParsedSource> {
  return { id, filename, document: await parseDocxDocument(await buildDocx(children)) };
}

export async function buildCorpusCase(specialtyId: string): Promise<CorpusCase> {
  const flavour = FLAVOURS.find((candidate) => candidate.specialtyId === specialtyId);
  if (!flavour) throw new Error(`no golden corpus flavour for ${specialtyId}`);
  const { candidateName, areas } = flavour;

  const master = await source("master", "Documento principal.docx", [
    paragraph(candidateName),
    paragraph("Curriculum Vitae"),
    paragraph(flavour.internatoPt),
    paragraph("Hospital Universitário Imaginário, 2021-2026"),
    heading(1, "Nota prévia"),
    paragraph("O presente Curriculum Vitae foi elaborado para a prova de avaliação curricular do exame final do internato."),
    heading(1, "Dedicatória"),
    paragraph("Aos meus pais, pela paciência inventada."),
    heading(1, "Índice"),
    paragraph("Identificação ........................ 1"),
    paragraph(`${flavour.summaryTitle} ........................ 3`),
    heading(1, "Lista de Abreviaturas e Siglas"),
    ...["HUI – Hospital Universitário Imaginário", "SNF – Serviço Nacional Fictício", "UCI – Unidade de Cuidados Intensivos"].map(
      paragraph,
    ),
    // Stale on purpose: wrong titles and only two of the three tables.
    heading(1, "Lista de Tabelas"),
    paragraph("Tabela 1 – Resumo curricular"),
    paragraph("Tabela 2 – Casuística"),
  ]);

  // Long enough to run over a page, like the reference CVs' casuística, so
  // the repeated header row is exercised (DIO-48).
  const casuistica = [["Área", "Diagnóstico", "Primeiras", "Subsequentes", "Total"]];
  const totals = [0, 0, 0];
  areas.forEach((area, a) => {
    for (let d = 1; d <= 8; d += 1) {
      const first = 10 + a * 7 + d * 3;
      const next = 20 + a * 11 + d * 5;
      totals[0] += first;
      totals[1] += next;
      totals[2] += first + next;
      casuistica.push([area, `Diagnóstico fictício ${d}`, String(first), String(next), String(first + next)]);
    }
  });
  casuistica.push(["Total", "", ...totals.map(String)]);

  const chapters = await Promise.all([
    source("identificacao", "01 Identificação.docx", [
      heading(1, "IDENTIFICAÇÃO"),
      paragraph(`Nome: ${candidateName}`),
      paragraph("Naturalidade: Vila Inventada"),
      paragraph("Correio eletrónico: exemplo@exemplo.pt"),
    ]),
    source("resumo", "02 Resumo.docx", [
      heading(1, flavour.summaryTitle),
      paragraph(prose("todo o percurso formativo")),
      paragraph("Tabela 1 – Percurso até ao internato"),
      simpleTable([
        ["Etapa", "Descrição", "Resultado"],
        ["2013-2019", "Mestrado Integrado em Medicina", "17 valores"],
        ["2020", "Prova Nacional de Acesso", "88%"],
        ["2021", "Formação Geral", "Apto"],
        ["2021-2026", flavour.internatoPt, "—"],
      ]),
    ]),
    source("percurso", "03 Percurso formativo.docx", [
      heading(1, "Percurso formativo"),
      heading(2, "Formação académica"),
      paragraph(prose("o Mestrado Integrado em Medicina")),
      heading(2, "Cronograma do internato"),
      simpleTable([
        ["Ano", "1.º semestre", "2.º semestre"],
        ...[2021, 2022, 2023, 2024, 2025].map((year, i) => [String(year), areas[i % areas.length], areas[(i + 1) % areas.length]]),
      ]),
      // Typed below the table, as Word puts captions by default.
      paragraph("Tabela 2: Cronograma dos estágios"),
      ...areas.map((area) => paragraph(prose(`o estágio de ${area.toLowerCase()}`))),
    ]),
    source("assistencial", "04 Atividade assistencial.docx", [
      heading(1, "ATIVIDADE ASSISTENCIAL"),
      heading(2, "Casuística"),
      paragraph(prose("consultas e internamento")),
      paragraph("Tabela 3 – Casuística por área e diagnóstico"),
      simpleTable(casuistica),
      paragraph("Legenda: Primeiras – primeiras consultas; Subsequentes – consultas de seguimento."),
      heading(2, "Registos"),
      paragraph("Figura ilustrativa fictícia:"),
      imageParagraph(),
      paragraph("Logótipo fictício do serviço:"),
      imageParagraph(),
    ]),
    source("valorizacao", "05 Valorização profissional.docx", [
      heading(1, "Valorização profissional"),
      heading(2, "Cursos"),
      ...Array.from({ length: 15 }, (_, i) =>
        bulletItem(`Curso fictício n.º ${i + 1} — Sociedade Inventada, Lisboa, ${2021 + (i % 5)} (Doc. ${i + 20})`),
      ),
      heading(2, "Congressos"),
      ...Array.from({ length: 10 }, (_, i) => bulletItem(`${i + 10}.º Congresso Nacional Imaginário, Porto, ${2021 + (i % 5)}`)),
    ]),
    source("cientifica", "06 Atividade científica.docx", [
      heading(1, "Atividade científica"),
      heading(2, "Publicações"),
      ...Array.from({ length: 4 }, (_, i) =>
        paragraph(`Autor A, Autor B, Autor C. Título inventado de artigo n.º ${i + 1}. Rev Fict. 202${i + 2};${10 + i}(2):1-8.`),
      ),
      heading(2, "Comunicações"),
      ...Array.from({ length: 8 }, (_, i) => bulletItem(`Comunicação oral fictícia n.º ${i + 1} — Reunião Imaginária, 202${(i % 5) + 1}`)),
    ]),
    source("reflexao", "07 Reflexão final.docx", [
      heading(1, "Reflexão final"),
      paragraph(prose("todo o internato")),
      paragraph(prose("o serviço de acolhimento")),
    ]),
  ]);

  return {
    specialtyId,
    ruleSetId: resolveRuleSetId(specialtyId),
    candidateName,
    sources: [master, ...chapters],
    masterPosition: 0,
    dateLabel: "12 de março de 2026",
  };
}
