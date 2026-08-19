/**
 * Money in this app is ALWAYS an integer number of paise (₹1 = 100 paise) — in
 * the database, on the wire, and in every calculation. Rupees exist only at the
 * two edges: what a user types in, and what we render back out.
 *
 * This module owns both edges. Nothing else should multiply or divide by 100.
 */

declare const paiseBrand: unique symbol;

/**
 * An integer count of paise. Produced by `toPaise` at the input edge — never by
 * doing arithmetic on a raw form value.
 */
export type Paise = number & { readonly [paiseBrand]: true };

const PAISE_PER_RUPEE = 100;

/** True when `n` is a whole, finite number of paise. The wire invariant. */
export function isPaise(n: unknown): n is Paise {
  return typeof n === "number" && Number.isInteger(n);
}

/**
 * Converts a rupee amount typed by a user into paise.
 *
 * Parsed digit-by-digit rather than via `parseFloat(x) * 100`, so no binary
 * float error can creep in: "8.29" is exactly 829 paise, not 828.9999…
 * Commas and a leading ₹ are tolerated — `parseFloat("1,234")` silently
 * returns 1, which is how a comma used to become ₹1.
 *
 * Throws on anything that isn't a number, so a bad value fails loudly at the
 * edge instead of being stored as NaN.
 */
export function toPaise(rupees: string | number): Paise {
  const raw = typeof rupees === "number" ? String(rupees) : rupees;
  const cleaned = raw.trim().replace(/[₹,\s]/g, "");

  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
    throw new Error(`Not a valid amount: ${JSON.stringify(rupees)}`);
  }

  const sign = m[1] ? -1 : 1;
  const whole = m[2] || "0";
  // Work in thousandths of a rupee so the 3rd decimal can round the 2nd.
  const frac = ((m[3] ?? "") + "000").slice(0, 3);
  const thousandths = Number(whole) * 1000 + Number(frac);

  return (sign * Math.round(thousandths / 10)) as Paise;
}

/**
 * Lenient `toPaise` for optional fields and inputs parsed while the user is
 * still typing, where a half-finished value is expected rather than an error.
 */
export function toPaiseOr(rupees: string | number | null | undefined, fallback: number): number {
  if (rupees === null || rupees === undefined || rupees === "") return fallback;
  try {
    return toPaise(rupees);
  } catch {
    return fallback;
  }
}

/** Paise back to a rupee number — for charts and anything that needs a scalar. */
export function toRupees(paise: number): number {
  return paise / PAISE_PER_RUPEE;
}

export interface FormatOptions {
  /** Prefix with ₹. Default true. */
  symbol?: boolean;
  /** Fixed decimal places, or "auto" for however many the value needs. Default 2. */
  decimals?: 0 | 2 | "auto";
}

/** Renders paise as en-IN rupees, e.g. 123450 -> "₹1,234.50". */
export function formatPaise(paise: number, opts: FormatOptions = {}): string {
  const { symbol = true, decimals = 2 } = opts;

  const intl: Intl.NumberFormatOptions = symbol
    ? { style: "currency", currency: "INR" }
    : {};
  if (decimals !== "auto") {
    intl.minimumFractionDigits = decimals;
    intl.maximumFractionDigits = decimals;
  }

  return toRupees(paise).toLocaleString("en-IN", intl);
}
