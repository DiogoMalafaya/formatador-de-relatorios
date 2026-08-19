import { getPublicRuntimeInfo } from "@/lib/env";

/**
 * Liveness probe, and the check that proves the frontend can reach the backend
 * in a deployed environment (DIO-5).
 *
 * The `encoding` field is deliberately full of Portuguese diacritics: if the
 * runtime, the build, or the reverse proxy mangles UTF-8, this endpoint shows it
 * before the formatting engine (DIO-10) and PDF renderer (DIO-11) inherit the
 * problem — where the same bug is far harder to trace.
 */
export async function GET() {
  return Response.json({
    status: "ok",
    encoding: "Formatação · relatórios · avaliação · função · ãõçéêíóú ÃÕÇÉÊÍÓÚ",
    ...getPublicRuntimeInfo(),
  });
}
