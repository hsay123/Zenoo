"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { useAction, useClientQuery } from "@/lib/api/live";
import {
  apiKeyCreatedSchema,
  apiKeySchema,
  apiPlanCheckoutSchema,
  apiPlanSchema,
  platformPaths,
  type ApiKey,
} from "@/lib/api/platform";
import { QueryView, InlineError, InfoNote } from "@/components/product/AsyncView";
import { WorkspaceHeader } from "@/components/product/WorkspaceHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TextField } from "@/components/ui/Field";
import { Check, Database, Lock } from "@/components/ui/icons";
import { formatDate } from "@/lib/utils/format";

/**
 * Buyer → API: the $299/month Data API plan (Dodo Payments, test mode), the
 * organisation's API keys, and a quickstart. See docs/system/DATA-API.md.
 */
export function BuyerApi() {
  const plan = useClientQuery("api-plan", (client) => client.get(apiPlanSchema, platformPaths.apiPlan()));
  const keys = useClientQuery("api-keys", (client) => client.get(z.array(apiKeySchema), platformPaths.apiKeys()));

  // Back from checkout: the plan turns on when Dodo's signed webhook arrives,
  // so poll briefly instead of trusting the redirect.
  // Rendered only after the client-side session gate, so window is defined.
  const [returned] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("checkout") === "done",
  );
  const planOn = plan.data?.plan === "api";
  const { reload } = plan;
  useEffect(() => {
    if (!returned || planOn) return;
    const timer = window.setInterval(reload, 3000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 60_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [returned, planOn, reload]);

  return (
    <>
      <WorkspaceHeader
        eyebrow="Buyer"
        title="Data API"
        description="Pull accepted labels straight into your training code, filtered and shaped the way it reads them: no bulk downloads, no reshaping scripts."
      />
      <div className="space-y-6">
        <QueryView query={plan}>{(p) => <PlanCard plan={p} returned={returned} />}</QueryView>
        <QueryView query={keys}>
          {(list) => <KeysCard keys={list} planOn={planOn} onChange={keys.reload} />}
        </QueryView>
        <Quickstart />
      </div>
    </>
  );
}

function PlanCard({ plan, returned }: { plan: z.infer<typeof apiPlanSchema>; returned: boolean }) {
  const { run, pending, error } = useAction();
  const subscribe = async () => {
    const result = await run((client) => client.post(apiPlanCheckoutSchema, platformPaths.apiPlanCheckout()));
    if (result) window.location.href = result.checkout_url;
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-title text-ink">API plan</h2>
          <p className="mt-1 text-body-sm text-ink-3">
            ${plan.price_usd} / {plan.interval} · 600 requests a minute · unlimited records
          </p>
        </div>
        {plan.plan === "api" ? (
          <Badge tone="accent">
            <Check aria-hidden className="h-3.5 w-3.5" /> Active
          </Badge>
        ) : (
          <Badge tone="neutral">Not subscribed</Badge>
        )}
      </div>

      {plan.plan === "api" ? (
        <p className="mt-4 text-body-sm text-ink-2">
          Your organization can use the Data API.
          {plan.renews_at ? ` Renews ${formatDate(plan.renews_at)}.` : ""}
          {plan.status && plan.status !== "active" ? ` Status: ${plan.status}.` : ""}
        </p>
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={() => void subscribe()} disabled={pending || !plan.checkout_available}>
            {pending ? "Opening checkout…" : `Subscribe — $${plan.price_usd}/month`}
          </Button>
          {returned && (
            <span role="status" className="text-body-sm text-ink-3">
              Waiting for Dodo to confirm your subscription…
            </span>
          )}
          {!plan.checkout_available && (
            <span className="text-body-sm text-ink-3">Checkout is not configured on this server.</span>
          )}
        </div>
      )}
      <InlineError error={error} />
      {plan.test_mode && (
        <div className="mt-4">
          <InfoNote>
            Test mode: checkout runs in Dodo Payments&apos; test environment with test cards. No real
            money moves.
          </InfoNote>
        </div>
      )}
    </section>
  );
}

function KeysCard({ keys, planOn, onChange }: { keys: ApiKey[]; planOn: boolean; onChange: () => void }) {
  const { run, pending, error } = useAction();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    const created = await run((client) =>
      client.post(apiKeyCreatedSchema, platformPaths.apiKeys(), { body: { name: name.trim() } }),
    );
    if (created) {
      setFresh(created.key);
      setCopied(false);
      setName("");
      onChange();
    }
  };
  const revoke = async (key: ApiKey) => {
    if (await run((client) => client.request(apiKeySchema, platformPaths.apiKey(key.id), { method: "DELETE" }))) {
      onChange();
    }
  };
  const active = keys.filter((k) => !k.revoked_at);

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="font-display text-title text-ink">API keys</h2>
      <p className="mt-1 text-body-sm text-ink-3">
        Keys belong to your organization and read only its datasets. Keep them on your servers, never in
        a web page.
        {!planOn && " Keys work once the API plan is active."}
      </p>

      {fresh && (
        <div className="mt-5 rounded-lg border border-success-line bg-success-bg p-4">
          <p className="flex items-center gap-2 text-body-sm font-medium text-success-fg">
            <Lock aria-hidden className="h-4 w-4" /> Copy this key now. It will not be shown again.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-md bg-surface px-3 py-2 font-mono text-[12px] text-ink">{fresh}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(fresh).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      <form
        className="mt-5 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) void create();
        }}
      >
        <TextField
          id="api-key-name"
          label="Key name"
          placeholder="training-pipeline"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          className="min-w-[16rem] flex-1"
        />
        <Button type="submit" disabled={pending || !name.trim()}>
          Create key
        </Button>
      </form>
      <InlineError error={error} />

      {active.length > 0 ? (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line">
          {active.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{key.name}</p>
                <p className="font-mono text-[11px] text-ink-4">
                  {key.prefix}… · created {formatDate(key.created_at)} ·{" "}
                  {key.last_used_at ? `last used ${formatDate(key.last_used_at)}` : "never used"}
                </p>
              </div>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => void revoke(key)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 flex items-center gap-2 text-body-sm text-ink-3">
          <Database aria-hidden className="h-4 w-4" /> No active keys yet.
        </p>
      )}
    </section>
  );
}

function Quickstart() {
  const base = process.env.NEXT_PUBLIC_DATA_API_URL ?? "https://zenolab-api.vercel.app";
  const curl = `curl -H "Authorization: Bearer $ZENO_API_KEY" \\
  "${base}/api/v1/datasets"

curl -H "Authorization: Bearer $ZENO_API_KEY" \\
  "${base}/api/v1/datasets/<id>/labels?format=yolo&classes=cup,hand&split=train:0.8,val:0.2&media=signed_url&limit=500"`;
  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="font-display text-title text-ink">Quickstart</h2>
      <p className="mt-1 text-body-sm text-ink-3">
        List your datasets, then pull labels in COCO, YOLO or Zeno JSON with the classes, box format and
        train/val split you need. Large pulls stream as NDJSON or CSV from{" "}
        <code className="font-mono text-[12px]">/labels/stream</code>.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-surface-sunken p-4 font-mono text-[12px] leading-relaxed text-ink-2">
        {curl}
      </pre>
      <p className="mt-3 text-body-sm text-ink-3">
        Full reference:{" "}
        <a className="underline" href="/developers">
          Developers
        </a>{" "}
        ·{" "}
        <a className="underline" href={`${base}/api/v1/openapi.json`}>
          OpenAPI spec
        </a>
      </p>
    </section>
  );
}
