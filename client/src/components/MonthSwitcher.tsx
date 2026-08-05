import { format, addMonths, subMonths, isSameMonth, isAfter, isBefore, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MonthSwitcherProps {
  /** First day of the selected month. */
  month: Date;
  onChange: (month: Date) => void;
  /** Earliest selectable month. Defaults to unbounded. */
  minMonth?: Date;
  /** Latest selectable month. Defaults to the current month. */
  maxMonth?: Date;
}

/**
 * Compact `‹ MMMM yyyy ›` stepper for the dashboard hero, with a "Today" pill
 * that appears once you've navigated away from the current month.
 */
export function MonthSwitcher({ month, onChange, minMonth, maxMonth }: MonthSwitcherProps) {
  const thisMonth = startOfMonth(new Date());
  const max = maxMonth ?? thisMonth;

  const prev = subMonths(month, 1);
  const next = addMonths(month, 1);
  const canGoBack = !minMonth || !isBefore(prev, startOfMonth(minMonth));
  const canGoForward = !isAfter(next, startOfMonth(max));
  const isCurrentMonth = isSameMonth(month, thisMonth);

  const arrowClass = (enabled: boolean) =>
    `w-6 h-6 flex items-center justify-center rounded-full border border-white/20 text-white ${
      enabled ? "bg-white/15 hover:bg-white/25 cursor-pointer" : "bg-white/5 text-white/30 cursor-not-allowed"
    }`;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => canGoBack && onChange(prev)}
        disabled={!canGoBack}
        className={arrowClass(canGoBack)}
        style={{ transition: "background-color 150ms var(--ease-out)" }}
        aria-label="Previous month"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      <span className="section-label text-blue-200/70 min-w-[104px] text-center select-none">
        {format(month, "MMMM yyyy")}
      </span>

      <button
        type="button"
        onClick={() => canGoForward && onChange(next)}
        disabled={!canGoForward}
        className={arrowClass(canGoForward)}
        style={{ transition: "background-color 150ms var(--ease-out)" }}
        aria-label="Next month"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>

      {!isCurrentMonth && (
        <button
          type="button"
          onClick={() => onChange(thisMonth)}
          className="ml-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white cursor-pointer"
          style={{ transition: "background-color 150ms var(--ease-out)" }}
        >
          Today
        </button>
      )}
    </div>
  );
}
