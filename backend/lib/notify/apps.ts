/**
 * Alerts in the user's own Slack or Discord, through viaSocket App
 * integrations (HHG sponsor). viaSocket holds each user's OAuth; Zeno keeps an
 * `auth_id` and the enabled app's `script_id` per user and app
 * (user_app_connections, migration 016).
 *
 * Who chooses what (the approved plan):
 * - the action: Zeno's code, one fixed send action per app;
 * - the destination (channel, or "DM me" on Slack): the user, from a list read
 *   from their own account, once right after Connect; stored with the row;
 * - which events: the user, with checkboxes, defaults per role;
 * - the message text: Zeno, per event. Bot name "Zeno" is a constant.
 *
 * Every send runs on the server after the response and never fails the action
 * that caused it. All ids come from the action pages (tested on a real
 * connection): Slack `row1jrbor` V107, Discord `rowprvu04wpv` V6.
 */

import { ViaSocket } from "viasocket-apps";
import { getEnv, type Env } from "@/lib/env";
import { getSupabase } from "@/lib/db/supabase";
import { HttpError } from "@/lib/api/errors";
import type { UserRole } from "@/src/types/api";

export type AlertApp = "slack" | "discord";
export type AlertEvent = "job.funded" | "review.decided" | "payout.settled";
export type PickerKind = "channel" | "user";

export interface Destination {
  kind: PickerKind;
  value: string;
}

interface AppSpec {
  slug: AlertApp;
  name: string;
  icon: string;
  actionId: string;
  version: string;
  pickers: Partial<Record<PickerKind, { fieldKey: string; existingFields: Record<string, unknown> }>>;
  input: (destination: Destination, text: string) => Record<string, unknown>;
}

export const APP_SPECS: Record<AlertApp, AppSpec> = {
  slack: {
    slug: "slack",
    name: "Slack",
    icon: "https://stuff.thingsofbrand.com/slack.com/images/img668216333e_slack.jpg",
    actionId: "row1jrbor",
    version: "V107",
    pickers: {
      channel: { fieldKey: "destination.channel_id", existingFields: { destination: { messageto: "channel" } } },
      user: { fieldKey: "destination.userId", existingFields: { destination: { messageto: "user" } } },
    },
    input: (d, text) => ({
      destination:
        d.kind === "user" ? { messageto: "user", userId: [d.value] } : { messageto: "channel", channel_id: [d.value] },
      markdown_content: text,
      bot_details: { bot_name: "Zeno" },
    }),
  },
  discord: {
    slug: "discord",
    name: "Discord",
    icon: "https://stuff.thingsofbrand.com/discord.com/images/img6dd59dde35_discord.jpg",
    actionId: "rowprvu04wpv",
    version: "V6",
    pickers: { channel: { fieldKey: "channel_id", existingFields: {} } },
    input: (d, text) => ({ channel_id: d.value, message_content: text, bot_name: "Zeno" }),
  },
};

export const ALERT_APPS = Object.keys(APP_SPECS) as AlertApp[];

/** Events each role can receive, and which are on by default. */
export const ROLE_EVENTS: Record<string, Array<{ event: AlertEvent; label: string; defaultOn: boolean }>> = {
  buyer: [
    { event: "job.funded", label: "A job's escrow is funded", defaultOn: true },
    { event: "review.decided", label: "A label on my job is reviewed", defaultOn: false },
  ],
  contributor: [
    { event: "review.decided", label: "My label is accepted, returned or rejected", defaultOn: true },
    { event: "payout.settled", label: "A payout settles (with its receipt)", defaultOn: true },
  ],
};

export function eventsForRole(role: UserRole) {
  return ROLE_EVENTS[role] ?? ROLE_EVENTS.contributor;
}

// ── Client ────────────────────────────────────────────────────────────────

let client: { key: string; vs: ViaSocket } | null = null;

export function viasocketConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.VIASOCKET_ORG_ID && env.VIASOCKET_PROJECT_ID && env.VIASOCKET_EMBED_SECRET);
}

export function getViaSocket(env: Env = getEnv()): ViaSocket {
  if (!viasocketConfigured(env)) throw HttpError.conflict("App alerts are not configured on this server");
  const key = `${env.VIASOCKET_ORG_ID}:${env.VIASOCKET_PROJECT_ID}`;
  if (client?.key !== key) {
    client = {
      key,
      vs: new ViaSocket({
        orgId: env.VIASOCKET_ORG_ID!,
        projectId: env.VIASOCKET_PROJECT_ID!,
        secret: env.VIASOCKET_EMBED_SECRET!,
      }),
    };
  }
  return client.vs;
}

/** Zeno's user id is the viaSocket end-user id (a string, never an email). */
const vsUser = (userId: string) => getViaSocket().user(String(userId));

export function parseApp(raw: string): AlertApp {
  if ((ALERT_APPS as string[]).includes(raw)) return raw as AlertApp;
  throw HttpError.notFound(`Unknown app: ${raw}`);
}

// ── Connections ───────────────────────────────────────────────────────────

