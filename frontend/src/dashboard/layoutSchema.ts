// The saved dashboard: what it looks like on disk, and the pure operations over
// it.
//
// Deliberately free of React and of the widget registry. The registry imports
// every widget component, which imports every feature hook, so anything that
// imported it back would be unloadable in vitest's node environment. Validation
// therefore takes the registry's shape as an argument (WidgetSpec) rather than
// reaching for it, which is also what lets the tests describe a two-widget
// registry instead of the real one.

export type WidgetSize = "small" | "medium" | "wide";

export const WIDGET_SIZES: WidgetSize[] = ["small", "medium", "wide"];

/** Bumped when a stored layout needs reshaping in code. 2 moved the chosen
 *  asset from one dashboard-wide `pinnedTicker` to a per-widget
 *  `settings.ticker`. 3 gave every entry an `instanceId` of its own, so a
 *  ticker-scoped widget can be placed more than once; see parseLayout. */
export const LAYOUT_VERSION = 3;

export type WidgetSettings = Record<string, unknown>;

export interface LayoutEntry {
  /** Which widget this is: a key into the registry. */
  id: string;
  /**
   * Which placement this is. Two sentiment-trend widgets pointing at two
   * different assets share an `id` and differ here, and every operation on a
   * placed widget (move, resize, remove, retarget) addresses this rather than
   * the widget id. A v2 entry had no instanceId; the parser gives it its
   * widget id, which was unique on a v2 board.
   */
  instanceId: string;
  size: WidgetSize;
  settings?: WidgetSettings;
}

/**
 * A fresh instance id for a placement of `id`. Prefixed with the widget id so a
 * saved layout stays readable in the SQL editor, and random after that so two
 * placements made in the same millisecond cannot collide.
 */
