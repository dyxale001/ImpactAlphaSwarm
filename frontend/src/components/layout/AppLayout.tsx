import { useEffect, useRef, useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const location = useLocation();

  // Any navigation closes the menu, including programmatic redirects.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Tapping anywhere outside the top bar (and its dropdown) closes the menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        headerRef.current &&
        event.target instanceof Node &&
        !headerRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

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

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
      isActive
        ? "bg-brand-fg text-brand-bg shadow-sm" // Active state mimics the white pill in your screenshot
        : "text-brand-muted-fg hover:text-brand-fg hover:bg-brand-bg/50"
    }`;

  return (
    <div className="flex h-dvh bg-brand-bg text-brand-fg overflow-hidden">
      {/* Mobile / tablet top bar */}
      <header
        ref={headerRef}
        className="lg:hidden fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between px-4 bg-brand-card border-b border-brand-border/50"
      >
        <span className="text-xl font-black tracking-tighter text-primary flex items-center gap-2">
          <Terminal size={20} className="text-brand-primary" /> AlphaSwarm
        </span>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          className="p-2 -mr-2 rounded-full text-brand-muted-fg hover:text-brand-fg hover:bg-brand-bg/50 transition-colors"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Dropdown menu under the hamburger */}
        {menuOpen && (
          <nav className="absolute top-full right-4 mt-2 z-[60] flex w-60 flex-col gap-1 rounded-2xl border border-brand-border/50 bg-brand-card p-2 shadow-xl">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                className={navLinkClasses}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.name}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Sidebar: desktop only */}
      <aside className="hidden lg:flex w-64 border-r border-brand-border/50 bg-brand-card flex-col pt-8 pb-4 shrink-0 overflow-y-auto">
        {/* Logo Area */}
        <div className="px-8 pb-8 mb-4">
          <span className="text-2xl font-black tracking-tighter bg-clip-text text-primary flex items-center gap-2">
            <Terminal size={24} className="text-brand-primary" /> AlphaSwarm
          </span>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink key={item.name} to={item.path} className={navLinkClasses}>
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
