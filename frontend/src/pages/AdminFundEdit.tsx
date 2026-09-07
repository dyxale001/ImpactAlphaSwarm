import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check } from "lucide-react";
import {
  ValidationError,
  addAdminSnapshot,
  extractFactsheet,
  updateAdminFund,
  type FieldProblem,
  type Extraction,
  type SnapshotInput,
} from "../services/api/adminFundCatalogue";
import { getCatalogueFund, type CatalogueFundDetail } from "../services/api/fundCatalogue";
import FactsheetCrops from "../components/admin/FactsheetCrops";

/**
 * Edit one fund, and record a fact sheet against it.
 *
 * The two halves are separate on purpose, because they mean different things. A
 * fund's identity — its ISIN, its manager, its ASISA category — is a fact about
 * the fund and gets corrected in place. A fact sheet is a dated document, and
 * recording one never overwrites: a correction is another row for the same
 * date, and the newer reading is the one the product shows. The earlier one
 * stays as the record of what the catalogue said at the time.
 *
 * Validation is the backend's. Whatever the seed loader would refuse in a CSV,
 * this form is refused too, and every problem comes back at once so the whole
 * thing can be fixed in one pass rather than one field per attempt.
 */
export default function AdminFundEdit() {
  const { fundId } = useParams<{ fundId: string }>();
  const [fund, setFund] = useState<CatalogueFundDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!fundId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      setFund(await getCatalogueFund(fundId));
    } catch (e) {
      console.error("Error loading the fund:", e);
      setLoadError("Unable to load that fund.");
    } finally {
      setIsLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return <Shell><p className="text-sm text-brand-secondary">Loading…</p></Shell>;
  }
  if (loadError || !fund || !fundId) {
    return <Shell><p className="text-sm text-brand-secondary">{loadError ?? "Not found."}</p></Shell>;
  }

  return (
    <Shell>
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-brand-primary">{fund.name}</h1>
        <p className="text-xs text-brand-secondary/70">
          <span className="font-mono">{fund.isin}</span> · {fund.manco}
        </p>
      </header>

      <FundFields fund={fund} fundId={fundId} onSaved={load} />
      <CurrentSheet fund={fund} />
      <RecordSheet fundId={fundId} fund={fund} onSaved={load} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto pt-6 lg:pt-10 px-4 sm:px-6 lg:px-8 pb-20 space-y-5">
      <Link
        to="/admin/funds"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-secondary hover:text-brand-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to the catalogue
      </Link>
      {children}
    </div>
  );
}

/** The fund's own identity. Corrected in place — this is not a dated document. */
function FundFields({
  fund,
  fundId,
  onSaved,
}: {
  fund: CatalogueFundDetail;
  fundId: string;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState({
    name: fund.name,
    fund_house: fund.fund_house,
    manco: fund.manco,
    asisa_category: fund.asisa_category,
    curation_rule: fund.curation_rule ?? "",
    mdd_page_url: fund.mdd_page_url ?? "",
  });
  const { problems, saved, saving, save } = useSaver(async () => {
    await updateAdminFund(fundId, values);
    await onSaved();
  });

  return (
    <section className="soft-card space-y-3 p-5">
      <h2 className="text-sm font-bold text-brand-primary">Fund details</h2>
      <p className="text-xs text-brand-secondary/70">
        Facts about the fund itself. The ISIN identifies it and cannot be changed here — a
        different ISIN is a different fund.
      </p>
      <Field label="Name" value={values.name} onChange={(v) => setValues({ ...values, name: v })} problems={problems} name="name" />
      <Field label="Manager" value={values.fund_house} onChange={(v) => setValues({ ...values, fund_house: v })} problems={problems} name="fund_house" />
      <Field label="Management company" value={values.manco} onChange={(v) => setValues({ ...values, manco: v })} problems={problems} name="manco" />
      <Field label="ASISA category" value={values.asisa_category} onChange={(v) => setValues({ ...values, asisa_category: v })} problems={problems} name="asisa_category" />
      <Field label="Why it is in the catalogue" value={values.curation_rule} onChange={(v) => setValues({ ...values, curation_rule: v })} problems={problems} name="curation_rule" />
      <Field label="Manager's fund page" value={values.mdd_page_url} onChange={(v) => setValues({ ...values, mdd_page_url: v })} problems={problems} name="mdd_page_url" />
      <SaveRow saving={saving} saved={saved} problems={problems} onSave={save} label="Save details" />
    </section>
  );
}

/** What the product is currently showing, and every sheet on file. */
function CurrentSheet({ fund }: { fund: CatalogueFundDetail }) {
  return (
    <section className="soft-card space-y-3 p-5">
      <h2 className="text-sm font-bold text-brand-primary">Fact sheets on file</h2>
      {fund.snapshot ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
          <Readonly label="As at" value={fund.snapshot.as_of} />
          <Readonly label="Risk" value={fund.snapshot.risk_indicator_raw ?? "not published"} />
          <Readonly label="Level" value={fund.snapshot.risk_indicator_1to5?.toString() ?? "—"} />
          <Readonly label="TER" value={fund.snapshot.ter?.toString() ?? "—"} />
          <Readonly label="TC" value={fund.snapshot.tc?.toString() ?? "—"} />
          <Readonly label="TIC" value={fund.snapshot.tic?.toString() ?? "—"} />
        </dl>
      ) : (
        <p className="text-xs text-brand-secondary">
          None recorded. This fund is listed but cannot be matched to anyone until a fact sheet is
          on file.
        </p>
      )}
      {fund.snapshot_history.length > 0 && (
        <p className="text-[11px] text-brand-secondary/60">
          {fund.snapshot_history.length} dated{" "}
          {fund.snapshot_history.length === 1 ? "sheet" : "sheets"}:{" "}
          {fund.snapshot_history.map((h) => h.as_of).join(", ")}
        </p>
      )}
    </section>
  );
}

