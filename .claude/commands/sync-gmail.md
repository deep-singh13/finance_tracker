# sync-gmail

Fetch HDFC Bank transaction emails from Gmail and import them into the finance tracker.

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
Use the Gmail MCP `search_threads` tool with this query (adjust the `after:` date from step 2):

```
from:alerts@hdfcbank.bank.in (debited OR "UPI txn") $AFTER_CLAUSE
```

Fetch up to 50 threads. Collect all messages across all threads.

### 4 — Parse each message into a transaction

For every message, extract from its **snippet** (no need to call `get_thread`):

**Amount** — match `Rs.<digits>` or `INR <digits>` (strip commas, multiply by 100 to get paise):
- `Rs.353.58` → 35358 paise
- `Rs.1,180.00` → 118000 paise

**Merchant / Description** — use these rules in order:
1. UPI pattern: `to VPA <vpa_address> <MERCHANT NAME> on` — capture MERCHANT NAME
   - Example snippet: `debited from account 1366 to VPA payzomato@hdfcbank ZOMATO on 14-04-26` → `ZOMATO`
2. Debit card pattern: `at <MERCHANT NAME> on <date>` or `at <MERCHANT NAME> at`
   - Example: `debited from your HDFC Bank Debit Card ending 3482 at CLAUDE.AI SUBSCRIPTION on` → `CLAUDE.AI SUBSCRIPTION`
3. Fallback: use the email subject, trimmed.

Capitalise the merchant name in title case (e.g. `ZOMATO` → `Zomato`, `COSMO PROFILE SALONS` → `Cosmo Profile Salons`).

**Category** — infer from the merchant name using these keywords (case-insensitive):
- Food: swiggy, zomato, blinkit, mcdonald, pizza, domino, restaurant, cafe, food, biryani
- Shopping: amazon, flipkart, myntra, nykaa, ajio, shop, mart
- Transport: ola, uber, rapido, metro, auto, taxi, petrol, fuel, parking
- Entertainment: netflix, hotstar, spotify, bookmyshow, prime, movie, apple (if "Apple Services")
- Utilities: jio, airtel, bsnl, internet, broadband, electricity, gas, recharge, dth
- Health: hospital, clinic, doctor, pharmacy, medical, apollo, medplus
- Travel: hotel, flight, irctc, makemytrip, goibibo, oyo
- Other: anything that doesn't match above

**Date** — use the message's `date` field (ISO 8601), convert to `YYYY-MM-DD`.

**externalId** — use the message's `id` field from the search result.

**Skip** a message if:
- Amount cannot be parsed (no Rs./INR pattern found)
- The snippet contains `credited` but NOT `debited` (refunds/incoming, skip these)
- Subject contains `OTP` (one-time password emails, not transactions)

### 5 — POST to the API

Batch all parsed transactions in a single request:

```
POST $FINANCE_TRACKER_URL/api/gmail/sync
Content-Type: application/json
X-Sync-Key: $SYNC_API_KEY   ← only if SYNC_API_KEY is set

{
  "transactions": [
    { "amount": 35358, "description": "Zomato", "category": "Food", "date": "2026-04-14", "externalId": "19d8a285d3b1bd18" },
    ...
  ]
}
```

### 6 — Report results

Print a summary like:
```
✅ Gmail sync complete
   Fetched : 42 emails
   Imported: 38 new transactions
   Skipped : 4 (already in DB)
   Last synced: 2026-04-17 14:30
```

If the request fails, show the error message from the response body.
