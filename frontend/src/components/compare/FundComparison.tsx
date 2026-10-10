import { BrainCircuit, CalendarClock } from "lucide-react";
import type { CatalogueFundDetail } from "../../services/api/fundCatalogue";
import { VEHICLE_LABEL, formatPercent } from "../../utils/fundsCopy";
import { formatFullDate } from "../research/quantSeries";
import {
  DATE_GAP_WARN_DAYS,
  PERIOD_LABELS,
  commonPeriods,
  daysApart,
  fundDiffersMost,
  fundsSummary,
  partialPeriods,
  sharedHoldings,
  yearlyCost,
  type FundFacts,
} from "../../utils/compareFunds";
import {
  DIFFERS_MOST,
  FUNDS_DISCLAIMER,
  FUND_COST_MEANING,
  FUND_HOLDINGS_MEANING,
  FUND_RETURNS_MEANING,
  FUND_RISK_MEANING,
  FUND_SECTION_COST,
  FUND_SECTION_HOLDINGS,
  FUND_SECTION_RETURNS,
  FUND_SECTION_RISK,
  FUND_SECTION_WHAT,
  FUND_TRACE_BADGE,
  FUND_TRACE_DISCLOSURE,
  SAME,
  TRACE_TITLE,
  fundDateWarning,
} from "../../data/compareCopy";
import { CompareGrid, CompareRow, CompareSection, Missing, RowTag, Value, type CompareColumn } from "./CompareGrid";

// The fund side of the Compare page. Every figure is the manager's own, read off
// the dated fact sheet the fund's page shows, so the rules are about not setting
// unlike things beside each other: the sheet date on every column and a warning
// when they are months apart, only the return periods every fund reports, costs
// as one year on R10,000 with no growth (D-225), and "Reg 28 compliant", never
// "RA-approved".
//
// There is no Ask AlphaSwarm button on this side: the assistant does not read
// the funds catalogue yet (D-166), and a button that cannot answer is worse than
// none.

function sameText(values: Array<string | null | undefined>): boolean {
  return values.length >= 2 && values.every((v) => v && v === values[0]);
}

function yesNo(value: boolean | null | undefined, unknown = "Not stated"): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return unknown;
}

export function fundColumn(f: CatalogueFundDetail): CompareColumn {
  return {
    id: f.fund_id,
    title: f.jse_code ?? f.name,
    subtitle: f.jse_code ? f.name : f.fund_house,
    href: `/funds/${encodeURIComponent(f.fund_id)}`,
  };
}

