import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BookOpen,
  Search,
  Eye,
  LineChart,
  Terminal,
  Settings,
  Waves,
  Menu,
  X,
} from "lucide-react";

export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Any navigation closes the drawer, including programmatic redirects.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const navItems = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Learning", path: "/learning", icon: BookOpen },
    { name: "Research", path: "/research", icon: Search },
    { name: "Watchlist", path: "/watchlist", icon: Eye },
    { name: "Portfolio", path: "/portfolio", icon: LineChart },
    { name: "Whale Watching", path: "/whale-watching", icon: Waves },
    { name: "Settings", path: "/settings", icon: Settings },
  ];

  const visibleNavItems = navItems.filter(
    (i) =>
      i.name === "Dashboard" ||
      i.name === "Watchlist" ||
      i.name === "Whale Watching" ||
      i.name === "Learning" ||
      i.name === "Settings"
  );

  return (
    <div className="flex h-dvh bg-brand-bg text-brand-fg overflow-hidden">
      {/* Mobile / tablet top bar */}
      <header className="lg:hidden fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between px-4 bg-brand-card border-b border-brand-border/50">
        <span className="text-xl font-black tracking-tighter text-primary flex items-center gap-2">
          <Terminal size={20} className="text-brand-primary" /> AlphaSwarm
        </span>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          className="p-2 -mr-2 rounded-full text-brand-muted-fg hover:text-brand-fg hover:bg-brand-bg/50 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Scrim behind the drawer */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[55] bg-black/40"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: off-canvas drawer below lg, static column at lg+ */}
      <aside
        className={`fixed inset-y-0 left-0 z-[60] w-64 transform transition-transform duration-200 ease-out
          lg:static lg:z-auto lg:translate-x-0
          ${drawerOpen ? "translate-x-0" : "-translate-x-full"}
          border-r border-brand-border/50 bg-brand-card flex flex-col pt-8 pb-4 shrink-0 overflow-y-auto`}
      >
        {/* Logo Area */}
        <div className="px-8 pb-8 mb-4 flex items-center justify-between">
          <span className="text-2xl font-black tracking-tighter bg-clip-text text-primary flex items-center gap-2">
            <Terminal size={24} className="text-brand-primary" /> AlphaSwarm
          </span>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="lg:hidden p-2 -mr-4 rounded-full text-brand-muted-fg hover:text-brand-fg hover:bg-brand-bg/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-fg text-brand-bg shadow-sm" // Active state mimics the white pill in your screenshot
                    : "text-brand-muted-fg hover:text-brand-fg hover:bg-brand-bg/50"
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <Outlet />{" "}
      </main>
    </div>
  );
}
