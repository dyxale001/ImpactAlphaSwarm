// --- PHASE 1: FINANCIALS ---
export const RISK_PROFILES = [
  { id: 'Conservative', label: 'Conservative', desc: 'Prioritize capital preservation and reliable dividend scaling.', color: 'hover:border-semantic-info' },
  { id: 'Moderate', label: 'Moderate', desc: 'A balanced mandate. Capture upward momentum while hedging drawdowns.', color: 'hover:border-semantic-success' },
  { id: 'Aggressive', label: 'Aggressive', desc: 'High conviction, high reward. Rely on measured volatility for outperformance.', color: 'hover:border-brand-primary' },
  { id: 'Very Aggressive', label: 'Very Aggressive', desc: 'Frontier markets and heavy speculation. You thrive in deep market trends.', color: 'hover:border-semantic-danger' },
]

export const UNIVERSE_OPTIONS = [
  "Technology & AI", "Healthcare & Biotech", "Financials & Fintech", 
  "Real Estate", "Energy & Renewables", "Consumer Discretionary", "Emerging Markets", "Digital Assets"
]

// --- PHASE 2 & 3: PSYCHOLOGICAL PROFILING ---

export const SCENARIO_QUESTIONS = [
  {
    id: "q_market_crash",
    question: "A broader market correction triggers a 15% drop across your portfolio overnight. What is your immediate response?",
    options: [
      { value: "panic_sell", label: "Capital Preservation", desc: "Liquidate exposed positions to mitigate further downside risk." },
      { value: "ignore", label: "Strategic Patience", desc: "Maintain the current thesis. Short-term volatility is market noise." },
      { value: "buy_dip", label: "Opportunistic Entry", desc: "Identify fundamentally strong assets that are suddenly trading at a discount." }
    ]
  },
  {
    id: "q_hype_trend",
    question: "A new sector is dominating financial media, pushing valuations up 200%. How do you approach it?",
    options: [
      { value: "momentum", label: "Momentum Capture", desc: "Allocate capital to ride the institutional and retail momentum." },
      { value: "fundamentals", label: "Fundamental Diligence", desc: "Wait for earnings reports to validate if the valuation is justified." },
      { value: "contrarian", label: "Market Skepticism", desc: "Avoid entirely. Over-hyped sectors usually signal an impending correction." }
    ]
  },
  {
    id: "q_windfall",
    question: "You secure an unexpected R50,000 cash injection. How do you deploy it?",
    options: [
      { value: "safe_yield", label: "Income Generation", desc: "Deploy into high-yield savings, bonds, or fixed-income instruments." },
      { value: "index_fund", label: "Broad Exposure", desc: "Allocate into a diversified S&P 500 or global index tracker." },
      { value: "stock_picking", label: "Alpha Seeking", desc: "Concentrate into specific, high-conviction equities." }
    ]
  },
  {
    id: "q_ai_relationship",
    question: "How should AlphaSwarm format its strategic insights for you?",
    options: [
      { value: "mentor", label: "Educational", desc: "Explain the underlying mechanics and market terms (e.g., P/E Ratios)." },
      { value: "bottom_line", label: "Executive Summary", desc: "Provide high-level, actionable bullet points. Skip the deep math." },
      { value: "quant", label: "Institutional", desc: "Deliver raw data, technical indicators, and quantitative metrics." }
    ]
  }
]

export const SLIDER_QUESTIONS = [
  {
    id: "q_time_horizon",
    label: "What is the primary liquidity timeline for these investments?",
    leftLabel: "Short-Term (1-3 yrs)",
    rightLabel: "Long-Term (10+ yrs)"
  },
  {
    id: "q_control",
    label: "How heavily do you want to rely on the AI's recommendations?",
    leftLabel: "Guide my strategy entirely",
    rightLabel: "Just validate my own ideas"
  },
  {
    id: "q_risk_vs_reward",
    label: "Determine your central risk/reward tradeoff axis.",
    leftLabel: "Target 5% steady yields",
    rightLabel: "Risk parity for 25% upside"
  },
  {
    id: "q_financial_literacy",
    label: "Assess your current proficiency with financial modeling.",
    leftLabel: "Learning the basics",
    rightLabel: "Advanced corporate finance"
  }
]