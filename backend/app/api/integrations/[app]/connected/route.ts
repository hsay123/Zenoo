/**
 * POST /api/integrations/{app}/connected – store the connection the Connect
 * popup just created ({ auth_id }). The auth_id must belong to this user.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, withErrorHandler } from "@/lib/api/response";
import { withCors, corsOptions } from "@/lib/api/cors";
import { readJson } from "@/lib/api/request";
import { requireUser } from "@/lib/auth/requireRole";
import { parseApp, saveConnection, toPublicConnection } from "@/lib/notify/apps";

const bodySchema = z.object({ auth_id: z.string().min(3).max(200) });

export async function OPTIONS() {
  return corsOptions();
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  return withCors(
    await withErrorHandler(async () => {
      const user = await requireUser(req);
      const app = parseApp((await params).app);
      const { auth_id } = bodySchema.parse(await readJson(req));
      return ok(toPublicConnection(await saveConnection(user.id, user.role, app, auth_id)));
    }),
  );
}
