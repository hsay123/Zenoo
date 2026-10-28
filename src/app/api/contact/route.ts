import { NextResponse } from "next/server";

/**
 * POST /api/contact
 *
 * This repository ships the frontend only — there is no mail provider or
 * CRM wired up. Rather than silently drop a message or pretend to send
 * one, the route validates the submission and then reports honestly that
 * delivery is not configured in this build.
 *
 * To enable real delivery, set `CONTACT_DELIVERY_URL` to an endpoint that
 * accepts `{ name, email, company, topic, message }` as JSON. The handler
 * forwards the validated payload there and surfaces the upstream status.
 */

export type ContactPayload = {
  name: string;
  email: string;
  company?: string;
  topic?: string;
  message: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(body: unknown): { ok: true; data: ContactPayload } | { ok: false; message: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Request body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const message = typeof b.message === "string" ? b.message.trim() : "";

  if (!name) return { ok: false, message: "A name is required." };
  if (!EMAIL.test(email)) return { ok: false, message: "A valid email is required." };
  if (message.length < 10) {
    return { ok: false, message: "Please add a little more detail (10+ characters)." };
  }

  return {
    ok: true,
    data: {
      name,
      email,
      message,
      company: typeof b.company === "string" ? b.company.trim() : undefined,
      topic: typeof b.topic === "string" ? b.topic.trim() : undefined,
    },
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "Request body was not valid JSON." },
      { status: 400 },
    );
  }

  const result = validate(body);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: result.message },
      { status: 422 },
    );
  }

  const deliveryUrl = process.env.CONTACT_DELIVERY_URL;
  if (!deliveryUrl) {
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_CONFIGURED",
        message:
          "Message delivery is not configured in this build. Set CONTACT_DELIVERY_URL to connect a mailbox or CRM.",
      },
      { status: 501 },
    );
  }

  try {
    const upstream = await fetch(deliveryUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result.data),
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: "UPSTREAM",
          message: `Delivery service responded ${upstream.status}.`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, message: "Message delivered." });
  } catch {
    return NextResponse.json(
      { ok: false, code: "NETWORK", message: "Could not reach the delivery service." },
      { status: 502 },
    );
  }
}
