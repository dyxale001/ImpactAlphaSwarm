import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../store/authStore";
import {
  arrayMove,
  emptyLayout,
  parseLayout,
  type DashboardLayout,
  type LayoutEntry,
  type WidgetSettings,
  type WidgetSize,
} from "../dashboard/layoutSchema";
import {
  WIDGETS,
  WIDGET_SPEC,
  widgetById,
  type WidgetDef,
} from "../dashboard/widgetRegistry";
import { NO_ACTIVITY, type GuideActivity } from "../dashboard/guideSteps";
import {
  clearDashboardLayout,
  saveDashboardLayout,
} from "../services/supabase/dashboardLayoutService";

// All dashboard layout state. The page talks to this and to nothing else.
//
// Every dashboard starts blank. There are no starter layouts to choose from and
// nothing is placed on anyone's behalf: the setup guide explains the controls
// and the reader decides what belongs there. `layout === null` therefore means
// "has never touched this", which is what opens that guide, and it is the state
// both a fresh signup and every existing account are in.
//
// Edits land in local state immediately and are written back on a debounce, so a
// drag across four positions is one round trip rather than four. A failed write
// keeps the local state and surfaces a flag rather than reverting: losing the
// arrangement someone just made because the network blinked is worse than
// showing it unsaved, and the next successful edit writes the whole blob anyway.

/** Long enough to collapse a drag or a burst of size clicks into one write,
 *  short enough that leaving the page straight after an edit still saves. */
const SAVE_DEBOUNCE_MS = 800;

