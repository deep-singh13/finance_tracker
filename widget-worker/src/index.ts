import { neon } from "@neondatabase/serverless";
import { monthSummary } from "../../shared/month";

interface Env {
  DATABASE_URL: string;
  WIDGET_API_KEY: string;
}

const CORS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

/** Constant-time string compare. Length is not secret; content is. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const av = enc.encode(a);
  const bv = enc.encode(b);
  if (av.byteLength !== bv.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

// Current date in IST (UTC+5:30). Workers run with TZ=UTC, so a timestamp
// shifted by +5:30 reads back as IST wall-clock through the local getters —
// which is what shared/month.ts uses for "days elapsed this month".
function istNow() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const year = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day = ist.getUTCDate();
  return { year, month, day, currentMonth: `${year}-${month}`, ist };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Auth: header only. The key used to be accepted from ?key=, which put a
    // live credential into Cloudflare request logs and anything else that
    // records URLs — for an endpoint that returns the full month summary.
    const key = request.headers.get("X-Widget-Key");
    if (!env.WIDGET_API_KEY || !key || !safeEqual(key, env.WIDGET_API_KEY)) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      const sql = neon(env.DATABASE_URL);
      const { day, currentMonth, ist } = istNow();

      // Fetch rows, not aggregates: the month figures are defined once in
      // shared/month.ts and this worker calls that, rather than restating the
      // rules in SQL and drifting from what the app shows.
      const [expenseRows, incomeRows, investmentRows, emiRows, subscriptionRows] = await Promise.all([
        sql`
          SELECT date::text AS date, amount, split_amount, category
          FROM expenses
          WHERE TO_CHAR(date, 'YYYY-MM') = ${currentMonth}
        `,
        sql`
          SELECT date::text AS date, amount
          FROM income
          WHERE TO_CHAR(date, 'YYYY-MM') = ${currentMonth}
        `,
        sql`
          SELECT type, is_active, amount, start_date::text AS start_date, skipped_months
          FROM investments
          WHERE is_active = true
        `,
        sql`
          SELECT is_active, start_date::text AS start_date, tenure_months, amount
          FROM emis
          WHERE is_active = true
        `,
        // Upcoming subscriptions: active, not yet billed, billing day still ahead
        sql`
          SELECT name, amount, billing_day
          FROM subscriptions
          WHERE is_active = true
            AND billing_day > ${day}
            AND (last_billed_month IS NULL OR last_billed_month != ${currentMonth})
          ORDER BY billing_day ASC
        `,
      ]);

      const summary = monthSummary(
        {
          expenses: expenseRows.map((r) => ({
            date: r.date as string,
            amount: Number(r.amount),
            splitAmount: Number(r.split_amount ?? 0),
            category: r.category as string,
          })),
          income: incomeRows.map((r) => ({
            date: r.date as string,
            amount: Number(r.amount),
          })),
          investments: investmentRows.map((r) => ({
            type: r.type as string,
            isActive: Boolean(r.is_active),
            amount: Number(r.amount),
            startDate: (r.start_date as string | null) ?? null,
            skippedMonths: (r.skipped_months as string[] | null) ?? [],
          })),
          emis: emiRows.map((r) => ({
            isActive: Boolean(r.is_active),
            startDate: r.start_date as string,
            tenureMonths: Number(r.tenure_months),
            amount: Number(r.amount),
          })),
        },
        currentMonth,
        ist,
      );

      const monthSpendPaise = summary.expenses;
      const dailyAvgPaise = Math.round(summary.dailyAvg);
      const netCashFlowPaise = summary.netCashFlow;

      const topCategory = summary.topCategory
        ? { name: summary.topCategory.name, amountPaise: summary.topCategory.total }
        : null;

      const upcomingSubscriptions = subscriptionRows.map((s) => ({
        name: s.name as string,
        amountPaise: Number(s.amount),
        billingDay: Number(s.billing_day),
      }));

      const upcomingTotalPaise = upcomingSubscriptions.reduce((sum, s) => sum + s.amountPaise, 0);

      return json({
        month: currentMonth,
        monthSpendPaise,
        dailyAvgPaise,
        topCategory,
        upcomingSubscriptions,
        upcomingTotalPaise,
        netCashFlowPaise,
        incomePaise: summary.income,
        sipPaise: summary.sip,
        emiPaise: summary.emi,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      return json({ error: "Internal error" }, 500);
    }
  },
};
