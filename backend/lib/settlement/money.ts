/**
 * Fixed-point decimal math for reward/budget sums (Numeric(18,6) columns).
 *
 * PostgREST returns numeric columns as strings; JS `Number` loses precision in
 * the 18-integer-digit range, so sums are computed in 6-decimal micro-units.
 */

const SCALE = 6;
const SCALE_BIG = BigInt(10) ** BigInt(SCALE);
const ZERO = BigInt(0);
const ONE = BigInt(1);

function parseDecimalToUnits(value: string): bigint {
  const trimmed = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) throw new Error(`Invalid decimal value: ${value}`);
  const sign = match[1] === "-" ? BigInt(-1) : ONE;
  const whole = match[2];
  const frac = (match[3] ?? "").padEnd(SCALE, "0").slice(0, SCALE);
  const units = BigInt(whole) * SCALE_BIG + BigInt(frac === "" ? "0" : frac);
  return sign * units;
}

function unitsToDecimal(units: bigint): string {
  const negative = units < ZERO;
  const abs = negative ? units * BigInt(-1) : units;
  const whole = abs / SCALE_BIG;
  const frac = (abs % SCALE_BIG).toString().padStart(SCALE, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Sum decimal strings exactly (to 6 places), returning a decimal string. */
export function sumDecimalStrings(values: string[]): string {
  if (values.length === 0) return "0";
  const total = values.reduce((acc, v) => acc + parseDecimalToUnits(v), ZERO);
  return unitsToDecimal(total);
}

/** True when `reward` multiplied by `count` does not exceed `budget`. */
export function withinBudget(
  rewardPerTask: string,
  count: number,
  budget: string,
): boolean {
  return parseDecimalToUnits(rewardPerTask) * BigInt(count) <= parseDecimalToUnits(budget);
}