export function useDashboardLayout() {
  const { profile, analysis, fetchProfile } = useAuthStore();
  const userId = profile?.id;

  // What the database last told us. Reparsed rather than trusted: the column is
  // free-form jsonb, so anything could be in it.
  const stored = useMemo(
    () => parseLayout(analysis?.dashboard_layout, WIDGET_SPEC),
    [analysis?.dashboard_layout],
  );

  const [layout, setLayout] = useState<DashboardLayout | null>(stored);
  const [isEditing, setIsEditingRaw] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // What the reader has done, for the setup guide to tick off. Session-scoped on
  // purpose: it describes this visit, and the guide only auto-opens for someone
  // who has never configured anything, so there is nothing to carry forward.
  const [activity, setActivity] = useState<GuideActivity>(NO_ACTIVITY);
  const mark = useCallback((key: keyof GuideActivity) => {
    setActivity((current) => (current[key] ? current : { ...current, [key]: true }));
  }, []);

  // Adopt whatever the store now holds, unless we are mid-edit: a profile
  // refetch fired by an analysis run must not throw away an arrangement the user
  // is in the middle of making.
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  useEffect(() => {
    if (!isEditingRef.current) setLayout(stored);
  }, [stored]);

  // Turning customise mode off with something on the page is what "saved" means
  // to the guide. The writes themselves are debounced and already done by then.
  const widgetCountRef = useRef(0);
  widgetCountRef.current = layout?.widgets.length ?? 0;
  const setIsEditing = useCallback(
    (next: boolean) => {
      if (next) mark("entered");
      else if (widgetCountRef.current > 0) mark("saved");
      setIsEditingRaw(next);
    },
    [mark],
  );

  // Null layout means the user has never set a dashboard up, which is every
  // account until they arrange one. That is what opens the setup guide.
  const needsGuide = Boolean(profile) && layout === null;

  // ── Saving ───────────────────────────────────────────────────────────────
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingRef = useRef<DashboardLayout | null>(null);

  /** Keep the auth store in step with what was just written.
   *
   *  A direct patch rather than fetchProfile(): that flips the store's
   *  isProfileLoading flag, which Dashboard.tsx (like most pages) treats as
   *  "show a loading skeleton" — so refetching after every debounced widget
   *  edit swapped the entire customise session out for a skeleton and back on
   *  each single change. We already know exactly what was written. */
  const syncStore = useCallback((next: DashboardLayout | null) => {
    useAuthStore.setState((state) =>
      state.analysis
        ? { analysis: { ...state.analysis, dashboard_layout: next } }
        : state,
    );
  }, []);

  const flush = useCallback(async () => {
    const next = pendingRef.current;
    if (!next || !userId) return;
    pendingRef.current = null;

    setIsSaving(true);
    setSaveError(null);
    try {
      await saveDashboardLayout(userId, next);
      syncStore(next);
    } catch (e) {
      console.error("Failed to save dashboard layout:", e);
      setSaveError("We could not save your dashboard. Your changes are still here.");
    } finally {
      setIsSaving(false);
    }
  }, [userId, syncStore]);

  const queueSave = useCallback(
    (next: DashboardLayout) => {
      pendingRef.current = next;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // A debounced write that never fires is a lost edit, so anything still pending
  // when the dashboard unmounts goes out immediately.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void flush();
    };
  }, [flush]);

  /**
   * Apply a change to the current layout and schedule the write.
   *
   * Seeds from an empty layout when there is none yet, so the first thing
   * anyone does on a blank dashboard both works and creates their layout. There
   * is no separate "initialise" step for the page to remember to call.
   */
  const mutate = useCallback(
    (fn: (current: DashboardLayout) => DashboardLayout) => {
      setLayout((current) => {
        const base = current ?? emptyLayout();
        const next = fn(base);
        if (next === base && current !== null) return current;
        queueSave(next);
        return next;
      });
    },
    [queueSave],
  );

  /** Write a whole layout at once, with no debounce. For the deliberate
   *  one-off actions where the user is waiting to see the result. */
  const commit = useCallback(
    async (next: DashboardLayout) => {
      setLayout(next);
      if (!userId) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingRef.current = null;

      setIsSaving(true);
      setSaveError(null);
      try {
        await saveDashboardLayout(userId, next);
        syncStore(next);
      } catch (e) {
        console.error("Failed to save dashboard layout:", e);
        setSaveError("We could not save your dashboard. Your changes are still here.");
      } finally {
        setIsSaving(false);
      }
    },
    [userId, syncStore],
  );

  // ── Operations ───────────────────────────────────────────────────────────

  /** Claim the blank page as theirs without placing anything on it. What
   *  dismissing the guide calls, so it does not reopen on the next visit. */
  const startBlank = useCallback(
    () => commit(emptyLayout()),
    [commit],
  );

  const forgetLayout = useCallback(async () => {
    if (!userId) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await clearDashboardLayout(userId);
      setLayout(null);
      setIsEditingRaw(false);
      setActivity(NO_ACTIVITY);
      syncStore(null);
    } catch (e) {
      console.error("Failed to reset dashboard layout:", e);
      setSaveError("We could not reset your dashboard.");
    } finally {
      setIsSaving(false);
    }
  }, [userId, syncStore]);

  const addWidget = useCallback(
    (id: string) => {
      const def = widgetById(id);
      if (!def) return;
      mark("added");
      mutate((current) =>
        current.widgets.some((w) => w.id === id)
          ? current
          : {
              ...current,
              widgets: [...current.widgets, { id, size: def.defaultSize }],
            },
      );
    },
    [mutate, mark],
  );

  const removeWidget = useCallback(
    (id: string) =>
      mutate((current) => ({
        ...current,
        widgets: current.widgets.filter((w) => w.id !== id),
      })),
    [mutate],
  );

  const setSize = useCallback(
    (id: string, size: WidgetSize) => {
      mark("resized");
      mutate((current) => ({
        ...current,
        widgets: current.widgets.map((w) => (w.id === id ? { ...w, size } : w)),
      }));
    },
    [mutate, mark],
  );

  /** Step a widget through the sizes it offers, wrapping at the end. One button
   *  rather than three, since a widget rarely offers more than two. */
  const cycleSize = useCallback(
    (id: string) => {
      const def = widgetById(id);
      if (!def) return;
      mark("resized");
      mutate((current) => ({
        ...current,
        widgets: current.widgets.map((w) => {
          if (w.id !== id) return w;
          const at = def.sizes.indexOf(w.size);
          return { ...w, size: def.sizes[(at + 1) % def.sizes.length] };
        }),
      }));
    },
    [mutate, mark],
  );

  const moveWidget = useCallback(
    (from: number, to: number) => {
      mutate((current) => {
        const widgets = arrayMove(current.widgets, from, to);
        if (widgets === current.widgets) return current;
        return { ...current, widgets };
      });
      // Only a move that changed something counts, so nudging the first widget
      // further up does not tick the step off.
      if (from !== to) mark("reordered");
    },
    [mutate, mark],
  );

  const updateSettings = useCallback(
    (id: string, patch: WidgetSettings) =>
      mutate((current) => ({
        ...current,
        widgets: current.widgets.map((w) =>
          w.id === id ? { ...w, settings: { ...w.settings, ...patch } } : w,
        ),
      })),
    [mutate],
  );

  const setPinnedTicker = useCallback(
    (ticker: string | null) =>
      mutate((current) => ({
        ...current,
        pinnedTicker: ticker ? ticker.toUpperCase() : null,
      })),
    [mutate],
  );

  /** Widgets not currently placed, for the add drawer. */
  const availableWidgets = useMemo(() => {
    const placed = new Set((layout?.widgets ?? []).map((w) => w.id));
    return WIDGETS.filter((w) => !placed.has(w.id));
  }, [layout?.widgets]);

  /** Entries paired with their definition, so the page never looks a widget up
   *  itself. Entries whose widget has vanished from the registry are dropped,
   *  which also covers a layout parsed before a redeploy removed one. */
  const placedWidgets = useMemo(() => {
    const placed: { entry: LayoutEntry; def: WidgetDef }[] = [];
    for (const entry of layout?.widgets ?? []) {
      const def = widgetById(entry.id);
      if (def) placed.push({ entry, def });
    }
    return placed;
  }, [layout?.widgets]);

  return {
    layout,
    placedWidgets,
    availableWidgets,
    needsGuide,
    activity,
    isEditing,
    setIsEditing,
    isSaving,
    saveError,
    startBlank,
    forgetLayout,
    addWidget,
    removeWidget,
    setSize,
    cycleSize,
    moveWidget,
    updateSettings,
    setPinnedTicker,
    // Kept for the settings page, which resets and then wants the store fresh.
    refetchProfile: fetchProfile,
  };
}
