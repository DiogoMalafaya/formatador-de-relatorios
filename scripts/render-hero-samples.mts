/**
 * Renders the landing hero's background grid: real output of our pipeline
 * (formatting engine → cover merge → Chromium PDF), rasterised to JPEGs in
 * `public/hero/`.
 *
 * Every CV here is fictional — invented names, institutions and activity, no
 * patient data — so the images can ship in a public repository. Re-run after
 * a visible change to the engine, covers or footer:
 *
 *   node scripts/render-hero-samples.mts
 *
 * macOS only: rasterisation uses `sips`, which renders the first page of a
 * PDF, so each page is split into its own PDF with pdf-lib first.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { applyFormatting } from "../src/lib/formatting/apply.ts";
import { mergeCoverWithDocument } from "../src/lib/covers/merge.ts";
import { renderPdf } from "../src/lib/pdf/render.ts";
import {
  buildDocx,
  bulletItem,
  heading,
  paragraph,
  simpleTable,
} from "../src/lib/formatting/testFixtures.ts";
import type { FontFamily, TitleSizePt } from "../src/lib/formatting/ruleSet.ts";

const OUT_DIR = join(import.meta.dirname, "..", "public", "hero");
/** Body pages kept per sample, after the cover. */
const BODY_PAGES = 3;
const WIDTH_PX = 520;

interface Sample {
  name: string;
  hospital: string;
  city: string;
  coverId: string;
  fontFamily: FontFamily;
  titleSizePt: TitleSizePt;
  dateLabel: string;
}

const SAMPLES: Sample[] = [
  {
    name: "Inês Carvalho Moreira",
    hospital: "Centro Hospitalar Universitário do Litoral",
    city: "Coimbra",
    coverId: "classica",
    fontFamily: "Times New Roman",
    titleSizePt: 14,
    dateLabel: "12 de março de 2026",
  },
  {
    name: "Tiago Almeida Rocha",
    hospital: "Hospital Distrital da Serra",
    city: "Viseu",
    coverId: "moderna",
    fontFamily: "Arial",
    titleSizePt: 12,
    dateLabel: "4 de junho de 2026",
  },
  {
    name: "Beatriz Santos Lima",
    hospital: "Unidade Local de Saúde do Estuário",
    city: "Lisboa",
    coverId: "formal",
    fontFamily: "Arial",
    titleSizePt: 14,
    dateLabel: "18 de setembro de 2026",
  },
];

function cvBody(sample: Sample) {
  const lorem = (topic: string) =>
    `Durante este período participei de forma ativa em ${topic}, assumindo progressivamente maior ` +
    `autonomia na avaliação funcional, na definição de objetivos de reabilitação e na articulação com ` +
    `a equipa multidisciplinar de fisioterapia, terapia ocupacional e terapia da fala. Esta experiência ` +
    `consolidou competências de comunicação com a família e de planeamento da alta, em estreita ` +
    `colaboração com os cuidados de saúde primários da área de referência.`;

  return [
    heading(1, sample.name),
    heading(2, "Resumo do currículo"),
    paragraph(
      `Médica/o interna/o de formação especializada em Medicina Física e de Reabilitação no ${sample.hospital}, ` +
        `em ${sample.city}. O presente currículo descreve, por ordem cronológica, a atividade assistencial, ` +
        `formativa e científica desenvolvida ao longo do internato, bem como a casuística correspondente.`,
    ),
    paragraph(lorem("consultas externas de reabilitação geral e de patologia musculoesquelética")),
    heading(2, "Identificação"),
    bulletItem(`Nome: ${sample.name}`),
    bulletItem(`Local de formação: ${sample.hospital}`),
    bulletItem("Especialidade: Medicina Física e de Reabilitação"),
    heading(2, "Formação pré-graduada"),
    paragraph(
      "Mestrado Integrado em Medicina, concluído com classificação final de dezassete valores. " +
        "Durante o curso frequentou estágios opcionais em reabilitação neurológica e em medicina desportiva.",
    ),
    heading(2, "Organização do internato"),
    simpleTable([
      ["Período", "Estágio", "Local"],
      ["1.º ano", "Reabilitação geral", sample.hospital],
      ["2.º ano", "Medicina Interna e Neurologia", sample.hospital],
      ["3.º ano", "Reabilitação neurológica", `Centro de Reabilitação de ${sample.city}`],
      ["4.º ano", "Reabilitação pediátrica", "Hospital Pediátrico Regional"],
      ["5.º ano", "Reabilitação cardiorrespiratória", sample.hospital],
    ]),
    heading(2, "Atividade assistencial"),
    heading(3, "Reabilitação geral"),
    paragraph(lorem("internamento de reabilitação e consultas de fisiatria geral")),
    paragraph(lorem("programas de reabilitação pós-operatória em ortopedia")),
    heading(3, "Reabilitação neurológica"),
    paragraph(lorem("programas de reabilitação após acidente vascular cerebral e lesão medular")),
    heading(3, "Casuística"),
    simpleTable([
      ["Área", "Primeiras consultas", "Consultas subsequentes"],
      ["Musculoesquelética", "412", "968"],
      ["Neurológica", "236", "701"],
      ["Pediátrica", "148", "392"],
      ["Cardiorrespiratória", "97", "254"],
    ]),
    heading(2, "Formação complementar"),
    bulletItem("Curso de Ecografia Musculoesquelética — nível básico e avançado"),
    bulletItem("Curso de Espasticidade e Toxina Botulínica"),
    bulletItem("Curso de Suporte Avançado de Vida"),
    paragraph(lorem("reuniões de serviço e sessões clínicas semanais")),
    heading(2, "Atividade científica"),
    paragraph(lorem("trabalhos apresentados em congressos nacionais e internacionais da especialidade")),
    paragraph(lorem("projetos de investigação clínica do serviço")),
  ];
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of readdirSync(OUT_DIR)) rmSync(join(OUT_DIR, file));
  const work = mkdtempSync(join(tmpdir(), "hero-samples-"));

  try {
    for (const [sampleIndex, sample] of SAMPLES.entries()) {
      const docx = await buildDocx(cvBody(sample));
      const formatted = await applyFormatting(docx, {
        ruleSetId: "mfr",
        fontFamily: sample.fontFamily,
        titleSizePt: sample.titleSizePt,
      });
      const withCover = mergeCoverWithDocument(formatted, {
        coverId: sample.coverId,
        candidateName: sample.name,
        dateLabel: sample.dateLabel,
      });
      const pdf = await PDFDocument.load(await renderPdf(withCover, { candidateName: sample.name }));

      const pageCount = Math.min(pdf.getPageCount(), 1 + BODY_PAGES);
      for (let page = 0; page < pageCount; page++) {
        const single = await PDFDocument.create();
        const [copied] = await single.copyPages(pdf, [page]);
        single.addPage(copied);

        const base = `sample-${sampleIndex + 1}-${page + 1}`;
        const pdfPath = join(work, `${base}.pdf`);
        writeFileSync(pdfPath, await single.save());
        execFileSync("sips", [
          "-s", "format", "jpeg",
          "-s", "formatOptions", "72",
          "--resampleWidth", String(WIDTH_PX),
          pdfPath,
          "--out", join(OUT_DIR, `${base}.jpg`),
        ], { stdio: "ignore" });
      }
      console.log(`${sample.name}: ${pageCount} pages`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