/** Record a sheet. Never an overwrite — see the module docstring. */
function RecordSheet({
  fundId,
  fund,
  onSaved,
}: {
  fundId: string;
  fund: CatalogueFundDetail;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({
    as_of: "",
    mdd_url: "",
    risk_indicator_raw: "",
    risk_indicator_1to5: "",
    ter: "",
    tc: "",
    tic: "",
    objective: "",
    benchmark: "",
    fund_size_zar: "",
    distribution_frequency: "",
    recommended_min_term_years: "",
    // The common core. Everything a Minimum Disclosure Document publishes that
    // the earlier form discarded — most consequentially the NAV, which for a
    // unit trust is the only price the fund has.
    nav_cpu: "",
    nav_date: "",
    fee_period: "",
    inception_date: "",
    annual_management_fee: "",
    return_high_12m: "",
    return_low_12m: "",
    return_extremes_basis: "",
    risk_narrative: "",
    horizon_words: "",
    portfolio_manager: "",
  });

  // A tri-state, not a checkbox: unit trust sheets print Regulation 28
  // compliance and ETF sheets do not, so "the document does not say" has to be
  // recordable and is the default. A checkbox would quietly record every ETF as
  // non-compliant.
  const [reg28, setReg28] = useState<"" | "yes" | "no">("");

  // Cents per unit by month, as the sheet's distribution table prints it. Free
  // rows because managers publish different windows — Satrix prints four
  // quarters, FundRock prints twelve months with dashes for the empty ones.
  const [income, setIncome] = useState<Array<{ month: string; cents: string }>>([]);

  // Asset classes vary by fund, so these are free-form rows. Periods do not, so
  // those are fixed below: a mix of "1y", "1 year" and "1Y" across funds would
  // make the figures unchartable later for no gain now.
  const [allocation, setAllocation] = useState<Array<{ label: string; percent: string }>>([]);
  const [performance, setPerformance] = useState<Record<string, string>>({
    "1y": "",
    "3y": "",
    "5y": "",
    "10y": "",
  });

  const { problems, warnings, saved, saving, save } = useSaver(async () => {
    const body: SnapshotInput = { as_of: values.as_of };
    // Empty means "the sheet does not state it", which is not the same as zero.
    // Sending 0 for an unstated fee would publish a figure the manager never
    // printed, so blanks are dropped rather than coerced.
    for (const [key, raw] of Object.entries(values)) {
      if (key === "as_of" || raw.trim() === "") continue;
      const numeric = [
        "risk_indicator_1to5",
        "ter",
        "tc",
        "tic",
        "fund_size_zar",
        "recommended_min_term_years",
        "nav_cpu",
        "annual_management_fee",
        "return_high_12m",
        "return_low_12m",
      ];
      (body as Record<string, unknown>)[key] = numeric.includes(key) ? Number(raw) : raw;
    }

    if (reg28) body.regulation_28 = reg28 === "yes";

    const filledIncome = income.filter((r) => r.month.trim() && r.cents.trim());
    if (filledIncome.length) {
      body.income_distribution = Object.fromEntries(
        filledIncome.map((r) => [r.month.trim(), Number(r.cents)]),
      );
    }

    const filledAllocation = allocation.filter((r) => r.label.trim() && r.percent.trim());
    if (filledAllocation.length) {
      body.asset_allocation = Object.fromEntries(
        filledAllocation.map((r) => [r.label.trim(), Number(r.percent)]),
      );
    }
    const filledPerformance = Object.entries(performance).filter(([, v]) => v.trim() !== "");
    if (filledPerformance.length) {
      body.performance = Object.fromEntries(filledPerformance.map(([k, v]) => [k, Number(v)]));
    }

    await addAdminSnapshot(fundId, body);
    await onSaved();
  });

  const allocationTotal = allocation.reduce((sum, r) => sum + (Number(r.percent) || 0), 0);

  // Reading a sheet fills the boxes; it does not save anything, and what it
  // could not read stays empty with the reason shown beside it.
  const [prefilling, setPrefilling] = useState(false);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);

  async function prefill() {
    setPrefilling(true);
    setPrefillError(null);
    setExtraction(null);
    try {
      const read = await extractFactsheet(values.mdd_url);
      setExtraction(read);
      // Only fields the sheet actually gave. Anything already typed by hand
      // stays: the person is the authority, the extractor is a convenience.
      setValues((current) => {
        const next = { ...current };
        for (const [field, value] of Object.entries(read.fields)) {
          if (field in next && !next[field].trim()) next[field] = String(value);
        }
        return next;
      });
    } catch (e) {
      setPrefillError(
        e instanceof ValidationError ? e.message : "That sheet could not be read.",
      );
    } finally {
      setPrefilling(false);
    }
  }

  const supersedes = fund.snapshot_history.some((h) => h.as_of === values.as_of);

  return (
    <section className="soft-card space-y-3 p-5">
      <h2 className="text-sm font-bold text-brand-primary">Record a fact sheet</h2>
      <p className="text-xs leading-relaxed text-brand-secondary/70">
        Transcribe the figures from the manager's own document. Leave a field empty when the sheet
        does not state it — an empty field means "not published", which is not the same as zero.
      </p>
      {/* Paste the manager's link and let the sheet fill what it can. */}
      <div className="flex flex-wrap items-end gap-2 rounded-md bg-brand-bg/50 p-3">
        <div className="flex-1 min-w-[220px]">
          <Field
            label="Fact sheet URL"
            value={values.mdd_url}
            onChange={(v) => setValues({ ...values, mdd_url: v })}
            problems={problems}
            name="mdd_url"
          />
        </div>
        <button
          type="button"
          onClick={() => void prefill()}
          disabled={prefilling || !values.mdd_url.trim()}
          className="rounded-md border border-brand-border/60 px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-bg disabled:opacity-50"
        >
          {prefilling ? "Reading…" : "Read the sheet"}
        </button>
      </div>

      {prefillError && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {prefillError}
        </p>
      )}

      {extraction && (
        <div className="space-y-2 rounded-md border border-brand-border/40 p-3">
          <p className="text-[11px] text-brand-secondary">
            Read {Object.keys(extraction.fields).length} field
            {Object.keys(extraction.fields).length === 1 ? "" : "s"} using the{" "}
            <span className="font-semibold">{extraction.template}</span> template. Check each
            against the document before saving — the quote beside a value is the line it came from.
          </p>

          {Object.entries(extraction.evidence).length > 0 && (
            <ul className="space-y-1">
              {Object.entries(extraction.evidence).map(([field, quote]) => (
                <li key={field} className="text-[11px] leading-relaxed">
                  <span className="font-semibold text-brand-primary">{field}</span>{" "}
                  <span className="text-brand-secondary/70">“{quote}”</span>
                </li>
              ))}
            </ul>
          )}

          {extraction.unresolved.length > 0 && (
            <div className="border-t border-brand-border/40 pt-2">
              <p className="text-[11px] font-semibold text-brand-primary">
                Left blank on purpose — read these off the document yourself:
              </p>
              <ul className="mt-1 space-y-1">
                {extraction.unresolved.map((u) => (
                  <li key={u.field} className="text-[11px] leading-relaxed text-brand-secondary">
                    <span className="font-semibold">{u.field}</span> — {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* The blocks a person still has to read, cut out of the document. Shown
          after the reading rather than beside each field: the crops are wide,
          and three of the four cover fields that are blank anyway. */}
      {extraction?.crops && extraction.crops.length > 0 && (
        <FactsheetCrops crops={extraction.crops} />
      )}

      {supersedes && (
        <p className="rounded-md bg-brand-bg/70 p-2.5 text-[11px] leading-relaxed text-brand-secondary">
          A sheet dated {values.as_of} is already on file. Saving records a second reading of the
          same document; the product will show this newer one, and the earlier reading is kept.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="As at (YYYY-MM-DD)" value={values.as_of} onChange={(v) => setValues({ ...values, as_of: v })} problems={problems} name="as_of" />
        <Field label="Risk, as printed" value={values.risk_indicator_raw} onChange={(v) => setValues({ ...values, risk_indicator_raw: v })} problems={problems} name="risk_indicator_raw" />
        <Field label="Risk level 1-5" value={values.risk_indicator_1to5} onChange={(v) => setValues({ ...values, risk_indicator_1to5: v })} problems={problems} name="risk_indicator_1to5" />
        <Field label="TER %" value={values.ter} onChange={(v) => setValues({ ...values, ter: v })} problems={problems} name="ter" />
        <Field label="Transaction cost %" value={values.tc} onChange={(v) => setValues({ ...values, tc: v })} problems={problems} name="tc" />
        <Field label="TIC %" value={values.tic} onChange={(v) => setValues({ ...values, tic: v })} problems={problems} name="tic" />
        <Field label="Benchmark" value={values.benchmark} onChange={(v) => setValues({ ...values, benchmark: v })} problems={problems} name="benchmark" />
        <Field label="Fund size (R)" value={values.fund_size_zar} onChange={(v) => setValues({ ...values, fund_size_zar: v })} problems={problems} name="fund_size_zar" />
        <Field label="Distributions" value={values.distribution_frequency} onChange={(v) => setValues({ ...values, distribution_frequency: v })} problems={problems} name="distribution_frequency" />
        <Field label="Minimum term (years)" value={values.recommended_min_term_years} onChange={(v) => setValues({ ...values, recommended_min_term_years: v })} problems={problems} name="recommended_min_term_years" />
        <Field label="Manager's fee %" value={values.annual_management_fee} onChange={(v) => setValues({ ...values, annual_management_fee: v })} problems={problems} name="annual_management_fee" />
        {/* Which fee column the figures above came from. Managers print 1-Year
            and 3-Year and the figures differ, so a cost recorded without its
            period cannot be compared with another fund's. */}
        <Choice
          label="Fees cover"
          value={values.fee_period}
          onChange={(v) => setValues({ ...values, fee_period: v })}
          problems={problems}
          name="fee_period"
          options={[
            ["", "not stated on the sheet"],
            ["1y", "1 year"],
            ["3y", "3 years, annualised"],
          ]}
        />
      </div>

      {/* ── The price, which for a unit trust is the only one there is ── */}
      <div className="grid grid-cols-1 gap-3 border-t border-brand-border/40 pt-3 sm:grid-cols-2">
        <Field label="NAV, cents a unit" value={values.nav_cpu} onChange={(v) => setValues({ ...values, nav_cpu: v })} problems={problems} name="nav_cpu" />
        <Field label="Priced on (YYYY-MM-DD)" value={values.nav_date} onChange={(v) => setValues({ ...values, nav_date: v })} problems={problems} name="nav_date" />
        <Field label="Started (YYYY-MM-DD)" value={values.inception_date} onChange={(v) => setValues({ ...values, inception_date: v })} problems={problems} name="inception_date" />
        <Field label="Portfolio manager" value={values.portfolio_manager} onChange={(v) => setValues({ ...values, portfolio_manager: v })} problems={problems} name="portfolio_manager" />
      </div>
      <p className="text-[11px] leading-relaxed text-brand-secondary/70">
        A Satrix sheet prints the NAV in rand ("NAV Price R9.23") and a FundRock sheet prints it in
        cents ("183.63 cents"). This field is cents, so R9.23 is 923.
      </p>

      {/* ── The strongest and weakest year, and how they were measured ── */}
      <div className="grid grid-cols-1 gap-3 border-t border-brand-border/40 pt-3 sm:grid-cols-3">
        <Field label="Strongest year %" value={values.return_high_12m} onChange={(v) => setValues({ ...values, return_high_12m: v })} problems={problems} name="return_high_12m" />
        <Field label="Weakest year %" value={values.return_low_12m} onChange={(v) => setValues({ ...values, return_low_12m: v })} problems={problems} name="return_low_12m" />
        <Choice
          label="Measured over"
          value={values.return_extremes_basis}
          onChange={(v) => setValues({ ...values, return_extremes_basis: v })}
          problems={problems}
          name="return_extremes_basis"
          options={[
            ["", "pick one"],
            ["rolling_12m", "rolling twelve-month periods"],
            ["calendar_year", "calendar years"],
          ]}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-brand-secondary/70">
        The sheet's own heading says which. "Highest/Lowest Annual Rolling Return" is rolling;
        "Highest and Lowest: Calendar year performance" is calendar. A negative figure is often
        printed in brackets — (4.49) is -4.49.
      </p>

      {/* ── Regulation 28 ── */}
      <div className="border-t border-brand-border/40 pt-3">
        <Choice
          label="Regulation 28"
          value={reg28}
          onChange={(v) => setReg28(v as "" | "yes" | "no")}
          problems={problems}
          name="regulation_28"
          options={[
            ["", "the sheet does not say"],
            ["yes", "complies"],
            ["no", "does not comply"],
          ]}
        />
        <p className="mt-1 text-[11px] leading-relaxed text-brand-secondary/70">
          Unit trust sheets state this and ETF sheets do not. Leave it unset when the document is
          silent — recorded as a published fact, and not used to filter matches.
        </p>
      </div>

      <Field label="Objective, in the manager's words" value={values.objective} onChange={(v) => setValues({ ...values, objective: v })} problems={problems} name="objective" />
      <Field label="Risk, in the manager's words" value={values.risk_narrative} onChange={(v) => setValues({ ...values, risk_narrative: v })} problems={problems} name="risk_narrative" />
      <Field label="Horizon, in the manager's words" value={values.horizon_words} onChange={(v) => setValues({ ...values, horizon_words: v })} problems={problems} name="horizon_words" />

      {/* ── What it has paid out ── */}
      <div className="space-y-2 border-t border-brand-border/40 pt-3">
        <h3 className="text-xs font-bold text-brand-primary">What it has paid out</h3>
        <p className="text-[11px] leading-relaxed text-brand-secondary/70">
          Cents per unit, by month as YYYY-MM. Skip a month the sheet shows as a dash; record a
          month it prints as 0.00, because a declared nothing and no declaration are different
          things.
        </p>
        {income.map((row, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={row.month}
              onChange={(e) => {
                const next = [...income];
                next[index] = { ...next[index], month: e.target.value };
                setIncome(next);
              }}
              placeholder="2026-06"
              className="w-32 rounded-md border border-brand-border/60 bg-white px-2.5 py-1.5 text-xs"
            />
            <input
              value={row.cents}
              onChange={(e) => {
                const next = [...income];
                next[index] = { ...next[index], cents: e.target.value };
                setIncome(next);
              }}
              placeholder="3.93"
              className="w-24 rounded-md border border-brand-border/60 bg-white px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => setIncome(income.filter((_, i) => i !== index))}
              className="text-[11px] font-semibold text-brand-secondary/70 hover:text-brand-primary"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setIncome([...income, { month: "", cents: "" }])}
          className="text-[11px] font-semibold text-brand-primary hover:underline"
        >
          Add a month
        </button>
      </div>

      {/* ── What it holds ── */}
      <div className="space-y-2 border-t border-brand-border/40 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xs font-bold text-brand-primary">What it holds</h3>
          {allocation.length > 0 && (
            <span
              className={`text-[11px] font-semibold ${
                allocationTotal >= 95 && allocationTotal <= 105
                  ? "text-emerald-700"
                  : "text-amber-700"
              }`}
            >
              {allocationTotal.toFixed(1)}% of 100
            </span>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-brand-secondary/70">
          Optional — many tracker sheets print no breakdown, and the index is the answer. If you do
          enter one it has to account for the whole fund: a partial breakdown reads as a fund
          holding some of nothing.
        </p>
        {allocation.map((row, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={row.label}
              placeholder="Domestic equity"
              onChange={(e) => {
                const next = [...allocation];
                next[index] = { ...row, label: e.target.value };
                setAllocation(next);
              }}
              className="flex-1 rounded-md border border-brand-border/60 px-2.5 py-1.5 text-xs text-brand-primary"
            />
            <input
              value={row.percent}
              placeholder="%"
              onChange={(e) => {
                const next = [...allocation];
                next[index] = { ...row, percent: e.target.value };
                setAllocation(next);
              }}
              className="w-20 rounded-md border border-brand-border/60 px-2.5 py-1.5 text-xs text-brand-primary"
            />
            <button
              type="button"
              onClick={() => setAllocation(allocation.filter((_, i) => i !== index))}
              className="px-2 text-xs text-brand-secondary hover:text-brand-primary"
              aria-label="Remove this line"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setAllocation([...allocation, { label: "", percent: "" }])}
          className="text-[11px] font-semibold text-brand-primary hover:underline"
        >
          + Add a line
        </button>
        {problems
          .filter((p) => p.field === "asset_allocation")
          .map((p) => (
            <p key={p.message} className="text-[11px] text-amber-700">
              {p.message}
            </p>
          ))}
      </div>

      {/* ── Published returns ── */}
      <div className="space-y-2 border-t border-brand-border/40 pt-3">
        <h3 className="text-xs font-bold text-brand-primary">Returns, as the sheet prints them</h3>
        <p className="text-[11px] leading-relaxed text-brand-secondary/70">
          Annualised percentages from the fund's own performance table, for the period ending on the
          sheet date. Leave a period blank when the sheet does not show it — a fund younger than
          five years has no five-year figure, and a zero would claim it made nothing.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.keys(performance).map((period) => (
            <label key={period} className="flex flex-col gap-1 text-xs">
              <span className="font-semibold text-brand-secondary/80">{period}</span>
              <input
                value={performance[period]}
                onChange={(e) => setPerformance({ ...performance, [period]: e.target.value })}
                className="rounded-md border border-brand-border/60 px-2.5 py-1.5 text-brand-primary"
              />
            </label>
          ))}
        </div>
      </div>

      <SaveRow saving={saving} saved={saved} problems={problems} warnings={warnings} onSave={save} label="Record sheet" />
    </section>
  );
}

/* ── shared bits ──────────────────────────────────────────────────────────── */

/** Runs a save, and keeps whatever the backend refused it for. */
function useSaver(run: () => Promise<void>) {
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [warnings, setWarnings] = useState<FieldProblem[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setProblems([]);
    setWarnings([]);
    setSaved(false);
    try {
      await run();
      setSaved(true);
    } catch (e) {
      if (e instanceof ValidationError) {
        setProblems(e.problems);
      } else {
        console.error("Save failed:", e);
        setProblems([{ field: "", message: "That did not save.", severity: "error" }]);
      }
    } finally {
      setSaving(false);
    }
  }

  return { problems, warnings, saved, saving, save };
}

function Field({
  label,
  value,
  onChange,
  problems,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  problems: FieldProblem[];
  name: string;
}) {
  const mine = problems.filter((p) => p.field === name);
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-semibold text-brand-secondary/80">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
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

/**
 * A field whose value is one of a closed set, and whose empty option means "the
 * sheet does not state it" rather than a default.
 *
 * A select rather than a text box because these columns have check constraints
 * behind them: a fee period typed as "1 year" or a basis typed as "rolling"
 * would be refused by the database with a constraint name for an explanation,
 * after the person had already read the sheet. And a select rather than a
 * checkbox for Regulation 28, because the third state is real — ETF sheets do
 * not print it, and a checkbox would record every one of them as non-compliant.
 */
function Choice({
  label,
  value,
  onChange,
  problems,
  name,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  problems: FieldProblem[];
  name: string;
  options: Array<[string, string]>;
}) {
  const mine = problems.filter((p) => p.field === name);
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-semibold text-brand-secondary/80">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-md border bg-white px-2.5 py-1.5 text-brand-primary ${
          mine.length ? "border-amber-500" : "border-brand-border/60"
        }`}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
      {mine.map((p) => (
        <span key={p.message} className="text-[11px] text-amber-700">
          {p.message}
        </span>
      ))}
    </label>
  );
}

function Readonly({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-brand-secondary/70">{label}</dt>
      <dd className="font-semibold text-brand-primary">{value ?? "—"}</dd>
    </div>
  );
}

function SaveRow({
  saving,
  saved,
  problems,
  warnings = [],
  onSave,
  label,
}: {
  saving: boolean;
  saved: boolean;
  problems: FieldProblem[];
  warnings?: FieldProblem[];
  onSave: () => void;
  label: string;
}) {
  const unattached = problems.filter((p) => !p.field);
  return (
    <div className="space-y-2 border-t border-brand-border/40 pt-3">
      {unattached.map((p) => (
        <p key={p.message} className="flex items-center gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {p.message}
        </p>
      ))}
      {warnings.map((w) => (
        <p key={w.message} className="text-[11px] text-brand-secondary/70">
          Saved, but: {w.message}
        </p>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : label}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
            <Check className="h-3 w-3" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
