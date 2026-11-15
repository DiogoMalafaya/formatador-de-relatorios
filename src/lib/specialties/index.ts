import { HOUSE_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { SPECIALTIES } from "./data.ts";
import type { Specialty } from "./data.ts";

export type { Specialty } from "./data.ts";
export { HOUSE_RULE_SET_ID } from "../formatting/ruleSet.ts";

export function getSpecialties(): readonly Specialty[] {
  return SPECIALTIES;
}

export function getSpecialtyById(id: string): Specialty | undefined {
  return SPECIALTIES.find((specialty) => specialty.id === id);
}

/**
 * The norm profile for a specialty. A specialty without one gets the Lauda
 * house standard — never another Colégio's norms (DIO-43).
 */
export function resolveRuleSetId(specialtyId: string): string {
  return getSpecialtyById(specialtyId)?.ruleSetId ?? HOUSE_RULE_SET_ID;
}
