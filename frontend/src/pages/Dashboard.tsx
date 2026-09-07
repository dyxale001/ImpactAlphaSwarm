import { Link } from "react-router-dom";
import { HardHat, Hammer, ArrowRight } from "lucide-react";

// The dashboard is being rebuilt around the user. This placeholder stands in for it
// so the route keeps working and the rest of the app is unaffected; the previous
// implementation is in git history and comes back when the new one lands.

export default function DashboardPage() {
  return (
    <div className="max-w-3xl mx-auto pt-12 lg:pt-20 px-4 sm:px-6 lg:px-8 pb-20 animate-fade-in-up">
      <style>{`
        @keyframes wip-bob {
          0%, 100% { transform: rotate(-8deg) translateY(0); }
          50%      { transform: rotate(6deg) translateY(-3px); }
        }
        @keyframes wip-grid {
          from { background-position: 0 0; }
          to   { background-position: 42px 42px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wip-bob, .wip-grid { animation: none !important; }
        }
      `}</style>

      <div className="hero-card relative overflow-hidden p-8 sm:p-12">
        {/* Blueprint grid, drifting slowly behind everything. */}
        <div
          className="wip-grid pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(199,242,105,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(199,242,105,0.5) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
            animation: "wip-grid 6s linear infinite",
            maskImage:
              "radial-gradient(circle at 30% 0%, black, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(circle at 30% 0%, black, transparent 75%)",
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-accent">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-accent animate-pulse" />
            AlphaSwarm · Your Dashboard
          </div>

          <div className="mt-5 flex items-start gap-4">
            <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-brand-accent/40 bg-brand-accent/10">
              <HardHat className="h-7 w-7 text-brand-accent" />
              <Hammer
                className="wip-bob absolute -right-2 -top-2 h-5 w-5 text-white"
                style={{
                  animation: "wip-bob 1.6s ease-in-out infinite",
                  transformOrigin: "bottom left",
                }}
              />
            </span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-white">
                We're rebuilding the dashboard around you
              </h1>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm sm:text-[15px] text-white/70 leading-relaxed">
            <p>Hi there,</p>
            <p>
              We're turning this page into your page: your watchlist, your
              holdings and the signals that fit how you invest, all in one view.
              We've taken it offline for a short while to get that right, and it
              will reopen here as soon as it's ready.
            </p>
            <p>
              Nothing else has changed. The rest of the app is running as normal
              in the meantime, so carry on as usual.
            </p>
            <p className="text-white/85">
              Thanks for bearing with us,
              <br />
              <span className="font-semibold text-white">Team AlphaSwarm</span>
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/assets"
              className="inline-flex items-center gap-2 rounded-full bg-brand-accent px-4 py-2 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-accent/85"
            >
              Browse assets
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/watchlist"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-brand-accent/60 hover:text-brand-accent"
            >
              Go to watchlist
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
