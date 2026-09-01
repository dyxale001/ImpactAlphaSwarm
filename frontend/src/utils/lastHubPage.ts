// Which top-level list page an asset's page was opened from, so its "Back to X" link
// names the page the reader actually came from rather than always assuming Dashboard.
//
// RecommendationCard and ScoredAssetRow render identically on both Dashboard and
// Assets, and each page links into /asset/:ticker from several places — the shortlist
// cards, the scored rows, and four separate links inside the "top pick" hero alone.
// Threading a `state` prop through every one of those Links is a lot of surface for
// something this simple to get subtly wrong on the next new entry point. sessionStorage
// instead: each hub page names itself once on mount, and AssetDetailsPage reads
// whichever wrote most recently. New ways into an asset page get this for free.

const KEY = "alphaswarm:last-hub-page";

export const HUB_PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/assets": "Assets",
};

export function rememberHubPage(path: keyof typeof HUB_PAGE_LABELS): void {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // Private browsing, or storage disabled. The back link just falls back to
    // Dashboard, which was the only behaviour before this existed.
  }
}

export function readLastHubPage(): string {
  try {
    const stored = sessionStorage.getItem(KEY);
    return stored && stored in HUB_PAGE_LABELS ? stored : "/dashboard";
  } catch {
    return "/dashboard";
  }
}
