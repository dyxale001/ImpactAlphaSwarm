import { useState } from "react";
import { AlertTriangle, Link2 } from "lucide-react";
import {
  ValidationError,
  createAdminFund,
  extractFactsheet,
  type Extraction,
  type FieldProblem,
  type FundInput,
  type SnapshotInput,
} from "../../services/api/adminFundCatalogue";
import { useFundCatalogueMeta } from "../../hooks/useFundCatalogue";
import FactsheetCrops from "./FactsheetCrops";

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
 * What the extractor declines to read stays empty and says why. A pre-filled
 * wrong value gets nodded through; an empty box has to be answered.
 */

/** Snapshot fields the extractor can fill. Kept explicit so a new extractor
 *  field cannot silently start populating something this form does not show. */
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
  const [reading, setReading] = useState(false);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

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

  async function readSheet() {
    setReading(true);
    setReadError(null);
    setExtraction(null);
    try {
      const read = await extractFactsheet(url);
      setExtraction(read);

      // Only fills what is still blank. Anything already typed by hand wins:
      // the person is the authority, the extractor is a convenience.
      setFund((current) => {
        const next = { ...current };
        for (const key of ["isin", "jse_code"] as const) {
          const value = read.fields[key];
          if (value !== undefined && !next[key].trim()) next[key] = String(value);
        }
        // The sheet's category wording is the manager's abbreviation ("SA Multi
        // Asset Income"); the catalogue needs the canonical ASISA name. Matched
        // loosely so the dropdown lands on the right one, and left blank rather
        // than guessed when nothing matches.
        const raw = read.fields.asisa_category;
        if (raw && !next.asisa_category) {
          const words = String(raw).toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
          const hit = meta?.categories.find((c) => {
            const target = c.name.toLowerCase();
            return words.every((w) => (w === "sa" ? true : target.includes(w)));
          });
          if (hit) {
            next.asisa_category = hit.name;
            next.asisa_geography = hit.tier1;
            next.asisa_asset_class = hit.tier2;
          }
        }
        return next;
      });

      setSheet((current) => {
        const next = { ...current };
        for (const key of SHEET_FIELDS) {
          const value = read.fields[key];
          if (value !== undefined && !next[key].trim()) next[key] = String(value);
        }
        return next;
      });
    } catch (e) {
      setReadError(e instanceof ValidationError ? e.message : "That sheet could not be read.");
    } finally {
      setReading(false);
    }
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
      // Only sent when there is a dated sheet to attach it to; as_of is what
      // makes a snapshot a snapshot.
      if (snapshot.as_of) body.snapshot = snapshot as SnapshotInput;

      await createAdminFund(body as unknown as FundInput);
      setOpen(false);
      setExtraction(null);
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

      {/* ── Start from the document ── */}
      <div className="space-y-2 rounded-md bg-brand-bg/50 p-3">
        <p className="text-xs leading-relaxed text-brand-secondary/80">
          Paste the fact sheet from the manager's own site. Everything below comes off that one
          document — what identifies the fund, and its first dated set of figures.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs" style={{ minWidth: 240 }}>
            <span className="font-semibold text-brand-secondary/80">Fact sheet URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://satrix.co.za/fund/mdd/STX40"
              className="rounded-md border border-brand-border/60 px-2.5 py-1.5 text-brand-primary"
            />
          </label>
          <button
            type="button"
            onClick={() => void readSheet()}
            disabled={reading || !url.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-brand-border/60 px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-bg disabled:opacity-50"
          >
            <Link2 className="h-3 w-3" />
            {reading ? "Reading…" : "Read the sheet"}
          </button>
        </div>
        {readError && (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {readError}
          </p>
        )}
        {extraction && (
          <div className="space-y-1 border-t border-brand-border/40 pt-2 text-[11px]">
            <p className="text-brand-secondary">
              Filled {Object.keys(extraction.fields).length} field
              {Object.keys(extraction.fields).length === 1 ? "" : "s"} using the{" "}
              <span className="font-semibold">{extraction.template}</span> template. Check each
              against the document before saving.
            </p>
            {extraction.unresolved.length > 0 && (
              <>
                <p className="font-semibold text-brand-primary">
                  Left blank on purpose — read these off the document yourself:
                </p>
                <ul className="space-y-0.5">
                  {extraction.unresolved.map((u) => (
                    <li key={u.field} className="text-brand-secondary">
                      <span className="font-semibold">{u.field}</span> — {u.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── What identifies the fund ── */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-brand-primary">What identifies the fund</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="ISIN" name="isin" values={fund} set={setFund} problems={problems} evidence={extraction} />
          <Field label="Fund name" name="name" values={fund} set={setFund} problems={problems} evidence={extraction} />
          <Field label="Manager (the brand)" name="fund_house" values={fund} set={setFund} problems={problems} evidence={extraction} />
          <Field label="Management company" name="manco" values={fund} set={setFund} problems={problems} evidence={extraction} />

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
            evidence={extraction}
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
        {/* Before the fields, here: on a new fund the risk rating is one of the
            things that has to be typed, and it is the field a reader always
            refuses. Having the scale on screen while filling the box in is the
            difference between reading the sheet and remembering it. */}
        {extraction?.crops && extraction.crops.length > 0 && (
          <FactsheetCrops crops={extraction.crops} />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="As at (YYYY-MM-DD)" name="as_of" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Risk, as printed" name="risk_indicator_raw" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Risk level 1-5" name="risk_indicator_1to5" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Benchmark" name="benchmark" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="TER %" name="ter" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Transaction cost %" name="tc" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="TIC %" name="tic" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Fund size (R)" name="fund_size_zar" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Distributions" name="distribution_frequency" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Manager's fee %" name="annual_management_fee" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Fees cover (1y or 3y)" name="fee_period" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="NAV, cents a unit" name="nav_cpu" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Priced on (YYYY-MM-DD)" name="nav_date" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Started (YYYY-MM-DD)" name="inception_date" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Portfolio manager" name="portfolio_manager" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Strongest year %" name="return_high_12m" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Weakest year %" name="return_low_12m" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
          <Field label="Measured over (rolling_12m or calendar_year)" name="return_extremes_basis" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
        </div>
        <p className="text-[11px] leading-relaxed text-brand-secondary/70">
          The NAV field is cents, so a sheet printing "R9.23" is 923. For the strongest and weakest
          year, the sheet's own heading says how they were measured: "Annual Rolling Return" is
          rolling_12m, "Calendar year performance" is calendar_year.
        </p>
        <Field label="Objective, in the manager's words" name="objective" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
        <Field label="Risk, in the manager's words" name="risk_narrative" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
        <Field label="Horizon, in the manager's words" name="horizon_words" values={sheet} set={setSheet} problems={problems} evidence={extraction} />
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

/** One input, with its validation message and — when the extractor filled it —
 *  the line of the document it was read from. */
function Field({
  label,
  name,
  values,
  set,
  problems,
  evidence,
}: {
  label: string;
  name: string;
  values: Record<string, string>;
  set: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  problems: FieldProblem[];
  evidence?: Extraction | null;
}) {
  const mine = problems.filter((p) => p.field === name);
  const quote = evidence?.evidence?.[name];
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
      {quote && (
        <span className="text-[10px] leading-snug text-brand-secondary/60">read from “{quote}”</span>
      )}
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
