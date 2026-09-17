/**
 * Synthesised multi-file CV fixtures for the DIO-41 merge tests.
 *
 * PRIVACY (PRD §12 Q5): the repository is public and the real reference
 * corpus contains patient/personal data, so these fixtures mirror only the
 * corpus's *structure* — a documento principal (cover text, structure page,
 * dedication, stale Índice) plus chapter files with inconsistent top-heading
 * casing/levels — with entirely invented names and content. Never paste real
 * corpus content here.
 *
 * Fixtures are authored with the `docx` builders and run through the real
 * parser, so the merge engine is tested against genuine mammoth output.
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
import type { MergeSource } from "./types.ts";

async function source(id: string, children: Parameters<typeof buildDocx>[0]): Promise<MergeSource> {
  const buffer = await buildDocx(children);
  return { id, document: await parseDocxDocument(buffer) };
}

/**
 * Documento principal: cover text, structure page, dedication, and a stale
 * Índice whose dotted-leader page numbers no longer match anything.
 */
export function buildMasterFixture(): Promise<MergeSource> {
  return source("master", [
    paragraph("Beatriz Fictícia Andrade"),
    paragraph("Curriculum Vitae"),
    paragraph("Unidade de Saúde Familiar Imaginária, Vila Inventada"),
    paragraph("Janeiro de 2026"),
    heading(1, "Estrutura do Documento"),
    paragraph("Este documento está organizado por áreas de atividade, seguido dos anexos."),
    heading(1, "Dedicatória"),
    paragraph("Aos meus orientadores fictícios, pela paciência inventada."),
    heading(1, "Índice"),
    paragraph("Saúde Materna ........................................ 12"),
    paragraph("Saúde Mental ......................................... 34"),
    paragraph("Planeamento Familiar ................................. 56"),
  ]);
}

/** A master without any Índice — front matter only. */
export function buildMasterWithoutTocFixture(): Promise<MergeSource> {
  return source("master-no-toc", [
    paragraph("Beatriz Fictícia Andrade"),
    paragraph("Curriculum Vitae"),
    heading(1, "Dedicatória"),
    paragraph("Aos meus orientadores fictícios."),
  ]);
}

/** Chapter with an ALL-CAPS top heading, subsections, and a casuística table. */
export function buildChapterSaudeMaterna(): Promise<MergeSource> {
  return source("saude-materna", [
    heading(1, "SAÚDE MATERNA"),
    paragraph("Atividade inventada em consulta de vigilância da gravidez."),
    heading(2, "Consultas de vigilância"),
    paragraph("Descrição fictícia das consultas realizadas."),
    simpleTable([
      ["Ano", "Consultas", "Observações"],
      ["2024", "111", "valor inventado"],
      ["2025", "222", "valor inventado"],
    ]),
  ]);
}

/** Chapter with a Title-Case top heading and a bullet list. */
export function buildChapterSaudeMental(): Promise<MergeSource> {
  return source("saude-mental", [
    heading(1, "Saúde Mental"),
    paragraph("Resumo fictício da atividade em saúde mental."),
    bulletItem("Consulta inventada de acompanhamento"),
    bulletItem("Sessão fictícia de articulação com a equipa"),
  ]);
}

/** Chapter with an ALL-CAPS top heading and a second table. */
export function buildChapterPlaneamentoFamiliar(): Promise<MergeSource> {
  return source("planeamento-familiar", [
    heading(1, "PLANEAMENTO FAMILIAR"),
    paragraph("Texto inventado sobre planeamento familiar."),
    simpleTable([
      ["Ano", "Atos"],
      ["2025", "333"],
    ]),
  ]);
}

/** Chapter whose top heading is an h2 (inconsistent source styling), with an h3 below it. */
export function buildChapterSaudeDoAdulto(): Promise<MergeSource> {
  return source("saude-do-adulto", [
    heading(2, "Saúde do Adulto"),
    paragraph("Atividade fictícia em consulta aberta."),
    heading(3, "Doença crónica"),
    paragraph("Seguimento inventado de doença crónica."),
  ]);
}

/** Chapter containing a forbidden image — must keep flowing to the warnings mechanism. */
export function buildChapterWithImage(): Promise<MergeSource> {
  return source("capitulo-com-imagem", [
    heading(1, "ANEXOS"),
    paragraph("Certificado fictício digitalizado:"),
    imageParagraph(),
  ]);
}

/** The standard ordered chapter set used by most merge tests. */
export function buildChapterFixtures(): Promise<MergeSource[]> {
  return Promise.all([
    buildChapterSaudeMaterna(),
    buildChapterSaudeMental(),
    buildChapterPlaneamentoFamiliar(),
    buildChapterSaudeDoAdulto(),
  ]);
}
