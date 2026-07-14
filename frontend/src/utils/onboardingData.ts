
export const UNIVERSE_OPTIONS = [
  "Technology", "Green Energy", "Finance", 
  "AI & Robotics", "Healthcare"
]

// ─── Investor paths ────────────────────────────────────────────────────────
export interface InvestorPath {
  id: string
  label: string
  icon: string
  tagline: string
  desc: string
}

export const INVESTOR_PATHS: InvestorPath[] = [
  {
    id: 'steady_builder',
    label: 'Steady Builder',
    icon: '🌳',
    tagline: 'Long-term, low drama',
    desc: 'Consistent compounding over years, not overnight wins. Blue chips, dividends, patience.',
  },
  {
    id: 'growth_seeker',
    label: 'Growth Seeker',
    icon: '🚀',
    tagline: 'High conviction, high upside',
    desc: 'Back disruptive companies early and stomach volatility for outsized returns.',
  },
  {
    id: 'trend_rider',
    label: 'Trend Rider',
    icon: '📈',
    tagline: 'Momentum-driven, stay current',
    desc: "Follow strong signals, rotate into what's moving, act on market momentum.",
  },
  {
    id: 'value_hunter',
    label: 'Value Hunter',
    icon: '💎',
    tagline: 'Contrarian, patient, fundamental',
    desc: "Spot undervalued companies the market has overlooked and hold until they're recognised.",
  },
]

// ─── Familiar assets for the picker ───────────────────────────────────────
export interface FamiliarAsset {
  ticker: string
  name: string
  sector: string   // matches UNIVERSE_OPTIONS
  emoji: string
  description: string
}

export const FAMILIAR_ASSETS: FamiliarAsset[] = [
  // Technology
  { ticker: 'AAPL',  name: 'Apple',          sector: 'Technology',    emoji: '🍎', description: 'iPhone, Mac, wearables' },
  { ticker: 'MSFT',  name: 'Microsoft',      sector: 'Technology',    emoji: '🪟', description: 'Windows, Office, Azure' },
  { ticker: 'GOOGL', name: 'Google',         sector: 'Technology',    emoji: '🔍', description: 'Search, YouTube, ads' },
  { ticker: 'META',  name: 'Meta',           sector: 'Technology',    emoji: '👓', description: 'Facebook, Instagram, VR' },
  { ticker: 'AMZN',  name: 'Amazon',         sector: 'Technology',    emoji: '📦', description: 'E-commerce & AWS cloud' },
  { ticker: 'NFLX',  name: 'Netflix',        sector: 'Technology',    emoji: '🎬', description: 'Streaming & content' },
  // AI & Robotics
  { ticker: 'NVDA',  name: 'NVIDIA',         sector: 'AI & Robotics', emoji: '🤖', description: 'AI chips & data centres' },
  { ticker: 'TSLA',  name: 'Tesla',          sector: 'AI & Robotics', emoji: '⚡', description: 'EVs, FSD & robotics' },
  { ticker: 'PLTR',  name: 'Palantir',       sector: 'AI & Robotics', emoji: '🔮', description: 'AI analytics & defence' },
  { ticker: 'ARM',   name: 'Arm Holdings',   sector: 'AI & Robotics', emoji: '💡', description: 'Chip architecture & AI' },
  // Green Energy
  { ticker: 'ENPH',  name: 'Enphase',        sector: 'Green Energy',  emoji: '☀️', description: 'Home solar microinverters' },
  { ticker: 'FSLR',  name: 'First Solar',    sector: 'Green Energy',  emoji: '🌞', description: 'Utility-scale solar panels' },
  { ticker: 'NEE',   name: 'NextEra Energy', sector: 'Green Energy',  emoji: '💨', description: 'Wind & solar utilities' },
  { ticker: 'PLUG',  name: 'Plug Power',     sector: 'Green Energy',  emoji: '🔋', description: 'Green hydrogen fuel cells' },
  // Finance
  { ticker: 'JPM',   name: 'JPMorgan',       sector: 'Finance',       emoji: '🏦', description: 'Largest US bank' },
  { ticker: 'V',     name: 'Visa',           sector: 'Finance',       emoji: '💳', description: 'Global payments network' },
  { ticker: 'PYPL',  name: 'PayPal',         sector: 'Finance',       emoji: '💸', description: 'Digital payments & Venmo' },
  { ticker: 'GS',    name: 'Goldman Sachs',  sector: 'Finance',       emoji: '⚜️', description: 'Investment banking' },
  // Healthcare
  { ticker: 'MRNA',  name: 'Moderna',        sector: 'Healthcare',    emoji: '💉', description: 'mRNA vaccines & therapies' },
  { ticker: 'JNJ',   name: 'J&J',            sector: 'Healthcare',    emoji: '🩺', description: 'Pharma, medtech, consumer' },
  { ticker: 'UNH',   name: 'UnitedHealth',   sector: 'Healthcare',    emoji: '🏥', description: 'Health insurance & care' },
  { ticker: 'ABBV',  name: 'AbbVie',         sector: 'Healthcare',    emoji: '🧬', description: 'Biopharmaceuticals' },
]