export interface ConnectionRow {
  id: string;
  user_id: string;
  app: AlertApp;
  auth_id: string;
  script_id: string;
  destination: Destination | null;
  destination_label: string | null;
  events: AlertEvent[];
  last_sent_at: string | null;
  last_error: string | null;
}

const COLUMNS = "id, user_id, app, auth_id, script_id, destination, destination_label, events, last_sent_at, last_error";

export async function listConnectionRows(userId: string): Promise<ConnectionRow[]> {
  const { data, error } = await getSupabase().from("user_app_connections").select(COLUMNS).eq("user_id", userId);
  if (error) throw HttpError.internal(`Failed to load app connections: ${error.message}`);
  return (data ?? []) as ConnectionRow[];
}

async function loadRow(userId: string, app: AlertApp): Promise<ConnectionRow> {
  const { data, error } = await getSupabase()
    .from("user_app_connections")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("app", app)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to load app connection: ${error.message}`);
  if (!data) throw HttpError.notFound(`${APP_SPECS[app].name} is not connected`);
  return data as ConnectionRow;
}

/** Public view of a user's connections (no auth or script ids). */
export function toPublicConnection(row: ConnectionRow) {
  return {
    app: row.app,
    name: APP_SPECS[row.app].name,
    icon: APP_SPECS[row.app].icon,
    destination: row.destination ? { kind: row.destination.kind, label: row.destination_label } : null,
    events: row.events,
    last_sent_at: row.last_sent_at,
    last_error: row.last_error,
  };
}

/**
 * Store a fresh connection: the auth_id must belong to this user (one user's
 * auth_id never serves another), and the app is enabled once (its script_id).
 */
export async function saveConnection(userId: string, role: UserRole, app: AlertApp, authId: string) {
  const user = vsUser(userId);
  const connections = (await user.listConnections()) as Array<{ id?: string; isExpired?: boolean }>;
  if (!connections.some((c) => c.id === authId)) {
    throw HttpError.forbidden("That connection does not belong to your account");
  }
  const vs = getViaSocket();
  const serviceId = await vs.catalog.serviceIdFor(APP_SPECS[app].slug);
  const scriptId = (await user.findEnabled(serviceId)) ?? (await user.enable(serviceId, authId)).scriptId;

  const events = eventsForRole(role).filter((e) => e.defaultOn).map((e) => e.event);
  const { data: existing } = await getSupabase()
    .from("user_app_connections")
    .select("events")
    .eq("user_id", userId)
    .eq("app", app)
    .maybeSingle();
  const { data, error } = await getSupabase()
    .from("user_app_connections")
    .upsert(
      {
        user_id: userId,
        app,
        auth_id: authId,
        script_id: scriptId,
        // Reconnecting in place keeps the destination and the event choices.
        ...(existing ? {} : { events, destination: null, destination_label: null }),
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,app" },
    )
    .select(COLUMNS)
    .single();
  if (error) throw HttpError.internal(`Failed to save the connection: ${error.message}`);
  return data as ConnectionRow;
}

/** The user's own channels (or users), read from their connected account. */
export async function listDestinationOptions(userId: string, app: AlertApp, kind: PickerKind) {
  const spec = APP_SPECS[app];
  const picker = spec.pickers[kind];
  if (!picker) throw HttpError.unprocessable(`${spec.name} has no ${kind} destination`);
  const row = await loadRow(userId, app);
  const vs = getViaSocket();
  const serviceId = await vs.catalog.serviceIdFor(spec.slug);
  const versionId = await vs.catalog.versionIdFor(serviceId, spec.actionId, spec.version);
  const { options } = await vsUser(userId).listOptions(versionId, {
    fieldKey: picker.fieldKey,
    authId: row.auth_id,
    existingFields: picker.existingFields,
  });
  return (options ?? []).map((o) => ({ label: String(o.label), value: String(o.value) }));
}

/** Save the destination (verified against the user's own list) and events. */
export async function saveSettings(
  userId: string,
  role: UserRole,
  app: AlertApp,
  input: { destination?: Destination; events?: string[] },
) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.destination) {
    // Never trust an id from the browser: it must be one of the user's options.
    const options = await listDestinationOptions(userId, app, input.destination.kind);
    const match = options.find((o) => o.value === input.destination!.value);
    if (!match) throw HttpError.unprocessable("Pick a destination from the list");
    update.destination = { kind: input.destination.kind, value: match.value };
    update.destination_label = input.destination.kind === "channel" ? `#${match.label.replace(/^#/, "")}` : `DM ${match.label}`;
  }
  if (input.events) {
    const allowed = new Set(eventsForRole(role).map((e) => e.event as string));
    const bad = input.events.filter((e) => !allowed.has(e));
    if (bad.length) throw HttpError.unprocessable(`Unknown events for your role: ${bad.join(", ")}`);
    update.events = [...new Set(input.events)];
  } else {
    await loadRow(userId, app); // 404 when not connected
  }
  const { data, error } = await getSupabase()
    .from("user_app_connections")
    .update(update)
    .eq("user_id", userId)
    .eq("app", app)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw HttpError.internal(`Failed to save alert settings: ${error.message}`);
  if (!data) throw HttpError.notFound(`${APP_SPECS[app].name} is not connected`);
  return data as ConnectionRow;
}

