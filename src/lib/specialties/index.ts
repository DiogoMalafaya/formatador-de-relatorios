import { GENERIC_RULE_SET_ID, SPECIALTIES } from "./data.ts";
import type { Specialty } from "./data.ts";

export type { Specialty } from "./data.ts";
export { GENERIC_RULE_SET_ID } from "./data.ts";

export function getSpecialties(): readonly Specialty[] {
  return SPECIALTIES;
}

export function getSpecialtyById(id: string): Specialty | undefined {
  return SPECIALTIES.find((specialty) => specialty.id === id);
}

/** The rule set to apply for a given specialty — generic when none is set (D1). */
export function resolveRuleSetId(specialtyId: string): string {
  return getSpecialtyById(specialtyId)?.ruleSetId ?? GENERIC_RULE_SET_ID;
}
