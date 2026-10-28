import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils/cn";
import {
  AlertTriangle,
  Check,
  Clock,
  FileText,
  Info,
  Lock,
  Play,
  Receipt,
  Scale,
} from "./icons";

type Tone = "neutral" | "success" | "pending" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-2 border-line-strong",
  success: "bg-success-bg text-success-fg border-success-line",
  pending: "bg-pending-bg text-pending-fg border-pending-line",
  danger: "bg-danger-bg text-danger-fg border-danger-line",
  info: "bg-info-bg text-info-fg border-info-line",
};

type ChipSpec = {
  label: string;
  tone: Tone;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

/**
 * Status vocabulary.
 *
 * Every state pairs a colour with an icon *and* a word, so meaning never
 * depends on colour alone. Labels match the product's plain-language
 * statuses (`submitted`, `accepted`, `paid` are deliberately distinct).
 */
export const statusSpecs: Record<string, ChipSpec> = {
  /* Task lifecycle */
  available: { label: "Available", tone: "neutral", Icon: FileText },
  assigned: { label: "Assigned", tone: "info", Icon: Lock },
  claimed: { label: "Claimed", tone: "info", Icon: Lock },
  draft: { label: "Draft", tone: "neutral", Icon: FileText },
  submitted: { label: "Submitted", tone: "info", Icon: Check },
  validating: { label: "Validating", tone: "info", Icon: Clock },
  in_review: { label: "In review", tone: "pending", Icon: Clock },
  accepted: { label: "Accepted", tone: "success", Icon: Check },
  needs_revision: { label: "Needs revision", tone: "pending", Icon: AlertTriangle },
  revision_requested: {
    label: "Revision requested",
    tone: "pending",
    Icon: AlertTriangle,
  },
  rejected: { label: "Rejected", tone: "danger", Icon: AlertTriangle },
  appealed: { label: "Appealed", tone: "info", Icon: Scale },
  paid: { label: "Paid", tone: "success", Icon: Receipt },
  payment_failed: {
    label: "Payment failed",
    tone: "danger",
    Icon: AlertTriangle,
  },

  /* Appeals */
  open: { label: "Open", tone: "pending", Icon: Scale },

  /* Payout lifecycle */
  not_eligible: { label: "Not eligible", tone: "neutral", Icon: Info },
  eligible: { label: "Eligible", tone: "info", Icon: Info },
  pending: { label: "Payment pending", tone: "pending", Icon: Clock },
  confirmed: { label: "Confirmed", tone: "success", Icon: Check },
  failed: { label: "Failed", tone: "danger", Icon: AlertTriangle },

  /* Job status */
  active: { label: "Active", tone: "success", Icon: Play },
  published: { label: "Published", tone: "success", Icon: Play },
  awaiting_funding: { label: "Awaiting funding", tone: "pending", Icon: Clock },
  paused: { label: "Paused", tone: "pending", Icon: Clock },
  closed: { label: "Closed", tone: "neutral", Icon: Check },

  /* Export state */
  generating: { label: "Generating", tone: "pending", Icon: Clock },
  ready: { label: "Ready", tone: "success", Icon: Check },
  expired: { label: "Link expired", tone: "neutral", Icon: Lock },

  /* Validation */
  passed: { label: "Validation passed", tone: "success", Icon: Check },
  needs_fix: { label: "Validation errors", tone: "danger", Icon: AlertTriangle },
};

export function StatusChip({
  status,
  className,
  withIcon = true,
}: {
  status: string;
  className?: string;
  withIcon?: boolean;
}) {
  const spec = statusSpecs[status] ?? {
    label: status.replaceAll("_", " "),
    tone: "neutral" as Tone,
    Icon: Info,
  };
  const { Icon } = spec;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-caption font-medium whitespace-nowrap",
        toneClasses[spec.tone],
        className,
      )}
    >
      {withIcon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
      <span className="capitalize">{spec.label}</span>
    </span>
  );
}
