import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

export function createOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(oauth2Client: OAuth2Client): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    prompt: "consent", // Force refresh token on every auth
  });
}

export interface ParsedTransaction {
  amount: number; // in paise (cents for INR)
  description: string;
  category: string;
  date: string; // YYYY-MM-DD
  externalId: string; // Gmail message ID
}

// Category inference from description keywords
function inferCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/swiggy|zomato|mcdonald|pizza|domino|restaurant|cafe|food|biryani|burger|dhaba/.test(lower)) return "Food";
  if (/amazon|flipkart|myntra|nykaa|ajio|meesho|shop|store|mart/.test(lower)) return "Shopping";
  if (/ola|uber|rapido|metro|auto|taxi|petrol|fuel|bpcl|hpcl|iocl|parking/.test(lower)) return "Transport";
  if (/netflix|hotstar|spotify|bookmyshow|prime|zee5|movie|cinema|pvr|inox/.test(lower)) return "Entertainment";
  if (/electricity|water|gas|jio|airtel|bsnl|vi|internet|broadband|recharge|dth|tata sky/.test(lower)) return "Utilities";
  if (/hospital|clinic|doctor|medical|pharmacy|apollo|medplus|pharmeasy|1mg|health/.test(lower)) return "Health";
  if (/hotel|flight|irctc|makemytrip|goibibo|oyo|travel|trip|booking|cleartrip/.test(lower)) return "Travel";
  return "Other";
}

// Parse INR amount from text — handles formats like Rs.1,234.56 / INR 1234 / ₹1,234
function parseAmount(text: string): number | null {
  // Match patterns like: Rs.1,234.56 | Rs 1,234 | INR 1,234.56 | ₹1234 | 1,234.56 INR
  const patterns = [
    /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:INR|Rs\.?|₹)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[1].replace(/,/g, "");
      const value = parseFloat(cleaned);
      if (!isNaN(value) && value > 0 && value < 1_000_000) {
        return Math.round(value * 100); // convert to paise
      }
    }
  }
  return null;
}

// Extract merchant/description from common Indian bank email formats
function extractDescription(subject: string, body: string): string {
  const combined = `${subject} ${body}`.replace(/\s+/g, " ");

  // UPI payment patterns: "to Swiggy", "at McDonald's", "VPA merchant@upi"
  const upiMerchant = combined.match(/(?:to|at)\s+([A-Za-z][A-Za-z0-9\s\-&'.]+?)(?:\s+(?:on|for|via|ref|upi|\.)|$)/i);
  if (upiMerchant) return upiMerchant[1].trim();

  // VPA-based UPI: "UPI/DR/123456/SwiggySellers"
  const vpa = combined.match(/UPI\/(?:DR|CR)\/\d+\/([A-Za-z][A-Za-z0-9\s]+)/i);
  if (vpa) return vpa[1].trim();

  // "at MERCHANT" pattern in credit card alerts
  const atMerchant = combined.match(/at\s+([A-Z][A-Za-z0-9\s\-&'.]{2,30}?)(?:\s+on\s+\d|\s+for\s+Rs|\s*\.)/i);
  if (atMerchant) return atMerchant[1].trim();

  // Fall back to subject line (trimmed)
  return subject.slice(0, 60);
}

// Decode base64url encoded Gmail message parts
function decodeBase64(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

// Recursively extract plain-text body from MIME parts
function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }
  return "";
}

export async function fetchTransactionEmails(
  oauth2Client: OAuth2Client,
  since: Date | null
): Promise<ParsedTransaction[]> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Build query: debit/transaction keywords + date filter
  const afterClause = since
    ? `after:${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, "0")}/${String(since.getDate()).padStart(2, "0")}`
    : "newer_than:90d";

  const query = `(debited OR "has been debited" OR "transaction alert" OR "UPI transaction" OR "payment of" OR "amount of") (Rs OR INR OR ₹) ${afterClause}`;

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 100,
  });

  const messages = listRes.data.messages || [];
  const transactions: ParsedTransaction[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;
    try {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = detail.data.payload?.headers || [];
      const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
      const dateHeader = headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

      const body = extractBody(detail.data.payload);
      const combined = `${subject} ${body}`;

      // Skip credited/refund emails — we only want debits
      if (/\bcredited\b/i.test(combined) && !/\bdebited\b/i.test(combined)) continue;

      const amount = parseAmount(combined);
      if (!amount) continue; // Skip if we can't parse an amount

      // Parse email date
      let txDate: string;
      try {
        txDate = new Date(dateHeader).toISOString().split("T")[0];
      } catch {
        txDate = new Date().toISOString().split("T")[0];
      }

      const description = extractDescription(subject, body);
      const category = inferCategory(description);

      transactions.push({
        amount,
        description,
        category,
        date: txDate,
        externalId: msg.id,
      });
    } catch {
      // Skip individual email parse failures silently
    }
  }

  return transactions;
}
