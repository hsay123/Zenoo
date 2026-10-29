/**
 * GET /api/integrations – the signed-in user's Slack/Discord alert
 * connections, the apps they can connect, and the events for their role.
 * (viaSocket App integrations; lib/notify/apps.ts.)
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireUser } from "@/lib/auth/requireRole";
import {
  ALERT_APPS,
  APP_SPECS,
  eventsForRole,
  listConnectionRows,
  toPublicConnection,
  viasocketConfigured,
} from "@/lib/notify/apps";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireUser(req);
      const configured = viasocketConfigured();
      const rows = configured ? await listConnectionRows(user.id) : [];
      return ok({
        available: configured,
        apps: ALERT_APPS.map((app) => ({
          app,
          name: APP_SPECS[app].name,
          icon: APP_SPECS[app].icon,
          pickers: Object.keys(APP_SPECS[app].pickers),
        })),
        events: eventsForRole(user.role).map(({ event, label, defaultOn }) => ({ event, label, default_on: defaultOn })),
        connections: rows.map(toPublicConnection),
      });
    }),
  );
}
