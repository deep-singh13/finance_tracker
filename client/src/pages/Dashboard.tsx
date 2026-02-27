import { useMemo, useState } from "react";
import { format, isToday, parseISO, startOfWeek, isAfter, startOfMonth, isSameMonth, subWeeks, subMonths, eachDayOfInterval, eachMonthOfInterval } from "date-fns";
import { Plus } from "lucide-react";
import { useExpenses, useBudget, useSetBudget } from "@/hooks/use-expenses";
import { ExpenseModal } from "@/components/ExpenseModal";
import { ExpenseList } from "@/components/ExpenseList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { type ExpenseResponse } from "@shared/routes";

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
  const currentMonthStr = format(new Date(), "yyyy-MM");
  const { data: budgetData } = useBudget(currentMonthStr);
  const setBudgetMutation = useSetBudget();
  const [newBudget, setNewBudget] = useState("");

  const { todayTotal, weekTotal, monthTotal, categoryData, monthlyInsights, weeklyTrend, monthlyTrend } = useMemo(() => {
    if (!expenses) return { 
      todayTotal: 0, weekTotal: 0, monthTotal: 0, 
      categoryData: [], monthlyInsights: null,
      weeklyTrend: [], monthlyTrend: []
    };

    let today = 0;
    let week = 0;
    let month = 0;
    const allCategories: Record<string, number> = {};
    
    const now = new Date();
    const startOfCurrentWeek = startOfWeek(now, { weekStartsOn: 1 });

    expenses.forEach(exp => {
      const expDate = parseISO(exp.date);
      if (isToday(expDate)) today += exp.amount;
      if (isAfter(expDate, startOfCurrentWeek) || expDate.getTime() === startOfCurrentWeek.getTime()) week += exp.amount;
      if (isSameMonth(expDate, now)) month += exp.amount;
      allCategories[exp.category] = (allCategories[exp.category] || 0) + exp.amount;
    });

    const insights = calculateMonthlyInsights(expenses);
    const weeklyT = calculateWeeklyTotals(expenses);
    const monthlyT = calculateMonthlyTotals(expenses);

    const chartData = Object.entries(allCategories).map(([name, value]) => ({
      name,
      value: value / 100
    }));

    return { 
      todayTotal: today, weekTotal: week, monthTotal: month, 
      categoryData: chartData, monthlyInsights: insights,
      weeklyTrend: weeklyT, monthlyTrend: monthlyT
    };
  }, [expenses]);

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
          <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/50 flex flex-col justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Today
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg text-muted-foreground font-medium">$</span>
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
              <span className="text-lg text-muted-foreground font-medium">$</span>
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
              <span className="text-lg text-muted-foreground font-medium">$</span>
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {formatAmount(monthTotal)}
              </span>
            </div>
          </div>
        </div>

        {categoryData.length > 0 && (
          <div className="space-y-6 mt-6">
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 overflow-hidden">
              <h3 className="text-[13px] uppercase tracking-widest font-semibold text-muted-foreground mb-4">
                Category Breakdown
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
                      formatter={(value: number) => `$${value.toFixed(2)}`}
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
                  <span className="font-semibold">${formatAmount(monthlyInsights?.total || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Top Category</span>
                  <span className="font-semibold">
                    {monthlyInsights?.topCategory 
                      ? `${monthlyInsights.topCategory.name} ($${formatAmount(monthlyInsights.topCategory.amount)})`
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Daily Average</span>
                  <span className="font-semibold">${formatAmount(monthlyInsights?.dailyAvg || 0)}</span>
                </div>
              </div>
            </div>

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
                    <span className="text-muted-foreground">Budget: ${formatAmount(budget)}</span>
                    <span className="text-muted-foreground">Spent: ${formatAmount(monthTotal)}</span>
                  </div>
                  <Progress value={budgetProgress} className="h-2" />
                  <div className="text-right">
                    <span className={cn(
                      "text-[15px] font-bold",
                      remaining < 0 ? "text-destructive" : "text-primary"
                    )}>
                      {remaining < 0 ? "Over by: " : "Remaining: "}${formatAmount(Math.abs(remaining))}
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
                        formatter={(value: number) => `$${value.toFixed(2)}`}
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
                        formatter={(value: number) => `$${value.toFixed(2)}`}
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

      <div className="hidden md:block fixed bottom-8 right-8 z-50">
        <ExpenseModal>
          <button className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-4 rounded-full shadow-lg shadow-primary/30 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 font-semibold text-lg">
            <Plus className="w-6 h-6" /> Add Expense
          </button>
        </ExpenseModal>
      </div>
    </div>
  );
}
