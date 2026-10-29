"use client";

import { useEffect, useState } from "react";
import { connect, loadConnectScript } from "viasocket-apps/browser";
import { useAction, useClientQuery } from "@/lib/api/live";
import {
  alertConnectionSchema,
  destinationOptionsSchema,
  integrationsSchema,
  integrationsTokenSchema,
  platformPaths,
  type AlertConnection,
  type Integrations,
} from "@/lib/api/platform";
import { QueryView, InlineError, InfoNote } from "@/components/product/AsyncView";
import { WorkspaceHeader } from "@/components/product/WorkspaceHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Check } from "@/components/ui/icons";
import { formatDate } from "@/lib/utils/format";
import { z } from "zod";

const okSchema = z.object({}).passthrough();

/**
 * Alerts: connect your own Slack or Discord (viaSocket App integrations),
 * choose where Zeno posts, and which events. The browser only ever holds a
 * short-lived embed token for the Connect popup; every send runs on the server.
 */
export function AlertsSettings({ eyebrow }: { eyebrow: string }) {
  const integrations = useClientQuery("integrations", (client) =>
    client.get(integrationsSchema, platformPaths.integrations()),
  );
  return (
    <>
      <WorkspaceHeader
        eyebrow={eyebrow}
        title="Alerts"
        description="Get Zeno updates in your own Slack or Discord: funded jobs, reviewed labels and settled payouts, as they happen."
      />
      <QueryView query={integrations}>
        {(data) =>
          data.available ? (
            <Apps data={data} onChange={integrations.reload} />
          ) : (
            <InfoNote>App alerts are not configured on this server.</InfoNote>
          )
        }
      </QueryView>
    </>
  );
}

function Apps({ data, onChange }: { data: Integrations; onChange: () => void }) {
  // The token is fetched on page load, not in the click: the popup must open
  // straight from the click or the browser blocks it.
  const token = useClientQuery("integrations-token", (client) =>
    client.get(integrationsTokenSchema, platformPaths.integrationsToken()),
  );
  useEffect(() => {
    void loadConnectScript().catch(() => undefined);
  }, []);

  return (
    <div className="space-y-5">
      {data.apps.map((app) => (
        <AppCard
          key={app.app}
          app={app}
          connection={data.connections.find((c) => c.app === app.app) ?? null}
          events={data.events}
          token={token.data}
          onChange={onChange}
        />
      ))}
      <InfoNote>
        Connections run through viaSocket: Zeno never sees your Slack or Discord password or token, and you
        can disconnect at any time.
      </InfoNote>
    </div>
  );
}

function AppCard({
  app,
  connection,
  events,
  token,
  onChange,
}: {
  app: Integrations["apps"][number];
  connection: AlertConnection | null;
  events: Integrations["events"];
  token: z.infer<typeof integrationsTokenSchema> | null;
  onChange: () => void;
}) {
  const { run, pending, error, setError } = useAction();
  const [notice, setNotice] = useState<string | null>(null);

  const save = (authId: string) =>
    run((client) =>
      client.post(alertConnectionSchema, platformPaths.integrationConnected(app.app), { body: { auth_id: authId } }),
    ).then((saved) => saved && onChange());

  const onConnect = async () => {
    if (!token) return;
    setError(null);
    try {
      const { authId } = await connect({
        embedToken: token.token,
        serviceId: token.service_ids[app.app],
        actions: [token.actions[app.app]],
        skipActionSelection: true,
        // Finished after connect() already rejected with 'closed'.
        onLateSuccess: ({ authId: late }) => void save(late),
      });
      await save(authId);
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      if (code !== "closed") setNotice(`Could not connect ${app.name}: ${(cause as Error).message}`);
    }
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={app.icon} alt="" className="h-9 w-9 rounded-md" />
          <div>
            <h2 className="font-display text-title text-ink">{app.name}</h2>
            <p className="text-body-sm text-ink-3">
              {connection?.destination
                ? `Posting to ${connection.destination.label}`
                : connection
                  ? "Connected: choose where to post"
                  : "Not connected"}
            </p>
          </div>
        </div>
        {connection ? (
          <Badge tone="accent">
            <Check aria-hidden className="h-3.5 w-3.5" /> Connected
          </Badge>
        ) : (
          <Button onClick={() => void onConnect()} disabled={!token || pending}>
            Connect {app.name}
          </Button>
        )}
      </div>

      {connection && (
        <ConnectedSettings app={app} connection={connection} events={events} onChange={onChange} />
      )}
      {notice && <p className="mt-3 text-body-sm text-danger-fg">{notice}</p>}
      <InlineError error={error} />
    </section>
  );
}

