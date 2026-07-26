-- Split amount received back on an expense (e.g. from a shared bill)
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "split_amount" integer DEFAULT 0 NOT NULL;
