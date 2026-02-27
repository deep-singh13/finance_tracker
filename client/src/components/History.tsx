import { useMemo, useState } from "react";
import { format, parseISO, startOfMonth, isSameMonth, subMonths, eachMonthOfInterval } from "date-fns";
import { type ExpenseResponse } from "@shared/routes";
import { CategoryIcon } from "./CategoryIcon";
import { useExpenses } from "@/hooks/use-expenses";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpenseModal } from "./ExpenseModal";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function History() {
  const { data: expenses, isLoading } = useExpenses();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingExpense, setEditingExpense] = useState<ExpenseResponse | null>(null);

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    return expenses.filter(exp => 
      exp.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exp.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [expenses, searchQuery]);

  const months = useMemo(() => {
    if (!filteredExpenses.length) return [];
    
    // Find min and max date to create intervals
    const dates = filteredExpenses.map(e => parseISO(e.date).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    return eachMonthOfInterval({ start: startOfMonth(minDate), end: startOfMonth(maxDate) })
      .sort((a, b) => b.getTime() - a.getTime());
  }, [filteredExpenses]);

  const formatAmount = (cents: number) => {
    return (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 px-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-4">
            <Skeleton className="h-6 w-32 bg-muted/60 rounded-full" />
            <div className="ios-list">
              {[1, 2].map((j) => (
                <div key={j} className="ios-list-item">
                  <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                  <div className="ios-list-content border-b-0">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <header className="px-5 pt-12 pb-4 sticky top-0 bg-background/80 backdrop-blur-xl z-10 border-b border-transparent transition-all">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            History
          </h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search history..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl bg-card border-border/50 h-11"
            />
          </div>
        </div>
      </header>

      <main className="px-4 max-w-2xl mx-auto mt-6">
        <ExpenseModal 
          expense={editingExpense || undefined} 
          open={!!editingExpense} 
          onOpenChange={(open) => !open && setEditingExpense(null)} 
        />

        {months.map((monthDate) => {
          const monthExpenses = filteredExpenses.filter(e => isSameMonth(parseISO(e.date), monthDate));
          if (monthExpenses.length === 0) return null;

          const monthTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

          return (
            <div key={monthDate.toISOString()} className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-baseline px-2 mb-2">
                <h3 className="text-lg font-bold text-foreground">
                  {format(monthDate, "MMMM yyyy")}
                </h3>
                <span className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Total: {formatAmount(monthTotal)}
                </span>
              </div>
              
              <div className="ios-list">
                {monthExpenses
                  .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())
                  .map((expense) => (
                    <div 
                      key={expense.id} 
                      className="ios-list-item group cursor-pointer"
                      onClick={() => setEditingExpense(expense)}
                    >
                      <CategoryIcon category={expense.category} size="md" />
                      
                      <div className="ios-list-content">
                        <div className="flex flex-col justify-center">
                          <span className="text-[16px] font-medium text-foreground leading-snug">
                            {expense.description}
                          </span>
                          <span className="text-[13px] text-muted-foreground mt-0.5">
                            {format(parseISO(expense.date), "MMM d")} • {expense.category}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <span className="text-[16px] font-semibold text-foreground tracking-tight">
                            {formatAmount(expense.amount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}

        {filteredExpenses.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 opacity-50">
              <span className="text-3xl">🔍</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No transactions found</h3>
            <p className="text-muted-foreground text-[15px]">
              Try searching for something else or log a new expense.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
