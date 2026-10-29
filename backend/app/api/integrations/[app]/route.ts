/**
 * PUT    /api/integrations/{app} – save the destination and/or the events
 * DELETE /api/integrations/{app} – disconnect (pause the flow, revoke the
 *                                  connection at viaSocket, forget it here)
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { readJson } from "@/lib/api/request";
import { requireUser } from "@/lib/auth/requireRole";
import { disconnect, parseApp, saveSettings, toPublicConnection } from "@/lib/notify/apps";

const bodySchema = z
  .object({
    destination: z.object({ kind: z.enum(["channel", "user"]), value: z.string().min(1).max(200) }).optional(),
    events: z.array(z.string().max(40)).max(10).optional(),
  })
  .refine((b) => b.destination || b.events, "Send a destination or events");

export async function OPTIONS() {
  return corsOptions();
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireUser(req);
      const app = parseApp((await params).app);
      const body = bodySchema.parse(await readJson(req));
      return ok(toPublicConnection(await saveSettings(user.id, user.role, app, body)));
    }),
  );
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireUser(req);
      const app = parseApp((await params).app);
      await disconnect(user.id, app);
      return ok({ app, connected: false });
    }),
  );
}
