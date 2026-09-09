import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  ValidationError,
  createAdminFund,
  type FieldProblem,
  type FundInput,
} from "../../services/api/adminFundCatalogue";
import { useFundCatalogueMeta } from "../../hooks/useFundCatalogue";
import PairRows, { asObject, type Pair } from "./PairRows";

/**
 * Add a fund, starting from its fact sheet.
 *
 * The URL comes first because the document is the source of both halves of what
 * gets created: the ISIN and ASISA category identify the fund, the fees and
 * risk rating are its first dated sheet. They used to be two forms on two
 * screens, which meant reading one document twice and leaving the fund listed
 * but matchable to nobody in between.
 *
 * Both are sent in one request. The backend validates everything before it
 * writes anything, which is the seed loader's rule — a half-loaded catalogue is
 * worse than an empty one.
 *
 * Every figure is typed in from the document. There was a "Read the sheet"
 * button that pre-filled these boxes from the PDF; it was removed along with the
 * readers behind it, so what is on screen is what a person read.
 */

/** Snapshot fields this form records. Kept explicit so a new schema column
 *  cannot silently start being sent by a form that does not show it. */
const SHEET_FIELDS = [
  "as_of",
  "benchmark",
  "risk_indicator_raw",
  "risk_indicator_1to5",
  "ter",
  "tc",
  "tic",
  "fund_size_zar",
  "distribution_frequency",
  "objective",
  // The common core. A fund added here gets the same fields as one whose sheet
  // is recorded later, so which route was taken does not decide what is known
  // about a fund.
  "nav_cpu",
  "nav_date",
  "fee_period",
  "inception_date",
  "annual_management_fee",
  "return_high_12m",
  "return_low_12m",
  "return_extremes_basis",
  "risk_narrative",
  "horizon_words",
  "portfolio_manager",
] as const;

const NUMERIC = new Set([
  "risk_indicator_1to5",
  "ter",
  "tc",
  "tic",
  "fund_size_zar",
  "nav_cpu",
  "annual_management_fee",
  "return_high_12m",
  "return_low_12m",
]);

