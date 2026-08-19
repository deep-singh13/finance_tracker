import { useMemo, useState, useEffect, useRef } from "react";
import { format, isToday, parseISO, startOfWeek, startOfMonth, isAfter, isSameMonth, subWeeks, subMonths, getDaysInMonth, eachDayOfInterval, eachMonthOfInterval } from "date-fns";
import { Plus, AlertTriangle, TrendingUp, TrendingDown, Minus, CalendarClock, ArrowUpRight, ArrowDownRight, Target, Eye, EyeOff, Mail, LogOut } from "lucide-react";
import { useLogout } from "@/hooks/use-auth";
import { useExpenses, useBudget, useSetBudget } from "@/hooks/use-expenses";
import { useIncome } from "@/hooks/use-income";
import { useQuery } from "@tanstack/react-query";
import { ExpenseModal } from "@/components/ExpenseModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GmailSyncModal } from "@/components/GmailSyncModal";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import Aurora from "@/components/Aurora";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type ExpenseResponse } from "@shared/routes";
import { monthSummary, netAmount } from "@shared/month";
import type { Subscription, Investment, Emi } from "@shared/schema";
import { formatPaise, toRupees, toPaiseOr } from "@shared/paise";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Counts up from 0 to target on first mount. Subsequent target changes snap. */
function useCountUp(target: number, duration = 680) {
  const [value, setValue] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    if (hasAnimated.current) { setValue(target); return; }

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) { setValue(target); hasAnimated.current = true; return; }

    hasAnimated.current = true;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t); // ease-out-expo
      setValue(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [target, duration]);

  return value;
}

/**
 * The aurora is a continuously animating WebGL canvas. Skip it when the user
 * asked for reduced motion, or when WebGL2 isn't available — the hero then
 * falls back to the original static gradient. Evaluated once, since neither
 * answer changes within a session.
 */