export function newInstanceId(id: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${id}:${random}`;
}

export interface DashboardLayout {
  version: number;
  widgets: LayoutEntry[];
}

/** What parseLayout needs to know about a widget. The registry satisfies this. */
export interface WidgetSpec {
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  /** Scoped to one asset, and so carries a `ticker` in its settings. Also the
   *  widgets that may be placed more than once: a second copy watching a
   *  second asset says something a single copy cannot. Every other widget shows
   *  the same thing twice, and is held to one per board. */
  needsTicker?: boolean;
}

/** Whether a widget may appear on the board more than once. */
export function allowsMultiple(spec: WidgetSpec | undefined): boolean {
  return Boolean(spec?.needsTicker);
}

/** What every widget component is handed. Lives here rather than in the registry
 *  so widgets can import it without importing the registry that imports them. */
export interface WidgetProps {
  size: WidgetSize;
  /**
   * The asset THIS widget points at, and how it changes it. Null until one is
   * chosen. Backed by `settings.ticker`, so each ticker-scoped widget holds its
   * own: choosing an asset for the sentiment trend leaves the news and insider
   * widgets on whatever they were showing.
   */
  ticker: string | null;
  setTicker: (ticker: string | null) => void;
  settings: WidgetSettings;
  updateSettings: (patch: WidgetSettings) => void;
}

/** Uppercase and trim a stored ticker, rejecting anything blank or not a
 *  string. Shared by the settings reader and the v1 migration. */
export function normaliseTicker(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().toUpperCase()
    : null;
}

export type WidgetSpecMap = Record<string, WidgetSpec>;

/** The layout everyone starts from: a blank page.
 *
 *  Still a real layout, which is what distinguishes it from null. Null means
 *  the user has never touched their dashboard, and is what puts the setup guide
 *  in front of them; this means they have one and it happens to be empty. */
export function emptyLayout(): DashboardLayout {
  return { version: LAYOUT_VERSION, widgets: [] };
}

function isSize(value: unknown): value is WidgetSize {
  return typeof value === "string" && (WIDGET_SIZES as string[]).includes(value);
}

/**
 * Coerce whatever came back from the database into a layout we can render.
 *
 * Never throws and never returns a half-valid object: a row written by an older
 * build, hand-edited in the SQL editor, or truncated mid-write all resolve to
 * either a usable layout or null. Null means "no layout", which the page reads
 * as "show the starter-deck picker".
 *
 * Unknown widget ids are dropped rather than rejected, so retiring a widget from
 * the registry silently retires it from everybody's saved dashboard instead of
 * breaking it. Sizes the widget does not offer fall back to its default for the
 * same reason.
 *
 * A v1 row's dashboard-wide `pinnedTicker` is migrated here: every ticker-scoped
 * widget that has no `ticker` of its own inherits it, so a dashboard that was
 * showing one asset everywhere keeps showing it, and only then diverges as the
 * reader retargets widgets one at a time. The field itself does not survive the
 * parse, so the migration runs once and the next write is clean.
 *
 * A v2 entry has no `instanceId`. It is given its widget id, which a v2 board
 * held once, so the first read after this build lands changes nothing the
 * reader can see and the next write is v3. Two entries that arrive with the
 * same instance id keep only the first; two entries for the same widget keep
 * only the first unless that widget is ticker-scoped, where each placement is
 * its own thing.
 */
export function parseLayout(
  raw: unknown,
  spec: WidgetSpecMap,
): DashboardLayout | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.widgets)) return null;

  const legacyTicker = normaliseTicker(record.pinnedTicker);

  const seenInstances = new Set<string>();
  const seenWidgets = new Set<string>();
  const widgets: LayoutEntry[] = [];

  for (const candidate of record.widgets) {
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as Record<string, unknown>;
    const id = entry.id;
    if (typeof id !== "string") continue;

    const widgetSpec = spec[id];
    if (!widgetSpec) continue;
    // One per board for a widget that would only show the same thing twice.
    if (!allowsMultiple(widgetSpec) && seenWidgets.has(id)) continue;

    // A v2 entry carries no instance id and takes its widget id, which was
    // unique on a v2 board. A repeat of that id with no instance id of its own
    // (a hand-edited row) is given a fresh one rather than dropped: the reader
    // put two there, and for a ticker-scoped widget that is allowed.
    const provided =
      typeof entry.instanceId === "string" && entry.instanceId.trim()
        ? entry.instanceId
        : null;
    let instanceId = provided ?? id;
    if (seenInstances.has(instanceId)) {
      if (provided) continue;
      instanceId = newInstanceId(id);
    }
    seenInstances.add(instanceId);
    seenWidgets.add(id);

    const size =
      isSize(entry.size) && widgetSpec.sizes.includes(entry.size)
        ? entry.size
        : widgetSpec.defaultSize;

    const stored =
      entry.settings && typeof entry.settings === "object" && !Array.isArray(entry.settings)
        ? (entry.settings as WidgetSettings)
        : undefined;

    let settings = stored;

    if (widgetSpec.needsTicker) {
      // Normalised on the way in so a widget never has to defend against a
      // lowercase, padded or non-string ticker at render time.
      const ticker = normaliseTicker(stored?.ticker) ?? legacyTicker;
      if (ticker) settings = { ...stored, ticker };
      else if (stored && "ticker" in stored) {
        const { ticker: _drop, ...rest } = stored;
        settings = Object.keys(rest).length > 0 ? rest : undefined;
      }
    }

    widgets.push(
      settings ? { id, instanceId, size, settings } : { id, instanceId, size },
    );
  }

  // A `deck` field on an older row is read straight past. Starter decks were
  // removed in favour of everyone beginning from a blank page, so the field no
  // longer means anything, and dropping it here is what retires it from a saved
  // layout the next time that layout is written back. `pinnedTicker` leaves the
  // same way, having been migrated into the widgets above.
  return {
    version:
      typeof record.version === "number" ? record.version : LAYOUT_VERSION,
    widgets,
  };
}

/**
 * Move the item at `from` so it sits at `to`, returning a new array.
 *
 * This is the whole of reordering: the grid is flow-based, so where a widget
 * sits is only ever its index in this list. Out-of-range indices return the
 * input untouched rather than producing holes.
 */
export function arrayMove<T>(items: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Tailwind column spans against the six-column `.bento-grid` in index.css.
 *
 * "small" moves to its own two-column span as soon as the grid leaves its
 * single-column phone layout, rather than waiting for `lg`. Sharing
 * `md:col-span-3` with "medium" meant three smalls on a tablet-width screen
 * tiled two to a row with a third stranded alone on the next, its other half
 * empty; going straight to col-span-2 at `md` makes three fill a row exactly
 * (2+2+2 of 6) at every width where the grid is multi-column at all.
 */
export const SIZE_CLASS: Record<WidgetSize, string> = {
  small: "col-span-6 md:col-span-2",
  medium: "col-span-6 md:col-span-3",
  wide: "col-span-6",
};

export const SIZE_LABEL: Record<WidgetSize, string> = {
  small: "S",
  medium: "M",
  wide: "W",
};
