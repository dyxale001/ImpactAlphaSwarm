import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FundPrices } from "../../services/api/fundCatalogue";
import { DETAIL_PRICE_TITLE } from "../../utils/fundsCopy";

/**
 * What a listed fund closed at on the JSE, in rand.
 *
 * Only ETFs have this. A unit trust is bought from its manager at a daily NAV
 * rather than traded, so there is no market price — the caller renders nothing
 * at all rather than an empty frame, because a blank chart reads as missing
 * data instead of as a fact about the vehicle.
 *
 * The axis starts at the series' own range rather than at zero. That is the
 * right call for a price — a fund trading between R109 and R114 shows nothing
 * useful zero-anchored — but it also exaggerates movement, which is exactly how
 * a price chart misleads. Hence the note under it, and hence no percentage
 * anywhere: the manager's published performance is the only performance shown,
 * and it is measured to the fact sheet's own date.
 */
export default function FundPriceChart({ prices }: { prices: FundPrices }) {
  if (!prices.listed || prices.closes.length < 2) return null;

  const data = prices.closes.map((point) => ({
    date: point.date,
    close: point.close_zar,
  }));
  const values = data.map((d) => d.close);
  const low = Math.min(...values);
  const high = Math.max(...values);
  // A little air so the line does not touch the frame.
  const pad = (high - low) * 0.08 || 1;

  return (
    <section className="soft-card space-y-3 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-brand-primary">{DETAIL_PRICE_TITLE}</h2>
        <span className="text-[11px] text-brand-secondary/70">
          {data[0].date} to {data[data.length - 1].date}
        </span>
      </div>

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "rgba(0,0,0,0.45)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={48}
            />
            <YAxis
              domain={[low - pad, high + pad]}
              tick={{ fontSize: 10, fill: "rgba(0,0,0,0.45)" }}
              tickLine={false}
              axisLine={false}
              width={46}
              tickFormatter={(v: number) => `R${v.toFixed(0)}`}
            />
            <Tooltip
              formatter={(v: number) => [`R${v.toFixed(2)}`, "Close"]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Line
              type="monotone"
              dataKey="close"
              stroke="#3e6258"
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] leading-relaxed text-brand-secondary/60">{prices.note}</p>
    </section>
  );
}
