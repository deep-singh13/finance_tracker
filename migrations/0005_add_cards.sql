-- Credit cards. Transactions stay in `expenses` (a swipe is money spent); this
-- table adds the limit / billing-cycle context the card page needs, and the
-- Gmail sync routes an alert to a card by matching `last4`.
CREATE TABLE IF NOT EXISTS "cards" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "issuer" text NOT NULL,
  "network" text,
  "last4" text NOT NULL UNIQUE,
  "credit_limit" integer,
  "statement_day" integer DEFAULT 1 NOT NULL,
  "due_day" integer DEFAULT 20 NOT NULL,
  "paid_statements" text[] DEFAULT '{}',
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now()
);

-- Which card paid for an expense. Null means bank account or cash.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "card_id" integer;
CREATE INDEX IF NOT EXISTS "expenses_card_id_idx" ON "expenses" ("card_id");
