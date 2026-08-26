/**
 * Best-effort candidate name extraction (DIO-12).
 *
 * Diogo's call on the DIO-12 thread: auto-extract rather than ask for manual
 * entry, since the name is already sitting at the top of every CV mammoth
 * parses. Interns' CVs consistently open with the name as the first heading
 * or, failing that, the first line of body text — so that's the heuristic.
 * Wrong guesses are cheap: the cover is re-rendered, not re-uploaded, so a
 * bad extraction just means picking a different cover template later once
 * DIO-12's follow-up (manual override) exists.
 */

import type { ParsedDocument } from "./parseDocx.ts";

const MAX_NAME_LENGTH = 80;

export function extractCandidateName(parsed: ParsedDocument): string | undefined {
  const candidate = firstTagText(parsed.html, "h1") ?? firstTagText(parsed.html, "p");
  if (!candidate || candidate.length > MAX_NAME_LENGTH) {
    return undefined;
  }
  return candidate;
}

function firstTagText(html: string, tag: string): string | undefined {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return undefined;
  const text = stripTags(match[1]);
  return text.length > 0 ? text : undefined;
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
