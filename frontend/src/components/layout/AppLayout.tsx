import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Search, Eye, LineChart, Settings } from "lucide-react";

export default function AppLayout() {
  const navItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Research", path: "/research", icon: Search },
    { name: "Watchlist", path: "/watchlist", icon: Eye },
    { name: "Portfolio", path: "/portfolio", icon: LineChart },
    { name: "Settings", path: "/settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-brand-bg text-brand-fg overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-brand-border/50 bg-brand-card flex flex-col pt-8 pb-4 shrink-0">
        
        {/* Logo Area */}
        <div className="px-8 pb-8 mb-4">
          <h1 className="text-2xl font-bold leading-none tracking-tight">Alpha<br/>Swarm</h1>
          <p className="text-[10px] text-brand-muted-fg uppercase tracking-widest mt-2 font-mono">Team Hive</p>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
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

        {/* Paper Trading Mode Disclaimer */}
        <div className="px-6 mt-auto">
          <div className="p-4 rounded-xl border border-brand-border bg-brand-secondary/40">
            <p className="text-xs text-brand-muted-fg">Paper Trading Mode</p>
            <p className="text-xs font-semibold text-semantic-warning mt-1">No real money at risk</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <Outlet /> {/* This will render Dashboard, Research, etc., based on routing */}
      </main>
    </div>
  );
}