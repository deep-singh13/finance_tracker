-- EMIs table — ongoing loan repayments, counted as a monthly outflow (not an expense)
CREATE TABLE IF NOT EXISTS "emis" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "lender" text,
  "amount" integer NOT NULL,
  "total_amount" integer,
  "tenure_months" integer NOT NULL,
  "start_date" date NOT NULL,
  "due_day" integer DEFAULT 1 NOT NULL,
  "notes" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now()
);
