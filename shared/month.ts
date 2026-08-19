/**
 * Everything the app knows about "a month" — the figures the Overview tab, the
 * Investments tab and the home-screen widget all quote.
 *
 * These rules used to be restated in three places: a useMemo in Dashboard.tsx,
 * a filter in Investments.tsx, and SQL in widget-worker. The three disagreed —
 * the widget summed gross amounts and left investments and EMIs out of net cash
 * flow entirely, and Investments counted SIPs that had not started yet.
 *
 * `shared/emi.ts` had already solved this shape for EMIs and its two callers
 * cannot drift. This module is the same idea for the rest of the month.
 *
 * All amounts are integer paise — see shared/paise.ts.
 */

import { getDaysInMonth, isSameMonth, parseISO } from "date-fns";
import { emiTotalForMonth, type EmiLike } from "./emi";

/** The parts of an expense the month figures need. */
export interface ExpenseLike {
  date: string;               // YYYY-MM-DD
  amount: number;             // paise
  splitAmount?: number | null; // paise received back
  category: string;
}

/** The parts of an income row the month figures need. */
export interface IncomeLike {
  date: string;   // YYYY-MM-DD
  amount: number; // paise
}

/** The parts of an investment the SIP rule needs. */
export interface SipLike {
  type: string;
  isActive: boolean;
  amount: number;               // paise; monthly for a SIP
  startDate?: string | null;    // YYYY-MM-DD
  skippedMonths?: string[] | null; // YYYY-MM keys
}

/**
 * The amount an expense actually contributes: what you paid minus whatever
 * someone paid you back. Every total in the app is net of splits — this is the
 * single most-copied line in the codebase, so it lives here now.
 */
export function netAmount(e: { amount: number; splitAmount?: number | null }): number {
  return e.amount - (e.splitAmount || 0);
}

/** YYYY-MM key for a date. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Whether a YYYY-MM-DD date falls inside a YYYY-MM month. */
export function isInMonth(date: string, month: string): boolean {
  return date.startsWith(month);
}

/**
 * Monthly SIP outflow (paise) for `month` — the twin of `emiTotalForMonth`.
 *
 * A SIP counts only from its start month onward (otherwise it shows up in
 * months that predate the investment) and not in months it was skipped.
 */
export function sipTotalForMonth(investments: SipLike[] | undefined, month: string): number {
  return (investments ?? [])
    .filter(inv =>
      inv.type === "SIP" &&
      inv.isActive &&
      !(inv.skippedMonths ?? []).includes(month) &&
      (!inv.startDate || inv.startDate.slice(0, 7) <= month)
    )
    .reduce((sum, inv) => sum + inv.amount, 0);
}

export interface CategoryTotal {
  name: string;
  /** Net paise spent in this category. */
  total: number;
}

export interface MonthSummary {
  month: string;
  /** Net spend (paise) — gross minus splits. What the budget tracks. */
  expenses: number;
  /** Paise received back via splits this month. */
  split: number;
  income: number;
  /** SIP investments due this month. */
  sip: number;
  /** EMI instalments due this month. */
  emi: number;
  /** income − expenses − sip − emi. Investments and EMIs are outflow. */
  netCashFlow: number;
  /** Number of expense rows in the month. */
  count: number;
  /**
   * Net spend per day (paise). Divides by days elapsed for the running month,
   * by the full month length for a month already past.
   */
  dailyAvg: number;
  /** Net totals per category, largest first. */
  byCategory: CategoryTotal[];
  topCategory: CategoryTotal | null;
}

export interface MonthData {
  expenses?: ExpenseLike[];
  income?: IncomeLike[];
  investments?: SipLike[];
  emis?: EmiLike[];
}

/**
 * Every month figure, from one pass over the data.
 *
 * `today` is a parameter (defaulted) so the result is deterministic and the
 * caller can supply a clock in another timezone — the widget worker runs in UTC
 * but reports on the user's IST month.
 */
export function monthSummary(data: MonthData, month: string, today = new Date()): MonthSummary {
  const rows = (data.expenses ?? []).filter(e => isInMonth(e.date, month));

  let expenses = 0;
  let split = 0;
  const categories: Record<string, number> = {};
  for (const e of rows) {
    const net = netAmount(e);
    expenses += net;
    split += e.splitAmount || 0;
    categories[e.category] = (categories[e.category] || 0) + net;
  }

  const income = (data.income ?? [])
    .filter(i => isInMonth(i.date, month))
    .reduce((sum, i) => sum + i.amount, 0);

  const sip = sipTotalForMonth(data.investments, month);
  const emi = emiTotalForMonth(data.emis, month);

  const monthDate = parseISO(`${month}-01`);
  const days = isSameMonth(monthDate, today) ? today.getDate() : getDaysInMonth(monthDate);

  const byCategory = Object.entries(categories)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  return {
    month,
    expenses,
    split,
    income,
    sip,
    emi,
    netCashFlow: income - expenses - sip - emi,
    count: rows.length,
    dailyAvg: rows.length > 0 ? expenses / days : 0,
    byCategory,
    topCategory: byCategory[0] ?? null,
  };
}
