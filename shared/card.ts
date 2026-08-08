import { parseISO, addMonths, subMonths, format, startOfMonth, getDaysInMonth, differenceInCalendarDays } from "date-fns";
import type { Card } from "./schema";

/**
 * A billing cycle closes on the card's statement day. The statement dated
 * 15 Aug covers 16 Jul → 15 Aug inclusive.
 *
 * `key` is the YYYY-MM of the statement date and is what `card.paidStatements`
 * stores, so it uniquely identifies a cycle.
 */
export interface Cycle {
  key: string;        // YYYY-MM of the statement date
  start: string;      // YYYY-MM-DD, inclusive
  end: string;        // YYYY-MM-DD, inclusive — the statement date
  due: string;        // YYYY-MM-DD
  label: string;      // "16 Jul – 15 Aug"
}

/** Clamps a day-of-month to a month that may be shorter (e.g. day 31 in Feb). */
function dayInMonth(month: Date, day: number): Date {
  const d = new Date(month.getFullYear(), month.getMonth(), Math.min(day, getDaysInMonth(month)));
  d.setHours(0, 0, 0, 0);
  return d;
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Builds the cycle whose statement falls in `statementMonth`.
 * The due date lands in the following month when dueDay <= statementDay
 * (the common Indian card setup: statement on the 15th, payment due the 5th).
 */
export function cycleForStatementMonth(card: Card, statementMonth: Date): Cycle {
  const end = dayInMonth(statementMonth, card.statementDay);
  const prevEnd = dayInMonth(subMonths(statementMonth, 1), card.statementDay);
  const start = new Date(prevEnd);
  start.setDate(start.getDate() + 1);

  const dueMonth = card.dueDay <= card.statementDay ? addMonths(statementMonth, 1) : statementMonth;
  const due = dayInMonth(dueMonth, card.dueDay);

  return {
    key: format(end, "yyyy-MM"),
    start: iso(start),
    end: iso(end),
    due: iso(due),
    label: `${format(start, "d MMM")} – ${format(end, "d MMM")}`,
  };
}

/**
 * The cycle a given date falls into. A purchase made after this month's
 * statement day belongs to next month's statement.
 */
export function cycleForDate(card: Card, date: Date): Cycle {
  const statementThisMonth = dayInMonth(date, card.statementDay);
  const statementMonth = date > statementThisMonth ? addMonths(startOfMonth(date), 1) : startOfMonth(date);
  return cycleForStatementMonth(card, statementMonth);
}

/** The cycle still open today — spend here is unbilled. */
export function currentCycle(card: Card, today = new Date()): Cycle {
  return cycleForDate(card, today);
}

/**
 * Closed statements, newest first, going back `count` cycles from the one
 * before the open cycle.
 */
export function closedCycles(card: Card, count = 12, today = new Date()): Cycle[] {
  const openEnd = parseISO(currentCycle(card, today).end);
  return Array.from({ length: count }, (_, i) =>
    cycleForStatementMonth(card, subMonths(startOfMonth(openEnd), i + 1))
  );
}

export function isPaid(card: Card, cycle: Cycle): boolean {
  return (card.paidStatements ?? []).includes(cycle.key);
}

/** Days until `due` — negative once overdue. */
export function daysUntilDue(cycle: Cycle, today = new Date()): number {
  return differenceInCalendarDays(parseISO(cycle.due), today);
}

/** Sums the net amount of transactions falling inside a cycle. */
export function cycleTotal<T extends { date: string; amount: number; splitAmount?: number | null }>(
  txns: T[],
  cycle: Cycle
): number {
  return txns
    .filter(t => t.date >= cycle.start && t.date <= cycle.end)
    .reduce((sum, t) => sum + t.amount - (t.splitAmount || 0), 0);
}

export interface CardSummary {
  /** Spend in the open cycle — not yet billed. */
  unbilled: number;
  /** Total of closed statements not marked paid. */
  unpaidBilled: number;
  /** unbilled + unpaidBilled. What you'd owe if you paid everything today. */
  outstanding: number;
  /** Null when the card has no credit limit set. */
  available: number | null;
  /** 0–100, or null without a limit. */
  utilization: number | null;
  current: Cycle;
  /** Most recent closed statement, if it has any spend. */
  lastStatement: { cycle: Cycle; total: number; paid: boolean } | null;
}

export function cardSummary<T extends { date: string; amount: number; splitAmount?: number | null }>(
  card: Card,
  txns: T[],
  today = new Date()
): CardSummary {
  const current = currentCycle(card, today);
  const unbilled = cycleTotal(txns, current);

  const closed = closedCycles(card, 12, today);
  const unpaidBilled = closed
    .filter(c => !isPaid(card, c))
    .reduce((sum, c) => sum + cycleTotal(txns, c), 0);

  const outstanding = unbilled + unpaidBilled;
  const limit = card.creditLimit ?? null;

  const last = closed[0];
  const lastTotal = last ? cycleTotal(txns, last) : 0;

  return {
    unbilled,
    unpaidBilled,
    outstanding,
    available: limit != null ? limit - outstanding : null,
    utilization: limit && limit > 0 ? (outstanding / limit) * 100 : null,
    current,
    lastStatement: last && lastTotal > 0 ? { cycle: last, total: lastTotal, paid: isPaid(card, last) } : null,
  };
}
