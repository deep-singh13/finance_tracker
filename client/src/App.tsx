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
import { History } from "@/components/History";
import { LayoutDashboard, History as HistoryIcon, TrendingUp, RefreshCw } from "lucide-react";

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

  const tabs = [
    { href: "/",              label: "Dashboard",     icon: LayoutDashboard },
    { href: "/investments",   label: "Investments",   icon: TrendingUp },
    { href: "/subscriptions", label: "Subscriptions", icon: RefreshCw },
    { href: "/history",       label: "History",       icon: HistoryIcon },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t border-border flex justify-around items-center py-2 pb-safe z-50">
      {tabs.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href}>
          <a className={`flex flex-col items-center gap-1 p-2 min-w-[60px] ${location === href ? "text-primary" : "text-muted-foreground"}`}>
            <Icon className="w-6 h-6" />
            <span className="text-[10px] font-medium">{label}</span>
          </a>
        </Link>
      ))}
    </nav>
  );
}

function Router() {
  useSubscriptionBilling();

  return (
    <div className="pb-20">
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/investments" component={Investments} />
        <Route path="/subscriptions" component={Subscriptions} />
        <Route path="/history" component={History} />
        <Route component={NotFound} />
      </Switch>
      <TabBar />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="spending-app-theme">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
