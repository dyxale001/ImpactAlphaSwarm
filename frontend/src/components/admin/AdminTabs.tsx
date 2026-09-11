import { Link, useLocation } from "react-router-dom";
import { FUNDS_ENABLED } from "../../utils/fundsFlags";

/**
 * The admin section's tab strip.
 *
 * One component because there were five copies of it, hand-written into each
 * admin page with that page's own pill hard-coded as the active one — and the
 * copies had already drifted. **Funds existed only on the dashboard's strip**,
 * so an admin who opened Categories or Badges could not see that a fund
 * catalogue existed, and `AdminFunds` carried no strip at all: opening it left
 * the section entirely, with the browser's back button as the only way out.
 * That is what made a tab feel like a separate product.
 *
 * The active tab is derived from the URL rather than passed in, which is the
 * other half of the same fix. A page that declares its own active pill can be
 * wrong about it, and one of these was: `/admin/funds/:fundId` highlighted
 * nothing, because the strip it never rendered had no entry for it either.
 *
 * `end` distinguishes Users from the rest: every admin path starts with
 * `/admin`, so only an exact match may light it up.
 */
type Tab = {
  to: string;
  label: string;
  /** Match the path exactly rather than as a prefix. */
  end?: boolean;
  /** Rendered only when the feature it points at is on. */
  enabled?: boolean;
};

const TABS: Tab[] = [
  { to: "/admin", label: "Users", end: true },
  { to: "/admin/learning-categories", label: "Categories" },
  { to: "/admin/learning-articles", label: "Articles" },
  { to: "/admin/learning-questions", label: "Questions & Answers" },
  { to: "/admin/badges", label: "Badges" },
  { to: "/admin/reports", label: "Reports" },
  // Gated on the same flag as the route it points at: with the feature off that
  // route is not registered, so an ungated link would send an admin to the
  // redirect instead of a page.
  { to: "/admin/funds", label: "Funds", enabled: FUNDS_ENABLED },
];

export default function AdminTabs() {
  const { pathname } = useLocation();

  return (
    <div className="flex flex-wrap gap-3">
      {TABS.filter((tab) => tab.enabled !== false).map((tab) => {
        const active = tab.end
          ? pathname === tab.to
          : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
              active
                ? "bg-brand-fg text-brand-bg font-medium"
                : "border border-brand-border bg-brand-card text-brand-muted-fg hover:text-brand-fg"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
