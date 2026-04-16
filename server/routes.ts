import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { createOAuth2Client, getAuthUrl, fetchTransactionEmails } from "./gmail";

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

  // ── Gmail OAuth & Sync Routes ──────────────────────────────────────────────

  // GET /api/gmail/status — connection state + last sync time
  app.get("/api/gmail/status", async (_req, res) => {
    const record = await storage.getGmailSync();
    if (!record?.refreshToken) {
      const authUrl = process.env.GOOGLE_CLIENT_ID
        ? getAuthUrl(createOAuth2Client())
        : null;
      return res.json({ connected: false, lastSyncedAt: null, authUrl });
    }
    return res.json({
      connected: true,
      lastSyncedAt: record.lastSyncedAt,
      authUrl: null,
    });
  });

  // GET /api/gmail/auth — redirect to Google consent screen
  app.get("/api/gmail/auth", (_req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ message: "Gmail integration not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI." });
    }
    const url = getAuthUrl(createOAuth2Client());
    res.redirect(url);
  });

  // GET /api/gmail/callback — Google redirects here with ?code=...
  app.get("/api/gmail/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    if (!code) return res.status(400).send("Missing authorization code");

    try {
      const oauth2Client = createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);
      await storage.upsertGmailSync({
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        lastSyncedAt: null,
      });
      // Redirect back to app root after connecting
      res.redirect("/?gmail=connected");
    } catch (err) {
      console.error("Gmail OAuth callback error:", err);
      res.status(500).send("Failed to complete Gmail authorization");
    }
  });

  // POST /api/gmail/sync — fetch emails since last sync and import transactions
  app.post("/api/gmail/sync", async (_req, res) => {
    const record = await storage.getGmailSync();
    if (!record?.refreshToken) {
      return res.status(401).json({ message: "Gmail not connected. Visit /api/gmail/auth first." });
    }

    try {
      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials({
        access_token: record.accessToken,
        refresh_token: record.refreshToken,
        expiry_date: record.tokenExpiry ? record.tokenExpiry.getTime() : undefined,
      });

      // googleapis auto-refreshes access tokens using the refresh token
      oauth2Client.on("tokens", async (tokens) => {
        await storage.upsertGmailSync({
          accessToken: tokens.access_token ?? record.accessToken,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : record.tokenExpiry,
        });
      });

      const transactions = await fetchTransactionEmails(oauth2Client, record.lastSyncedAt);

      let imported = 0;
      for (const tx of transactions) {
        // Deduplicate by Gmail message ID
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

      // Update last sync timestamp
      await storage.upsertGmailSync({ lastSyncedAt: new Date() });

      return res.json({ imported, total: transactions.length, lastSyncedAt: new Date() });
    } catch (err) {
      console.error("Gmail sync error:", err);
      return res.status(500).json({ message: "Gmail sync failed. Please reconnect." });
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
