/**
 * The Gmail import wire contract, in one place.
 *
 * The `/sync-gmail` command parses bank alert emails and POSTs transactions to
 * /api/gmail/stage; the review UI edits them; /api/gmail/commit writes them.
 * This shape used to be restated four times — a zod schema and an interface in
 * server/routes.ts, an edit schema beside them, and a hand-copied interface in
 * GmailSyncModal.tsx. The client copy was missing `cardLast4`, so the review UI
 * could not correct a mis-routed card and tsc could not see the gap.
 *
 * Amounts are integer paise — see shared/paise.ts.
 */

import { z } from "zod";

// Field validators are defined once so the regexes and enums cannot drift.
// Defaults are applied only where a schema wants them: an edit is a merge, and
// a default there would overwrite a field the user never touched.
const amount = z.number().positive();
const description = z.string().min(1);
const category = z.string().min(1);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const incomeSource = z.enum(["salary", "freelance", "investment", "other"]);
const splitAmount = z.number().min(0);
const cardLast4 = z.string().regex(/^\d{4}$/);

/** One transaction as parsed from a bank alert email. */
export const parsedTransactionSchema = z.object({
  amount,                                        // paise
  description,
  category: category.default("Miscellaneous"),   // debits
  date: dateString,
  externalId: z.string().min(1),                 // Gmail message ID, for dedupe
  type: z.enum(["debit", "credit"]).default("debit"),
  incomeSource: incomeSource.default("other"),   // credits
  splitAmount: splitAmount.default(0),           // paise received back (debits)
  cardLast4: cardLast4.optional(),               // matched against cards.last4
});

export type ParsedTransaction = z.infer<typeof parsedTransactionSchema>;

/** What the sync command POSTs to /api/gmail/stage and /api/gmail/sync. */
export const syncPayloadSchema = z.object({
  transactions: z.array(parsedTransactionSchema),
});

/** A parsed transaction waiting in the review queue, with a handle to edit it. */
export interface StagedTransaction extends ParsedTransaction {
  tempId: string;
}

/**
 * Fields the review UI may change. All optional — the handler merges only what
 * is present. `cardLast4` accepts null to clear the card (bank account / cash).
 */
export const stagedEditSchema = z.object({
  amount: amount.optional(),
  description: description.optional(),
  category: category.optional(),
  date: dateString.optional(),
  incomeSource: incomeSource.optional(),
  splitAmount: splitAmount.optional(),
  cardLast4: cardLast4.nullable().optional(),
});

export type StagedEdit = z.infer<typeof stagedEditSchema>;
