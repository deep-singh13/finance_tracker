import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import { History } from "@/components/History";
import { LayoutDashboard, History as HistoryIcon } from "lucide-react";

function TabBar() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t border-border flex justify-around items-center py-2 pb-safe z-50">
      <Link href="/">
        <a className={`flex flex-col items-center gap-1 p-2 ${location === "/" ? "text-primary" : "text-muted-foreground"}`}>
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px] font-medium">Dashboard</span>
        </a>
      </Link>
      <Link href="/history">
        <a className={`flex flex-col items-center gap-1 p-2 ${location === "/history" ? "text-primary" : "text-muted-foreground"}`}>
          <HistoryIcon className="w-6 h-6" />
          <span className="text-[10px] font-medium">History</span>
        </a>
      </Link>
    </nav>
  );
}

function Router() {
  return (
    <div className="pb-20">
      <Switch>
        <Route path="/" component={Dashboard} />
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
