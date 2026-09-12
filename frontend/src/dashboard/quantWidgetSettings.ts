// The one setting a quant widget keeps for itself: which horizon it shows.
//
// Stored in the widget's own settings, beside its ticker, so two copies of the
// price window can sit on the board showing the same asset over a month and
// over five years. Pure and registry-free, like layoutSchema, so it is testable
// on its own.

import {
  DEFAULT_QUANT_HORIZON,
  QUANT_HORIZONS,
  type QuantHorizon,
} from "../data/quantExplainers";
import type { WidgetSettings } from "./layoutSchema";

export const HORIZON_SETTING = "horizon";

/** The horizon a widget's settings name, or the default when they name none or
 *  name one this build does not offer. Case-insensitive, since the value goes
 *  through a JSON column anyone can edit. */
export function readHorizon(settings: WidgetSettings | undefined): QuantHorizon {
  const raw = settings?.[HORIZON_SETTING];
  if (typeof raw !== "string") return DEFAULT_QUANT_HORIZON;
  const key = raw.trim().toUpperCase();
  return (QUANT_HORIZONS as string[]).includes(key)
    ? (key as QuantHorizon)
    : DEFAULT_QUANT_HORIZON;
}
