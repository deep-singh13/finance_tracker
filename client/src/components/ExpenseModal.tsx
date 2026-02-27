import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateExpense, useUpdateExpense } from "@/hooks/use-expenses";
import { CATEGORIES, CategoryIcon } from "./CategoryIcon";
import { type ExpenseResponse } from "@shared/routes";
import { cn } from "@/lib/utils";

interface ExpenseModalProps {
  children?: React.ReactNode;
  expense?: ExpenseResponse;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ExpenseModal({ children, expense, open: externalOpen, onOpenChange }: ExpenseModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  
  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense();

  useEffect(() => {
    if (expense && open) {
      setAmount((expense.amount / 100).toString());
      setDescription(expense.description);
      setCategory(expense.category);
      setDate(expense.date);
    } else if (!expense && open) {
      setAmount("");
      setDescription("");
      setCategory(CATEGORIES[0]);
      setDate(format(new Date(), "yyyy-MM-dd"));
    }
  }, [expense, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    const uiData = { amount, description, category, date };

    if (expense) {
      updateMutation.mutate(
        { id: expense.id, uiData },
        { onSuccess: () => setOpen(false) }
      );
    } else {
      createMutation.mutate(
        uiData,
        {
          onSuccess: () => {
            setOpen(false);
            setAmount("");
            setDescription("");
            setCategory(CATEGORIES[0]);
            setDate(format(new Date(), "yyyy-MM-dd"));
          }
        }
      );
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow numbers and a single decimal point
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      setAmount(val);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button className="rounded-full shadow-lg hover:-translate-y-0.5 transition-transform duration-200 px-6 font-semibold">
            <Plus className="w-5 h-5 mr-1" /> Add Expense
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden border-border/50 bg-background/95 backdrop-blur-xl">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-center text-xl font-semibold">
            {expense ? "Edit Expense" : "New Expense"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-6">
          <div className="relative flex justify-center py-4">
            <div className="flex items-baseline justify-center max-w-[80%]">
              <span className="text-3xl font-medium text-muted-foreground mr-1 translate-y-[-2px]">$</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={handleAmountChange}
                className="w-full text-5xl font-bold bg-transparent text-center focus:outline-none placeholder:text-muted/50 text-foreground"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-sm">
            <div className="flex items-center px-4 py-3 border-b border-border">
              <label className="w-24 text-[15px] font-medium text-foreground">For</label>
              <input
                type="text"
                placeholder="e.g. Lunch, Coffee, Movie"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex-1 bg-transparent text-[15px] focus:outline-none text-foreground placeholder:text-muted-foreground"
                required
              />
            </div>
            
            <div className="flex items-center px-4 py-3 border-b border-border">
              <label className="w-24 text-[15px] font-medium text-foreground">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex-1 bg-transparent text-[15px] focus:outline-none text-foreground"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 px-2">
              Category
            </label>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-200",
                    category === cat 
                      ? "bg-card border-primary/20 shadow-md scale-[1.02]" 
                      : "bg-transparent border-transparent hover:bg-card/50 opacity-60 hover:opacity-100"
                  )}
                >
                  <CategoryIcon category={cat} size="md" className="mb-2" />
                  <span className={cn(
                    "text-[11px] font-medium text-center leading-tight",
                    category === cat ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {cat}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full rounded-xl py-6 text-[17px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
            disabled={createMutation.isPending || updateMutation.isPending || !amount || !description}
          >
            {(createMutation.isPending || updateMutation.isPending) ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              expense ? "Update Expense" : "Save Expense"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
