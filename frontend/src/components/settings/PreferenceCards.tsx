import { Check, Cpu, Zap, TrendingUp, Bot, Heart, Tv, BookOpen, BarChart2, Brain, Clock } from "lucide-react";
import SettingsCard, { Consequence } from "./SettingsCard";
import RunPlanPreview from "./RunPlanPreview";
import { PrimaryButton, SecondaryButton } from "./SettingsButtons";
import type { useUserSettings } from "../../hooks/useUserSettings";
import {
  EXPERTISE_CARD_LEAD,
  EXPERTISE_CARD_TITLE,
  EXPERTISE_SAVE_ACTION,
  RETAKE_SAVING,
  RUN_CONSEQUENCE,
  SECTORS_CARD_LEAD,
  SECTORS_CARD_TITLE,
  SECTORS_NONE_WARNING,
  SECTORS_SAVE_ACTION,
} from "../../utils/settingsCopy";

type Settings = ReturnType<typeof useUserSettings>;

// ─── Data ──────────────────────────────────────────────────────────────────

const UNIVERSE_TILES = [
  { id: "Technology", Icon: Cpu, desc: "Software, hardware & semiconductors" },
  { id: "Green Energy", Icon: Zap, desc: "Solar, wind, water & clean infrastructure" },
  { id: "Finance", Icon: TrendingUp, desc: "Banks, fintech & asset management" },
  { id: "AI & Robotics", Icon: Bot, desc: "Machine learning & automation" },
  { id: "Healthcare", Icon: Heart, desc: "Biotech, pharma & medical devices" },
  { id: "Media & Communications", Icon: Tv, desc: "Streaming, social media & telecoms" },
];

const EXPERTISE_TILES = [
  { value: "novice", label: "Novice", Icon: BookOpen, numeral: "I", desc: "Plain-language explanations, no jargon." },
  { value: "intermediate", label: "Intermediate", Icon: BarChart2, numeral: "II", desc: "Balanced analysis with key metrics." },
  { value: "advanced", label: "Advanced", Icon: Brain, numeral: "III", desc: "Full technical and quantitative detail." },
];

// ─── Shared primitives ──────────────────────────────────────────────────────

function SelectionRing() {
  return (
    <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-forest-700 animate-in zoom-in-75 duration-150">
      <Check size={11} strokeWidth={3.5} className="text-white" />
    </span>
  );
}

function Tile({
  on,
  onClick,
  Icon,
  title,
  desc,
  numeral,
}: {
  on: boolean;
  onClick: () => void;
  Icon: React.ElementType;
  title: string;
  desc: string;
  numeral?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`group relative rounded-[14px] border px-3.5 py-3 text-left transition-colors duration-150 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 ${
        on
          ? "border-forest-700 bg-forest-50"
          : "border-forest-900/12 bg-white hover:border-forest-900/30"
      }`}
    >
      {on && <SelectionRing />}
      <div className="mb-2.5 flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors ${
            on ? "bg-white" : "bg-forest-50"
          }`}
        >
          <Icon size={16} className={on ? "text-forest-700" : "text-brand-muted-fg"} strokeWidth={1.75} />
        </div>
        {numeral && (
          <span
            className={`text-xs font-bold ${
              on ? "text-forest-700" : "text-brand-muted-fg/60"
            }`}
          >
            {numeral}
          </span>
        )}
      </div>
      <p className="text-sm font-bold leading-tight text-forest-900">{title}</p>
      <p className="mt-0.5 text-xs leading-snug text-brand-muted-fg">{desc}</p>
    </button>
  );
}

const runConsequence = (
  <Consequence icon={<Clock className="h-3.5 w-3.5" />}>{RUN_CONSEQUENCE}</Consequence>
);

// ─── Cards ──────────────────────────────────────────────────────────────────

/** The sectors the analysis run looks at. Saves alone. */
export function SectorsCard({ settings }: { settings: Settings }) {
  const { formData, toggleUniverse, prefStatus, prefDirty, saveInvestmentPrefs, resetInvestmentPrefs } =
    settings;
  const status = prefStatus.universe;
  const none = formData.investment_universe.length === 0;
  const dirty = prefDirty("universe");

  return (
    <SettingsCard
      id="sectors"
      title={SECTORS_CARD_TITLE}
      lead={SECTORS_CARD_LEAD}
      error={status.error}
      success={status.success}
      consequence={runConsequence}
      actions={
        <>
          {dirty && (
            <SecondaryButton onClick={() => resetInvestmentPrefs("universe")} disabled={status.saving}>
              Cancel
            </SecondaryButton>
          )}
          <PrimaryButton
            onClick={() => void saveInvestmentPrefs("universe")}
            disabled={status.saving || none || !dirty}
          >
            {status.saving ? RETAKE_SAVING : SECTORS_SAVE_ACTION}
          </PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {UNIVERSE_TILES.map(({ id, Icon, desc }) => (
          <Tile
            key={id}
            on={formData.investment_universe.includes(id)}
            onClick={() => toggleUniverse(id)}
            Icon={Icon}
            title={id}
            desc={desc}
          />
        ))}
      </div>
      {none && <p className="text-xs font-semibold text-caution">{SECTORS_NONE_WARNING}</p>}
      <RunPlanPreview sectors={formData.investment_universe} />
    </SettingsCard>
  );
}

/** How much detail the app explains with. Saves alone. */
export function ExpertiseCard({ settings }: { settings: Settings }) {
  const { formData, updateFormField, prefStatus, prefDirty, saveInvestmentPrefs, resetInvestmentPrefs } =
    settings;
  const status = prefStatus.expertise;
  const dirty = prefDirty("expertise");

  return (
    <SettingsCard
      id="expertise"
      title={EXPERTISE_CARD_TITLE}
      lead={EXPERTISE_CARD_LEAD}
      error={status.error}
      success={status.success}
      consequence={runConsequence}
      actions={
        <>
          {dirty && (
            <SecondaryButton onClick={() => resetInvestmentPrefs("expertise")} disabled={status.saving}>
              Cancel
            </SecondaryButton>
          )}
          <PrimaryButton
            onClick={() => void saveInvestmentPrefs("expertise")}
            disabled={status.saving || !dirty}
          >
            {status.saving ? RETAKE_SAVING : EXPERTISE_SAVE_ACTION}
          </PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {EXPERTISE_TILES.map(({ value, label, Icon, numeral, desc }) => (
          <Tile
            key={value}
            on={formData.expertise_level === value}
            onClick={() => updateFormField("expertise_level", value)}
            Icon={Icon}
            title={label}
            desc={desc}
            numeral={numeral}
          />
        ))}
      </div>
    </SettingsCard>
  );
}
