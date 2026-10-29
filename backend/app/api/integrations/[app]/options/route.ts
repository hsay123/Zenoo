/**
 * GET /api/integrations/{app}/options?kind=channel|user – the user's own
 * channels (or Slack users, for "DM me"), read from their connected account.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { HttpError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/requireRole";
import { listDestinationOptions, parseApp } from "@/lib/notify/apps";

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireUser(req);
      const app = parseApp((await params).app);
      const kind = req.nextUrl.searchParams.get("kind") ?? "channel";
      if (kind !== "channel" && kind !== "user") throw HttpError.unprocessable("kind must be channel or user");
      return ok(await listDestinationOptions(user.id, app, kind));
    }),
  );
}
