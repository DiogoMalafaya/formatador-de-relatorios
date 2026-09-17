import { getCurrentSession } from "@/lib/session/cookies";
import { resolveRuleSetId } from "@/lib/specialties";
import { getRuleSet } from "@/lib/formatting/ruleSet";
import { formatFormattingSummaryPt } from "@/lib/formatting/summary";

/**
 * Formatting summary for the current session (DIO-17): the rule set applied
 * so far, resolved from the chosen specialty (`generic` before one is
 * chosen) and rendered as a short pt-PT line next to the preview.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json(
      {
        ok: false,
        errorMessagePt: "A tua sessão expirou. Carrega novamente o teu currículo.",
      },
      { status: 401 },
    );
  }

  const ruleSet = getRuleSet(resolveRuleSetId(session.specialtyId ?? ""));

  return Response.json({ ok: true, summaryPt: formatFormattingSummaryPt(ruleSet) });
}
