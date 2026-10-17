import { useState } from "react";
import { createPortal } from "react-dom";
import { LockKeyhole } from "lucide-react";
import { badgeRequirementText } from "../../services/supabase/learningService";
import type { LearningBadge } from "../../types/learning";

type ActiveBadgeTooltip = {
  badge: LearningBadge;
  rect: DOMRect;
};

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
  const [activeTooltip, setActiveTooltip] = useState<ActiveBadgeTooltip | null>(
    null,
  );

  const showTooltip = (badge: LearningBadge, element: HTMLElement) => {
    setActiveTooltip({ badge, rect: element.getBoundingClientRect() });
  };

  const earnedCount = badges.filter((badge) => earnedBadgeIds.has(badge.id)).length;

  // A row of medals in one card at the top of the Library, wrapping rather than
  // scrolling sideways. Hover or focus a medal for what earns it.
  return (
    <section className="as-card space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-bold tracking-[-0.01em] text-forest-900">Badges</h2>
          <p className="mt-1 text-xs text-brand-muted-fg">Hover or select a badge to see what earns it.</p>
        </div>
        {badges.length > 0 && <span className="chip">{earnedCount} of {badges.length} earned</span>}
      </div>

      {badges.length === 0 ? (
        <p className="as-inset p-4 text-sm text-brand-muted-fg">
          {hasUserContext
            ? "No badges are available yet."
            : "Sign in to load your badge progress. If badges are still empty after signing in, check Supabase access policies for the badges table."}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {badges.map((badge) => {
            const isEarned = earnedBadgeIds.has(badge.id);
            return (
              <li
                key={badge.id}
                tabIndex={0}
                onMouseEnter={(event) => showTooltip(badge, event.currentTarget)}
                onMouseLeave={() => setActiveTooltip(null)}
                onFocus={(event) => showTooltip(badge, event.currentTarget)}
                onBlur={() => setActiveTooltip(null)}
                aria-label={`${badge.name}, ${isEarned ? "earned" : "locked"}`}
                className={`as-inset group flex flex-col items-center gap-2 p-3 text-center outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary ${
                  isEarned ? "" : "opacity-60 grayscale"
                }`}
              >
                <span className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-forest-900/10 bg-white transition-transform duration-200 group-hover:scale-[1.04]">
                  {badge.icon_url ? (
                    <img src={badge.icon_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-base font-bold text-forest-700">
                      {badge.name
                        .split(" ")
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                  )}
                  {!isEarned ? (
                    <span className="absolute right-0.5 top-0.5 inline-flex items-center justify-center rounded-full bg-white p-0.5 text-brand-muted-fg shadow-sm">
                      <LockKeyhole className="h-3 w-3" aria-hidden="true" />
                    </span>
                  ) : null}
                </span>
                <span className="line-clamp-2 w-full text-xs font-semibold leading-snug text-forest-900">{badge.name}</span>
                <span className={`text-xs ${isEarned ? "font-semibold text-up" : "text-brand-muted-fg"}`}>{isEarned ? "Earned" : "Locked"}</span>
              </li>
            );
          })}
        </ul>
      )}

      {activeTooltip && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 w-[min(17rem,calc(100vw-2rem))] rounded-[16px] border border-forest-900/10 bg-white px-4 py-3 text-left shadow-float"
              style={{
                left: Math.min(
                  Math.max(
                    activeTooltip.rect.left + activeTooltip.rect.width / 2,
                    16 + Math.min(272, window.innerWidth - 32) / 2,
                  ),
                  window.innerWidth -
                    16 -
                    Math.min(272, window.innerWidth - 32) / 2,
                ),
                top:
                  activeTooltip.rect.top < 160
                    ? activeTooltip.rect.bottom + 12
                    : activeTooltip.rect.top - 12,
                transform:
                  activeTooltip.rect.top < 160
                    ? "translateX(-50%)"
                    : "translateX(-50%) translateY(-100%)",
              }}
            >
              <p className="text-sm font-bold text-forest-900">
                {activeTooltip.badge.name}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-brand-muted-fg">
                {badgeRequirementText(activeTooltip.badge)}
              </p>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
