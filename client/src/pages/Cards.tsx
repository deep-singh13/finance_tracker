import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Plus, Pencil, Trash2, CreditCard, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useExpenses } from "@/hooks/use-expenses";
import { CategoryIcon } from "@/components/CategoryIcon";
import { formatPaise, toPaise, toRupees } from "@shared/paise";
import { cn } from "@/lib/utils";
import { cardSummary, closedCycles, cycleTotal, isPaid, daysUntilDue, type Cycle } from "@shared/card";
import type { Card as CardType } from "@shared/schema";
import type { ExpenseResponse } from "@shared/routes";

const NETWORKS = ["VISA", "Mastercard", "RuPay", "Amex"];

const fmt = (paise: number) => formatPaise(paise, { symbol: false, decimals: 0 });

const fmt2 = (paise: number) => formatPaise(paise, { symbol: false });

/** Utilization above 30% starts hurting your credit score; 90%+ is critical. */
function utilTone(pct: number) {
  if (pct >= 90) return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400", chip: "bg-red-500/15" };
  if (pct >= 30) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", chip: "bg-amber-500/15" };
  return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", chip: "bg-emerald-500/15" };
}

interface FormState {
  name: string; issuer: string; network: string; last4: string;
  creditLimit: string; statementDay: string; dueDay: string;
}

const emptyForm: FormState = {
  name: "", issuer: "", network: "VISA", last4: "",
  creditLimit: "", statementDay: "1", dueDay: "20",
};