export default function AddFundForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const { meta } = useFundCatalogueMeta();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<FieldProblem[]>([]);

  const [url, setUrl] = useState("");

  // The parts of a sheet that are a list rather than a figure. None of these
  // were on this form: adding a fund meant saving it, reopening it and
  // recording a SECOND fact sheet to enter the allocation, which lands a second
  // snapshot row for the same document.
  const [allocation, setAllocation] = useState<Pair[]>([]);
  const [holdings, setHoldings] = useState<Pair[]>([]);
  const [income, setIncome] = useState<Pair[]>([]);
  const [performance, setPerformance] = useState<Pair[]>([]);

  const [fund, setFund] = useState<Record<string, string>>({
    isin: "",
    name: "",
    fund_house: "",
    manco: "",
    vehicle: "unit_trust",
    asisa_geography: "",
    asisa_asset_class: "",
    asisa_category: "",
    jse_code: "",
    yahoo_symbol: "",
    mdd_page_url: "",
    curation_rule: "",
  });
  const [flags, setFlags] = useState({ is_index_tracker: false, tfsa_eligible: false });
  const [sheet, setSheet] = useState<Record<string, string>>(
    Object.fromEntries(SHEET_FIELDS.map((f) => [f, ""])),
  );

  function pickCategory(name: string) {
    const category = meta?.categories.find((c) => c.name === name);
    setFund({
      ...fund,
      asisa_category: name,
      // Taken from the same record rather than typed, so the three columns
      // cannot disagree with each other.
      asisa_geography: category?.tier1 ?? "",
      asisa_asset_class: category?.tier2 ?? "",
    });
  }

  async function submit() {
    setSaving(true);
    setProblems([]);
    try {
      const body: Record<string, unknown> = { ...flags };
      for (const [key, value] of Object.entries(fund)) {
        if (value.trim() !== "") body[key] = value;
      }
      body.platforms = ["EasyEquities"];

      // Empty means "the sheet does not state it", which is not zero.
      const snapshot: Record<string, unknown> = {};
      for (const key of SHEET_FIELDS) {
        const raw = sheet[key];
        if (raw.trim() === "") continue;
        snapshot[key] = NUMERIC.has(key) ? Number(raw) : raw;
      }
      if (url.trim()) snapshot.mdd_url = url.trim();

      const lists: Array<[string, Pair[]]> = [
        ["asset_allocation", allocation],
        ["top_holdings", holdings],
        ["income_distribution", income],
        ["performance", performance],
      ];
      for (const [key, rows] of lists) {
        const value = asObject(rows);
        if (value) snapshot[key] = value;
      }
      // Only sent when there is a dated sheet to attach it to; as_of is what
      // makes a snapshot a snapshot.
      if (snapshot.as_of) body.snapshot = snapshot;

      await createAdminFund(body as unknown as FundInput);
      setOpen(false);
      setUrl("");
      await onCreated();
    } catch (e) {
      if (e instanceof ValidationError) {
        setProblems(e.problems);
      } else {
        console.error("Could not add the fund:", e);
        setProblems([{ field: "", message: "That did not save.", severity: "error" }]);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white"
      >
        Add a fund
      </button>
    );
  }

  const isEtf = fund.vehicle === "etf";
  const unattached = problems.filter((p) => !p.field);

  return (
    <section className="soft-card space-y-4 p-5">
      <h2 className="text-sm font-bold text-brand-primary">Add a fund</h2>

      {/* ── The document every figure below comes from ── */}
      <div className="space-y-2 rounded-md bg-brand-bg/50 p-3">
        <p className="text-xs leading-relaxed text-brand-secondary/80">
          Paste the fact sheet from the manager's own site, then read the figures off it into the
          boxes below. The link is stored with the sheet, so every number on the fund's page can be
          traced back to the document it was taken from.
        </p>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-brand-secondary/80">Fact sheet URL</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://satrix.co.za/fund/mdd/STX40"
            className="rounded-md border border-brand-border/60 px-2.5 py-1.5 text-brand-primary"
          />
        </label>
      </div>

      {/* ── What identifies the fund ── */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-brand-primary">What identifies the fund</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="ISIN" name="isin" values={fund} set={setFund} problems={problems} />
          <Field label="Fund name" name="name" values={fund} set={setFund} problems={problems} />
          <Field label="Manager (the brand)" name="fund_house" values={fund} set={setFund} problems={problems} />
          <Field label="Management company" name="manco" values={fund} set={setFund} problems={problems} />

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-brand-secondary/80">Fund type</span>
            <select
              value={fund.vehicle}
              onChange={(e) => setFund({ ...fund, vehicle: e.target.value })}
              className="rounded-md border border-brand-border/60 px-2.5 py-1.5 text-brand-primary"
            >
              {(meta?.vehicles ?? []).map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-brand-secondary/80">ASISA category</span>
            <select
              value={fund.asisa_category}
              onChange={(e) => pickCategory(e.target.value)}
              className={`rounded-md border px-2.5 py-1.5 text-brand-primary ${
                problems.some((p) => p.field.startsWith("asisa")) ? "border-amber-500" : "border-brand-border/60"
              }`}
            >
              <option value="">Choose…</option>
              {(meta?.categories ?? []).map((c) => (
                <option key={c.code} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            {fund.asisa_category && (
              <span className="text-[11px] text-brand-secondary/60">
                {fund.asisa_geography} · {fund.asisa_asset_class}
              </span>
            )}
          </label>

          <Field
            label={isEtf ? "JSE code (required)" : "JSE code (unit trusts may print one)"}
            name="jse_code"
            values={fund}
            set={setFund}
            problems={problems}
           
          />
          <Field
            label={isEtf ? "Price symbol, e.g. STX40.JO (required)" : "Price symbol (ETFs only)"}
            name="yahoo_symbol"
            values={fund}
            set={setFund}
            problems={problems}
          />
          <Field label="Manager's fund page" name="mdd_page_url" values={fund} set={setFund} problems={problems} />
          <Field label="Why it is in the catalogue" name="curation_rule" values={fund} set={setFund} problems={problems} />
        </div>

        <div className="flex flex-wrap gap-4 text-xs">
          <Check label="Index tracker" checked={flags.is_index_tracker} onChange={(b) => setFlags({ ...flags, is_index_tracker: b })} />
          <Check label="Tax-free eligible" checked={flags.tfsa_eligible} onChange={(b) => setFlags({ ...flags, tfsa_eligible: b })} />
        </div>
      </div>

      {/* ── Its first fact sheet ── */}
      <div className="space-y-3 border-t border-brand-border/40 pt-3">
        <h3 className="text-xs font-bold text-brand-primary">Its first fact sheet</h3>
        <p className="text-[11px] leading-relaxed text-brand-secondary/70">
          Dated figures from the same document. Leave a field empty where the sheet does not state
          it. Without a date here the fund is saved on its own — it will be listed but cannot be
          matched to anyone until a sheet is recorded.
        </p>
        {/* The risk rating is the field worth being careful with: managers
            draw it as a five-step scale with one step shaded, and the PDF's
            text layer lists every step's label whatever the rating. Read it off
            the picture, not the words. */}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="As at (YYYY-MM-DD)" name="as_of" values={sheet} set={setSheet} problems={problems} />
          <Field label="Risk, as printed" name="risk_indicator_raw" values={sheet} set={setSheet} problems={problems} />
          <Field label="Risk level 1-5" name="risk_indicator_1to5" values={sheet} set={setSheet} problems={problems} />
          <Field label="Benchmark" name="benchmark" values={sheet} set={setSheet} problems={problems} />
          <Field label="TER %" name="ter" values={sheet} set={setSheet} problems={problems} />
          <Field label="Transaction cost %" name="tc" values={sheet} set={setSheet} problems={problems} />
          <Field label="TIC %" name="tic" values={sheet} set={setSheet} problems={problems} />
          <Field label="Fund size (R)" name="fund_size_zar" values={sheet} set={setSheet} problems={problems} />
          <Field label="Distributions" name="distribution_frequency" values={sheet} set={setSheet} problems={problems} />
          <Field label="Manager's fee %" name="annual_management_fee" values={sheet} set={setSheet} problems={problems} />
          <Field label="Fees cover (1y or 3y)" name="fee_period" values={sheet} set={setSheet} problems={problems} />
          <Field label="NAV, cents a unit" name="nav_cpu" values={sheet} set={setSheet} problems={problems} />
          <Field label="Priced on (YYYY-MM-DD)" name="nav_date" values={sheet} set={setSheet} problems={problems} />
          <Field label="Started (YYYY-MM-DD)" name="inception_date" values={sheet} set={setSheet} problems={problems} />
          <Field label="Portfolio manager" name="portfolio_manager" values={sheet} set={setSheet} problems={problems} />
          <Field label="Strongest year %" name="return_high_12m" values={sheet} set={setSheet} problems={problems} />
          <Field label="Weakest year %" name="return_low_12m" values={sheet} set={setSheet} problems={problems} />
          <Field label="Measured over (rolling_12m or calendar_year)" name="return_extremes_basis" values={sheet} set={setSheet} problems={problems} />
        </div>
        <p className="text-[11px] leading-relaxed text-brand-secondary/70">
          The NAV field is cents, so a sheet printing "R9.23" is 923. For the strongest and weakest
          year, the sheet's own heading says how they were measured: "Annual Rolling Return" is
          rolling_12m, "Calendar year performance" is calendar_year.
        </p>
        <Field label="Objective, in the manager's words" name="objective" values={sheet} set={setSheet} problems={problems} />
        <Field label="Risk, in the manager's words" name="risk_narrative" values={sheet} set={setSheet} problems={problems} />
        <Field label="Horizon, in the manager's words" name="horizon_words" values={sheet} set={setSheet} problems={problems} />

        <PairRows
          title="What it holds"
          note="Optional — many tracker sheets print no breakdown, and the index is the answer. If you do enter one it has to account for the whole fund: a partial breakdown reads as a fund holding some of nothing. It is drawn as a chart, so read it off the picture in the document."
          rows={allocation}
          onChange={setAllocation}
          labelPlaceholder="Domestic equity"
          valuePlaceholder="%"
          total
        />

        <PairRows
          title="Top holdings"
          note="The largest positions, as the sheet lists them. These do not add to 100 — they are the top of a longer list."
          rows={holdings}
          onChange={setHoldings}
          labelPlaceholder="Naspers Ltd"
          valuePlaceholder="%"
        />

        <PairRows
          title="Past returns, as published"
          note="The manager's own annualised figures. Use 1y / 3y / 5y / 10y / inception as the labels so figures stay comparable between funds."
          rows={performance}
          onChange={setPerformance}
          labelPlaceholder="1y"
          valuePlaceholder="%"
        />

        <PairRows
          title="What it has paid out"
          note="Cents per unit, by month as YYYY-MM. Skip a month the sheet shows as a dash; record one it prints as 0.00 — a declared nothing and no declaration are different things."
          rows={income}
          onChange={setIncome}
          labelPlaceholder="2026-06"
          valuePlaceholder="3.93"
        />
      </div>

      {unattached.map((p) => (
        <p key={p.message} className="flex items-center gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {p.message}
        </p>
      ))}

      <div className="flex items-center gap-3 border-t border-brand-border/40 pt-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Adding…" : sheet.as_of.trim() ? "Add fund and sheet" : "Add fund only"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setProblems([]);
          }}
          className="text-xs font-semibold text-brand-secondary hover:text-brand-primary"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

/** One input, with its validation message. */
function Field({
  label,
  name,
  values,
  set,
  problems,
}: {
  label: string;
  name: string;
  values: Record<string, string>;
  set: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  problems: FieldProblem[];
}) {
  const mine = problems.filter((p) => p.field === name);
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-semibold text-brand-secondary/80">{label}</span>
      <input
        value={values[name] ?? ""}
        onChange={(e) => set({ ...values, [name]: e.target.value })}
        className={`rounded-md border px-2.5 py-1.5 text-brand-primary ${
          mine.length ? "border-amber-500" : "border-brand-border/60"
        }`}
      />
      {mine.map((p) => (
        <span key={p.message} className="text-[11px] text-amber-700">
          {p.message}
        </span>
      ))}
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-brand-secondary">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