export default function FundComparison({ funds }: { funds: CatalogueFundDetail[] }) {
  const columns = funds.map(fundColumn);
  const snaps = funds.map((f) => f.snapshot);

  const facts: FundFacts[] = funds.map((f) => ({
    code: f.jse_code ?? f.name,
    benchmark: f.snapshot?.benchmark ?? null,
    indexTracker: f.is_index_tracker,
    category: f.asisa_category ?? null,
    riskLevel: f.risk_level,
    ter: f.snapshot?.ter ?? f.ter,
    performance: f.snapshot?.performance ?? null,
    asOf: f.snapshot?.as_of ?? f.as_of,
  }));
  const shared = sharedHoldings(snaps.map((s) => s?.top_holdings));
  const summary = fundsSummary(facts, shared);
  const most = fundDiffersMost(facts);
  const gap = daysApart(facts.map((f) => f.asOf));
  const periods = commonPeriods(snaps.map((s) => s?.performance));
  const partial = partialPeriods(snaps.map((s) => s?.performance));

  const tag = (row: "ter" | "risk" | "return1y", alike: boolean) =>
    most === row ? <RowTag kind="differs">{DIFFERS_MOST}</RowTag> : alike ? <RowTag kind="alike">{SAME}</RowTag> : undefined;

  return (
    <div className="space-y-6">
      {gap !== null && gap > DATE_GAP_WARN_DAYS && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-[var(--radius-brand)] border border-semantic-warning/40 bg-semantic-warning/10 p-4 text-sm text-brand-fg"
        >
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" />
          <p>{fundDateWarning(gap)}</p>
        </div>
      )}

      {summary && (
        <section className="rounded-2xl border border-brand-accent bg-brand-bg/55 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-brand-fg">{TRACE_TITLE}</h2>
            <span className="rounded-full bg-brand-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-primary">
              {FUND_TRACE_BADGE}
            </span>
          </div>
          <div className="mt-3 rounded-xl border border-brand-border/60 bg-brand-surface/70 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-brand-muted-fg">
              <BrainCircuit className="h-3 w-3 text-brand-primary" />
              Reasoning trace
            </div>
            <p className="text-sm leading-relaxed text-brand-fg">{summary}</p>
            <p className="mt-2 text-[10px] text-brand-muted-fg">{FUND_TRACE_DISCLOSURE}</p>
          </div>
        </section>
      )}

      <CompareGrid columns={columns}>
        <CompareSection title={FUND_SECTION_WHAT} />
        <CompareRow
          label="Type"
          tag={sameText(funds.map((f) => f.vehicle)) ? <RowTag kind="alike">{SAME}</RowTag> : undefined}
          values={funds.map((f) => (
            <Value key={f.fund_id} main={VEHICLE_LABEL[f.vehicle] ?? f.vehicle} sub={f.fund_house} />
          ))}
        />
        <CompareRow
          label="ASISA category"
          tag={sameText(funds.map((f) => f.asisa_category)) ? <RowTag kind="alike">{SAME}</RowTag> : undefined}
          values={funds.map((f) => <span key={f.fund_id} className="text-xs leading-snug">{f.asisa_category || "—"}</span>)}
        />
        <CompareRow
          label="Benchmark"
          tag={sameText(snaps.map((s) => s?.benchmark)) ? <RowTag kind="alike">{SAME}</RowTag> : undefined}
          values={funds.map((f) => (
            <Value
              key={f.fund_id}
              main={f.snapshot?.benchmark || <Missing />}
              sub={f.is_index_tracker ? "Tracks this index" : "Actively managed against it"}
            />
          ))}
        />
        <CompareRow label="Tax-free account (TFSA)" values={funds.map((f) => (f.tfsa_eligible ? "Yes" : "Not stated"))} />
        <CompareRow
          label="Reg 28 compliant"
          values={snaps.map((s, i) => <span key={i}>{yesNo(s?.regulation_28, "Not on the sheet")}</span>)}
          note="Whether the fund meets the limits for retirement annuities. Whether a particular annuity offers it is that platform's choice."
        />

        <CompareSection title={FUND_SECTION_COST} />
        <CompareRow
          label="TER (yearly)"
          emphasis={most === "ter"}
          tag={tag("ter", sameText(facts.map((f) => (f.ter === null ? null : String(f.ter)))))}
          values={facts.map((f, i) =>
            f.ter !== null ? (
              <Value
                key={i}
                main={formatPercent(f.ter)}
                sub={`R${yearlyCost(f.ter)} a year on R10,000${snaps[i]?.fee_period ? ` · ${snaps[i]!.fee_period === "3y" ? "3-year" : "1-year"} figure` : ""}`}
              />
            ) : (
              <Missing key={i} />
            ),
          )}
          note={FUND_COST_MEANING}
        />

        <CompareSection title={FUND_SECTION_RISK} />
        <CompareRow
          label="Risk"
          emphasis={most === "risk"}
          tag={tag("risk", sameText(facts.map((f) => (f.riskLevel === null ? null : String(f.riskLevel)))))}
          values={funds.map((f) =>
            f.risk_level !== null ? (
              <Value key={f.fund_id} main={`${f.risk_level} of 5`} sub={f.risk_label} />
            ) : (
              <Missing key={f.fund_id}>Not published</Missing>
            ),
          )}
          note={FUND_RISK_MEANING}
        />
        <CompareRow
          label="Suggested minimum term"
          values={snaps.map((s, i) =>
            s?.recommended_min_term_years ? (
              `${s.recommended_min_term_years}+ years`
            ) : s?.horizon_words ? (
              <span key={i} className="text-xs leading-snug">{s.horizon_words}</span>
            ) : (
              <Missing key={i} />
            ),
          )}
        />

        <CompareSection title={FUND_SECTION_RETURNS} />
        {periods.length ? (
          periods.map((period, p) => (
            <CompareRow
              key={period}
              label={PERIOD_LABELS[period]}
              emphasis={period === "1y" && most === "return1y"}
              tag={period === "1y" && most === "return1y" ? <RowTag kind="differs">{DIFFERS_MOST}</RowTag> : undefined}
              values={snaps.map((s, i) => (
                <Value
                  key={i}
                  main={formatPercent(s!.performance![period])}
                  sub={gap !== null && gap > DATE_GAP_WARN_DAYS && s?.as_of ? `to ${formatFullDate(s.as_of)}` : undefined}
                />
              ))}
              note={
                p === periods.length - 1
                  ? `${FUND_RETURNS_MEANING}${partial.length ? ` Not shown: ${partial.map((x) => PERIOD_LABELS[x]).join(", ")}, which not every fund here reports.` : ""}`
                  : undefined
              }
            />
          ))
        ) : (
          <p className="px-4 py-3 text-xs text-brand-muted-fg">
            These funds do not report a common period, so their returns are not set side by side. Each fund's page shows its own.
          </p>
        )}

        <CompareSection title={FUND_SECTION_HOLDINGS} />
        <CompareRow
          label="Largest holdings"
          values={snaps.map((s, i) => {
            const top = s?.top_holdings
              ? Object.entries(s.top_holdings)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
              : [];
            return top.length ? (
              <ul key={i} className="space-y-0.5 text-xs font-normal">
                {top.map(([name, weight]) => (
                  <li key={name} className="flex justify-between gap-2">
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 tabular-nums text-brand-muted-fg">{formatPercent(weight)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Missing key={i}>Not on the sheet</Missing>
            );
          })}
          note={
            shared
              ? `${shared.shared} of the ${shared.of} largest holdings appear in every fund here. ${FUND_HOLDINGS_MEANING}`
              : FUND_HOLDINGS_MEANING
          }
        />

        <CompareSection title="Fact sheet" />
        <CompareRow
          label="Dated"
          values={facts.map((f, i) => (f.asOf ? formatFullDate(f.asOf) : <Missing key={i} />))}
        />
      </CompareGrid>

      <p className="max-w-3xl text-[11px] leading-relaxed text-brand-muted-fg">{FUNDS_DISCLAIMER}</p>
    </div>
  );
}
