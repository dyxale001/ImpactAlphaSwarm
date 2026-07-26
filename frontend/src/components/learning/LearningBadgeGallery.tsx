import { LockKeyhole } from "lucide-react";
import { badgeRequirementText } from "../../services/supabase/learningService";
import type { LearningBadge } from "../../types/learning";

type Props = {
  badges: LearningBadge[];
  earnedBadgeIds: Set<string>;
  hasUserContext: boolean;
};

export default function LearningBadgeGallery({
  badges,
  earnedBadgeIds,
  hasUserContext,
}: Props) {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-primary">
          Badge Vault
        </p>
        <h2 className="text-xl font-semibold text-brand-fg">
          All Learning Badges
        </h2>
      </div>

      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 scroll-smooth [scrollbar-width:thin] [scrollbar-color:theme(colors.brand-border)_transparent]">
        {badges.length === 0 ? (
          <div className="min-w-[16rem] rounded-2xl border border-brand-border bg-brand-bg/60 p-6 text-sm text-brand-muted-fg">
            {hasUserContext
              ? "No badges are available yet."
              : "Sign in to load your badge progress. If badges are still empty after signing in, check Supabase access policies for the badges table."}
          </div>
        ) : null}

        {badges.map((badge) => {
          const isEarned = earnedBadgeIds.has(badge.id);

          return (
            <div
              key={badge.id}
              tabIndex={0}
              className="group relative w-[10.5rem] shrink-0 snap-start flex-col items-center gap-2.5 rounded-3xl border border-brand-border bg-brand-card p-3.5 text-center shadow-card outline-none transition-all duration-200 focus:border-brand-primary/40 focus:ring-2 focus:ring-brand-primary/20"
            >
              <div className="relative flex items-center justify-center">
                <div
                  className={`relative flex h-18 w-18 items-center justify-center overflow-hidden rounded-full border border-brand-border bg-brand-bg/70 shadow-sm transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-lg group-focus-within:scale-[1.03] group-focus-within:shadow-lg sm:h-22 sm:w-22 ${
                    isEarned
                      ? ""
                      : "opacity-60 grayscale blur-[0.15px] brightness-90"
                  }`}
                >
                  {badge.icon_url ? (
                    <img
                      src={badge.icon_url}
                      alt={badge.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-primary/15 to-brand-bg/70 text-lg font-semibold text-brand-primary">
                      {badge.name
                        .split(" ")
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </div>
                  )}

                  {!isEarned ? (
                    <div className="absolute inset-0 flex items-start justify-end p-1.5">
                      <span className="inline-flex items-center justify-center rounded-full border border-brand-border bg-brand-card/90 p-0.5 text-brand-muted-fg shadow-sm backdrop-blur-sm">
                        <LockKeyhole className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  ) : null}

                  <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-brand-primary/0 transition-colors duration-300 group-hover:ring-brand-primary/20 group-focus-within:ring-brand-primary/20" />
                </div>
              </div>

              <div className="min-w-0 space-y-1">
                <h3 className="truncate text-sm font-semibold text-brand-fg sm:text-base">
                  {badge.name}
                </h3>
              </div>

              <div className="pointer-events-none absolute left-1/2 top-[calc(100%+0.5rem)] z-30 hidden w-[min(17rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-brand-border bg-brand-card px-4 py-3 text-left shadow-2xl backdrop-blur-sm group-hover:block group-focus-within:block">
                <p className="text-sm font-semibold text-brand-fg">
                  {badge.name}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-brand-muted-fg">
                  {badgeRequirementText(badge)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
