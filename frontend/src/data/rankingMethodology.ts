// Ranking constants the methodology copy quotes. Each mirrors a
// backend value, named beside it, so the explanation cannot quietly drift from
// what the code does. Change them together.

// ranking.py W_QUANT / W_SENT: price and tone each count half towards strength.
export const STRENGTH_PRICE_WEIGHT_PCT = 50;

// ranking.py floors: no single weak factor can zero a stock.
export const AGREEMENT_FLOOR = 0.1;
export const DEPTH_FLOOR = 0.2;
export const FIT_FLOOR = 0.3;

// ranking.py DS_* saturation points: the evidence that earns full marks.
export const DEPTH_FULL_ARTICLES = 10;
export const DEPTH_FULL_POSTS = 25;
export const DEPTH_FULL_PRICE_DAYS = 120;

// ranking.py ProfileFit: only a Conservative profile is affected, above this beta.
export const FIT_BETA_THRESHOLD = 1.2;

// ranking.py TIE_BAND: scores closer than this keep the previous night's order.
export const TIE_BAND = 0.02;

// langgraph_orchestrator: the shortlist the four factors order, and the stocks that
// get a written reasoning trace (REASONING_TRACE_TOP_N).
export const SHORTLIST_SIZE = 5;

// quant_analyst QUANT_MIN_UNIVERSE: fewer stocks than this and no percentiles.
export const QUANT_MIN_UNIVERSE = 10;
