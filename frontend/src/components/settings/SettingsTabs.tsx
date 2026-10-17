import { SETTINGS_TABS, SETTINGS_TAB_LABELS, type SettingsTab } from "../../utils/settingsTabs";

/**
 * The Settings tab strip: the platform's tab bar, with the same keyboard
 * handling as the Learning Centre's, so moving between the two feels like one app.
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
      className="as-tabs grid w-full grid-cols-3 rounded-[20px] sm:inline-flex sm:w-auto sm:rounded-full"
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
            // Three across on a phone, so none sits off the edge; "Investor
            // profile" reads "Profile" there to fit.
            className="as-tab px-2 sm:px-4"
          >
            {tab === "profile" ? (
              <>
                <span className="sm:hidden">Profile</span>
                <span className="hidden sm:inline">{SETTINGS_TAB_LABELS[tab]}</span>
              </>
            ) : (
              SETTINGS_TAB_LABELS[tab]
            )}
          </button>
        );
      })}
    </div>
  );
}
