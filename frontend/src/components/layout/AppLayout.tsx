import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Eye,
  LineChart,
  Terminal,
  Settings,
} from "lucide-react";

export default function AppLayout() {
  const navItems = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Research", path: "/research", icon: Search },
    { name: "Watchlist", path: "/watchlist", icon: Eye },
    { name: "Portfolio", path: "/portfolio", icon: LineChart },
    { name: "Settings", path: "/settings", icon: Settings },
  ];

  // Show only Dashboard and Settings for now
  const visibleNavItems = navItems.filter((i) => i.name === "Dashboard" || i.name === "Settings");

  return (
    <div className="flex h-screen bg-brand-bg text-brand-fg overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-brand-border/50 bg-brand-card flex flex-col pt-8 pb-4 shrink-0">
        {/* Logo Area */}
        <div className="px-8 pb-8 mb-4">
          <span className="text-2xl font-black tracking-tighter bg-clip-text text-primary flex items-center gap-2">
                        <Terminal size={24} className="text-brand-primary" /> AlphaSwarm
                      </span>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-fg text-brand-bg shadow-sm" // Active state mimics the white pill in your screenshot
                    : "text-brand-muted-fg hover:text-brand-fg hover:bg-brand-bg/50"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />{" "}
      </main>
    </div>
  );
}
