import { getCurrentSession } from "@/lib/session/cookies";
import { getRuleSet } from "@/lib/formatting/ruleSet";
import { resolveRuleSetId } from "@/lib/specialties";
import { DocumentNotReadyError, prepareDocument } from "@/lib/rendering/prepareDocument";
import { chapterDividerPageCost } from "@/lib/pdf/paginate";
import { computePageBudget, pageCapBlockedMessagePt } from "@/lib/rendering/pageBudget";
import { SESSION_EXPIRED_PT, UNEXPECTED_ERROR_PT, UPLOAD_REQUIRED_PT } from "@/lib/errors/messages";

/**
 * The workspace's live page budget (DIO-54): pages / the profile's cap, the
 * divider toggle's state and exact cost, and whether checkout is blocked.
 *
 * The divider cost is worked out from the session's current documents (a
 * parse, no render), so the toggle can show its cost before the first
 * preview. The budget and dividers only exist on the multi-file (paginated)
 * path, the only one that counts pages exactly; a single file reports
 * `available: false` and the workspace shows nothing.
 */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ ok: false, errorMessagePt: SESSION_EXPIRED_PT }, { status: 401 });
  }

  try {
    const prepared = await prepareDocument(session);
    if (!prepared.merge) {
      return Response.json({ ok: true, available: false });
    }
    const ruleSet = getRuleSet(resolveRuleSetId(session.specialtyId ?? ""));
    const dividerPageCost = chapterDividerPageCost(prepared.merge.headings, ruleSet.page.delivery);
    const budget = computePageBudget({ session, maxPages: ruleSet.constraints.maxPages, dividerPageCost });

    return Response.json({
      ok: true,
      available: true,
      budget,
      dividersAvailable: dividerPageCost > 0,
      ...(budget.overCap ? { blockedMessagePt: pageCapBlockedMessagePt(budget) } : {}),
    });
  } catch (error) {
    if (error instanceof DocumentNotReadyError) {
      return Response.json({ ok: false, errorMessagePt: UPLOAD_REQUIRED_PT }, { status: 409 });
    }
    console.error("[session/page-budget] prepare failed", error);
    return Response.json({ ok: false, errorMessagePt: UNEXPECTED_ERROR_PT }, { status: 500 });
  }
}
