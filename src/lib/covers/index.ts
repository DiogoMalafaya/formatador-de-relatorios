import { COVER_TEMPLATES } from "./templates.ts";
import type { CoverTemplate } from "./templates.ts";

export type { CoverTemplate, CoverFields } from "./templates.ts";
export { mergeCoverWithDocument } from "./merge.ts";
export type { MergeCoverOptions } from "./merge.ts";

export const DEFAULT_COVER_ID = COVER_TEMPLATES[0].id;

export function getCovers(): readonly CoverTemplate[] {
  return COVER_TEMPLATES;
}

export function getCoverById(id: string): CoverTemplate | undefined {
  return COVER_TEMPLATES.find((cover) => cover.id === id);
}
