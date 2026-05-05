import { useEffect } from "react";
import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Investments from "@/pages/Investments";
import Subscriptions from "@/pages/Subscriptions";
import Income from "@/pages/Income";
import Login from "@/pages/Login";
import { History } from "@/components/History";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { LayoutDashboard, History as HistoryIcon, TrendingUp, RefreshCw, Wallet, LogOut } from "lucide-react";

// Runs on every app load — creates expenses for active subscriptions whose
// billing day has passed this month and haven't been billed yet.
function useSubscriptionBilling() {
  useEffect(() => {
    fetch("/api/subscriptions/process", { method: "POST" })
      .then(r => r.json())
      .then(({ billed }) => {
        if (billed > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        }
      })
      .catch(() => {});
  }, []);
}

function TabBar() {
  const [location] = useLocation();
  const logout = useLogout();

  const tabs = [
    { href: "/",              label: "Overview",      icon: LayoutDashboard },
    { href: "/income",        label: "Income",        icon: Wallet },
    { href: "/investments",   label: "Invest",        icon: TrendingUp },
    { href: "/subscriptions", label: "Subs",          icon: RefreshCw },
    { href: "/history",       label: "History",       icon: HistoryIcon },
  ];

  return (
    <nav className="tab-bar-glass fixed bottom-0 left-0 right-0 flex justify-around items-center px-2 py-2 pb-safe z-50">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = location === href;
        return (
          <Link key={href} href={href}>
            <a className="flex flex-col items-center gap-1 px-3 py-2 min-w-[52px] rounded-xl cursor-pointer transition-all duration-200 group"
               aria-label={label}>
              <span className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-200 ${
                active
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                  : "text-muted-foreground group-hover:text-foreground group-hover:bg-muted/60"
              }`}>
                <Icon className="w-[18px] h-[18px]" />
              </span>
              <span className={`text-[9.5px] font-semibold tracking-wide transition-colors duration-200 ${
                active ? "text-primary" : "text-muted-foreground"
              }`}>
                {label}
              </span>
            </a>
          </Link>
        );
      })}
      <button
        onClick={logout}
        className="flex flex-col items-center gap-1 px-3 py-2 min-w-[52px] rounded-xl cursor-pointer transition-all duration-200 group"
        aria-label="Lock / Logout"
      >
        <span className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground group-hover:text-destructive group-hover:bg-destructive/10 transition-all duration-200">
          <LogOut className="w-[18px] h-[18px]" />
        </span>
        <span className="text-[9.5px] font-semibold tracking-wide text-muted-foreground group-hover:text-destructive transition-colors duration-200">
          Lock
        </span>
      </button>
    </nav>
  );
}

function Router() {
  useSubscriptionBilling();

  return (
    <div className="pb-20">
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/income" component={Income} />
        <Route path="/investments" component={Investments} />
        <Route path="/subscriptions" component={Subscriptions} />
        <Route path="/history" component={History} />
        <Route component={NotFound} />
      </Switch>
      <TabBar />
    </div>
  );
}

// Shows a blank screen while checking auth, then Login or the app
function AuthGuard() {
  const { authenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <Login
        onSuccess={() => {
          queryClient.setQueryData(["/api/auth/me"], true);
        }}
      />
    );
  }

  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="spending-app-theme">
        <TooltipProvider>
          <Toaster />
          <AuthGuard />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
