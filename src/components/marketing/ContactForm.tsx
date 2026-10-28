"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { AlertTriangle, Check } from "@/components/ui/icons";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "sent" }
  | { kind: "not_configured" }
  | { kind: "error"; message: string };

/**
 * Contact form.
 *
 * Posts to `/api/contact`, which in this build honestly reports that mail
 * delivery is not configured rather than pretending a message was sent.
 * The form therefore always shows the true outcome.
 */
export function ContactForm() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "submitting" });
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        code?: string;
        message?: string;
      };

      if (payload.ok) {
        setState({ kind: "sent" });
        form.reset();
        return;
      }
      if (payload.code === "NOT_CONFIGURED") {
        setState({ kind: "not_configured" });
        return;
      }
      setState({
        kind: "error",
        message: payload.message ?? "Something went wrong.",
      });
    } catch {
      setState({
        kind: "error",
        message: "The request could not be completed. Check your connection.",
      });
    }
  }

  if (state.kind === "sent") {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-success-line bg-success-bg p-5"
      >
        <Check aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-success-fg" />
        <div>
          <p className="font-display text-title text-success-fg">
            Message delivered.
          </p>
          <p className="mt-1 text-body-sm text-success-fg/90">
            Thanks — we will reply to the address you provided.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {state.kind === "not_configured" ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-pending-line bg-pending-bg p-4"
        >
          <AlertTriangle
            aria-hidden
            className="mt-0.5 h-4 w-4 shrink-0 text-pending-fg"
          />
          <p className="text-body-sm text-pending-fg">
            This build has no mail delivery connected, so your message was not
            stored or sent. The field values were validated and are otherwise
            intact — configure <code className="font-mono">CONTACT_DELIVERY_URL</code>{" "}
            to enable delivery, or reach us by email.
          </p>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-danger-line bg-danger-bg p-4"
        >
          <AlertTriangle
            aria-hidden
            className="mt-0.5 h-4 w-4 shrink-0 text-danger-fg"
          />
          <p className="text-body-sm text-danger-fg">{state.message}</p>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id="name" name="name" label="Name" required autoComplete="name" />
        <TextField
          id="email"
          name="email"
          type="email"
          label="Work email"
          required
          autoComplete="email"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="company"
          name="company"
          label="Company"
          autoComplete="organization"
        />
        <SelectField id="topic" name="topic" label="Topic" defaultValue="pilot">
          <option value="pilot">Start a pilot</option>
          <option value="contributor">Contributor access</option>
          <option value="reviewer">Reviewer access</option>
          <option value="partnership">Partnership</option>
          <option value="other">Something else</option>
        </SelectField>
      </div>

      <TextAreaField
        id="message"
        name="message"
        label="What are you working on?"
        required
        hint="The image and video data you have, the labels you need, and any rights or timing constraints."
      />

      <div className="flex items-center gap-4 pt-1">
        <Button type="submit" size="lg" disabled={state.kind === "submitting"}>
          {state.kind === "submitting" ? "Sending…" : "Send message"}
        </Button>
        <p className="text-caption text-ink-4">
          We reply in business hours. No newsletters.
        </p>
      </div>
    </form>
  );
}
