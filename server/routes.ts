import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

const parsedTransactionSchema = z.object({
  amount: z.number().positive(),       // in paise
  description: z.string().min(1),
  category: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  externalId: z.string().min(1),       // Gmail message ID for deduplication
});

const syncPayloadSchema = z.object({
  transactions: z.array(parsedTransactionSchema),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get(api.expenses.list.path, async (req, res) => {
    const expenses = await storage.getExpenses();
    res.json(expenses);
  });

  app.get(api.expenses.get.path, async (req, res) => {
    const expense = await storage.getExpense(Number(req.params.id));
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    res.json(expense);
  });

  app.post(api.expenses.create.path, async (req, res) => {
    try {
      const input = api.expenses.create.input.parse(req.body);
      const expense = await storage.createExpense(input);
      res.status(201).json(expense);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.expenses.update.path, async (req, res) => {
    try {
      const input = api.expenses.update.input.parse(req.body);
      const expense = await storage.updateExpense(Number(req.params.id), input);
      if (!expense) {
         return res.status(404).json({ message: 'Expense not found' });
      }
      res.json(expense);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.expenses.delete.path, async (req, res) => {
    await storage.deleteExpense(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.budgets.get.path, async (req, res) => {
    const budget = await storage.getBudget(req.params.month);
    if (!budget) {
      return res.status(404).json({ message: 'Budget not found' });
    }
    res.json(budget);
  });

  app.post(api.budgets.set.path, async (req, res) => {
    try {
      const input = api.budgets.set.input.parse(req.body);
      const budget = await storage.setBudget(input);
      res.json(budget);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // ── Gmail Sync Routes ──────────────────────────────────────────────────────
  // Transactions are pushed HERE by the /sync-gmail Claude Code skill.
  // The skill uses the Gmail MCP connector (available in Claude Code) to read
  // emails and parse transactions, then POSTs them to this endpoint.
  // No Google Cloud account required.

  // GET /api/gmail/status — returns last sync timestamp
  app.get("/api/gmail/status", async (_req, res) => {
    const record = await storage.getGmailSync();
    res.json({ lastSyncedAt: record?.lastSyncedAt ?? null });
  });

  // POST /api/gmail/sync — accepts parsed transactions from the Claude Code skill
  // Optionally protected by SYNC_API_KEY env var (set same key in your skill env)
  app.post("/api/gmail/sync", async (req, res) => {
    const apiKey = process.env.SYNC_API_KEY;
    if (apiKey) {
      const provided = req.headers["x-sync-key"];
      if (provided !== apiKey) {
        return res.status(401).json({ message: "Invalid or missing X-Sync-Key header" });
      }
    }

    try {
      const { transactions } = syncPayloadSchema.parse(req.body);

      let imported = 0;
      for (const tx of transactions) {
        const exists = await storage.expenseExistsByExternalId(tx.externalId);
        if (exists) continue;
        await storage.createExpense({
          amount: tx.amount,
          description: tx.description,
          category: tx.category,
          date: tx.date,
          source: "gmail",
          externalId: tx.externalId,
        });
        imported++;
      }

      await storage.upsertGmailSync({ lastSyncedAt: new Date() });
      return res.json({ imported, total: transactions.length, lastSyncedAt: new Date() });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // ── Seed initial data ──────────────────────────────────────────────────────
  const existingExpenses = await storage.getExpenses();
  if (existingExpenses.length === 0) {
    const today = new Date().toISOString().split('T')[0];
    await storage.createExpense({ amount: 1250, description: "Lunch at cafe", category: "Food", date: today });
    await storage.createExpense({ amount: 5500, description: "Movie tickets", category: "Entertainment", date: today });
    await storage.createExpense({ amount: 15000, description: "Electric bill", category: "Amenities", date: today });
  }

  return httpServer;
}
