import { useMemo, useState } from "react";
import { format, isToday, parseISO, startOfWeek, isAfter, isSameMonth, subWeeks, subMonths, eachDayOfInterval, eachMonthOfInterval } from "date-fns";
import { Plus, AlertTriangle, TrendingUp, TrendingDown, Minus, CalendarClock } from "lucide-react";
import { useExpenses, useBudget, useSetBudget } from "@/hooks/use-expenses";
import { useIncome } from "@/hooks/use-income";
import { useQuery } from "@tanstack/react-query";
import { ExpenseModal } from "@/components/ExpenseModal";
import { ExpenseList } from "@/components/ExpenseList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { type ExpenseResponse } from "@shared/routes";
import type { Subscription, Investment } from "@shared/schema";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// FEATURE 2 — Monthly Insights Section
function calculateMonthlyInsights(expenses: ExpenseResponse[]) {
  const now = new Date();
  const monthExpenses = expenses.filter(e => isSameMonth(parseISO(e.date), now));
  const total = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  const categories: Record<string, number> = {};
  monthExpenses.forEach(e => {
    categories[e.category] = (categories[e.category] || 0) + e.amount;
  });
  const topCat = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  const daysInMonth = now.getDate();
  
  return {
    total,
    topCategory: topCat ? { name: topCat[0], amount: topCat[1] } : null,
    dailyAvg: monthExpenses.length > 0 ? total / daysInMonth : 0
  };
}

// FEATURE 5 — Weekly and Monthly Totals
function calculateWeeklyTotals(expenses: ExpenseResponse[]) {
  const now = new Date();
  const last7Days = eachDayOfInterval({ start: subWeeks(now, 6), end: now });
  return last7Days.map(day => {
    const dayStr = format(day, "yyyy-MM-dd");
    const total = expenses
      .filter(e => e.date === dayStr)
      .reduce((sum, e) => sum + e.amount, 0);
    return { name: format(day, "EEE"), total: total / 100 };
  });
}

function calculateMonthlyTotals(expenses: ExpenseResponse[]) {
  const now = new Date();
  const last6Months = eachMonthOfInterval({ start: subMonths(now, 5), end: now });
  return last6Months.map(m => {
    const mStr = format(m, "yyyy-MM");
    const total = expenses
      .filter(e => e.date.startsWith(mStr))
      .reduce((sum, e) => sum + e.amount, 0);
    return { name: format(m, "MMM"), total: total / 100 };
  });
}

