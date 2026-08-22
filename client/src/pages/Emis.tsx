import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Plus, Pencil, Trash2, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { emiProgress, emiTotalForMonth, isDueInMonth } from "@shared/emi";
import type { Emi } from "@shared/schema";
import { formatPaise, toPaise, toRupees } from "@shared/paise";

const fmt = (paise: number) => formatPaise(paise, { decimals: 0 });


interface FormState {
  name: string;
  lender: string;
  amount: string;
  tenureMonths: string;
  startDate: string;
  dueDay: string;
  totalAmount: string;
  notes: string;
}

const emptyForm: FormState = {
  name: "", lender: "", amount: "", tenureMonths: "",
  startDate: format(new Date(), "yyyy-MM-dd"), dueDay: "1", totalAmount: "", notes: "",
};

function EmiModal({ initial, onClose }: { initial?: Emi; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          lender: initial.lender ?? "",
          amount: String(toRupees(initial.amount)),
          tenureMonths: initial.tenureMonths.toString(),
          startDate: initial.startDate,
          dueDay: initial.dueDay.toString(),
          totalAmount: initial.totalAmount != null ? String(toRupees(initial.totalAmount)) : "",
          notes: initial.notes ?? "",
        }
      : emptyForm
  );
  const qc = useQueryClient();
  const { toast } = useToast();

  const save = useMutation({
    mutationFn: async () => {
      const url = initial ? `/api/emis/${initial.id}` : "/api/emis";
      const res = await fetch(url, {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name,
          lender: form.lender || null,
          amount: toPaise(form.amount),
          tenureMonths: parseInt(form.tenureMonths, 10),
          startDate: form.startDate,
          dueDay: parseInt(form.dueDay, 10) || 1,
          totalAmount: form.totalAmount ? toPaise(form.totalAmount) : null,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/emis"] });
      toast({ title: initial ? "EMI updated" : "EMI added" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isValid = form.name && form.amount && form.tenureMonths && form.startDate;

  // pb-24 on mobile keeps the Save/Cancel row clear of the fixed tab bar
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-24 sm:pb-4">
      <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl border border-border/50 max-h-[85dvh] overflow-y-auto">
        <h2 className="text-lg font-bold">{initial ? "Edit EMI" : "Add EMI"}</h2>

        <div className="space-y-3">
          <Input placeholder="Name (e.g. Car Loan)" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="rounded-xl" />

          <Input placeholder="Lender (optional)" value={form.lender}
            onChange={e => setForm(f => ({ ...f, lender: e.target.value }))} className="rounded-xl" />

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
            <Input type="number" placeholder="Monthly EMI" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="rounded-xl pl-7" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] text-muted-foreground pl-1">Tenure (months)</label>
              <Input type="number" placeholder="36" value={form.tenureMonths}
                onChange={e => setForm(f => ({ ...f, tenureMonths: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-muted-foreground pl-1">Due day (1–28)</label>
              <Input type="number" min={1} max={28} value={form.dueDay}
                onChange={e => setForm(f => ({ ...f, dueDay: e.target.value }))} className="rounded-xl" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] text-muted-foreground pl-1">First instalment date</label>
            <Input type="date" value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="rounded-xl" />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] text-muted-foreground pl-1">Total loan amount (optional)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
              <Input type="number" placeholder="Principal" value={form.totalAmount}
                onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} className="rounded-xl pl-7" />
            </div>
          </div>

          <Input placeholder="Notes (optional)" value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="rounded-xl" />
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 rounded-xl" disabled={!isValid || save.isPending}
            onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Emis() {
  const { data: emis = [], isLoading } = useQuery<Emi[]>({
    queryKey: ["/api/emis"],
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState<"add" | Emi | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/emis/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/emis"] });
      toast({ title: "Deleted" });
    },
  });

  const currentMonthStr = format(new Date(), "yyyy-MM");
  const monthlyTotal = emiTotalForMonth(emis, currentMonthStr);
  const dueThisMonth = emis.filter(e => isDueInMonth(e, currentMonthStr));
  const totalRemaining = emis
    .filter(e => e.isActive)
    .reduce((sum, e) => sum + emiProgress(e, currentMonthStr).outstanding, 0);

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {modal && (
        <EmiModal initial={modal === "add" ? undefined : modal} onClose={() => setModal(null)} />
      )}

      <header className="px-5 pt-12 pb-4 sticky top-0 bg-background/80 backdrop-blur-xl z-10 border-b border-transparent">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">EMIs</h1>
          <button type="button"
            onClick={() => setModal("add")}
            className="bg-primary text-primary-foreground p-2 rounded-full shadow-md hover:bg-primary/90 transition-transform active:scale-95">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="px-4 max-w-2xl mx-auto mt-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {format(new Date(), "MMM")} EMIs
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg text-muted-foreground">₹</span>
              <span className="text-2xl font-bold">{formatPaise(monthlyTotal, { symbol: false, decimals: "auto" })}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{dueThisMonth.length} active</p>
          </div>
          <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Remaining EMIs</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg text-muted-foreground">₹</span>
              <span className="text-2xl font-bold">{formatPaise(totalRemaining, { symbol: false, decimals: "auto" })}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{emis.length} loan{emis.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* EMI list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-card rounded-2xl animate-pulse border border-border/50" />
            ))}
          </div>
        ) : emis.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 opacity-50">
              <Landmark className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No EMIs yet</h3>
            <p className="text-muted-foreground text-[15px]">Tap + to track your first loan repayment.</p>
          </div>
        ) : (
          <div className="ios-list">
            {emis.map(emi => {
              const p = emiProgress(emi, currentMonthStr);
              const isDone = p.isCompleted || !emi.isActive;

              return (
                <div key={emi.id} className="ios-list-item group">
                  <div className="flex flex-col justify-center flex-1 min-w-0 gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[16px] font-medium truncate ${isDone ? "text-muted-foreground" : ""}`}>
                        {emi.name}
                      </span>
                      {emi.lender && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
                          {emi.lender}
                        </span>
                      )}
                      {p.isCompleted ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                          Completed
                        </span>
                      ) : p.isUpcoming ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-blue-500/12 text-blue-600 dark:text-blue-400">
                          Upcoming
                        </span>
                      ) : null}
                      {!emi.isActive && (
                        <span className="text-[11px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted shrink-0">Inactive</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`text-[13px] ${isDone ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                        {fmt(emi.amount)}/mo
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        Paid {p.paid} of {emi.tenureMonths}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        Ends {format(parseISO(`${p.endMonth}-01`), "MMM yyyy")}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        Due {emi.dueDay}
                      </span>
                    </div>

                    <div className="h-1.5 bg-muted rounded-full overflow-hidden max-w-xs">
                      <div
                        className={`h-full rounded-full ${p.isCompleted ? "bg-emerald-500" : "bg-primary"}`}
                        style={{ width: `${p.pct}%`, transition: "width 500ms var(--ease-out)" }}
                      />
                    </div>

                    {!p.isCompleted && (
                      <span className="text-[12px] text-muted-foreground">
                        {fmt(p.outstanding)} left over {p.remaining} instalment{p.remaining !== 1 ? "s" : ""}
                      </span>
                    )}
                    {emi.notes && (
                      <p className="text-[12px] text-muted-foreground truncate">{emi.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setModal(emi)}
                      className="p-2 text-muted-foreground hover:bg-muted/20 rounded-full">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(emi.id)}
                      className="p-2 text-destructive hover:bg-destructive/10 rounded-full">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Desktop FAB */}
      <div className="hidden md:block fixed bottom-24 right-8 z-[60]">
        <button type="button" onClick={() => setModal("add")}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-4 rounded-full shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 font-semibold text-lg">
          <Plus className="w-6 h-6" /> Add EMI
        </button>
      </div>
    </div>
  );
}
