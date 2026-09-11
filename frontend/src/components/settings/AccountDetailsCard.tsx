import SettingsCard from "./SettingsCard";
import { PrimaryButton, TextButton } from "./SettingsButtons";
import type { useUserSettings } from "../../hooks/useUserSettings";
import {
  DETAILS_CANCEL_ACTION,
  DETAILS_CARD_TITLE,
  DETAILS_EMAIL_NOTE,
  DETAILS_SAVE_ACTION,
  RETAKE_SAVING,
} from "../../utils/settingsCopy";

type Settings = ReturnType<typeof useUserSettings>;

const INPUT =
  "mt-1 w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-fg focus:outline-none focus:ring-2 focus:ring-brand-primary/40";

/** Name and email. Email is read-only: it is the login, and changing it is a
 *  Supabase auth flow rather than a profile edit. */
export default function AccountDetailsCard({ settings }: { settings: Settings }) {
  const {
    formData,
    updateFormField,
    saveAccountInfo,
    resetAccountInfo,
    isAccountSaving,
    accountError,
    accountSuccess,
    email,
  } = settings;

  return (
    <SettingsCard
      id="details"
      title={DETAILS_CARD_TITLE}
      error={accountError}
      success={accountSuccess}
      consequence={<span />}
      actions={
        <>
          <TextButton onClick={resetAccountInfo} disabled={isAccountSaving}>
            {DETAILS_CANCEL_ACTION}
          </TextButton>
          <PrimaryButton
            type="submit"
            form="account-details-form"
            disabled={isAccountSaving}
          >
            {isAccountSaving ? RETAKE_SAVING : DETAILS_SAVE_ACTION}
          </PrimaryButton>
        </>
      }
    >
      <form
        id="account-details-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void saveAccountInfo();
        }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="settings-first-name" className="text-xs font-medium text-brand-muted-fg">
              First name
            </label>
            <input
              id="settings-first-name"
              type="text"
              value={formData.first_name}
              onChange={(e) => updateFormField("first_name", e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="settings-last-name" className="text-xs font-medium text-brand-muted-fg">
              Last name
            </label>
            <input
              id="settings-last-name"
              type="text"
              value={formData.last_name}
              onChange={(e) => updateFormField("last_name", e.target.value)}
              className={INPUT}
            />
          </div>
        </div>
        <div>
          <label htmlFor="settings-email" className="text-xs font-medium text-brand-muted-fg">
            Email
          </label>
          <input
            id="settings-email"
            type="email"
            value={email}
            disabled
            className={`${INPUT} cursor-not-allowed text-brand-muted-fg opacity-60`}
          />
          <p className="mt-1 text-xs text-brand-muted-fg">{DETAILS_EMAIL_NOTE}</p>
        </div>
      </form>
    </SettingsCard>
  );
}
