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

/**
 * Specialties Lauda supports (DIO-44): exactly those with a sourced norm
 * profile. The full list stays in `data.ts` because a stored session can
 * still name a specialty that isn't supported (anymore), and we need its
 * name to tell the student so.
 */
export function getSupportedSpecialties(): readonly Specialty[] {
  return SPECIALTIES.filter((specialty) => specialty.ruleSetId !== undefined);
}

export function isSupportedSpecialty(specialtyId: string): boolean {
  return getSpecialtyById(specialtyId)?.ruleSetId !== undefined;
}

/**
 * Whether a session's stored specialty must be chosen again before it can be
 * previewed or paid for: it names a specialty we don't support. A paid
 * session is never sent back. It paid for the rules applied at the time, and
 * blocking its download would be charging without delivering.
 */
export function needsSpecialtyReselection(session: {
  specialtyId?: string;
  payment: { status: string };
}): boolean {
  if (session.payment.status === "paid") return false;
  return session.specialtyId !== undefined && !isSupportedSpecialty(session.specialtyId);
}

/** "A, B e C" — the supported specialties as pt-PT prose, for landing/wizard copy. */
export function formatSupportedSpecialtiesPt(): string {
  return new Intl.ListFormat("pt-PT", { style: "long", type: "conjunction" }).format(
    getSupportedSpecialties().map((specialty) => specialty.name),
  );
}
