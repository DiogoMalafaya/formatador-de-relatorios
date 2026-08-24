/**
 * Specialty list (DIO-9).
 *
 * Source: Ordem dos Médicos' official list of recognised medical specialties
 * (Colégios de especialidade), cross-checked against the Secção Regional do
 * Norte's published listing on 2026-08-19 — see
 * https://nortemedico.pt/srnom/nacional/regulamentos/listagem-das-especialidades-medicas
 * This is the ticket's own recommended source (open question, DIO-9); using
 * it directly rather than waiting, since a wrong or incomplete list is the
 * bigger trust risk.
 *
 * Per decision D1, every specialty resolves to the generic rule set at
 * launch — `ruleSetId` is the extension seam for US10, populated only once a
 * specialty's Colégio norms have actually been extracted and encoded
 * (DIO-10). Undefined means "use the generic rule set," not "not supported."
 */

export interface Specialty {
  id: string;
  /** pt-PT display name, exactly as published by the Colégio. */
  name: string;
  /** Set once a per-specialty rule set exists. Falls back to generic when absent. */
  ruleSetId?: string;
}

/** Already alphabetically ordered by `name`, per the AC — keep it that way when editing. */
export const SPECIALTIES: readonly Specialty[] = [
  { id: "anatomia-patologica", name: "Anatomia Patológica" },
  { id: "anestesiologia", name: "Anestesiologia" },
  { id: "angiologia-e-cirurgia-vascular", name: "Angiologia e Cirurgia Vascular" },
  { id: "cardiologia", name: "Cardiologia" },
  { id: "cardiologia-pediatrica", name: "Cardiologia Pediátrica" },
  { id: "cirurgia-cardio-toracica", name: "Cirurgia Cardio-Torácica" },
  { id: "cirurgia-geral", name: "Cirurgia Geral" },
  { id: "cirurgia-maxilo-facial", name: "Cirurgia Maxilo-facial" },
  { id: "cirurgia-pediatrica", name: "Cirurgia Pediátrica" },
  { id: "cirurgia-plastica-e-reconstrutiva-e-estetica", name: "Cirurgia Plástica e Reconstrutiva e Estética" },
  { id: "dermato-venereologia", name: "Dermato-venereologia" },
  { id: "doencas-infecciosas", name: "Doenças Infecciosas" },
  { id: "endocrinologia-nutricao", name: "Endocrinologia-Nutrição" },
  { id: "estomatologia", name: "Estomatologia" },
  { id: "farmacologia-clinica", name: "Farmacologia Clínica" },
  { id: "gastrenterologia", name: "Gastrenterologia" },
  { id: "genetica-medica", name: "Genética Médica" },
  { id: "ginecologia-obstetricia", name: "Ginecologia-Obstetrícia" },
  { id: "hematologia-clinica", name: "Hematologia Clínica" },
  { id: "imuno-alergologia", name: "Imuno-alergologia" },
  { id: "imuno-hemoterapia", name: "Imuno-hemoterapia" },
  { id: "medicina-desportiva", name: "Medicina Desportiva" },
  { id: "medicina-do-trabalho", name: "Medicina do Trabalho" },
  // The one specialty with a real rule set so far — see CLAUDE.md and the
  // DIO-10 comment thread for the extraction from the Colégio's norms.
  { id: "medicina-fisica-e-de-reabilitacao", name: "Medicina Física e de Reabilitação", ruleSetId: "mfr" },
  { id: "medicina-geral-e-familiar", name: "Medicina Geral e Familiar" },
  { id: "medicina-interna", name: "Medicina Interna" },
  { id: "medicina-legal", name: "Medicina Legal" },
  { id: "medicina-nuclear", name: "Medicina Nuclear" },
  { id: "medicina-tropical", name: "Medicina Tropical" },
  { id: "nefrologia", name: "Nefrologia" },
  { id: "neuro-cirurgia", name: "Neuro-Cirurgia" },
  { id: "neurologia", name: "Neurologia" },
  { id: "neuro-radiologia", name: "Neuro-Radiologia" },
  { id: "oftalmologia", name: "Oftalmologia" },
  { id: "oncologia-medica", name: "Oncologia Médica" },
  { id: "ortopedia", name: "Ortopedia" },
  { id: "otorrinolaringologia", name: "Otorrinolaringologia" },
  { id: "patologia-clinica", name: "Patologia Clínica" },
  { id: "pediatria", name: "Pediatria" },
  { id: "pneumologia", name: "Pneumologia" },
  { id: "psiquiatria", name: "Psiquiatria" },
  { id: "psiquiatria-da-infancia-e-da-adolescencia", name: "Psiquiatria da Infância e da Adolescência" },
  { id: "radiodiagnostico", name: "Radiodiagnóstico" },
  { id: "radioterapia", name: "Radioterapia" },
  { id: "reumatologia", name: "Reumatologia" },
  { id: "saude-publica", name: "Saúde Pública" },
  { id: "urologia", name: "Urologia" },
] as const;

/** Applied whenever a specialty has no `ruleSetId` of its own. */
export const GENERIC_RULE_SET_ID = "generic";
