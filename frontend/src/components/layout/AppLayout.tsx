import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import AskAlphaSwarmChatbot from "../assistant/AskAlphaSwarmChatbot";
import AnalysisCompletionNotification from "../AnalysisCompletionNotification";
import { readLastHubPage } from "../../utils/lastHubPage";
import { useAuthStore } from "../../store/authStore";
import { useSignOut } from "../../hooks/useSignOut";
import { Terminal, Menu, X, LogOut } from "lucide-react";
import { getVisibleNavigation, groupNavigation, type NavigationItem } from "../../data/appNavigation";

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();

  // The app scrolls this persistent region, rather than the window.
  useLayoutEffect(() => {
    if (location.pathname === "/financial-tools" && mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);
  const { profile, user } = useAuthStore();
  const signOut = useSignOut();

  // The profile row can lag the session by a fetch, so fall back to the auth
  // user's own email rather than showing an empty block.
  const email = profile?.email || user?.email || "";
  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ");
  const displayName = fullName || email;
  const initial = (displayName.trim()[0] ?? "?").toUpperCase();

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

  // Grouped as the artifacts group them: Dashboard alone at the top, then
  // Explore, Your tools and Learn under their labels, and Ask AlphaSwarm and
  // Settings pinned at the foot beside the account.
  const sections = groupNavigation(getVisibleNavigation());
  const mainSections = sections.filter((section) => section.group !== "footer");
  const footerItems = sections.find((section) => section.group === "footer")?.items ?? [];

  // An asset's pages (/asset/:ticker and its How it works / News / Social
  // sub-pages) live under a different path prefix than the /assets or /dashboard
  // list they were opened from, so NavLink's own isActive goes false for every
  // sidebar item while you're reading one. Keep the owning hub lit using the same
  // "which page did we come from" record the "Back to X" link reads.
  const onAssetPage = location.pathname.startsWith("/asset/");
  const owningHubPage = onAssetPage ? readLastHubPage() : null;

  const navLinkClassesFor =
    (path: string) =>
    ({ isActive }: { isActive: boolean }) =>
      `flex items-center gap-3 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
        isActive || owningHubPage === path
          ? "bg-brand-fg text-brand-bg shadow-sm" // Active state mimics the white pill in your screenshot
          : "text-brand-muted-fg hover:text-brand-fg hover:bg-brand-bg/50"
      }`;

  const renderLink = (item: NavigationItem, onClick?: () => void) => (
    <NavLink
      key={item.name}
      data-spotlight-nav={item.path}
      to={item.path}
      onClick={onClick}
      className={navLinkClassesFor(item.path)}
    >
      <item.icon className="w-4 h-4 shrink-0" />
      {item.name}
    </NavLink>
  );

  const renderSections = (onClick?: () => void) =>
    mainSections.map((section) => (
      <div key={section.group ?? "top"} className="space-y-0.5">
        {section.group && (
          <p className="px-4 pb-1 pt-3 text-xs font-semibold text-brand-muted-fg">{section.group}</p>
        )}
        {section.items.map((item) => renderLink(item, onClick))}
      </div>
    ));

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
          data-spotlight="mobile-navigation"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          className="p-2 -mr-2 rounded-full text-brand-muted-fg hover:text-brand-fg hover:bg-brand-bg/50 transition-colors"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Dropdown menu under the hamburger */}
        {menuOpen && (
          <nav className="absolute top-full right-4 mt-2 z-[60] flex max-h-[calc(100dvh-5rem)] w-60 flex-col gap-1 overflow-y-auto rounded-2xl border border-brand-border/50 bg-brand-card p-2 shadow-xl">
            {renderSections(() => setMenuOpen(false))}

            {/* The foot, as on the sidebar: help and settings, then the way out
                set off by a rule, since leaving is not a place to go. */}
            <div className="my-1 border-t border-brand-border/50" />
            {footerItems.map((item) => renderLink(item, () => setMenuOpen(false)))}
            <div className="my-1 border-t border-brand-border/50" />
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                void signOut();
              }}
              className="flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium text-brand-muted-fg hover:text-brand-fg hover:bg-brand-bg/50 transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Sign out
            </button>
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
        <nav className="flex-1 px-4" aria-label="Main navigation">
          {renderSections()}
        </nav>

        {/* Help and settings, pinned at the foot above the account. */}
        {footerItems.length > 0 && (
          <nav className="mt-4 space-y-0.5 px-4" aria-label="Help and settings">
            {footerItems.map((item) => renderLink(item))}
          </nav>
        )}

        {/* Profile block. The nav above is flex-1, so this sits at the foot of
            the sidebar, where most apps keep who you are and the way out. */}
        <div className="mx-4 mt-3 border-t border-brand-border/50 pt-4">
          <div className="flex items-center gap-3 px-2">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-brand-bg"
            >
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-fg">
                {displayName}
              </p>
              {fullName && email ? (
                <p className="truncate text-xs text-brand-muted-fg">{email}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 flex w-full items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium text-brand-muted-fg hover:text-brand-fg hover:bg-brand-bg/50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Area. `relative` makes this scroll region the containing
          block for any absolutely positioned descendant that lacks a positioned
          parent (sr-only labels are the usual case), so such a box scrolls with
          the page instead of anchoring to the document and giving the window a
          second scrollbar beside this one. Below lg the floating Ask button sits
          over the bottom-right corner of the content, so pb-20 lets the last card
          on every page scroll clear of it; /ask has no floating button. */}
      <main
        ref={mainRef}
        className={`relative flex-1 overflow-y-auto pt-14 lg:pt-0 ${
          location.pathname === "/ask" ? "" : "pb-20 lg:pb-0"
        }`}
      >
        <Outlet />{" "}
      </main>

      <AskAlphaSwarmChatbot />
      <AnalysisCompletionNotification />
    </div>
  );
}
