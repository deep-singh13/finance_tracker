import { pgTable, text, serial, timestamp, date, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  amount: integer("amount").notNull(), // Stored in cents
  description: text("description").notNull(),
  category: text("category").notNull(),
  date: date("date").notNull(), // YYYY-MM-DD
  source: text("source").default("manual").notNull(), // 'manual' | 'gmail' | 'subscription'
  externalId: text("external_id"), // Gmail message ID for deduplication
  tags: text("tags").array(), // free-form tags e.g. ['#vacation', '#tax-deductible']
  splitAmount: integer("split_amount").default(0).notNull(), // Cents received back from someone else for this expense; subtracted before counting toward totals
  cardId: integer("card_id"), // Credit card that paid, if any. Null = bank account / cash.
  createdAt: timestamp("created_at").defaultNow(),
});

export const income = pgTable("income", {
  id: serial("id").primaryKey(),
  amount: integer("amount").notNull(), // Stored in cents
  description: text("description").notNull(),
  source: text("source").notNull().default("other"), // 'salary' | 'freelance' | 'investment' | 'other'
  date: date("date").notNull(), // YYYY-MM-DD
  externalId: text("external_id"), // Gmail message ID for deduplication
  createdAt: timestamp("created_at").defaultNow(),
});

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  month: text("month").notNull().unique(), // YYYY-MM
  amount: integer("amount").notNull(), // Stored in cents
});

export const investments = pgTable("investments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'SIP' | 'Lump Sum' | 'FD' | 'PPF' | 'NPS' | 'Other'
  amount: integer("amount").notNull(), // in paise; monthly for SIP, total for others
  startDate: date("start_date"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  skippedMonths: text("skipped_months").array().default([]), // YYYY-MM months where SIP is skipped
  createdAt: timestamp("created_at").defaultNow(),
});

export const cards = pgTable("cards", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // "SimplySAVE"
  issuer: text("issuer").notNull(), // "SBI Card"
  network: text("network"), // 'VISA' | 'Mastercard' | 'RuPay' | 'Amex'
  last4: text("last4").notNull().unique(), // Gmail sync routes a transaction to a card by this
  creditLimit: integer("credit_limit"), // in paise
  statementDay: integer("statement_day").default(1).notNull(), // day of month the bill is generated
  dueDay: integer("due_day").default(20).notNull(), // day of month payment is due
  // Statement period keys (YYYY-MM of the statement date) already paid off.
  // Bill payments are skipped during sync, so this is how outstanding stays honest.
  paidStatements: text("paid_statements").array().default([]),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emis = pgTable("emis", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  lender: text("lender"),
  amount: integer("amount").notNull(), // monthly instalment, in paise
  totalAmount: integer("total_amount"), // optional loan principal, in paise
  tenureMonths: integer("tenure_months").notNull(),
  startDate: date("start_date").notNull(), // month of the first instalment
  dueDay: integer("due_day").default(1).notNull(), // day of month the instalment is debited
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  amount: integer("amount").notNull(), // in paise
  billingDay: integer("billing_day").default(1).notNull(), // day of month to create expense
  category: text("category").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastBilledMonth: text("last_billed_month"), // YYYY-MM; prevents double-billing
  createdAt: timestamp("created_at").defaultNow(),
});

// Stores Gmail OAuth tokens and last sync metadata
export const gmailSync = pgTable("gmail_sync", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  lastSyncedAt: timestamp("last_synced_at"), // Timestamp of last successful sync
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true }).extend({
  tags: z.array(z.string()).optional().nullable(),
  splitAmount: z.coerce.number().int().min(0).optional(), // paise
});
export const insertBudgetSchema = createInsertSchema(budgets).omit({ id: true });
export const insertGmailSyncSchema = createInsertSchema(gmailSync).omit({ id: true });
export const insertInvestmentSchema = createInsertSchema(investments).omit({ id: true, createdAt: true });
export const insertCardSchema = createInsertSchema(cards).omit({ id: true, createdAt: true });
export const insertEmiSchema = createInsertSchema(emis).omit({ id: true, createdAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true });
export const insertIncomeSchema = createInsertSchema(income).omit({ id: true, createdAt: true });

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type GmailSync = typeof gmailSync.$inferSelect;
export type InsertGmailSync = z.infer<typeof insertGmailSyncSchema>;
export type Investment = typeof investments.$inferSelect;
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type Card = typeof cards.$inferSelect;
export type InsertCard = z.infer<typeof insertCardSchema>;
export type Emi = typeof emis.$inferSelect;
export type InsertEmi = z.infer<typeof insertEmiSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Income = typeof income.$inferSelect;
export type InsertIncome = z.infer<typeof insertIncomeSchema>;

export type CreateExpenseRequest = InsertExpense;
export type UpdateExpenseRequest = Partial<InsertExpense>;

export type ExpenseResponse = Expense;
export type ExpensesListResponse = Expense[];
