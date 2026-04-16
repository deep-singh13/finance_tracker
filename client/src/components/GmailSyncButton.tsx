import { useEffect, useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Mail } from "lucide-react";

export function GmailSyncButton() {
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/gmail/status")
      .then((r) => r.json())
      .then((d) => setLastSyncedAt(d.lastSyncedAt))
      .catch(() => {});
  }, []);

  if (!lastSyncedAt) return null;

  return (
    <div className="flex items-center gap-2 px-1 text-[12px] text-muted-foreground">
      <Mail className="w-3.5 h-3.5 shrink-0" />
      <span>
        Gmail synced{" "}
        {formatDistanceToNow(parseISO(lastSyncedAt), { addSuffix: true })}
      </span>
    </div>
  );
}
