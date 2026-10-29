/**
 * GET /api/earnings – contributor earnings summary.
 *
 * Also carries the contributor's reputation (score, tier, what the next tier
 * needs) as an additive `reputation` field; it is null if it cannot be
 * computed, so earnings never fail because of it.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireRole } from "@/lib/auth/requireRole";
import { getEnv } from "@/lib/env";
import { getEarningsSummary } from "@/lib/settlement/service";
import { getContributorReputation } from "@/lib/reputation/service";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const contributor = await requireRole(req, "contributor");
      const summary = await getEarningsSummary(contributor.id);
      const reputation = await getContributorReputation(contributor.id, getEnv()).catch(
        (cause: unknown) => {
          console.warn(
            `[reputation] unavailable for ${contributor.id}: ${
              cause instanceof Error ? cause.message : String(cause)
            }`,
          );
          return null;
        },
      );
      return ok({ ...summary, reputation });
    }),
  );
}
