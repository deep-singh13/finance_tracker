// Guards the 401 session-expiry seam in client/src/lib/queryClient.ts.
//
// The QueryCache onError handler keys off `error.message.startsWith("401:")`.
// Every useQuery that supplies its own queryFn bypasses the default one and can
// silently break that contract — which is exactly how this went dead before:
// seven call sites threw `${res.status}`, i.e. "401" with no colon.
//
// Run:  npx tsx script/verify-query-seam.ts
// No test runner required.

import http from "node:http";
import { queryClient, getQueryFn } from "../client/src/lib/queryClient";

async function main() {

  // Stub mirroring server/auth.ts requireAuth exactly: 401 + {"message":"Unauthorized"}
  const seen: string[] = [];
  const srv = http.createServer((req, res) => {
    seen.push(req.url!);
    if (req.url === "/api/budgets/2026-08") { res.writeHead(404, {"Content-Type":"application/json"}); return res.end('{"message":"Budget not found"}'); }
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end('{"message":"Unauthorized"}');
  });
  await new Promise<void>(r => srv.listen(5099, "127.0.0.1", r));

  const base = "http://127.0.0.1:5099";
  const origFetch = globalThis.fetch;
  // queryFn passes a relative path; rebase onto the stub.
  globalThis.fetch = ((u: any, o: any) =>
    origFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o)) as typeof fetch;

  let pass = 0, fail = 0;
  const ok = (name: string, cond: boolean, extra = "") => {
    cond ? (pass++, console.log(`  PASS  ${name}`)) : (fail++, console.log(`  FAIL  ${name} ${extra}`));
  };

  // ── 1. URL construction from queryKey ──────────────────────────────────
  await getQueryFn({ on401: "throw" })({ queryKey: ["/api/expenses"] } as any).catch(() => {});
  ok("single-part key -> /api/expenses", seen.at(-1) === "/api/expenses", `got ${seen.at(-1)}`);
  await getQueryFn({ on401: "throw" })({ queryKey: ["/api/budgets", "2026-08"] } as any).catch(() => {});
  ok("two-part key -> /api/budgets/2026-08", seen.at(-1) === "/api/budgets/2026-08", `got ${seen.at(-1)}`);

  // ── 2. Error contract: message must start with "401:" ──────────────────
  let msg = "";
  await getQueryFn({ on401: "throw" })({ queryKey: ["/api/expenses"] } as any).catch(e => { msg = e.message; });
  ok('default queryFn throws "401: ..."', msg.startsWith("401:"), `got ${JSON.stringify(msg)}`);
  console.log(`        message = ${JSON.stringify(msg)}`);

  // ── 3. THE SEAM: a failed query must trigger onError -> clear() ─────────
  await queryClient.fetchQuery({ queryKey: ["/api/expenses"] }).catch(() => {});
  const after = queryClient.getQueryCache().getAll().length;
  ok("401 clears the query cache (onError fired)", after === 0, `cache had ${after} entries`);

  // ── 4. CONTROL: the OLD message shape must NOT clear (proves the test bites)
  await queryClient.fetchQuery({
    queryKey: ["/api/control"],
    queryFn: async () => { throw new Error(`401`); },   // old page-level shape
  }).catch(() => {});
  const ctrl = queryClient.getQueryCache().getAll().length;
  ok('old "401" (no colon) does NOT clear — regression guard', ctrl > 0, `cache had ${ctrl}`);

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);

}
main();
