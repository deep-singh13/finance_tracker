import { parseISO, differenceInMonths, addMonths, format, startOfMonth } from "date-fns";
import type { Emi } from "./schema";

/** Parses a YYYY-MM month key into the first day of that month. */
function monthStart(month: string): Date {
  return parseISO(`${month}-01`);
}

/**
 * 1-based instalment number falling in `month` (YYYY-MM).
 * Returns 0 or less if the loan hadn't started yet, and > tenureMonths once it's done.
 */
export function installmentIndex(emi: Emi, month: string): number {
  return differenceInMonths(monthStart(month), startOfMonth(parseISO(emi.startDate))) + 1;
}

/** Whether an instalment is actually debited in `month`. */
export function isDueInMonth(emi: Emi, month: string): boolean {
  if (!emi.isActive) return false;
  const idx = installmentIndex(emi, month);
  return idx >= 1 && idx <= emi.tenureMonths;
}

/** Total EMI outflow (paise) for `month` — the figure that feeds Net Cash Flow. */
export function emiTotalForMonth(emis: Emi[] | undefined, month: string): number {
  return (emis ?? [])
    .filter(e => isDueInMonth(e, month))
    .reduce((sum, e) => sum + e.amount, 0);
}

export interface EmiProgress {
  /** Instalments paid through the end of `asOfMonth`, clamped to [0, tenureMonths]. */
  paid: number;
  /** Instalments still to pay after `asOfMonth`. */
  remaining: number;
  /** Amount paid so far, in paise. */
  paidAmount: number;
  /** Remaining instalments × monthly amount, in paise. Not a payoff figure — no interest math. */
  outstanding: number;
  /** YYYY-MM of the final instalment. */
  endMonth: string;
  /** 0–100. */
  pct: number;
  isCompleted: boolean;
  /** True when the first instalment is still in the future. */
  isUpcoming: boolean;
}

export function emiProgress(emi: Emi, asOfMonth: string): EmiProgress {
  const idx = installmentIndex(emi, asOfMonth);
  const paid = Math.min(Math.max(idx, 0), emi.tenureMonths);
  const remaining = emi.tenureMonths - paid;
  return {
    paid,
    remaining,
    paidAmount: paid * emi.amount,
    outstanding: remaining * emi.amount,
    endMonth: format(addMonths(startOfMonth(parseISO(emi.startDate)), emi.tenureMonths - 1), "yyyy-MM"),
    pct: emi.tenureMonths > 0 ? (paid / emi.tenureMonths) * 100 : 0,
    isCompleted: paid >= emi.tenureMonths,
    isUpcoming: idx < 1,
  };
}
