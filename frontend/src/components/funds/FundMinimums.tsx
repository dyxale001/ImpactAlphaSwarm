import {
  DETAIL_MINIMUMS_NOTE,
  DETAIL_MINIMUMS_TITLE,
  DETAIL_MIN_DEBIT_LABEL,
  DETAIL_MIN_LUMP_LABEL,
  formatRandAmount,
} from "../../utils/fundsCopy";

/**
 * What the manager asks for to open an account, and to keep paying in.
 *
 * The other field this page collected and never showed. It is also the most
 * concrete thing on a fund page for somebody deciding whether a fund is even
 * available to them: a risk label is a word, and "R500 a month" is an answer.
 *
 * ## Zero is not a minimum
 *
 * `formatRandAmount` returns null at or below zero, and this section renders
 * nothing when both figures do. That is not tidiness. `min_lump_sum` is
 * non-blank on fifteen of twenty-six sheets and **twelve of those are `0`** —
 * every FundRock boutique fund, all carrying `0`/`0`, which reads as one bulk
 * seed default rather than twelve separate readings. Only four funds carry a
 * real minimum.
 *
 * Rendered, a zero would say "you can start with nothing", which is a claim no
 * document made and a good deal more consequential than a blank. So the rule is
 * the strict one: a figure above zero, or no tile. If those twelve zeros turn
 * out to be real readings, correcting them to a figure is what makes the tile
 * appear — the page needs no change for that.
 *
 * ## The note
 *
 * These are the manager's terms, and almost nobody in this catalogue's audience
 * buys from the manager: they buy through EasyEquities, whose own minimum can be
 * lower or higher. Same caveat `DETAIL_PLATFORM_FEE_NOTE` makes about fees, for
 * the same reason.
 */
export default function FundMinimums({
  lumpSum,
  debitOrder,
  className = "",
}: {
  lumpSum: number | null;
  debitOrder: number | null;
  className?: string;
}) {
  const lump = formatRandAmount(lumpSum);
  const debit = formatRandAmount(debitOrder);
  if (!lump && !debit) return null;

  return (
    <section className={`soft-card flex flex-col gap-3 p-5 ${className}`}>
      <h2 className="text-sm font-bold text-brand-primary">{DETAIL_MINIMUMS_TITLE}</h2>

      <dl className="flex flex-col gap-2.5">
        {lump && <Minimum label={DETAIL_MIN_LUMP_LABEL} value={lump} />}
        {debit && <Minimum label={DETAIL_MIN_DEBIT_LABEL} value={debit} />}
      </dl>

      <p className="mt-auto text-[11px] leading-relaxed text-brand-secondary/60">
        {DETAIL_MINIMUMS_NOTE}
      </p>
    </section>
  );
}

/**
 * Whether this fund states a minimum at all.
 *
 * The page needs the answer before it decides what to render, and it has to be
 * the same answer this component gives — hence one function rather than a
 * second reading of the zero rule.
 */
export function hasMinimums(
  lumpSum: number | null | undefined,
  debitOrder: number | null | undefined,
) {
  return Boolean(formatRandAmount(lumpSum) || formatRandAmount(debitOrder));
}

function Minimum({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] text-brand-secondary/70">{label}</dt>
      <dd className="text-sm font-bold tabular-nums text-brand-primary">{value}</dd>
    </div>
  );
}