function ConnectedSettings({
  app,
  connection,
  events,
  onChange,
}: {
  app: Integrations["apps"][number];
  connection: AlertConnection;
  events: Integrations["events"];
  onChange: () => void;
}) {
  const { run, pending, error } = useAction();
  const [kind, setKind] = useState<"channel" | "user">(connection.destination?.kind ?? "channel");
  const [choice, setChoice] = useState("");
  const [sent, setSent] = useState(false);
  const options = useClientQuery(`integration-options:${app.app}:${kind}`, (client) =>
    client.get(destinationOptionsSchema, platformPaths.integrationOptions(app.app, kind)),
  );

  const put = (body: Record<string, unknown>) =>
    run((client) => client.request(alertConnectionSchema, platformPaths.integration(app.app), { method: "PUT", body })).then(
      (saved) => saved && onChange(),
    );
  const toggle = (event: string, on: boolean) =>
    void put({ events: on ? [...connection.events, event] : connection.events.filter((e) => e !== event) });
  const test = async () => {
    setSent(false);
    if (await run((client) => client.post(okSchema, platformPaths.integrationTest(app.app)))) setSent(true);
  };
  const remove = async () => {
    if (await run((client) => client.request(okSchema, platformPaths.integration(app.app), { method: "DELETE" }))) {
      onChange();
    }
  };

  return (
    <div className="mt-5 space-y-5 border-t border-line pt-5">
      <div>
        <p className="text-body-sm font-medium text-ink">Where to post</p>
        {app.pickers.includes("user") && (
          <div className="mt-2 flex gap-4 text-body-sm text-ink-2">
            {(["channel", "user"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="radio" checked={kind === k} onChange={() => setKind(k)} />
                {k === "channel" ? "A channel" : "DM me"}
              </label>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            className="h-10 min-w-[14rem] rounded-md border border-line bg-surface px-3 text-body-sm text-ink"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={options.status !== "ready"}
          >
            <option value="">{options.status === "ready" ? "Choose…" : "Loading your list…"}</option>
            {(options.data ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {kind === "channel" ? `#${o.label.replace(/^#/, "")}` : o.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!choice || pending}
            onClick={() => void put({ destination: { kind, value: choice } })}
          >
            Save
          </Button>
        </div>
      </div>

      <div>
        <p className="text-body-sm font-medium text-ink">Send me</p>
        <div className="mt-2 space-y-1.5">
          {events.map((e) => (
            <label key={e.event} className="flex items-center gap-2 text-body-sm text-ink-2">
              <input
                type="checkbox"
                checked={connection.events.includes(e.event)}
                disabled={pending}
                onChange={(ev) => toggle(e.event, ev.target.checked)}
              />
              {e.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={!connection.destination || pending} onClick={() => void test()}>
          Send a test message
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => void remove()}>
          Disconnect
        </Button>
        {sent && <span className="text-body-sm text-success-fg">Sent. Check {app.name}.</span>}
        {connection.last_sent_at && !sent && (
          <span className="text-caption text-ink-4">Last alert {formatDate(connection.last_sent_at)}</span>
        )}
      </div>
      {connection.last_error && <p className="text-caption text-danger-fg">Last error: {connection.last_error}</p>}
      <InlineError error={error} />
    </div>
  );
}
