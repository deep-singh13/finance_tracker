import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { RefreshCw, Mail, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

interface GmailStatus {
  connected: boolean;
  lastSyncedAt: string | null;
  authUrl: string | null;
}

export function GmailSyncButton() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/gmail/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      // silently ignore — feature may not be configured
    }
  };

  useEffect(() => {
    fetchStatus();
    // If user just came back from Google OAuth, re-fetch status
    if (window.location.search.includes("gmail=connected")) {
      window.history.replaceState({}, "", window.location.pathname);
      toast({ title: "Gmail connected!", description: "You can now sync your transactions." });
    }
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Sync failed");

      await fetchStatus();
      queryClient.invalidateQueries({ queryKey: [api.expenses.list.path] });

      toast({
        title: data.imported > 0 ? `Imported ${data.imported} transaction${data.imported !== 1 ? "s" : ""}` : "Already up to date",
        description: data.imported > 0
          ? `Found ${data.total} emails, added ${data.imported} new expense${data.imported !== 1 ? "s" : ""}.`
          : "No new transactions found since last sync.",
      });
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  // Feature not configured server-side (no Google credentials set)
  if (status && !status.connected && !status.authUrl) return null;

  if (!status?.connected) {
    return (
      <Button
        variant="outline"
        onClick={() => { if (status?.authUrl) window.location.href = status.authUrl; }}
        className="w-full rounded-xl border-border/50 text-[13px] font-semibold gap-2"
      >
        <Mail className="w-4 h-4" />
        Connect Gmail
      </Button>
    );
  }

  return (
    <div className="space-y-1.5">
      <Button
        variant="outline"
        onClick={handleSync}
        disabled={syncing}
        className="w-full rounded-xl border-border/50 text-[13px] font-semibold gap-2"
      >
        {syncing ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle className="w-4 h-4 text-green-500" />
        )}
        {syncing ? "Syncing Gmail…" : "Sync from Gmail"}
      </Button>
      {status.lastSyncedAt && (
        <p className="text-center text-[11px] text-muted-foreground">
          Last synced {format(parseISO(status.lastSyncedAt), "MMM d, h:mm a")}
        </p>
      )}
    </div>
  );
}
