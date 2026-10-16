import { FUNDS_ENABLED } from "./fundsFlags";
import { COMPARE_ENABLED } from "./compareFlags";
import { MACRO_NEWS_ENABLED } from "./macroNewsFlags";
import { getVisibleNavigation } from "../data/appNavigation";

// Set only by registration introduced with this feature. Missing metadata is
// never evidence of a new account. This is a cosmetic invitation, not a role.
export const SPOTLIGHT_KEY = "alphaswarm_spotlight_v1";
export type SpotlightStatus = "eligible" | "started" | "skipped" | "finished";
export const SPOTLIGHT_SIGNUP_DATA = { [SPOTLIGHT_KEY]: "eligible" } as const;
export function isSpotlightInvited(
  metadata: Record<string, unknown> | undefined,
): boolean {
  return metadata?.[SPOTLIGHT_KEY] === "eligible";
}
export type SpotlightStep = {
  title: string;
  body: string;
  target: "welcome" | "navigation" | "assistant";
  path?: string;
};
export function spotlightSteps(
  funds = FUNDS_ENABLED,
  compare = COMPARE_ENABLED,
  news = MACRO_NEWS_ENABLED,
): SpotlightStep[] {
  return [
    {
      title: "Welcome to AlphaSwarm",
      body: "Welcome to AlphaSwarm! Let’s take a quick look around.",
      target: "welcome",
    },
    ...getVisibleNavigation({ funds, compare, news }).map((item) => ({
      title: item.name,
      body: item.tourCopy,
      path: item.path,
      target: "navigation" as const,
    })),
    {
      title: "Ask AlphaSwarm — Quick Help",
      body: "Need help while exploring? Use this button to ask AlphaSwarm a question from anywhere it’s available.",
      target: "assistant",
    },
  ];
}
