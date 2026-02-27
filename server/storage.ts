import { db } from "./db";
import {
  expenses,
  budgets,
  type CreateExpenseRequest,
  type UpdateExpenseRequest,
  type ExpenseResponse,
  type ExpensesListResponse,
  type Budget,
  type InsertBudget
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getExpenses(): Promise<ExpensesListResponse>;
  getExpense(id: number): Promise<ExpenseResponse | undefined>;
  createExpense(expense: CreateExpenseRequest): Promise<ExpenseResponse>;
  updateExpense(id: number, updates: UpdateExpenseRequest): Promise<ExpenseResponse>;
  deleteExpense(id: number): Promise<void>;
  getBudget(month: string): Promise<Budget | undefined>;
  setBudget(budget: InsertBudget): Promise<Budget>;
}

export class DatabaseStorage implements IStorage {
  async getExpenses(): Promise<ExpensesListResponse> {
    return await db.select().from(expenses).orderBy(desc(expenses.date));
  }

  async getExpense(id: number): Promise<ExpenseResponse | undefined> {
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, id));
    return expense;
  }

  async createExpense(insertExpense: CreateExpenseRequest): Promise<ExpenseResponse> {
    const [expense] = await db.insert(expenses).values(insertExpense).returning();
    return expense;
  }

  async updateExpense(id: number, updates: UpdateExpenseRequest): Promise<ExpenseResponse> {
    const [updated] = await db.update(expenses)
      .set(updates)
      .where(eq(expenses.id, id))
      .returning();
    return updated;
  }

  async deleteExpense(id: number): Promise<void> {
    await db.delete(expenses).where(eq(expenses.id, id));
  }

  async getBudget(month: string): Promise<Budget | undefined> {
    const [budget] = await db.select().from(budgets).where(eq(budgets.month, month));
    return budget;
  }

  async setBudget(insertBudget: InsertBudget): Promise<Budget> {
    const [existing] = await db.select().from(budgets).where(eq(budgets.month, insertBudget.month));
    if (existing) {
      const [updated] = await db.update(budgets)
        .set({ amount: insertBudget.amount })
        .where(eq(budgets.month, insertBudget.month))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(budgets).values(insertBudget).returning();
    return inserted;
  }
}

export const storage = new DatabaseStorage();
