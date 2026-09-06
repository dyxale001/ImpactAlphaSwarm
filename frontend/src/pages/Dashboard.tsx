import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, Plus } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useDashboardLayout } from "../hooks/useDashboardLayout";
import { SIZE_CLASS } from "../dashboard/layoutSchema";
import { DashboardDataProvider } from "../dashboard/DashboardDataContext";
import SetupGuide from "../components/dashboard/deck/SetupGuide";
import TodayStrip from "../components/dashboard/deck/TodayStrip";
import WidgetFrame from "../components/dashboard/deck/WidgetFrame";
import AddWidgetDrawer from "../components/dashboard/deck/AddWidgetDrawer";
import EditModeBar from "../components/dashboard/deck/EditModeBar";
import DashboardSkeleton from "../components/dashboard/DashboardSkeleton";
import { rememberHubPage } from "../utils/lastHubPage";

// The dashboard the user composed.
//
// Every dashboard starts blank, so the states are: the setup guide for anyone
// who has never configured one, the arranged grid, and edit mode over the top of
// it. All layout state lives in useDashboardLayout; this page arranges it.

const PAGE = "max-w-7xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-16";

export default function DashboardPage() {
  // Names this as the page an asset's "Back to X" link should return to. See
  // lastHubPage.ts: every route into /asset/:ticker shares this without being
  // threaded through individually.
  useEffect(() => {
    rememberHubPage("/dashboard");
  }, []);

  const { profile, isLoading, isProfileLoading } = useAuthStore();
  const {
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
    addWidget,
    removeWidget,
    cycleSize,
    moveWidget,
    updateSettings,
    setPinnedTicker,
  } = useDashboardLayout();

  const [drawerOpen, setDrawerOpen] = useState(false);
  // Which widget is being dragged, and which it is currently over. Index rather
  // than id: the move is an array operation and indices are what it takes.
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // Dismissed for this visit. Separate from `needsGuide`, which is about
  // whether they have ever configured anything: someone can close the guide
  // and reopen it from the banner without that meaning they started over.
  const [guideHidden, setGuideHidden] = useState(false);
  const [guideRequested, setGuideRequested] = useState(false);

  if (isLoading || isProfileLoading || !profile) {
    return <DashboardSkeleton />;
  }

  const pinnedTicker = layout?.pinnedTicker ?? null;
  const showGuide = (needsGuide || guideRequested) && !guideHidden;

  /** Closing the guide also claims the blank page, so it does not reopen on the
   *  next visit for someone who read it and decided to come back later. */
  const dismissGuide = () => {
    setGuideHidden(true);
    setGuideRequested(false);
    if (layout === null) void startBlank();
  };

  const finishDrag = () => {
    if (dragFrom !== null && dragOver !== null && dragFrom !== dragOver) {
      moveWidget(dragFrom, dragOver);
    }
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <DashboardDataProvider>
      <div className={`${PAGE} space-y-6`}>
        <TodayStrip
          widgetCount={placedWidgets.length}
          pinnedTicker={pinnedTicker}
          isEditing={isEditing}
          onCustomise={() => setIsEditing(true)}
          onOpenGuide={
            showGuide
              ? null
              : () => {
                  setGuideHidden(false);
                  setGuideRequested(true);
                }
          }
        />

        {saveError && !isEditing ? (
          <div className="rounded-lg border border-semantic-danger/20 bg-semantic-danger/10 p-4 text-sm text-semantic-danger">
            {saveError}
          </div>
        ) : null}

        {showGuide ? (
          <SetupGuide
            activity={activity}
            widgetCount={placedWidgets.length}
            isEditing={isEditing}
            onStartCustomising={() => setIsEditing(true)}
            onOpenLibrary={() => setDrawerOpen(true)}
            onFinish={dismissGuide}
            onDismiss={dismissGuide}
          />
        ) : null}

        {placedWidgets.length === 0 ? (
          <div className="soft-card flex flex-col items-center gap-3 px-6 py-14 text-center">
            <LayoutGrid className="h-7 w-7 text-brand-muted-fg" />
            <p className="text-sm font-medium text-brand-fg">
              Your dashboard is empty
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-brand-muted-fg">
              Add the pieces you want to see. Your watchlist, the assets your
              latest run ranked, sentiment, insider activity and your learning
              progress are all available.
            </p>
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
                setDrawerOpen(true);
              }}
              className="mt-1 inline-flex items-center gap-2 rounded-full bg-brand-accent px-4 py-2 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
            >
              <Plus className="h-4 w-4" />
              Add a widget
            </button>
          </div>
        ) : (
          <div
            className={`bento-grid ${isEditing ? "rounded-2xl bg-brand-fg/[0.02] p-3" : ""}`}
          >
            {placedWidgets.map(({ entry, def }, index) => (
              // Every drag handler lives on this plain wrapper rather than on
              // WidgetFrame. The frame is a framer-motion element, and
              // framer-motion claims onDragStart and onDragEnd for its own pan
              // gestures, consuming them before they reach the DOM. It also
              // makes the whole grid cell the drop target, including the gap
              // around the card that its own padding leaves.
              <div
                key={entry.id}
                className={SIZE_CLASS[entry.size]}
                // Draggable only in edit mode: a draggable card in normal use
                // hijacks text selection and turns a stray swipe into a layout
                // change.
                draggable={isEditing}
                onDragStart={
                  isEditing
                    ? (e) => {
                        // Firefox refuses to start a drag with nothing on the
                        // transfer.
                        e.dataTransfer.setData("text/plain", entry.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragFrom(index);
                      }
                    : undefined
                }
                onDragEnter={isEditing ? () => setDragOver(index) : undefined}
                onDragOver={
                  isEditing
                    ? (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }
                    : undefined
                }
                onDrop={
                  isEditing
                    ? (e) => {
                        e.preventDefault();
                        finishDrag();
                      }
                    : undefined
                }
                // Fires whether the drop landed on a target or was abandoned, so
                // this is what guarantees the drag state is always cleaned up.
                onDragEnd={isEditing ? finishDrag : undefined}
              >
                <WidgetFrame
                  def={def}
                  size={entry.size}
                  index={index}
                  total={placedWidgets.length}
                  isEditing={isEditing}
                  isDragging={dragFrom === index}
                  isDropTarget={dragOver === index}
                  onMove={(to) => moveWidget(index, to)}
                  onCycleSize={() => cycleSize(entry.id)}
                  onRemove={() => removeWidget(entry.id)}
                >
                  <def.Component
                    size={entry.size}
                    pinnedTicker={pinnedTicker}
                    setPinnedTicker={setPinnedTicker}
                    settings={entry.settings ?? {}}
                    updateSettings={(patch) => updateSettings(entry.id, patch)}
                  />
                </WidgetFrame>
              </div>
            ))}

            {/* The ghost slot. Only in edit mode, and it sits in the grid rather
                than below it so "add" reads as a place on the page. */}
            {isEditing ? (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                disabled={availableWidgets.length === 0}
                className="col-span-6 flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-border/70 text-brand-muted-fg transition-colors hover:border-brand-accent hover:text-brand-primary disabled:opacity-40 lg:col-span-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
              >
                <Plus className="h-5 w-5" />
                <span className="text-xs font-semibold">
                  {availableWidgets.length === 0
                    ? "Everything is placed"
                    : "Add a widget"}
                </span>
              </button>
            ) : null}
          </div>
        )}

        {isEditing ? (
          <EditModeBar
            widgetCount={placedWidgets.length}
            isSaving={isSaving}
            saveError={saveError}
            onAdd={() => setDrawerOpen(true)}
            onDone={() => setIsEditing(false)}
          />
        ) : null}

        <AddWidgetDrawer
          open={drawerOpen}
          available={availableWidgets}
          onAdd={(id) => addWidget(id)}
          onClose={() => setDrawerOpen(false)}
        />

        <p className="pt-2 text-[11px] leading-relaxed text-brand-muted-fg">
          Everything here is research, not financial advice. Prices are US
          listings shown in rand.{" "}
          <Link to="/settings" className="text-brand-primary hover:underline">
            Manage your preferences
          </Link>
          .
        </p>
      </div>
    </DashboardDataProvider>
  );
}
