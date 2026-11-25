import { getCurrentSession } from "@/lib/session/cookies";
import { resolveRuleSetId } from "@/lib/specialties";
import { getRuleSet } from "@/lib/formatting/ruleSet";
import { formatFormattingSummaryPt } from "@/lib/formatting/summary";
import { constrain, resolveTheme } from "@/lib/themes";

/**
 * Formatting summary for the current session (DIO-17): the norm profile
 * applied so far, resolved from the chosen specialty (the house standard
 * before one is chosen), as a short pt-PT line next to the preview — plus
 * whose rules those are and where they're published (DIO-43).
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

  return Response.json({
    ok: true,
    summaryPt: formatFormattingSummaryPt(ruleSet, constrain(resolveTheme(session.themeId), ruleSet).bodyFamily),
    provenancePt: ruleSet.provenancePt,
    sources: ruleSet.sources.map((source) => ({ titlePt: source.titlePt, url: source.url })),
  });
}
