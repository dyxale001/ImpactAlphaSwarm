import { Check } from "lucide-react";
import { DECK_LIST, type DeckId } from "../../../dashboard/decks";
import { widgetById } from "../../../dashboard/widgetRegistry";

// Choosing a starter deck.
//
// Rendered in two places from one definition: as a step in onboarding for people
// signing up, and as the first-run panel on the dashboard for everyone who
// signed up before this existed. Both hand it the same recommendation, worked
// out from the investor path the user already chose, so the two audiences get
// the same experience at different moments.
//
// One fixed look rather than a light/dark tone: both homes now sit the picker
// inside a light "boxed" container on the app's own grey background, so the
// deck cards themselves are always the forest-green surface that carries the
// brand's dark cards elsewhere (hero-card, RecommendationCard's avatar), with a
// neon lime pill for the recommendation badge. No emoji — every icon is a
// lucide glyph from the deck definition.

export default function DeckPicker({
  selected,
  recommended,
  onSelect,
}: {
  selected: DeckId | null;
  /** The deck their investor path points at, badged so the choice is already
   *  made for anyone who does not want to make it. */
  recommended: DeckId;
  onSelect: (deck: DeckId) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {DECK_LIST.map((deck) => {
        const isSelected = selected === deck.id;
        const isRecommended = recommended === deck.id;
        const Icon = deck.icon;

        return (
          <button
            key={deck.id}
            type="button"
            onClick={() => onSelect(deck.id)}
            aria-pressed={isSelected}
            className={`relative flex flex-col gap-2.5 rounded-2xl border bg-brand-primary p-4 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent ${
              isSelected
                ? "border-brand-accent shadow-[0_0_0_3px_rgba(199,242,105,0.35)]"
                : "border-white/10 hover:border-white/25"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
                  <Icon className="h-4 w-4 text-brand-bg" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-brand-bg">
                    {deck.name}
                  </p>
                  <p className="text-[11px] font-semibold text-brand-accent">
                    {deck.tagline}
                  </p>
                </div>
              </div>

              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors ${
                  isSelected
                    ? "border-brand-accent bg-brand-accent"
                    : "border-white/25"
                }`}
              >
                {isSelected ? (
                  <Check className="h-3 w-3 text-brand-primary" strokeWidth={3} />
                ) : null}
              </span>
            </div>

            {isRecommended ? (
              <span className="chip w-fit bg-brand-accent text-brand-fg">
                Recommended for you
              </span>
            ) : null}

            <p className="text-xs leading-relaxed text-brand-bg/70">
              {deck.blurb}
            </p>

            {/* Naming the widgets makes the choice concrete. Four decks described
                only in prose read as four moods; listing what actually lands on
                the page turns them back into four dashboards. A column rather
                than wrapped pills, so the list reads as the dashboard's running
                order top to bottom instead of a loose bag of tags. */}
            <ul className="mt-1 space-y-1 border-t border-white/10 pt-2.5">
              {deck.widgets.map((w) => {
                const def = widgetById(w.id);
                return def ? (
                  <li
                    key={w.id}
                    className="flex items-center gap-2 text-xs text-brand-bg/70"
                  >
                    <span
                      className="h-1 w-1 shrink-0 rounded-full bg-brand-accent"
                      aria-hidden="true"
                    />
                    {def.title}
                  </li>
                ) : null;
              })}
            </ul>
          </button>
        );
      })}
    </div>
  );
}
