import { useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import DeckPicker from "./DeckPicker";
import type { DeckId } from "../../../dashboard/decks";
import { DECKS } from "../../../dashboard/decks";

/**
 * The first-run panel: pick a starting dashboard.
 *
 * Because onboarding now sets a layout for every new signup, the only people
 * who ever reach this are existing users whose account predates the feature
 * (plus an admin with no user_analysis row). The copy is written for that
 * audience specifically: not "welcome, let's set you up" but "here is
 * something new, and here is what it means for the account you already have".
 *
 * Sits as a boxed card on the app's own grey page background, matching every
 * other settings-style surface (`soft-card`) rather than a full-bleed dark hero.
 * The deck options themselves carry the forest-green treatment instead.
 *
 * The recommendation is already made when this opens, so the shortest path
 * through is one button. Choosing differently is a choice, not a chore.
 */
export default function DeckSetupPanel({
  recommended,
  isSaving,
  onConfirm,
  onStartFromScratch,
}: {
  recommended: DeckId;
  isSaving: boolean;
  onConfirm: (deck: DeckId) => void;
  onStartFromScratch: () => void;
}) {
  const [selected, setSelected] = useState<DeckId>(recommended);

  return (
    <div className="soft-card space-y-6 p-6 sm:p-9">
      <div>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-primary">
          <Sparkles className="h-3.5 w-3.5" />
          New for your account
        </p>
        <h1 className="mt-3 text-2xl font-bold leading-tight text-brand-fg sm:text-3xl">
          Your dashboard is now yours to build
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-muted-fg">
          Everything you already use here, your watchlist, the assets your
          latest run ranked, sentiment, insider activity and your learning
          progress, can now live on one page laid out however you want it.
          Pick a starting point below. We have matched it to the investing
          style you chose when you signed up, and nothing about it is fixed:
          you can add, remove, resize and reorder anything afterwards.
        </p>
      </div>

      <DeckPicker
        selected={selected}
        recommended={recommended}
        onSelect={setSelected}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onConfirm(selected)}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-full bg-brand-accent px-5 py-2.5 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-accent/85 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Building
            </>
          ) : (
            <>
              Use {DECKS[selected].name}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onStartFromScratch}
          disabled={isSaving}
          className="rounded-full border border-brand-border px-4 py-2.5 text-sm font-medium text-brand-fg transition-colors hover:border-brand-primary/40 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
        >
          Start from an empty page
        </button>
      </div>
    </div>
  );
}
