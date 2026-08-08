# sync-gmail

Fetch HDFC Bank and SBI Card transaction emails from Gmail and push them to the finance tracker's staging area for review.

## Steps

### 1 — Read configuration
The app URL and optional API key come from environment variables. Read them now:
- `FINANCE_TRACKER_URL` — base URL of the deployed app (e.g. `https://finance-tracker.onrender.com`). If not set, use `http://localhost:5000`.
- `SYNC_API_KEY` — optional; if set, include it as the `X-Sync-Key` request header.

### 2 — Get last sync date
Call `GET $FINANCE_TRACKER_URL/api/gmail/status`. Parse `lastSyncedAt` from the JSON response.
- If `lastSyncedAt` is set, use it to build an `after:YYYY/MM/DD` Gmail query clause.
- If null, default to `newer_than:90d`.

### 3 — Search Gmail for transaction emails
Use the Gmail MCP `search_threads` tool with **three separate queries** (adjust the `after:` date from step 2):

**Query A — HDFC debits & UPI:**
```
from:alerts@hdfcbank.bank.in (debited OR "UPI txn") $AFTER_CLAUSE
```

**Query B — HDFC ATM / cash withdrawals** (different email format, not caught by query A):
```
from:alerts@hdfcbank.bank.in "ATM withdrawal" $AFTER_CLAUSE
```

**Query C — SBI Card transactions:**
```
from:onlinesbicard@sbicard.com "spent on your SBI Credit Card" $AFTER_CLAUSE
```

Run all three. Deduplicate by thread ID. Call `get_thread` on every unique thread (both banks bundle alerts into mega-threads; `search_threads` silently truncates them). Fetch up to 50 threads per query.

### 4 — Parse each message into a transaction

Determine the message type first, then extract fields.

---

#### Type 1 — SBI Card transaction (`from:onlinesbicard@sbicard.com`)

Body looks like:
```
Rs.1,234.56 spent on your SBI Credit Card ending 4321 at NationalHighwaysA on 08/08/26.
Trxn. not done by you? Report at https://sbicard.com/Dispute
```

- **Amount** — match `Rs.<digits>` before the word `spent`, strip commas, ×100 → paise
  - `Rs.1,234.56` → `123456`
- **cardLast4** — match `ending (\d{4})` → `"4321"`. **This field is what routes the transaction to the card**, so never omit it for SBI messages.
- **Merchant / Description** — match `at <MERCHANT> on <date>` → `NationalHighwaysA`
- **Date** — match `on (\d{2})/(\d{2})/(\d{2})` at the end. This is **DD/MM/YY** (Indian format), not MM/DD/YY. `08/08/26` → `2026-08-08`.
  - Prefer this over the email's `date` header — the alert can arrive a day after the swipe.
  - If the body date can't be parsed, fall back to the message `date` field.
- **Category** — same keyword rules as below.
- **externalId** — message `id`.

**Skip an SBI message if:**
- It says `credited to your SBI Credit Card` (refund/reversal) rather than `spent on`
- Subject or body is about a **payment received** on the card (`Payment of Rs.X received`, `payment towards your SBI Card`) — bill payments are tracked in the app by marking a statement paid, not as transactions
- It's a statement-generated notice, reward-points update, EMI-conversion offer, or OTP

---

#### Type 2 — HDFC ATM withdrawal (snippet contains `ATM withdrawal` or `for ATM`)
- **Amount** — match `Rs <digits>` (space after Rs, not dot) or `Rs.<digits>`, strip commas, ×100 → paise
  - `Rs 10000.00` → `1000000`
- **Description** — always `"Cash Withdrawal"`
- **Category** — always `Miscellaneous`
- **Date** — message `date` field → `YYYY-MM-DD`
- **externalId** — message `id`
- **cardLast4** — omit (this is a bank account, not a credit card)

---

#### Type 3 — All other HDFC debits

**Amount** — match `Rs.<digits>` or `INR <digits>` (strip commas, ×100 → paise):
- `Rs.353.58` → `35358`
- `Rs.1,180.00` → `118000`

**Merchant / Description** — use these rules in order:
1. UPI pattern: `to VPA <vpa_address> <MERCHANT NAME> on` — capture MERCHANT NAME
   - `debited from account 1366 to VPA payzomato@hdfcbank ZOMATO on 14-04-26` → `ZOMATO`