// Infer investment universe from familiar asset picks
export function inferUniverseFromAssets(tickers: string[]): string[] {
  const counts: Record<string, number> = {}
  tickers.forEach(ticker => {
    const asset = FAMILIAR_ASSETS.find(a => a.ticker === ticker)
    if (asset) counts[asset.sector] = (counts[asset.sector] || 0) + 1
  })
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([sector]) => sector)
}

// --- PHASE 2: FULL RISK & DEMOGRAPHIC SURVEY ---
export const SURVEY_QUESTIONS = [
  // --- RISK TOLERANCE ---
  {
    id: "q_friend_describe",
    question: "1. In general, how would your best friend describe you as a risk taker?",
    options: [
      { value: "4", label: "A real gambler" },
      { value: "3", label: "Willing to take risks after completing adequate research" },
      { value: "2", label: "Cautious" },
      { value: "1", label: "A real risk avoider" }
    ]
  },
  {
    id: "q_game_show",
    question: "2. You are on a TV game show and can choose one of the following. Which would you take?",
    options: [
      { value: "1", label: "R10,000 in cash" },
      { value: "2", label: "A 50% chance at winning R50,000" },
      { value: "3", label: "A 25% chance at winning R100,000" },
      { value: "4", label: "A 5% chance at winning R1,000,000" }
    ]
  },
  {
    id: "q_vacation_loss",
    question: "3. You have just finished saving for a 'once-in-a-lifetime' vacation. Three weeks before you plan to leave, you lose your job. You would:",
    options: [
      { value: "1", label: "Cancel the vacation" },
      { value: "2", label: "Take a much more modest vacation" },
      { value: "3", label: "Go as scheduled, reasoning that you need the time to prepare for a job search" },
      { value: "4", label: "Extend your vacation, because this might be your last chance to go first-class" }
    ]
  },
  {
    id: "q_unexpected_windfall",
    question: "4. If you unexpectedly received R200,000 to invest, what would you do?",
    options: [
      { value: "1", label: "Deposit it in a bank account, money market account, or an insured CD" },
      { value: "2", label: "Invest it in safe high quality bonds or bond mutual funds" },
      { value: "3", label: "Invest it in stocks or stock mutual funds" }
    ]
  },
  {
    id: "q_experience_comfort",
    question: "5. In terms of experience, how comfortable are you investing in stocks or stock mutual funds?",
    options: [
      { value: "1", label: "Not at all comfortable" },
      { value: "2", label: "Somewhat comfortable" },
      { value: "3", label: "Very comfortable" }
    ]
  },
  {
    id: "q_word_risk",
    question: "6. When you think of the word \"risk\" which of the following words comes to mind first?",
    options: [
      { value: "1", label: "Loss" },
      { value: "2", label: "Uncertainty" },
      { value: "3", label: "Opportunity" },
      { value: "4", label: "Thrill" }
    ]
  },
  {
    id: "q_bond_rotation",
    question: "7. Some experts are predicting prices of hard assets to increase in value; bond prices may fall, however, government bonds are relatively safe. Most of your assets are now in high-interest government bonds. What would you do?",
    options: [
      { value: "1", label: "Hold the bonds" },
      { value: "2", label: "Sell the bonds, put half the proceeds into money market accounts, and half into hard assets" },
      { value: "3", label: "Sell the bonds and put the total proceeds into hard assets" },
      { value: "4", label: "Sell the bonds, put all the money into hard assets, and borrow money to buy more" }
    ]
  },
  {
    id: "q_worst_best_case",
    question: "8. Given the best- and worst-case returns of the four investment choices below, which would you prefer?",
    options: [
      { value: "1", label: "R2,000 gain best case; R0 gain/loss worst case" },
      { value: "2", label: "R8,000 gain best case; R2,000 loss worst case" },
      { value: "3", label: "R26,000 gain best case; R8,000 loss worst case" },
      { value: "4", label: "R48,000 gain best case; R24,000 loss worst case" }
    ]
  },
  {
    id: "q_portfolio_allocation",
    question: "9. If you had to invest R200,000, which of the following investment choices would you find most appealing?",
    options: [
      { value: "1", label: "60% low-risk / 30% medium-risk / 10% high-risk" },
      { value: "2", label: "30% low-risk / 40% medium-risk / 30% high-risk" },
      { value: "3", label: "10% low-risk / 40% medium-risk / 50% high-risk" }
    ]
  },
  {
    id: "q_geologist_mine",
    question: "10. Your friend is funding an exploratory gold mine. The venture could pay back 50-100x, but if it's a bust, it's completely worthless. Chance of success is only 20%. How much would you invest?",
    options: [
      { value: "1", label: "Nothing" },
      { value: "2", label: "One month's salary" },
      { value: "3", label: "Three months' salary" },
      { value: "4", label: "Six months' salary" }
    ]
  },
  // --- FINANCIAL LITERACY ---
  {
    id: "q_financial_knowledge_self",
    question: "11. On a scale from one to five, how would you rate your overall understanding of personal-finance and money-management?",
    options: [
      { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }, { value: "5", label: "5" }
    ]
  },
  {
    id: "q_financial_math",
    question: "12. Suppose you had R1,000 in a savings account with a 2% yearly interest rate. After 5 years, if you left the money to grow, how much would you have?",
    options: [
      { value: "3", label: "More than R1,020" },
      { value: "2", label: "Exactly R1,020" },
      { value: "1", label: "Less than R1,020" }
    ]
  },
  {
    id: "q_inflation",
    question: "13. Imagine interest was 1% per year and inflation was 2% per year. After 1 year, how much would you be able to buy with the money in this account?",
    options: [
      { value: "1", label: "More than today" },
      { value: "2", label: "Exactly the same" },
      { value: "3", label: "Less than today" }
    ]
  },
  {
    id: "q_diversification",
    question: "14. True or false: \"Buying a single company's stock usually provides a safer return than a stock mutual fund\"",
    options: [
      { value: "1", label: "True" },
      { value: "3", label: "False" }
    ]
  },
  {
    id: "q_investment_participation",
    question: "15. You have a chance to make an investment returning either R500,000 or R1,000,000 (50% chance of each). What is the largest amount of money you would be willing to pay to participate?",
    options: [
      { value: "9", label: "R707,711" }, { value: "8", label: "R666,667" }, { value: "7", label: "R632,246" }, 
      { value: "5", label: "R585,566" }, { value: "3", label: "R559,978" }, { value: "1", label: "R544,499" }
    ]
  },
  // --- DEMOGRAPHICS (CAPACITY MODIFIERS) ---
  {
    id: "demo_gender",
    question: "16. What is your gender?",
    options: [
      { value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Prefer not to say" }
    ]
  },
  {
    id: "demo_age",
    question: "17. What is your current age in years?",
    options: [
      { value: "under_25", label: "Under 25" }, // Highest capacity
      { value: "25_34", label: "25-34" },
      { value: "35_44", label: "35-44" },
      { value: "45_54", label: "45-54" },
      { value: "55_64", label: "55-64" },
      { value: "65_74", label: "65-74" },      // Low capacity
      { value: "75_over", label: "75 and over" } // Lowest capacity
    ]
  },
  {
    id: "demo_marital",
    question: "18. What is your marital status?",
    options: [
      { value: "single", label: "Never married" },
      { value: "partner", label: "Not married but living with significant other" },
      { value: "married", label: "Married" },
      { value: "divorced", label: "Separated or Divorced" },
      { value: "widowed", label: "Widowed" }
    ]
  },
  {
    id: "demo_education",
    question: "19. What is the highest level of education you have completed?",
    options: [
      { value: "high_school", label: "High school graduate or less" },
      { value: "college_trade", label: "Some college/trade/vocational training" },
      { value: "bachelors", label: "Bachelors degree" },
      { value: "graduate", label: "Graduate or professional degree" }
    ]
  },
  {
    id: "demo_income",
    question: "20. What is your household's approximate annual gross income before taxes?",
    options: [
      { value: "tier_1", label: "Less than R250,000" }, // Low capacity
      { value: "tier_2", label: "R250,000 - R499,999" },
      { value: "tier_3", label: "R500,000 - R749,999" },
      { value: "tier_4", label: "R750,000 - R999,999" },
      { value: "tier_5", label: "R1,000,000 or greater" } // High capacity
    ]
  }
]