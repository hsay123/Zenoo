/**
 * POST /api/demo/royalty — ROADMAP DEMO (HHG F5), admin only.
 *
 * Simulates one data-API purchase of a job's labelled data and splits the
 * payment 50% Zeno / 30% data owner / 20% contributors (weighted by accepted
 * labels) with the RoyaltySplitter contract, paid by the platform treasury in
 * test USDC on Base Sepolia. There is no real data API or customer.
 *
 * Body: { job_id: uuid, amount?: "1" (USDC), dry_run?: boolean }
 *   dry_run (or no splitter deployed) → the planned split only, nothing sent.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { readJson } from "@/lib/api/request";
import { requireRole } from "@/lib/auth/requireRole";
import { getEnv } from "@/lib/env";
import { demoSaleDeps, loadSaleRecipients, planSale, runDemoSale } from "@/lib/royalty/demo";

export const maxDuration = 60;

const bodySchema = z.object({
  job_id: z.string().uuid("job_id must be a UUID"),
  amount: z.string().trim().optional().default("1"),
  dry_run: z.boolean().optional().default(false),
});

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      await requireRole(req, "admin");
      const body = bodySchema.parse(await readJson(req));
      const env = getEnv();

      const { dataOwner, rows } = await loadSaleRecipients(body.job_id);
      const plan = planSale(body.job_id, body.amount, dataOwner, rows);
      const live = demoSaleDeps(env);

      if (body.dry_run || !live.ok) {
        return ok({
          demo: "roadmap",
          mode: "preview",
          live_available: live.ok,
          live_unavailable_reason: live.ok ? null : live.reason,
          plan,
        });
      }

      const result = await runDemoSale(plan, live.deps);
      return ok({
        demo: "roadmap",
        mode: "live",
        live_available: true,
        live_unavailable_reason: null,
        plan,
        ...result,
      });
    }),
  );
}
