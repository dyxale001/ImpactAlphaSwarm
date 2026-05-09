import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Search, Eye, LineChart, Settings, Menu, X } from "lucide-react";
import Toaster from "@/components/Toaster";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/research", label: "Research", icon: Search },
  { path: "/compare", label: "Watchlist", icon: Eye },
  { path: "/portfolio", label: "Portfolio", icon: LineChart },
  { path: "/onboarding", label: "Settings", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-sidebar p-4 gap-2 fixed h-full z-30">
        <div className="px-2 py-5 mb-4">
          <div className="wordmark text-3xl leading-[0.85]">
            <span className="text-foreground">Alpha</span>
            <br />
            <span className="text-primary">Swarm</span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-2">Team Hive</p>
        </div>
        <nav className="flex flex-col gap-1.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/70"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto p-4 rounded-3xl bg-secondary/50 border border-border/60">
          <p className="text-xs text-muted-foreground">Paper Trading Mode</p>
          <p className="text-xs text-warning font-medium mt-1">No real money at risk</p>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-card/90 backdrop-blur-lg border-b border-border z-40 flex items-center px-4 justify-between">
        <div className="wordmark text-xl">
          <span className="text-foreground">Alpha</span>
          <span className="text-primary">Swarm</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-foreground">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Nav Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-background/95 backdrop-blur-lg pt-16 p-4">
          <nav className="flex flex-col gap-2">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  location.pathname === item.path
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-64 mt-14 md:mt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
