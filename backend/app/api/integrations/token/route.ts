/**
 * GET /api/integrations/token – a short-lived viaSocket embed token for the
 * signed-in user (the one viaSocket value a browser may hold), plus each
 * app's service id, for the Connect popup.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireUser } from "@/lib/auth/requireRole";
import { ALERT_APPS, APP_SPECS, getViaSocket } from "@/lib/notify/apps";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireUser(req);
      const vs = getViaSocket();
      const serviceIds = Object.fromEntries(
        await Promise.all(ALERT_APPS.map(async (app) => [app, await vs.catalog.serviceIdFor(APP_SPECS[app].slug)])),
      );
      const actions = Object.fromEntries(ALERT_APPS.map((app) => [app, APP_SPECS[app].actionId]));
      return ok({ token: await vs.user(String(user.id)).token(), service_ids: serviceIds, actions });
    }),
  );
}
