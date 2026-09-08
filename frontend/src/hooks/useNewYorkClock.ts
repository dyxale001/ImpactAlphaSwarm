import { useState, useEffect } from "react";
import { newYorkNow, marketStatus } from "../utils/marketHours";

// A New York clock that reads correctly and updates when the displayed value changes,
// rather than on a fixed interval.
//
// The naive version is setInterval(1000), which re-renders sixty times for every change
// a reader can see. The next naive version is setInterval(60000), which drifts: start it
// at 09:29:59 and it ticks at 10:30:59, so the clock is up to a minute stale and the
// "Market open" pill can be a minute late for the open. Scheduling to the next minute
// BOUNDARY fixes both, and it also self-corrects after a laptop sleeps through an hour.
export function useNewYorkClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const scheduleNextMinute = () => {
      const current = new Date();
      setNow(current);
      // +50ms so a rounding wobble cannot land us just before the boundary and fire
      // twice in the same minute.
      const untilNextMinute =
        60_000 - (current.getSeconds() * 1000 + current.getMilliseconds()) + 50;
      timer = setTimeout(scheduleNextMinute, untilNextMinute);
    };

    scheduleNextMinute();
    return () => clearTimeout(timer);
  }, []);

  return { now, newYork: newYorkNow(now), status: marketStatus(now) };
}
