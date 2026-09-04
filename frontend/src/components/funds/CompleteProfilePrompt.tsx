import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  COMPLETE_PROFILE_ACTION,
  COMPLETE_PROFILE_LEAD,
  COMPLETE_PROFILE_TITLE,
} from "../../utils/fundsCopy";

/**
 * Shown when a match used the risk profile alone.
 *
 * The point is to say so out loud rather than present a broad list as though it
 * were tailored. Most existing users predate the goal questions, so this is the
 * common case, not an edge one — and a shorter list of reasons is worth stating,
 * because it is also the prompt to answer the rest.
 */
export default function CompleteProfilePrompt({ notice }: { notice?: string | null }) {
  return (
    <div className="soft-card flex flex-col gap-2 border-l-2 border-brand-accent p-5">
      <h3 className="text-sm font-bold text-brand-primary">{COMPLETE_PROFILE_TITLE}</h3>
      <p className="text-xs leading-relaxed text-brand-secondary">
        {notice ?? COMPLETE_PROFILE_LEAD}
      </p>
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
      >
        {COMPLETE_PROFILE_ACTION}
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
