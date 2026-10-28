/** Small formatting helpers shared across product screens. */

/**
 * USDC amounts are displayed as USDC (6 decimals), not with a fiat symbol.
 * Input is the decimal string the API returns (`"0.100000"` → `"0.1 USDC"`),
 * so no floating-point rounding creeps in.
 */
export function formatUsdc(value: string | number): string {
  const raw = typeof value === "number" ? value.toFixed(6) : value;
  const negative = raw.startsWith("-");
  const [whole = "0", fraction = ""] = raw.replace("-", "").split(".");
  const trimmed = fraction.replace(/0+$/, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${trimmed ? `.${trimmed}` : ""} USDC`;
}

/**
 * @deprecated Use `formatUsdc`. Kept so existing imports keep working; since
 * the move to USDC on Base it formats USDC.
 */
export const formatMon = formatUsdc;

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** `12500` → `00:12.500`; assumes ms within an hour. */
export function formatTimecode(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
    millis,
  ).padStart(3, "0")}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

export function formatPercent(value: number | null, digits = 0): string {
  if (value === null) return "Not enough data";
  return `${(value * 100).toFixed(digits)}%`;
}
