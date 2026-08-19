// Guards shared/paise.ts.
//
// The refactor's safety property is that formatPaise reproduces each of the five
// formatter variants that used to be scattered across the client, byte for byte.
// Each case below pins one of those original expressions as the oracle.
//
// Run:  npx tsx script/verify-paise.ts

import { toPaise, formatPaise, toRupees, isPaise } from "../shared/paise";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) =>
  got === want
    ? (pass++, console.log(`  PASS  ${name}`))
    : (fail++, console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`));

const AMOUNTS = [0, 1, 50, 999, 12345, 123450, 100000000, 250075, 5];

// ── Format parity with the original expressions ────────────────────────────
console.log("format parity vs. the expressions being replaced:");
for (const p of AMOUNTS) {
  // History.tsx / Subscriptions / Investments / Income
  eq(`currency ₹ 2dp (${p})`,
     formatPaise(p),
     (p / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" }));
  // Emis.tsx
  eq(`currency ₹ 0dp (${p})`,
     formatPaise(p, { decimals: 0 }),
     (p / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }));
  // Dashboard fmt / Cards fmt2 / GmailSyncModal
  eq(`plain 2dp (${p})`,
     formatPaise(p, { symbol: false }),
     (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  // Cards fmt
  eq(`plain 0dp (${p})`,
     formatPaise(p, { symbol: false, decimals: 0 }),
     (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 }));
  // hero tiles: bare .toLocaleString on an already-divided value
  eq(`plain auto (${p})`,
     formatPaise(p, { symbol: false, decimals: "auto" }),
     (p / 100).toLocaleString("en-IN"));
}

// ── toPaise: exactness where parseFloat(x)*100 drifts ──────────────────────
console.log("\ntoPaise:");
eq("whole rupees", toPaise("1234"), 123400);
eq("two decimals", toPaise("1234.56"), 123456);
eq("one decimal", toPaise("0.5"), 50);
eq("zero", toPaise("0"), 0);
eq("no float drift on 8.29", toPaise("8.29"), 829);
eq("no float drift on 1.15", toPaise("1.15"), 115);
eq("rounds half up at 3rd dp", toPaise("1.005"), 101);
eq("truncating rounds down", toPaise("1.004"), 100);
eq("accepts a number", toPaise(1234.56), 123456);
eq("leading ₹ tolerated", toPaise("₹1234.56"), 123456);
eq("commas tolerated (parseFloat gave 1)", toPaise("1,234.56"), 123456);
eq("negative", toPaise("-12.34"), -1234);
eq(".5 shorthand", toPaise(".5"), 50);

// every result must satisfy the wire invariant
for (const s of ["1234", "1234.56", "0.5", "8.29", "1.005", ".5"]) {
  eq(`isPaise(toPaise("${s}"))`, isPaise(toPaise(s)), true);
}

console.log("\ntoPaise rejects junk:");
for (const bad of ["", "abc", "1.2.3", "--5", "₹"]) {
  let threw = false;
  try { toPaise(bad); } catch { threw = true; }
  eq(`throws on ${JSON.stringify(bad)}`, threw, true);
}

// ── round trip ─────────────────────────────────────────────────────────────
console.log("\nround trip:");
eq("toRupees(toPaise(x)) === x", toRupees(toPaise("4321.99")), 4321.99);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