export default function Dashboard() {
  const { data: expenses, isLoading } = useExpenses();
  const { data: incomeList } = useIncome();
  const { data: subscriptions } = useQuery<Subscription[]>({
    queryKey: ["/api/subscriptions"],
    queryFn: async () => {
      const res = await fetch("/api/subscriptions", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });
  const { data: investments } = useQuery<Investment[]>({
    queryKey: ["/api/investments"],
    queryFn: async () => {
      const res = await fetch("/api/investments", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });
  const currentMonthStr = format(new Date(), "yyyy-MM");
  const { data: budgetData } = useBudget(currentMonthStr);
  const setBudgetMutation = useSetBudget();
  const [newBudget, setNewBudget] = useState("");

  const { todayTotal, weekTotal, monthTotal, lastMonthTotal, monthlyIncomeTotal, monthlySIPTotal, categoryData, monthlyInsights, weeklyTrend, monthlyTrend } = useMemo(() => {
    if (!expenses) return {
      todayTotal: 0, weekTotal: 0, monthTotal: 0, lastMonthTotal: 0, monthlyIncomeTotal: 0,
      monthlySIPTotal: 0,
      categoryData: [], monthlyInsights: null,
      weeklyTrend: [], monthlyTrend: []
    };

    let today = 0;
    let week = 0;
    let month = 0;
    let lastMonth = 0;
    const allCategories: Record<string, number> = {};

    const now = new Date();
    const startOfCurrentWeek = startOfWeek(now, { weekStartsOn: 1 });
    const lastMonthStr = format(subMonths(now, 1), "yyyy-MM");

    expenses.forEach(exp => {
      const expDate = parseISO(exp.date);
      if (isToday(expDate)) today += exp.amount;
      if (isAfter(expDate, startOfCurrentWeek) || expDate.getTime() === startOfCurrentWeek.getTime()) week += exp.amount;
      if (isSameMonth(expDate, now)) {
        month += exp.amount;
        allCategories[exp.category] = (allCategories[exp.category] || 0) + exp.amount;
      }
      if (exp.date.startsWith(lastMonthStr)) lastMonth += exp.amount;
    });

    const monthlyInc = (incomeList ?? [])
      .filter(i => i.date.startsWith(currentMonthStr))
      .reduce((sum, i) => sum + i.amount, 0);

    // Active SIP investments represent a fixed monthly outflow
    const sipTotal = (investments ?? [])
      .filter(inv => inv.type === "SIP" && inv.isActive)
      .reduce((sum, inv) => sum + inv.amount, 0);

    const insights = calculateMonthlyInsights(expenses);
    const weeklyT = calculateWeeklyTotals(expenses);
    const monthlyT = calculateMonthlyTotals(expenses);

    const chartData = Object.entries(allCategories).map(([name, value]) => ({
      name,
      value: value / 100
    }));

    return {
      todayTotal: today, weekTotal: week, monthTotal: month, lastMonthTotal: lastMonth,
      monthlyIncomeTotal: monthlyInc,
      monthlySIPTotal: sipTotal,
      categoryData: chartData, monthlyInsights: insights,
      weeklyTrend: weeklyT, monthlyTrend: monthlyT
    };
  }, [expenses, incomeList, investments, currentMonthStr]);

  // Upcoming subscriptions this month (billing day hasn't passed yet or last billed != this month)
  const upcomingSubscriptions = useMemo(() => {
    if (!subscriptions) return [];
    const now = new Date();
    const todayDay = now.getDate();
    return subscriptions.filter(s =>
      s.isActive &&
      s.lastBilledMonth !== currentMonthStr &&
      s.billingDay > todayDay
    );
  }, [subscriptions, currentMonthStr]);

  const COLORS = ["#007AFF", "#34C759", "#FF9500", "#AF52DE", "#FF3B30", "#5856D6"];

  const formatAmount = (cents: number) => {
    return (cents / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleSetBudget = () => {
    const amount = parseFloat(newBudget);
    if (!isNaN(amount)) {
      setBudgetMutation.mutate({ month: currentMonthStr, amount });
      setNewBudget("");
    }
  };

  const budget = budgetData?.amount || 0;
  const remaining = budget - monthTotal;
  const budgetProgress = budget > 0 ? Math.min((monthTotal / budget) * 100, 100) : 0;
  const budgetPct = budget > 0 ? (monthTotal / budget) * 100 : 0;

  const monthVsLastPct = lastMonthTotal > 0
    ? ((monthTotal - lastMonthTotal) / lastMonthTotal) * 100
    : null;

  // Net cash flow includes investments as an outflow, but budget only tracks expenses
  const netCashFlow = monthlyIncomeTotal - monthTotal - monthlySIPTotal;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      <header className="px-5 pt-12 pb-4 sticky top-0 bg-background/80 backdrop-blur-xl z-10 border-b border-transparent transition-all">
        <div className="max-w-2xl mx-auto flex justify-between items-end">
          <div className="flex flex-col">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Spending
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="md:hidden">
              <ExpenseModal>
                <button className="bg-primary text-primary-foreground p-2 rounded-full shadow-md hover:bg-primary/90 transition-transform active:scale-95">
                  <Plus className="w-5 h-5" />
                </button>
              </ExpenseModal>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 max-w-2xl mx-auto pb-8">
        {/* Feature 6: Budget alert banner */}
        {budget > 0 && budgetPct >= 80 && (
          <div className={cn(
            "mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-medium",
            budgetPct >= 100
              ? "bg-destructive/10 text-destructive border border-destructive/20"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
          )}>
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {budgetPct >= 100
              ? `You've exceeded your ${format(new Date(), "MMMM")} budget by ₹${formatAmount(monthTotal - budget)}`
              : `You've used ${Math.round(budgetPct)}% of your ${format(new Date(), "MMMM")} budget`}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50 flex flex-col justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Today
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg text-muted-foreground font-medium">₹</span>
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {formatAmount(todayTotal)}
              </span>
            </div>
          </div>

          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50 flex flex-col justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              This Week
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg text-muted-foreground font-medium">₹</span>
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {formatAmount(weekTotal)}
              </span>
            </div>
          </div>

          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50 flex flex-col justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              This Month
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg text-muted-foreground font-medium">₹</span>
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {formatAmount(monthTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Feature 1: Net cash flow card (only shown if income is recorded) */}
        {monthlyIncomeTotal > 0 && (
          <div className={cn(
            "mt-4 bg-card rounded-2xl p-5 shadow-sm border border-border/50 flex items-center justify-between"
          )}>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Net Cash Flow — {format(new Date(), "MMMM")}
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-lg text-muted-foreground font-medium">₹</span>
                <span className={cn(
                  "text-2xl font-bold tracking-tight",
                  netCashFlow >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"
                )}>
                  {netCashFlow >= 0 ? "+" : "-"}{formatAmount(Math.abs(netCashFlow))}
                </span>
              </div>
            </div>
            <div className="text-right text-[13px] text-muted-foreground space-y-0.5">
              <div>Income: <span className="font-medium text-green-600 dark:text-green-400">+₹{formatAmount(monthlyIncomeTotal)}</span></div>
              <div>Expenses: <span className="font-medium text-foreground">−₹{formatAmount(monthTotal)}</span></div>
              {monthlySIPTotal > 0 && (
                <div>Investments: <span className="font-medium text-foreground">−₹{formatAmount(monthlySIPTotal)}</span></div>
              )}
            </div>
          </div>
        )}

        {categoryData.length > 0 && (
          <div className="space-y-6 mt-6">
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 overflow-hidden">
              <h3 className="text-[13px] uppercase tracking-widest font-semibold text-muted-foreground mb-4">
                This Month — Category Breakdown
              </h3>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => `₹${value.toFixed(2)}`}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
              <h3 className="text-[13px] uppercase tracking-widest font-semibold text-muted-foreground mb-4">
                Monthly Insights
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Spent</span>
                  <span className="font-semibold">₹{formatAmount(monthlyInsights?.total || 0)}</span>
                </div>
                {/* Feature 8: month vs last month */}
                {monthVsLastPct !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">vs Last Month</span>
                    <span className={cn(
                      "flex items-center gap-1 font-semibold text-[14px]",
                      monthVsLastPct === 0 ? "text-muted-foreground" :
                      monthVsLastPct > 0 ? "text-destructive" : "text-green-600 dark:text-green-400"
                    )}>
                      {monthVsLastPct === 0 ? <Minus className="w-3.5 h-3.5" /> :
                        monthVsLastPct > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {monthVsLastPct > 0 ? "+" : ""}{monthVsLastPct.toFixed(1)}%
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Top Category</span>
                  <span className="font-semibold">
                    {monthlyInsights?.topCategory
                      ? `${monthlyInsights.topCategory.name} (₹${formatAmount(monthlyInsights.topCategory.amount)})`
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Daily Average</span>
                  <span className="font-semibold">₹{formatAmount(monthlyInsights?.dailyAvg || 0)}</span>
                </div>
              </div>
            </div>

            {/* Feature 2: Upcoming subscriptions */}
            {upcomingSubscriptions.length > 0 && (
              <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
                <h3 className="text-[13px] uppercase tracking-widest font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                  <CalendarClock className="w-3.5 h-3.5" />
                  Upcoming This Month
                </h3>
                <div className="space-y-3">
                  {upcomingSubscriptions.map(s => (
                    <div key={s.id} className="flex justify-between items-center">
                      <div>
                        <span className="text-[15px] font-medium text-foreground">{s.name}</span>
                        <span className="text-[12px] text-muted-foreground ml-2">
                          due {ordinal(s.billingDay)}
                        </span>
                      </div>
                      <span className="font-semibold text-foreground">₹{formatAmount(s.amount)}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-border flex justify-between">
                    <span className="text-[13px] text-muted-foreground">Total upcoming</span>
                    <span className="font-bold text-foreground">
                      ₹{formatAmount(upcomingSubscriptions.reduce((s, x) => s + x.amount, 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
              <h3 className="text-[13px] uppercase tracking-widest font-semibold text-muted-foreground mb-4">
                Monthly Budget
              </h3>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Input 
                    type="number" 
                    placeholder="Set budget" 
                    value={newBudget}
                    onChange={(e) => setNewBudget(e.target.value)}
                    className="rounded-xl h-10"
                  />
                  <Button onClick={handleSetBudget} className="rounded-xl h-10">Set</Button>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground">Budget: ₹{formatAmount(budget)}</span>
                    <span className="text-muted-foreground">Spent: ₹{formatAmount(monthTotal)}</span>
                  </div>
                  <Progress value={budgetProgress} className="h-2" />
                  <div className="text-right">
                    <span className={cn(
                      "text-[15px] font-bold",
                      remaining < 0 ? "text-destructive" : "text-primary"
                    )}>
                      {remaining < 0 ? "Over by: " : "Remaining: "}₹{formatAmount(Math.abs(remaining))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
              <h3 className="text-[13px] uppercase tracking-widest font-semibold text-muted-foreground mb-4">
                Spending Trends
              </h3>
              <div className="space-y-8">
                <div className="h-[200px]">
                  <p className="text-[11px] font-medium text-muted-foreground mb-2">LAST 7 DAYS</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} />
                      <Tooltip 
                        formatter={(value: number) => `₹${value.toFixed(2)}`}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-[200px]">
                  <p className="text-[11px] font-medium text-muted-foreground mb-2">LAST 6 MONTHS</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} />
                      <Tooltip 
                        formatter={(value: number) => `₹${value.toFixed(2)}`}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                      <Bar dataKey="total" fill="#AF52DE" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        <ExpenseList expenses={expenses} isLoading={isLoading} />
      </main>

      <div className="hidden md:block fixed bottom-24 right-8 z-[60]">
        <ExpenseModal>
          <button type="button" className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-4 rounded-full shadow-lg shadow-primary/30 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 font-semibold text-lg">
            <Plus className="w-6 h-6" /> Add Expense
          </button>
        </ExpenseModal>
      </div>
    </div>
  );
}