/** Run the app's send action once for this row. Returns the provider's reply. */
export async function sendText(row: ConnectionRow, text: string): Promise<unknown> {
  if (!row.destination) throw HttpError.conflict("Choose where to post first");
  const spec = APP_SPECS[row.app];
  const vs = getViaSocket();
  const serviceId = await vs.catalog.serviceIdFor(spec.slug);
  const versionId = await vs.catalog.versionIdFor(serviceId, spec.actionId, spec.version);
  try {
    const result = await vs.runAction(row.script_id, versionId, spec.input(row.destination, text));
    await getSupabase()
      .from("user_app_connections")
      .update({ last_sent_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "send failed";
    await getSupabase().from("user_app_connections").update({ last_error: message }).eq("id", row.id);
    throw error;
  }
}

export async function sendTest(userId: string, app: AlertApp) {
  const row = await loadRow(userId, app);
  return sendText(row, "*Zeno* ✅ Alerts are connected. You'll get your Zeno updates here.");
}

/** Pause the flow, revoke the connection, forget the row. */
export async function disconnect(userId: string, app: AlertApp) {
  const row = await loadRow(userId, app);
  const user = vsUser(userId);
  await user.setFlowStatus(row.script_id, 2).catch(() => undefined);
  await user.revokeConnection(row.auth_id).catch(() => undefined);
  const { error } = await getSupabase().from("user_app_connections").delete().eq("id", row.id);
  if (error) throw HttpError.internal(`Failed to remove the connection: ${error.message}`);
}

// ── Event alerts ──────────────────────────────────────────────────────────

/** Send `text` to every connection of `userId` subscribed to `event`. */
export async function notifyUser(userId: string, event: AlertEvent, text: string): Promise<number> {
  const rows = (await listConnectionRows(userId)).filter((r) => r.destination && r.events.includes(event));
  let sent = 0;
  for (const row of rows) {
    try {
      await sendText(row, text);
      sent += 1;
    } catch (error) {
      console.warn(`[app-alerts] ${row.app} ${event} failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  return sent;
}

const DECISION_WORDS: Record<string, string> = {
  accept: "accepted ✅",
  revise: "returned for a revision ✏️",
  reject: "rejected ❌",
};

/**
 * Route a Zeno event to the people it concerns, through their own apps.
 * Called after the response by the event hook; never throws.
 */
export async function deliverAppAlerts(event: string, data: Record<string, unknown>): Promise<void> {
  if (!viasocketConfigured()) return;
  try {
    const supabase = getSupabase();
    const origin = getEnv().FRONTEND_ORIGIN.replace(/\/+$/, "");
    const jobTitle = async (jobId: string) => {
      const { data: job } = await supabase.from("jobs").select("title, project_id").eq("id", jobId).maybeSingle();
      const { data: project } = job
        ? await supabase.from("projects").select("buyer_id").eq("id", job.project_id).maybeSingle()
        : { data: null };
      return { title: (job?.title as string) ?? "your job", buyerId: (project?.buyer_id as string) ?? null };
    };
    const contributorOf = async (submissionId: string) => {
      const { data: s } = await supabase.from("submissions").select("contributor_id").eq("id", submissionId).maybeSingle();
      return (s?.contributor_id as string) ?? null;
    };

    if (event === "job.funded") {
      const { title, buyerId } = await jobTitle(String(data.job_id));
      if (buyerId) {
        await notifyUser(
          buyerId,
          "job.funded",
          `*Zeno* 💰 *${title}* is funded: ${data.amount_usdc} USDC in escrow on Base Sepolia. Contributors can start now.\n${origin}/workspace/buyer/jobs/${data.job_id}`,
        );
      }
    } else if (event === "review.decided") {
      const { title, buyerId } = await jobTitle(String(data.job_id));
      const contributorId = await contributorOf(String(data.submission_id));
      const word = DECISION_WORDS[String(data.decision)] ?? String(data.decision);
      if (contributorId) {
        await notifyUser(contributorId, "review.decided", `*Zeno* Your label on *${title}* was ${word}.\n${origin}/workspace/contributor`);
      }
      if (buyerId) {
        await notifyUser(buyerId, "review.decided", `*Zeno* A label on *${title}* was ${word}.\n${origin}/workspace/buyer/jobs/${data.job_id}`);
      }
    } else if (event === "payout.settled") {
      const { title } = await jobTitle(String(data.job_id));
      const { data: receipt } = await supabase.from("receipts").select("submission_id").eq("id", String(data.receipt_id)).maybeSingle();
      const contributorId = receipt ? await contributorOf(receipt.submission_id as string) : null;
      if (contributorId) {
        await notifyUser(
          contributorId,
          "payout.settled",
          `*Zeno* 💸 You were paid ${data.amount_usdc} USDC for *${title}*${data.is_mock ? " (mock settlement)" : ""}.\nReceipt: ${origin}/receipts/${data.receipt_id}`,
        );
      }
    }
  } catch (error) {
    console.warn(`[app-alerts] ${event} delivery failed: ${error instanceof Error ? error.message : error}`);
  }
}
