import { useNewYorkClock } from "../../hooks/useNewYorkClock";

// The New York time and whether the exchange is trading.
//
// Shown wherever a reader is looking at a US-listed price: the asset detail header,
// beside it, and the assets hub header, beside the "Last AI run" pill. Both places ask
// the same question for the same reason: the price on screen is a US listing quoted in
// rand, and what a reader needs to judge how live it is is what time it is where it
// trades and whether trading is happening at all. Neither is answerable from the
// reader's own clock: most of them are in South Africa, six or seven hours ahead, so "is
// the market open" asked locally is always the wrong question.
//
// `tone` exists because its homes sit on different grounds and, on the assets hub, sit
// INSIDE another element's own pill rather than standing as one. The asset page shows
// this on a light card as its own compact badge; the assets hub folds it into the FX
// strip's running line of text, separated by a bullet rather than a pill of its own,
// because that strip already states the exchange and currency every price on the page
// depends on and whether that exchange is trading is one more fact about the same thing,
// not a second, competing pill.
//
// `bare` switches between those two shapes. Non-bare draws the emerald/grey status chip
// this started as; bare drops the chip's own background and keeps only the dot, so it
// reads as one clause in a sentence rather than a badge nested inside another badge.
interface Props {
  tone?: "light" | "dark";
  bare?: boolean;
}

export function MarketClock({ tone = "light", bare = false }: Props) {
  const { newYork, status } = useNewYorkClock();
  const dark = tone === "dark";

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span
        className={`font-mono tabular-nums ${dark ? "text-brand-bg/70" : "text-brand-muted-fg"}`}
        title="Current time in New York"
      >
        {newYork.time}
        {/* The zone is what says this is not your clock. Without it a reader in
            Johannesburg sees a time seven hours off their own and reads it as a bug. */}
        <span className="ml-1 text-[10px] uppercase tracking-wide">{newYork.zone}</span>
      </span>
      <span
        className={`inline-flex items-center gap-1.5 font-medium ${
          bare
            ? dark
              ? "text-brand-bg"
              : "text-brand-fg"
            : `px-2 py-0.5 rounded-full ${
                status.isOpen
                  ? dark
                    ? "bg-brand-accent/15 text-brand-accent"
                    : "bg-emerald-500/10 text-emerald-600"
                  : dark
                    ? "bg-white/10 text-brand-bg/60"
                    : "bg-slate-400/15 text-slate-500"
              }`
        }`}
        title={status.detail}
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            status.isOpen
              ? dark
                ? "bg-brand-accent"
                : "bg-emerald-500"
              : dark
                ? "bg-brand-bg/40"
                : "bg-slate-400"
          }`}
          aria-hidden="true"
        />
        {status.label}
        {/* Only worth saying while it is true. A half day matters most before 13:00,
            when the session is about to end three hours earlier than a reader expects. */}
        {status.isEarlyClose && status.isOpen ? " (half day)" : null}
      </span>
    </span>
  );
}
