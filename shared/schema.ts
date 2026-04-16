import { pgTable, text, serial, timestamp, date, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  amount: integer("amount").notNull(), // Stored in cents
  description: text("description").notNull(),
  category: text("category").notNull(),
  date: date("date").notNull(), // YYYY-MM-DD
  source: text("source").default("manual").notNull(), // 'manual' | 'gmail'
  externalId: text("external_id"), // Gmail message ID for deduplication
  createdAt: timestamp("created_at").defaultNow(),
});

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  month: text("month").notNull().unique(), // YYYY-MM
  amount: integer("amount").notNull(), // Stored in cents
});

// Stores Gmail OAuth tokens and last sync metadata
export const gmailSync = pgTable("gmail_sync", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  lastSyncedAt: timestamp("last_synced_at"), // Timestamp of last successful sync
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true });
export const insertBudgetSchema = createInsertSchema(budgets).omit({ id: true });
export const insertGmailSyncSchema = createInsertSchema(gmailSync).omit({ id: true });

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type GmailSync = typeof gmailSync.$inferSelect;
export type InsertGmailSync = z.infer<typeof insertGmailSyncSchema>;

export type CreateExpenseRequest = InsertExpense;
export type UpdateExpenseRequest = Partial<InsertExpense>;

export type ExpenseResponse = Expense;
export type ExpensesListResponse = Expense[];
