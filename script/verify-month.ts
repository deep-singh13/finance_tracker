// Guards shared/month.ts.
//
// Each divergence this module was written to close gets a case here, chosen so
// that the OLD behaviour would fail it:
//   - widget summed gross amounts        -> net-of-split cases
//   - widget's top category was gross    -> a case where gross and net disagree
//   - widget left SIP/EMI out of netCash -> netCashFlow case
//   - Investments ignored SIP startDate  -> future-dated SIP case
//
// Run:  npx tsx script/verify-month.ts

import { monthSummary, sipTotalForMonth, netAmount, isInMonth, monthKey } from "../shared/month";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) =>
  JSON.stringify(got) === JSON.stringify(want)
    ? (pass++, console.log(`  PASS  ${name}`))
    : (fail++, console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`));

const M = "2026-08";
const AUG = new Date(2026, 7, 10); // 10 Aug 2026

console.log("netAmount:");
eq("subtracts split", netAmount({ amount: 10000, splitAmount: 4000 }), 6000);
eq("null split", netAmount({ amount: 10000, splitAmount: null }), 10000);
eq("absent split", netAmount({ amount: 10000 }), 10000);

console.log("\nisInMonth / monthKey:");
eq("in month", isInMonth("2026-08-31", M), true);
eq("not in month", isInMonth("2026-09-01", M), false);
eq("monthKey pads", monthKey(new Date(2026, 0, 5)), "2026-01");

console.log("\nsipTotalForMonth (the twin of emiTotalForMonth):");
const sips = [
  { type: "SIP", isActive: true,  amount: 500000, startDate: "2026-01-01", skippedMonths: [] },
  { type: "SIP", isActive: true,  amount: 300000, startDate: "2026-09-01", skippedMonths: [] }, // starts NEXT month
  { type: "SIP", isActive: true,  amount: 200000, startDate: "2026-01-01", skippedMonths: [M] }, // skipped
  { type: "SIP", isActive: false, amount: 100000, startDate: "2026-01-01", skippedMonths: [] }, // inactive
  { type: "FD",  isActive: true,  amount: 900000, startDate: "2026-01-01", skippedMonths: [] }, // not a SIP
  { type: "SIP", isActive: true,  amount:  50000, startDate: null, skippedMonths: null },        // no start date
];
eq("only active, started, unskipped SIPs", sipTotalForMonth(sips, M), 550000);
eq("future-dated SIP excluded (Investments.tsx used to count it)",
   sipTotalForMonth([sips[1]], M), 0);
eq("same SIP counts in its start month", sipTotalForMonth([sips[1]], "2026-09"), 300000);
eq("undefined list", sipTotalForMonth(undefined, M), 0);

console.log("\nmonthSummary — totals are net of splits:");
const expenses = [
  { date: "2026-08-02", amount: 10000, splitAmount: 9000, category: "Food" },   // net 1000
  { date: "2026-08-03", amount:  5000, splitAmount: 0,    category: "Travel" }, // net 5000
  { date: "2026-08-04", amount:  2000, splitAmount: null, category: "Food" },   // net 2000
  { date: "2026-07-31", amount: 99999, splitAmount: 0,    category: "Food" },   // other month
];
const s = monthSummary({
  expenses,
  income: [{ date: "2026-08-01", amount: 5000000 }, { date: "2026-07-01", amount: 111 }],
  investments: sips,
  emis: [{ isActive: true, startDate: "2026-01-01", tenureMonths: 24, amount: 250000 }],
}, M, AUG);

eq("expenses are net", s.expenses, 8000);
eq("gross would have been 17000 (what the widget reported)", 10000 + 5000 + 2000, 17000);
eq("split total", s.split, 9000);
eq("income only this month", s.income, 5000000);
eq("sip", s.sip, 550000);
eq("emi", s.emi, 250000);
eq("netCashFlow = income - expenses - sip - emi", s.netCashFlow, 5000000 - 8000 - 550000 - 250000);
eq("widget's old formula would have said", 5000000 - 17000, 4983000);
eq("count excludes other months", s.count, 3);

console.log("\nmonthSummary — top category uses NET, not gross:");
eq("byCategory sorted by net", s.byCategory, [{ name: "Travel", total: 5000 }, { name: "Food", total: 3000 }]);
eq("topCategory is Travel (gross would say Food)", s.topCategory, { name: "Travel", total: 5000 });

console.log("\nmonthSummary — dailyAvg:");
eq("current month divides by days elapsed", s.dailyAvg, 8000 / 10);
const past = monthSummary({ expenses: [{ date: "2026-06-05", amount: 3000, category: "Food" }] }, "2026-06", AUG);
eq("past month divides by full month length", past.dailyAvg, 3000 / 30);
eq("no expenses -> 0", monthSummary({ expenses: [] }, M, AUG).dailyAvg, 0);

console.log("\nmonthSummary — empty input:");
const empty = monthSummary({}, M, AUG);
eq("all zero", [empty.expenses, empty.income, empty.sip, empty.emi, empty.netCashFlow], [0, 0, 0, 0, 0]);
eq("no top category", empty.topCategory, null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
