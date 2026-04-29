import { useState, useEffect } from "react";
import { OTPInput, OTPInputContext } from "input-otp";
import { useContext } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

// Single slot rendered by OTPInput
function Slot({ index }: { index: number }) {
  const ctx = useContext(OTPInputContext);
  const slot = ctx.slots[index];

  return (
    <div
      className={cn(
        "relative w-14 h-16 text-2xl font-bold",
        "flex items-center justify-center",
        "rounded-2xl border-2 transition-all duration-150",
        "bg-card text-foreground",
        slot.isActive
          ? "border-primary shadow-[0_0_0_3px] shadow-primary/20"
          : "border-border/60",
      )}
    >
      {slot.char ?? (
        <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
      )}
      {slot.hasFakeCaret && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-0.5 h-6 bg-primary animate-[caret-blink_1s_step-end_infinite]" />
        </div>
      )}
    </div>
  );
}

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  // Auto-submit when 4 digits are entered
  useEffect(() => {
    if (pin.length === 4) submit(pin);
  }, [pin]);

  const triggerShake = (message: string) => {
    setError(message);
    setShake(true);
    setPin("");
    setTimeout(() => setShake(false), 600);
  };

  const submit = async (value: string) => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
        credentials: "include",
      });

      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json().catch(() => ({}));
        const msg =
          res.status === 429
            ? "Too many attempts. Try again in 15 minutes."
            : data.message || "Incorrect PIN";
        triggerShake(msg);
      }
    } catch {
      triggerShake("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      {/* Theme toggle top-right */}
      <div className="absolute top-5 right-5">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* App identity */}
        <div className="text-center space-y-1">
          <div className="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">💰</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Finance Tracker
          </h1>
          <p className="text-[14px] text-muted-foreground">
            Enter your 4-digit PIN to continue
          </p>
        </div>

        {/* PIN input */}
        <div
          className={cn(
            "flex flex-col items-center gap-4 transition-transform",
            shake && "animate-[shake_0.5s_ease-in-out]",
          )}
        >
          <OTPInput
            maxLength={4}
            value={pin}
            onChange={setPin}
            disabled={loading}
            containerClassName="flex gap-3"
            render={({ slots }) => (
              <>
                {slots.map((_, i) => (
                  <Slot key={i} index={i} />
                ))}
              </>
            )}
          />

          {/* Error message */}
          <div className="h-5">
            {error && (
              <p className="text-[13px] text-destructive text-center animate-in fade-in slide-in-from-bottom-1">
                {error}
              </p>
            )}
          </div>

          {/* Loading state */}
          {loading && (
            <p className="text-[13px] text-muted-foreground animate-pulse">
              Verifying…
            </p>
          )}
        </div>

        <p className="text-[12px] text-muted-foreground/50 text-center">
          Secured with bcrypt · Rate-limited
        </p>
      </div>
    </div>
  );
}