2. Debit card pattern: `at <MERCHANT NAME> on <date>` or `at <MERCHANT NAME> at`
   - `debited from your HDFC Bank Debit Card ending 3482 at CLAUDE.AI SUBSCRIPTION on` → `CLAUDE.AI SUBSCRIPTION`
3. Fallback: use the email subject, trimmed.

**cardLast4** — omit. HDFC alerts are for the bank account and debit card; the `ending 3482` in a debit-card alert is **not** a credit card and must not be sent as `cardLast4`.

**Date** — message `date` field (ISO 8601) → `YYYY-MM-DD`.

**externalId** — message `id`.

---

### Merchant name casing (applies to all types)

Only title-case a merchant name **if it is entirely uppercase**. Otherwise leave it exactly as the bank sent it.

- `ZOMATO` → `Zomato`
- `COSMO PROFILE SALONS` → `Cosmo Profile Salons`
- `NationalHighwaysA` → `NationalHighwaysA` (already mixed case — do **not** mangle it to `Nationalhighwaysa`)

### Category

Map to one of exactly these 4 values (case-sensitive): `Food`, `Entertainment`, `Amenities`, `Miscellaneous`

Keyword rules (case-insensitive on the merchant name):
- **Food**: swiggy, zomato, blinkit, mcdonald, pizza, domino, restaurant, cafe, food, biryani, burger, kfc, starbucks, daalchini
- **Entertainment**: netflix, hotstar, spotify, bookmyshow, prime video, apple services, youtube, disney, movie, game
- **Amenities**: jio, airtel, bsnl, internet, broadband, electricity, gas, recharge, dth, water, bill, hospital, clinic, doctor, pharmacy, medical, apollo, medplus, gym, salon, ola, uber, rapido, metro, petrol, fuel, parking, nationalhighways, fastag, toll
- **Miscellaneous**: everything else (amazon, flipkart, shopping, hotel, flight, irctc, etc.)

### Universal skip rules

Skip a message if **any** of these hold:
- Amount cannot be parsed (no Rs./INR amount found)
- The snippet contains `credited` but NOT `debited` (refunds/incoming)
- Subject contains `OTP`
- Subject matches `Toll Paid Rs.X from FASTag Wallet` AND amount ≤ Rs.100 (10000 paise)
- Account balance / e-mandate / forex markup fee alerts
- FASTag recharge success notifications

### ⚠️ Credit card bill payments — skip these

When you pay the SBI Card bill from your HDFC account, HDFC sends a normal debit alert. Staging it would **double-count** every card transaction you already imported (once as the SBI swipe, again as the lump-sum payment).

**Skip any HDFC debit whose merchant/VPA/narration matches (case-insensitive):**
- `sbicard`, `sbi card`, `sbi cards`
- `cc payment`, `credit card payment`, `card payment`
- `billdesk` **combined with** any of the above

The card's outstanding balance is derived from its own transactions, so nothing is lost by skipping the payment. Mark the statement paid in the app's Cards tab instead.

### 5 — POST to the staging API

Batch all parsed transactions in a single request to the **staging** endpoint (not sync):

```
POST $FINANCE_TRACKER_URL/api/gmail/stage
Content-Type: application/json
X-Sync-Key: $SYNC_API_KEY   ← only if SYNC_API_KEY is set

{
  "transactions": [
    { "amount": 35358, "description": "Zomato", "category": "Food", "date": "2026-04-14", "externalId": "19d8a285d3b1bd18" },
    { "amount": 123456, "description": "NationalHighwaysA", "category": "Amenities", "date": "2026-08-08", "externalId": "19d8a285d3b1bd19", "cardLast4": "4321" }
  ]
}
```

`cardLast4` is optional and must be exactly 4 digits when present. At commit time the server looks it up against the `cards` table and links the expense to that card. If no card with those digits exists yet, the transaction still imports — just unlinked — so add the card in the app's **Cards** tab first for it to be routed.

The server automatically filters out transactions already in the database.

### 6 — Report results

Print a summary like:
```
✅ Gmail sync staged for review
   Fetched : 42 emails  (HDFC 30, SBI Card 12)
   Staged  : 12 new transactions (ready to review in the app)
   Skipped : 30 (already in DB, duplicates, or card bill payments)

Open the finance tracker and click "Sync Gmail" to review and approve.
```

If the request fails, show the error message from the response body.