function CardModal({ initial, onClose }: { initial?: CardType; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          issuer: initial.issuer,
          network: initial.network ?? "VISA",
          last4: initial.last4,
          creditLimit: initial.creditLimit != null ? String(toRupees(initial.creditLimit)) : "",
          statementDay: initial.statementDay.toString(),
          dueDay: initial.dueDay.toString(),
        }
      : emptyForm
  );
  const qc = useQueryClient();
  const { toast } = useToast();

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(initial ? `/api/cards/${initial.id}` : "/api/cards", {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name,
          issuer: form.issuer,
          network: form.network || null,
          last4: form.last4,
          creditLimit: form.creditLimit ? toPaise(form.creditLimit) : null,
          statementDay: parseInt(form.statementDay, 10) || 1,
          dueDay: parseInt(form.dueDay, 10) || 20,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cards"] });
      toast({ title: initial ? "Card updated" : "Card added" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isValid = form.name && form.issuer && /^\d{4}$/.test(form.last4);

  // pb-24 on mobile keeps the Save/Cancel row clear of the fixed tab bar
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-24 sm:pb-4">
      <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl border border-border/50 max-h-[85dvh] overflow-y-auto">
        <h2 className="text-lg font-bold">{initial ? "Edit Card" : "Add Card"}</h2>

        <div className="space-y-3">
          <Input placeholder="Card name (e.g. SimplySAVE)" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="rounded-xl" />

          <Input placeholder="Issuer (e.g. SBI Card)" value={form.issuer}
            onChange={e => setForm(f => ({ ...f, issuer: e.target.value }))} className="rounded-xl" />

          <div className="flex flex-wrap gap-2">
            {NETWORKS.map(n => (
              <button key={n} type="button"
                onClick={() => setForm(f => ({ ...f, network: n }))}
                className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors
                  ${form.network === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                {n}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-[12px] text-muted-foreground pl-1">
              Last 4 digits — the sync matches transactions to this card by these
            </label>
            <Input inputMode="numeric" maxLength={4} placeholder="4321" value={form.last4}
              onChange={e => setForm(f => ({ ...f, last4: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
              className="rounded-xl font-mono tracking-widest" />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] text-muted-foreground pl-1">Credit limit (optional)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
              <Input type="number" placeholder="200000" value={form.creditLimit}
                onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))} className="rounded-xl pl-7" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] text-muted-foreground pl-1">Statement day</label>
              <Input type="number" min={1} max={28} value={form.statementDay}
                onChange={e => setForm(f => ({ ...f, statementDay: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-muted-foreground pl-1">Payment due day</label>
              <Input type="number" min={1} max={28} value={form.dueDay}
                onChange={e => setForm(f => ({ ...f, dueDay: e.target.value }))} className="rounded-xl" />
            </div>
          </div>
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

function StatementRow({
  card, cycle, txns, onTogglePaid, pending,
}: {
  card: CardType; cycle: Cycle; txns: ExpenseResponse[];
  onTogglePaid: (cycle: Cycle, paid: boolean) => void; pending: boolean;
}) {
  const total = cycleTotal(txns, cycle);
  const paid = isPaid(card, cycle);
  if (total === 0 && !paid) return null;

  const overdue = !paid && daysUntilDue(cycle) < 0;

  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-[14px] font-medium">{format(parseISO(`${cycle.key}-01`), "MMMM yyyy")}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {cycle.label} · due {format(parseISO(cycle.due), "d MMM")}
          {overdue && <span className="text-red-600 dark:text-red-400 font-semibold"> · overdue</span>}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={cn("text-[14px] font-semibold", paid && "text-muted-foreground line-through")}>
          ₹{fmt2(total)}
        </span>
        <button
          onClick={() => onTogglePaid(cycle, !paid)}
          disabled={pending}
          className={cn(
            "text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors shrink-0",
            paid
              ? "bg-emerald-500/12 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "border-border text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400",
            pending && "opacity-50 cursor-not-allowed"
          )}
        >
          {paid ? <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Paid</span> : "Mark paid"}
        </button>
      </div>
    </div>
  );
}

function CardPanel({ card, allExpenses }: { card: CardType; allExpenses: ExpenseResponse[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [showAllTxns, setShowAllTxns] = useState(false);

  const txns = useMemo(
    () => allExpenses.filter(e => e.cardId === card.id).sort((a, b) => b.date.localeCompare(a.date)),
    [allExpenses, card.id]
  );

  const summary = useMemo(() => cardSummary(card, txns), [card, txns]);
  const history = useMemo(() => closedCycles(card, 12), [card]);

  const payMutation = useMutation({
    mutationFn: async ({ cycle, paid }: { cycle: Cycle; paid: boolean }) => {
      const current = card.paidStatements ?? [];
      const paidStatements = paid
        ? [...current, cycle.key]
        : current.filter(k => k !== cycle.key);
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paidStatements }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/cards"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await fetch(`/api/cards/${card.id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cards"] });
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "Card removed", description: "Its transactions were kept as regular expenses." });
    },
  });

  const util = summary.utilization;
  const tone = utilTone(util ?? 0);
  const dueIn = summary.lastStatement && !summary.lastStatement.paid
    ? daysUntilDue(summary.lastStatement.cycle)
    : null;

  const visibleTxns = showAllTxns ? txns : txns.slice(0, 8);

  return (
    <div className="space-y-4">
      {editing && <CardModal initial={card} onClose={() => setEditing(false)} />}

      {/* ── Card face ─────────────────────────────────────────────── */}
      <div className="hero-gradient rounded-2xl p-5 relative overflow-hidden shadow-sm">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-200/70">{card.issuer}</p>
              <h2 className="text-xl font-bold text-white tracking-tight">{card.name}</h2>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setEditing(true)}
                className="icon-btn w-8 h-8 bg-white/15 text-white border border-white/20" aria-label="Edit card">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => deleteMutation.mutate()}
                className="icon-btn w-8 h-8 bg-white/15 text-white border border-white/20" aria-label="Delete card">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <p className="font-mono text-[15px] tracking-[0.3em] text-white/80 mt-5">•••• {card.last4}</p>

          <div className="flex items-end justify-between mt-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-200/60 mb-0.5">Outstanding</p>
              <p className="text-[26px] font-bold text-white leading-none">₹{fmt2(summary.outstanding)}</p>
            </div>
            {card.network && (
              <span className="text-[13px] font-bold text-white/70 italic">{card.network}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Utilization ───────────────────────────────────────────── */}
      {card.creditLimit != null && util != null && (
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm">
          <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center justify-between">
            <p className="section-label">Credit Utilization</p>
            <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full", tone.chip, tone.text)}>
              {util.toFixed(1)}%
            </span>
          </div>
          <div className="px-5 py-5 space-y-3">
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full", tone.bar)}
                style={{ width: `${Math.min(util, 100)}%`, transition: "width 500ms var(--ease-out)" }} />
            </div>
            <div className="flex justify-between text-[12px] text-muted-foreground">
              <span>Used ₹{fmt(summary.outstanding)}</span>
              <span>Limit ₹{fmt(card.creditLimit)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-500/8">
              <span className="text-[13px] text-muted-foreground">Available to spend</span>
              <span className="text-[16px] font-bold text-emerald-600 dark:text-emerald-400">
                ₹{fmt2(Math.max(summary.available ?? 0, 0))}
              </span>
            </div>
            {util >= 30 && (
              <div className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-medium",
                tone.chip, tone.text
              )}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {util >= 90
                  ? "Very high utilization — this will hurt your credit score."
                  : "Above 30% utilization. Paying down before the statement date helps your score."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Current cycle + due ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Unbilled Spend
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-lg text-muted-foreground">₹</span>
            <span className="text-2xl font-bold">{fmt(summary.unbilled)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {summary.current.label} · bills {format(parseISO(summary.current.end), "d MMM")}
          </p>
        </div>
        <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {summary.lastStatement?.paid ? "Last Statement" : "Amount Due"}
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-lg text-muted-foreground">₹</span>
            <span className="text-2xl font-bold">{fmt(summary.lastStatement?.total ?? 0)}</span>
          </div>
          <p className={cn(
            "text-[11px] mt-1",
            dueIn != null && dueIn < 0 ? "text-red-600 dark:text-red-400 font-semibold"
              : dueIn != null && dueIn <= 5 ? "text-amber-600 dark:text-amber-400 font-semibold"
              : "text-muted-foreground"
          )}>
            {summary.lastStatement == null ? "No statement yet"
              : summary.lastStatement.paid ? "Paid"
              : dueIn! < 0 ? `Overdue by ${Math.abs(dueIn!)}d`
              : dueIn === 0 ? "Due today"
              : `Due in ${dueIn}d · ${format(parseISO(summary.lastStatement.cycle.due), "d MMM")}`}
          </p>
        </div>
      </div>

      {/* ── Statement history ─────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm">
        <div className="px-5 pt-4 pb-3 border-b border-border/40">
          <p className="section-label">Statement History</p>
        </div>
        <div className="divide-y divide-border/40">
          {history.some(c => cycleTotal(txns, c) > 0 || isPaid(card, c)) ? (
            history.map(cycle => (
              <StatementRow key={cycle.key} card={card} cycle={cycle} txns={txns}
                onTogglePaid={(c, paid) => payMutation.mutate({ cycle: c, paid })}
                pending={payMutation.isPending} />
            ))
          ) : (
            <p className="px-5 py-6 text-[13px] text-muted-foreground text-center">
              No closed statements yet. The first bills on {format(parseISO(summary.current.end), "d MMM")}.
            </p>
          )}
        </div>
      </div>

      {/* ── Transactions ──────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm">
        <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center justify-between">
          <p className="section-label">Card Transactions</p>
          <span className="text-[11px] text-muted-foreground">{txns.length} total</span>
        </div>
        {txns.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted-foreground text-center">
            No transactions yet. Run <span className="font-mono">/sync-gmail</span> to pull in card alerts.
          </p>
        ) : (
          <>
            <div className="divide-y divide-border/40">
              {visibleTxns.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                  <CategoryIcon category={t.category} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium truncate">{t.description}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {format(parseISO(t.date), "d MMM yyyy")} · {t.category}
                    </p>
                  </div>
                  <span className="text-[14px] font-semibold shrink-0">₹{fmt2(t.amount - (t.splitAmount || 0))}</span>
                </div>
              ))}
            </div>
            {txns.length > 8 && (
              <button onClick={() => setShowAllTxns(v => !v)}
                className="w-full py-3 text-[13px] font-semibold text-primary hover:bg-muted/30 rounded-b-2xl">
                {showAllTxns ? "Show less" : `Show all ${txns.length}`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Cards() {
  const { data: cards = [], isLoading } = useQuery<CardType[]>({
    queryKey: ["/api/cards"],
  });
  const { data: expenses = [] } = useExpenses();
  const [adding, setAdding] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {adding && <CardModal onClose={() => setAdding(false)} />}

      <header className="px-5 pt-12 pb-4 sticky top-0 bg-background/80 backdrop-blur-xl z-10 border-b border-transparent">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Credit Cards</h1>
          <button type="button" onClick={() => setAdding(true)}
            className="bg-primary text-primary-foreground p-2 rounded-full shadow-md hover:bg-primary/90 transition-transform active:scale-95">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="px-4 max-w-2xl mx-auto mt-4 space-y-8">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-40 bg-card rounded-2xl animate-pulse border border-border/50" />)}
          </div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 opacity-50">
              <CreditCard className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No cards yet</h3>
            <p className="text-muted-foreground text-[15px] max-w-xs">
              Add your card with its last 4 digits and the Gmail sync will start routing its
              transactions here automatically.
            </p>
          </div>
        ) : (
          cards.map(card => <CardPanel key={card.id} card={card} allExpenses={expenses} />)
        )}
      </main>

      {/* Desktop FAB */}
      <div className="hidden md:block fixed bottom-24 right-8 z-[60]">
        <button type="button" onClick={() => setAdding(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-4 rounded-full shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 font-semibold text-lg">
          <Plus className="w-6 h-6" /> Add Card
        </button>
      </div>
    </div>
  );
}
