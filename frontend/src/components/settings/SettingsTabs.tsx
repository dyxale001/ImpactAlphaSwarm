import { SETTINGS_TABS, SETTINGS_TAB_LABELS, type SettingsTab } from "../../utils/settingsTabs";

/**
 * The Settings tab strip. Same pills, same keyboard handling as the Learning
 * Centre's, so moving between the two pages feels like one app.
 */
export default function SettingsTabs({
  active,
  onChange,
}: {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Settings views"
      className="flex gap-2 overflow-x-auto border-b border-brand-border pb-3 sm:flex-wrap"
    >
      {SETTINGS_TABS.map((tab, index) => {
        const selected = active === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`settings-tab-${tab}`}
            aria-controls={`settings-panel-${tab}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? SETTINGS_TABS.length - 1
                    : (index + (event.key === "ArrowRight" ? 1 : -1) + SETTINGS_TABS.length) %
                      SETTINGS_TABS.length;
              const next = SETTINGS_TABS[nextIndex];
              onChange(next);
              document.getElementById(`settings-tab-${next}`)?.focus();
            }}
            className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
              selected ? "bg-brand-primary text-brand-bg" : "text-brand-muted-fg hover:bg-brand-bg"
            }`}
          >
            {SETTINGS_TAB_LABELS[tab]}
          </button>
        );
      })}
    </div>
  );
}
