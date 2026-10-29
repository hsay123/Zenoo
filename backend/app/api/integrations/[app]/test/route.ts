/**
 * POST /api/integrations/{app}/test – post one test message to the chosen
 * destination, so the user sees alerts work before any real event.
 */

import type { NextRequest } from "next/server";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { requireUser } from "@/lib/auth/requireRole";
import { consume } from "@/lib/rateLimit";
import { parseApp, sendTest } from "@/lib/notify/apps";

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireUser(req);
      const app = parseApp((await params).app);
      await consume("alert-test", user.id, { points: 5, duration: 60 });
      await sendTest(user.id, app);
      return ok({ app, sent: true });
    }),
  );
}
