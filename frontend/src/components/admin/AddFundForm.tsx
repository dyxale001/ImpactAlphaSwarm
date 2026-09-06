import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  ValidationError,
  createAdminFund,
  type FieldProblem,
  type FundInput,
} from "../../services/api/adminFundCatalogue";
import { useFundCatalogueMeta } from "../../hooks/useFundCatalogue";

/**
 * Add a fund to the catalogue.
 *
 * The ASISA category is a dropdown rather than a text box, and picking one sets
 * the geography and asset class from the same record. Those three fields are
 * one fact split across three columns, so letting them be typed separately
 * invites a row that passes every individual check and is still incoherent —
 * "Global" geography on a South African category, say.
 *
 * Everything else is validated by the backend, which runs the same chain the
 * seed loader runs. Nothing is checked twice here: a second opinion in the
 * browser would be the one that drifts.
 *
 * A fund is created without a fact sheet. That is the honest order — the fund
 * exists as soon as it is identified, but it cannot be matched to anyone until
 * a dated document is recorded against it, which happens on its own page.
 */
export default function AddFundForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const { meta } = useFundCatalogueMeta();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [values, setValues] = useState<FundInput>({
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
    is_index_tracker: false,
    tfsa_eligible: false,
    platforms: ["EasyEquities"],
    mdd_page_url: "",
    curation_rule: "",
  });

  function pickCategory(name: string) {
    const category = meta?.categories.find((c) => c.name === name);
    setValues({
      ...values,
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
      // Empty optional fields are dropped rather than sent as "", which would
      // record an empty string where the answer is "we do not have one".
      const body = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== "" && v !== null),
      ) as unknown as FundInput;
      await createAdminFund(body);
      setValues({ ...values, isin: "", name: "", jse_code: "", yahoo_symbol: "" });
      setOpen(false);
      await onCreated();
    } catch (e) {
      if (e instanceof ValidationError) {
        // Covers a duplicate ISIN too: the client attaches that to the isin
        // field so it shows on the box rather than in the footer.
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

  const unattached = problems.filter((p) => !p.field);
  const isEtf = values.vehicle === "etf";

  return (
    <section className="soft-card space-y-3 p-5">
      <h2 className="text-sm font-bold text-brand-primary">Add a fund</h2>
      <p className="text-xs leading-relaxed text-brand-secondary/70">
        Identify the fund from its own fact sheet. It will be listed straight away and can be
        matched to someone once a fact sheet is recorded against it, which happens on its page.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="ISIN" value={values.isin} onChange={(v) => setValues({ ...values, isin: v })} problems={problems} name="isin" />
        <Field label="Fund name" value={values.name} onChange={(v) => setValues({ ...values, name: v })} problems={problems} name="name" />
        <Field label="Manager (the brand)" value={values.fund_house} onChange={(v) => setValues({ ...values, fund_house: v })} problems={problems} name="fund_house" />
        <Field label="Management company (issues the sheet)" value={values.manco} onChange={(v) => setValues({ ...values, manco: v })} problems={problems} name="manco" />

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-brand-secondary/80">Fund type</span>
          <select
            value={values.vehicle}
            onChange={(e) => setValues({ ...values, vehicle: e.target.value })}
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
            value={values.asisa_category}
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
          {values.asisa_category && (
            <span className="text-[11px] text-brand-secondary/60">
              {values.asisa_geography} · {values.asisa_asset_class}
            </span>
          )}
        </label>

        {/* Both are required for an ETF and neither applies to a unit trust,
            so the labels follow the chosen vehicle rather than claiming
            "optional" for a field the validators will insist on. */}
        <Field
          label={isEtf ? "JSE code (required)" : "JSE code (unit trusts may print one)"}
          value={values.jse_code ?? ""}
          onChange={(v) => setValues({ ...values, jse_code: v })}
          problems={problems}
          name="jse_code"
        />
        <Field
          label={isEtf ? "Price symbol, e.g. STX40.JO (required)" : "Price symbol (ETFs only)"}
          value={values.yahoo_symbol ?? ""}
          onChange={(v) => setValues({ ...values, yahoo_symbol: v })}
          problems={problems}
          name="yahoo_symbol"
        />
        <Field label="Manager's fund page" value={values.mdd_page_url ?? ""} onChange={(v) => setValues({ ...values, mdd_page_url: v })} problems={problems} name="mdd_page_url" />
        <Field label="Why it is in the catalogue" value={values.curation_rule ?? ""} onChange={(v) => setValues({ ...values, curation_rule: v })} problems={problems} name="curation_rule" />
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        <Check label="Index tracker" checked={values.is_index_tracker ?? false} onChange={(b) => setValues({ ...values, is_index_tracker: b })} />
        <Check label="Tax-free eligible" checked={values.tfsa_eligible ?? false} onChange={(b) => setValues({ ...values, tfsa_eligible: b })} />
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
          {saving ? "Adding…" : "Add fund"}
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