function canRenderAurora(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function calculateWeeklyTotals(expenses: ExpenseResponse[]) {
  const now = new Date();
  const last7Days = eachDayOfInterval({ start: subWeeks(now, 6), end: now });
  return last7Days.map(day => {
    const dayStr = format(day, "yyyy-MM-dd");
    const total = expenses.filter(e => e.date === dayStr).reduce((sum, e) => sum + netAmount(e), 0);
    return { name: format(day, "EEE"), total: toRupees(total) };
  });
}

/** Six-month bar series ending at (and including) `endMonth`. */
function calculateMonthlyTotals(expenses: ExpenseResponse[], endMonth: Date) {
  const last6Months = eachMonthOfInterval({ start: subMonths(endMonth, 5), end: endMonth });
  return last6Months.map(m => {
    const mStr = format(m, "yyyy-MM");
    const total = expenses.filter(e => e.date.startsWith(mStr)).reduce((sum, e) => sum + netAmount(e), 0);
    return { name: format(m, "MMM"), total: toRupees(total) };
  });
}

const CHART_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4"];

export default function Dashboard() {
  const [isPrivate, setIsPrivate] = useState(false);
  const [gmailOpen, setGmailOpen] = useState(false);
  const [auroraEnabled] = useState(canRenderAurora);
  const logout = useLogout();
  const { data: expenses } = useExpenses();
  const { data: incomeList } = useIncome();
  const { data: subscriptions } = useQuery<Subscription[]>({
    queryKey: ["/api/subscriptions"],
  });
  const { data: investments } = useQuery<Investment[]>({
    queryKey: ["/api/investments"],
  });
  const { data: emis } = useQuery<Emi[]>({
    queryKey: ["/api/emis"],
  });

  // Every month-scoped figure on this page follows `selectedMonth`.
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
  const selectedMonthStr = format(selectedMonth, "yyyy-MM");
  const isCurrentMonth = isSameMonth(selectedMonth, new Date());
  const monthLabel = format(selectedMonth, "MMMM");

  const { data: budgetData } = useBudget(selectedMonthStr);
  const setBudgetMutation = useSetBudget();
  const [newBudget, setNewBudget] = useState("");

  // Every month figure comes from one shared module — the widget and the
  // Investments tab call the same function, so they cannot drift apart.
  const summary = useMemo(
    () => monthSummary({ expenses, income: incomeList, investments, emis }, selectedMonthStr),
    [expenses, incomeList, investments, emis, selectedMonthStr],
  );

  const monthTotal = summary.expenses;
  const monthlyIncomeTotal = summary.income;
  const monthlySIPTotal = summary.sip;
  const monthlyEmiTotal = summary.emi;
  const monthlySplitTotal = summary.split;

  // Today and this week stay anchored to the real today — they're only shown on
  // the current month — so they don't belong to a month summary.
  const { todayTotal, weekTotal, lastMonthTotal, categoryData, weeklyTrend, monthlyTrend } = useMemo(() => {
    if (!expenses) return { todayTotal: 0, weekTotal: 0, lastMonthTotal: 0, categoryData: [], weeklyTrend: [], monthlyTrend: [] };

    let today = 0, week = 0;
    const now = new Date();
    const startOfCurrentWeek = startOfWeek(now, { weekStartsOn: 1 });

    expenses.forEach(exp => {
      const expDate = parseISO(exp.date);
      const net = netAmount(exp);
      if (isToday(expDate)) today += net;
      if (isAfter(expDate, startOfCurrentWeek) || expDate.getTime() === startOfCurrentWeek.getTime()) week += net;
    });

    const prevMonthStr = format(subMonths(selectedMonth, 1), "yyyy-MM");

    return {
      todayTotal: today,
      weekTotal: week,
      lastMonthTotal: monthSummary({ expenses }, prevMonthStr).expenses,
      categoryData: summary.byCategory.map(c => ({ name: c.name, value: toRupees(c.total) })),
      weeklyTrend: calculateWeeklyTotals(expenses),
      monthlyTrend: calculateMonthlyTotals(expenses, selectedMonth),
    };
  }, [expenses, selectedMonth, summary]);

  const upcomingSubscriptions = useMemo(() => {
    if (!subscriptions) return [];
    const todayDay = new Date().getDate();
    return subscriptions.filter(s =>
      s.isActive && s.lastBilledMonth !== selectedMonthStr && s.billingDay > todayDay
    );
  }, [subscriptions, selectedMonthStr]);

  const fmt = (paise: number) => formatPaise(paise, { symbol: false });

  const displayedTotal = useCountUp(monthTotal);

  const budget = budgetData?.amount || 0;
  const remaining = budget - monthTotal;
  const budgetProgress = budget > 0 ? Math.min((monthTotal / budget) * 100, 100) : 0;
  const budgetPct = budget > 0 ? (monthTotal / budget) * 100 : 0;
  const monthVsLastPct = lastMonthTotal > 0 ? ((monthTotal - lastMonthTotal) / lastMonthTotal) * 100 : null;
  // Net cash flow counts investments and EMIs as outflow; budget only tracks expenses
  const netCashFlow = summary.netCashFlow;

  const handleSetBudget = () => {
    const amount = toPaiseOr(newBudget, 0); // paise
    if (amount > 0) { setBudgetMutation.mutate({ month: selectedMonthStr, amount }); setNewBudget(""); }
  };

  // Privacy mask — replaces any amount string with ••••••
  const mask = (val: string) => isPrivate ? "••••••" : val;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Hero card ─────────────────────────────────────────────── */}
      <div className={cn(
        "px-5 pt-14 pb-8 relative overflow-hidden",
        // Falls back to the original static gradient when the animated canvas
        // is unavailable or unwanted, so the hero never renders bare.
        auroraEnabled ? "hero-aurora" : "hero-gradient"
      )}>
        {auroraEnabled ? (
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <Aurora colorStops={["#000000", "#B497CF", "#5227FF"]} blend={0.5} amplitude={1.0} speed={0.5} />
          </div>
        ) : (
          <>
            {/* Decorative orbs — the static-gradient counterpart to the aurora */}
            <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-8 -left-8 w-48 h-48 rounded-full bg-indigo-600/20 blur-2xl pointer-events-none" />
          </>
        )}

        <div className="max-w-2xl mx-auto md:max-w-none relative">
          {/* Month switcher gets its own row — with the "Today" pill visible it
              would otherwise push the icon row off-screen on narrow phones. */}
          <div className="mb-3">
            <MonthSwitcher month={selectedMonth} onChange={setSelectedMonth} />
          </div>

          {/* Header row */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{getGreeting()}</h1>
            </div>
            {/* gap-1.5 rather than gap-2 — five icons plus Lock only just fit at 320px */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Privacy toggle */}
              <button
                onClick={() => setIsPrivate(p => !p)}
                className="icon-btn w-9 h-9 bg-white/15 text-white border border-white/20"
                style={{ transition: "background-color 150ms var(--ease-out), transform 120ms var(--ease-out)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.25)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.15)"}
                aria-label={isPrivate ? "Show balances" : "Hide balances"}
              >
                {isPrivate ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              {/* Gmail sync */}
              <button
                onClick={() => setGmailOpen(true)}
                className="icon-btn w-9 h-9 bg-white/15 text-white border border-white/20"
                style={{ transition: "background-color 150ms var(--ease-out), transform 120ms var(--ease-out)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.25)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.15)"}
                aria-label="Sync Gmail"
              >
                <Mail className="w-4 h-4" />
              </button>
              <ThemeToggle variant="hero" />
              <ExpenseModal>
                <button
                  className="icon-btn w-9 h-9 bg-white/15 text-white border border-white/20"
                style={{ transition: "background-color 150ms var(--ease-out), transform 120ms var(--ease-out)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.25)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.15)"}
                  aria-label="Add expense"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </ExpenseModal>
              {/* Lock lives here rather than the tab bar — seven tabs already fill it */}
              <button
                onClick={logout}
                className="icon-btn w-9 h-9 bg-white/15 text-white border border-white/20"
                style={{ transition: "background-color 150ms var(--ease-out), transform 120ms var(--ease-out)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.25)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.15)"}
                aria-label="Lock / Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            <GmailSyncModal open={gmailOpen} onClose={() => setGmailOpen(false)} />
          </div>

          {/* Big number */}
          <div className="mb-6">
            <p className="text-[13px] font-medium text-blue-200/70 mb-1 uppercase tracking-widest">
              {isCurrentMonth ? "Spent This Month" : `Spent in ${monthLabel}`}
            </p>
            <div className="flex items-baseline gap-2">
              {!isPrivate && <span className="text-[13px] font-medium text-white/60">₹</span>}
              <span
                key={isPrivate ? "private" : "public"}
                className="blur-reveal text-[48px] font-bold text-white leading-none tracking-tight"
              >
                {isPrivate ? "••••••" : fmt(displayedTotal)}
              </span>
            </div>
            {!isPrivate && monthVsLastPct !== null && (
              <div className="flex items-center gap-1.5 mt-2">
                {monthVsLastPct > 0
                  ? <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
                  : monthVsLastPct < 0
                    ? <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400" />
                    : <Minus className="w-3.5 h-3.5 text-blue-300" />}
                <span className={cn(
                  "text-[13px] font-semibold",
                  monthVsLastPct > 0 ? "text-red-400" : monthVsLastPct < 0 ? "text-emerald-400" : "text-blue-300"
                )}>
                  {monthVsLastPct > 0 ? "+" : ""}{monthVsLastPct.toFixed(1)}% vs last month
                </span>
              </div>
            )}
          </div>

          {/* Quick stats row — today/week are only meaningful on the current month */}
          <div className="grid grid-cols-2 gap-3">
            {isCurrentMonth ? (
              <>
                <div className="bg-white/10 rounded-2xl px-4 py-3 border border-white/10">
                  <p className="text-[10px] font-semibold text-blue-200/60 uppercase tracking-wider mb-1">Today</p>
                  <p className="text-[20px] font-bold text-white">{isPrivate ? "••••••" : `₹${fmt(todayTotal)}`}</p>
                </div>
                <div className="bg-white/10 rounded-2xl px-4 py-3 border border-white/10">
                  <p className="text-[10px] font-semibold text-blue-200/60 uppercase tracking-wider mb-1">This Week</p>
                  <p className="text-[20px] font-bold text-white">{isPrivate ? "••••••" : `₹${fmt(weekTotal)}`}</p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-white/10 rounded-2xl px-4 py-3 border border-white/10">
                  <p className="text-[10px] font-semibold text-blue-200/60 uppercase tracking-wider mb-1">Daily Avg</p>
                  <p className="text-[20px] font-bold text-white">{isPrivate ? "••••••" : `₹${fmt(summary.dailyAvg)}`}</p>
                </div>
                <div className="bg-white/10 rounded-2xl px-4 py-3 border border-white/10">
                  <p className="text-[10px] font-semibold text-blue-200/60 uppercase tracking-wider mb-1">Transactions</p>
                  <p className="text-[20px] font-bold text-white">{summary.count}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <main className="px-4 md:px-8 max-w-2xl md:max-w-none mx-auto pb-8 mt-6">
        {/* ── Budget alert — full width ─────────────────────────────── */}
        {budget > 0 && budgetPct >= 80 && (
          <div className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-2xl text-[13px] font-medium mb-4",
            budgetPct >= 100
              ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
          )}>
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {budgetPct >= 100
              ? `Over budget by ₹${fmt(monthTotal - budget)}`
              : `${Math.round(budgetPct)}% of ${monthLabel} budget used`}
          </div>
        )}

        {/* ── Desktop: 2-col grid · Mobile: single column ───────────── */}
        <div className="space-y-5 md:grid md:grid-cols-2 md:gap-6 md:space-y-0 md:items-start">

          {/* ── Left column ─────────────────────────────────────────── */}
          <div className="space-y-5">
            {/* Net Cash Flow */}
            {monthlyIncomeTotal > 0 && (
              <div className={cn(
                "rounded-2xl border shadow-sm overflow-hidden",
                netCashFlow >= 0
                  ? "bg-emerald-500/[0.05] border-emerald-500/25 dark:bg-emerald-500/[0.07] dark:border-emerald-500/20"
                  : "bg-red-500/[0.05] border-red-500/25 dark:bg-red-500/[0.07] dark:border-red-500/20"
              )}>
                <div className="px-5 pt-4 pb-3 border-b border-border/40">
                  <p className="section-label">Net Cash Flow — {monthLabel}</p>
                </div>
                <div className="px-5 py-5 flex items-center justify-between">
                  <div>
                    <div className="flex items-baseline gap-1">
                      {!isPrivate && <span className="text-[14px] text-muted-foreground">₹</span>}
                      <span className={cn(
                        "text-[32px] font-bold tracking-tight",
                        netCashFlow >= 0 ? "text-emerald-500" : "text-red-500"
                      )}>
                        {isPrivate ? "••••••" : `${netCashFlow >= 0 ? "+" : "-"}${fmt(Math.abs(netCashFlow))}`}
                      </span>
                    </div>
                    {!isPrivate && (
                      <span className={cn(
                        "text-[12px] font-medium mt-0.5",
                        netCashFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                      )}>
                        {netCashFlow >= 0 ? "Positive — you're saving" : "Negative — spending exceeds income"}
                      </span>
                    )}
                  </div>
                  <div className="text-right space-y-1.5 text-[12px] text-muted-foreground">
                    <div className="flex items-center justify-end gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      Income <span className="font-semibold text-emerald-600 dark:text-emerald-400">{isPrivate ? "••••••" : `+₹${fmt(monthlyIncomeTotal)}`}</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                      Expenses <span className="font-semibold text-foreground">{isPrivate ? "••••••" : `−₹${fmt(monthTotal)}`}</span>
                    </div>
                    {monthlySIPTotal > 0 && (
                      <div className="flex items-center justify-end gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        Investments <span className="font-semibold text-foreground">{isPrivate ? "••••••" : `−₹${fmt(monthlySIPTotal)}`}</span>
                      </div>
                    )}
                    {monthlyEmiTotal > 0 && (
                      <div className="flex items-center justify-end gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        EMIs <span className="font-semibold text-foreground">{isPrivate ? "••••••" : `−₹${fmt(monthlyEmiTotal)}`}</span>
                      </div>
                    )}
                    {monthlySplitTotal > 0 && (
                      <div className="flex items-center justify-end gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                        Split Received <span className="font-semibold text-cyan-600 dark:text-cyan-400">{isPrivate ? "••••••" : `+₹${fmt(monthlySplitTotal)}`}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Budget card */}
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm">
              <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  <p className="section-label">Monthly Budget</p>
                </div>
                {budget > 0 && (
                  <span className={cn(
                    "text-[11px] font-bold px-2 py-0.5 rounded-full",
                    budgetPct >= 100 ? "bg-red-500/15 text-red-600 dark:text-red-400"
                      : budgetPct >= 80 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  )}>
                    {Math.round(budgetPct)}%
                  </span>
                )}
              </div>
              <div className="px-5 py-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Set monthly budget (₹)"
                    value={newBudget}
                    onChange={e => setNewBudget(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSetBudget()}
                    className="rounded-xl h-10 text-[14px]"
                    inputMode="numeric"
                  />
                  <Button onClick={handleSetBudget} className="rounded-xl h-10 px-5 shrink-0 cursor-pointer">Set</Button>
                </div>
                {budget > 0 && (
                  <>
                    <div className="space-y-2">
                      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            budgetPct >= 100 ? "bg-red-500"
                              : budgetPct >= 80 ? "bg-amber-500"
                              : "bg-primary"
                          )}
                          style={{
                            width: `${budgetProgress}%`,
                            transition: "width 500ms var(--ease-out), background-color 300ms var(--ease-out)",
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[12px] text-muted-foreground">
                        <span>Spent {isPrivate ? "••••••" : `₹${fmt(monthTotal)}`}</span>
                        <span>Budget {isPrivate ? "••••••" : `₹${fmt(budget)}`}</span>
                      </div>
                    </div>
                    <div className={cn(
                      "flex items-center justify-between px-4 py-3 rounded-xl",
                      remaining < 0 ? "bg-red-500/8" : "bg-emerald-500/8"
                    )}>
                      <span className="text-[13px] text-muted-foreground">
                        {remaining < 0 ? "Over budget" : "Remaining"}
                      </span>
                      <span className={cn(
                        "text-[16px] font-bold",
                        remaining < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                      )}>
                        {isPrivate ? "••••••" : `${remaining < 0 ? "-" : "+"}₹${fmt(Math.abs(remaining))}`}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Upcoming subscriptions — only relevant while viewing the running month */}
            {isCurrentMonth && upcomingSubscriptions.length > 0 && (
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm">
                <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-primary" />
                  <p className="section-label">Upcoming This Month</p>
                </div>
                <div className="divide-y divide-border/40">
                  {upcomingSubscriptions.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <p className="text-[14px] font-medium text-foreground">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Due {ordinal(s.billingDay)}</p>
                      </div>
                      <span className="text-[14px] font-semibold text-foreground">{isPrivate ? "••••••" : `₹${fmt(s.amount)}`}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-5 py-3.5 bg-muted/30">
                    <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Total upcoming</span>
                    <span className="text-[14px] font-bold text-foreground">
                      {isPrivate ? "••••••" : `₹${fmt(upcomingSubscriptions.reduce((s, x) => s + x.amount, 0))}`}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Right column ─────────────────────────────────────────── */}
          <div className="space-y-5">
            {categoryData.length > 0 && (
              <>
                {/* Category breakdown */}
                <div className="bg-card rounded-2xl border border-border/50 shadow-sm">
                  <div className="px-5 pt-4 pb-3 border-b border-border/40">
                    <p className="section-label">Category Breakdown — {monthLabel}</p>
                  </div>
                  <div className="px-2 py-4 h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%" cy="50%"
                          innerRadius={64} outerRadius={88}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {categoryData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="transparent" />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => [`₹${v.toFixed(2)}`, ""]}
                          contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", fontSize: "13px" }}
                        />
                        <Legend verticalAlign="bottom" height={40} iconType="circle" iconSize={8}
                          wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Monthly insights */}
                <div className="bg-card rounded-2xl border border-border/50 shadow-sm">
                  <div className="px-5 pt-4 pb-3 border-b border-border/40">
                    <p className="section-label">Monthly Insights — {monthLabel}</p>
                  </div>
                  <div className="divide-y divide-border/40">
                    {[
                      { label: "Total Spent", value: `₹${fmt(summary.expenses)}` },
                      {
                        label: "vs Last Month",
                        value: monthVsLastPct !== null
                          ? `${monthVsLastPct > 0 ? "+" : ""}${monthVsLastPct.toFixed(1)}%`
                          : "—",
                        color: monthVsLastPct == null ? undefined
                          : monthVsLastPct === 0 ? undefined
                          : monthVsLastPct > 0 ? "text-red-600 dark:text-red-400"
                          : "text-emerald-600 dark:text-emerald-400",
                      },
                      { label: "Top Category", value: summary.topCategory ? `${summary.topCategory.name} · ₹${fmt(summary.topCategory.total)}` : "—" },
                      { label: "Daily Average", value: `₹${fmt(summary.dailyAvg)}` },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex justify-between items-center px-5 py-3.5">
                        <span className="text-[13px] text-muted-foreground">{label}</span>
                        <span className={cn("text-[14px] font-semibold", color)}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Spending trends */}
                <div className="bg-card rounded-2xl border border-border/50 shadow-sm">
                  <div className="px-5 pt-4 pb-3 border-b border-border/40">
                    <p className="section-label">Spending Trends</p>
                  </div>
                  <div className="px-4 py-5 space-y-8">
                    {/* Last 7 days is relative to today, so it only makes sense on the current month */}
                    {isCurrentMonth && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Last 7 days</p>
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={weeklyTrend} barSize={18}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={40} />
                            <Tooltip
                              formatter={(v: number) => [`₹${v.toFixed(2)}`, "Spent"]}
                              contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", fontSize: "13px" }}
                              cursor={{ fill: "hsl(var(--muted))", radius: 6 }}
                            />
                            <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    )}
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        6 months to {format(selectedMonth, "MMM yyyy")}
                      </p>
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyTrend} barSize={22}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={40} />
                            <Tooltip
                              formatter={(v: number) => [`₹${v.toFixed(2)}`, "Spent"]}
                              contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", fontSize: "13px" }}
                              cursor={{ fill: "hsl(var(--muted))", radius: 6 }}
                            />
                            <Bar dataKey="total" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      </main>

      {/* Desktop FAB */}
      <div className="hidden md:block fixed bottom-24 right-8 z-[60]">
        <ExpenseModal>
          <button
            type="button"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-4 rounded-full shadow-lg shadow-primary/30 font-semibold text-[15px] cursor-pointer active:scale-[0.97]"
            style={{ transition: "transform 150ms var(--ease-out), opacity 150ms var(--ease-out)" }}
          >
            <Plus className="w-5 h-5" /> Add Expense
          </button>
        </ExpenseModal>
      </div>
    </div>
  );
}
