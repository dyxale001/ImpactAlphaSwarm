import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { useUserSettings } from "../hooks/useUserSettings"
import { useProfileAnswers } from "../hooks/useProfileAnswers"
import SettingsHero from "../components/settings/SettingsHero"
import SettingsTabs from "../components/settings/SettingsTabs"
import RiskProfileCard from "../components/settings/RiskProfileCard"
import GoalsCard from "../components/settings/GoalsCard"
import { ExpertiseCard, SectorsCard } from "../components/settings/PreferenceCards"
import AccountDetailsCard from "../components/settings/AccountDetailsCard"
import ChangePasswordSection from "../components/ChangePasswordSection"
import DeactivateAccountSection from "../components/DeactivateAccountSection"
import DashboardPreferencesSection from "../components/DashboardPreferencesSection"
import { GOAL_QUESTIONS } from "../utils/onboardingData"
import {
  SETTINGS_TAB_PARAM,
  parseSettingsTab,
  type SettingsTab,
} from "../utils/settingsTabs"
import {
  ACCOUNT_TAB_INTRO,
  PREFERENCES_TAB_INTRO,
  PROFILE_TAB_INTRO,
} from "../utils/settingsCopy"

/**
 * Settings: the same skeleton as every other main page.
 *
 * Hub header, tab strip, platform cards. Three tabs, split by what reads the
 * data: the fund matcher reads the risk answers and goals together, the
 * analysis run reads sectors and expertise, and the account tab is the login
 * itself. Each card saves on its own — see `SettingsCard` for why there is no
 * page-level Save.
 *
 * The active tab lives in the query string so other pages can link straight
 * to a view; the dashboard's fund-bracket tile sends someone with no profile
 * to `?tab=profile`, not to the top of the page.
 */
export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const tab = parseSettingsTab(searchParams.get(SETTINGS_TAB_PARAM))
  const setTab = useCallback(
    (next: SettingsTab) => {
      const params = new URLSearchParams(searchParams)
      params.set(SETTINGS_TAB_PARAM, next)
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const settings = useUserSettings()
  const profile = useProfileAnswers()

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-10 animate-fade-in-up">
      <SettingsHero
        riskLabel={profile.riskLabel}
        goalsAnswered={profile.answeredGoals}
        goalsTotal={GOAL_QUESTIONS.length}
        sectors={settings.formData.investment_universe}
        learnContext={tab !== "account" ? (tab === "profile" ? "settings.risk" : "settings.sectors") : null}
      />

      <SettingsTabs active={tab} onChange={setTab} />

      <div
        role="tabpanel"
        id="settings-panel-profile"
        aria-labelledby="settings-tab-profile"
        hidden={tab !== "profile"}
        className="space-y-4"
      >
        <p className="text-sm text-brand-muted-fg">{PROFILE_TAB_INTRO}</p>
        <RiskProfileCard profile={profile} />
        <GoalsCard profile={profile} />
      </div>

      <div
        role="tabpanel"
        id="settings-panel-preferences"
        aria-labelledby="settings-tab-preferences"
        hidden={tab !== "preferences"}
        className="space-y-4"
      >
        <p className="max-w-[70ch] text-sm text-brand-muted-fg">{PREFERENCES_TAB_INTRO}</p>
        <SectorsCard settings={settings} />
        <ExpertiseCard settings={settings} />
        <DashboardPreferencesSection />
      </div>

      <div
        role="tabpanel"
        id="settings-panel-account"
        aria-labelledby="settings-tab-account"
        hidden={tab !== "account"}
        className="space-y-4"
      >
        <p className="max-w-[70ch] text-sm text-brand-muted-fg">{ACCOUNT_TAB_INTRO}</p>
        <AccountDetailsCard settings={settings} />
        <ChangePasswordSection />
        <DeactivateAccountSection />
      </div>
    </div>
  )
}
