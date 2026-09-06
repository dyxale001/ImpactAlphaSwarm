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

/** Bumped when a stored layout needs reshaping in code. */
export const LAYOUT_VERSION = 1;

export type WidgetSettings = Record<string, unknown>;

export interface LayoutEntry {
  id: string;
  size: WidgetSize;
  settings?: WidgetSettings;
}

export interface DashboardLayout {
  version: number;
  /** The asset every ticker-scoped widget points at. */
  pinnedTicker: string | null;
  widgets: LayoutEntry[];
}

/** What parseLayout needs to know about a widget. The registry satisfies this. */
export interface WidgetSpec {
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
}

/** What every widget component is handed. Lives here rather than in the registry
 *  so widgets can import it without importing the registry that imports them. */
export interface WidgetProps {
  size: WidgetSize;
  /** The asset the ticker-scoped widgets point at. Null until one is pinned. */
  pinnedTicker: string | null;
  setPinnedTicker: (ticker: string | null) => void;
  settings: WidgetSettings;
  updateSettings: (patch: WidgetSettings) => void;
}

export type WidgetSpecMap = Record<string, WidgetSpec>;

/** The layout everyone starts from: a blank page.
 *
 *  Still a real layout, which is what distinguishes it from null. Null means
 *  the user has never touched their dashboard, and is what puts the setup guide
 *  in front of them; this means they have one and it happens to be empty. */
export function emptyLayout(): DashboardLayout {
  return { version: LAYOUT_VERSION, pinnedTicker: null, widgets: [] };
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
 */
export function parseLayout(
  raw: unknown,
  spec: WidgetSpecMap,
): DashboardLayout | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.widgets)) return null;

  const seen = new Set<string>();
  const widgets: LayoutEntry[] = [];

  for (const candidate of record.widgets) {
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as Record<string, unknown>;
    const id = entry.id;
    if (typeof id !== "string") continue;

    const widgetSpec = spec[id];
    // Unknown to this build, or already placed. A layout holds each widget once:
    // two copies of the same widget would fight over the same settings.
    if (!widgetSpec || seen.has(id)) continue;
    seen.add(id);

    const size =
      isSize(entry.size) && widgetSpec.sizes.includes(entry.size)
        ? entry.size
        : widgetSpec.defaultSize;

    const settings =
      entry.settings && typeof entry.settings === "object" && !Array.isArray(entry.settings)
        ? (entry.settings as WidgetSettings)
        : undefined;

    widgets.push(settings ? { id, size, settings } : { id, size });
  }

  // A `deck` field on an older row is read straight past. Starter decks were
  // removed in favour of everyone beginning from a blank page, so the field no
  // longer means anything, and dropping it here is what retires it from a saved
  // layout the next time that layout is written back.
  return {
    version:
      typeof record.version === "number" ? record.version : LAYOUT_VERSION,
    pinnedTicker:
      typeof record.pinnedTicker === "string" && record.pinnedTicker.trim()
        ? record.pinnedTicker.trim().toUpperCase()
        : null,
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

/** Tailwind column spans against the six-column `.bento-grid` in index.css. */
export const SIZE_CLASS: Record<WidgetSize, string> = {
  small: "col-span-6 md:col-span-3 lg:col-span-2",
  medium: "col-span-6 md:col-span-3 lg:col-span-3",
  wide: "col-span-6",
};

export const SIZE_LABEL: Record<WidgetSize, string> = {
  small: "S",
  medium: "M",
  wide: "W",
};
