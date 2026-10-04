
export const UNIVERSE_OPTIONS = [
  "Technology", "Green Energy", "Finance",
  "AI & Robotics", "Healthcare", "Media & Communications"
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
    tagline: 'Slow and steady',
    desc: 'Grow your money gradually over many years. Large, well known companies that share their profits with you.',
  },
  {
    id: 'growth_seeker',
    label: 'Growth Seeker',
    icon: '🚀',
    tagline: 'Bold bets, big upside',
    desc: 'Back young companies early and accept big price swings for the chance of much bigger gains.',
  },
  {
    id: 'trend_rider',
    label: 'Trend Rider',
    icon: '📈',
    tagline: "Follow what's moving",
    desc: 'Go with the shares that are rising and move your money quickly when the market changes.',
  },
  {
    id: 'value_hunter',
    label: 'Value Hunter',
    icon: '💎',
    tagline: 'Patient bargain hunter',
    desc: 'Find good companies whose shares look too cheap, then wait for everyone else to notice.',
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
  { ticker: 'AMZN',  name: 'Amazon',         sector: 'Technology',    emoji: '📦', description: 'E-commerce & AWS cloud' },
  { ticker: 'ORCL',  name: 'Oracle',         sector: 'Technology',    emoji: '🗄️', description: 'Databases & cloud' },
  // Media & Communications
  { ticker: 'GOOGL', name: 'Google',         sector: 'Media & Communications', emoji: '🔍', description: 'Search, YouTube, ads' },
  { ticker: 'META',  name: 'Meta',           sector: 'Media & Communications', emoji: '👓', description: 'Facebook, Instagram, VR' },
  { ticker: 'NFLX',  name: 'Netflix',        sector: 'Media & Communications', emoji: '🎬', description: 'Streaming & content' },
  { ticker: 'DIS',   name: 'Disney',         sector: 'Media & Communications', emoji: '🏰', description: 'Films, parks & Disney+' },
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
      { value: "3", label: "Willing to take risks, but only after doing my research" },
      { value: "2", label: "Cautious" },
      { value: "1", label: "A real risk avoider" }
    ]
  },
  {
    id: "q_game_show",
    question: "2. You are on a TV game show and can choose one of the following. Which would you take?",
    options: [
      { value: "1", label: "R10,000 in cash" },
      { value: "2", label: "A 1 in 2 chance of winning R50,000" },
      { value: "3", label: "A 1 in 4 chance of winning R100,000" },
      { value: "4", label: "A 1 in 20 chance of winning R1,000,000" }
    ]
  },
  {
    id: "q_vacation_loss",
    question: "3. You have just finished saving for a once in a lifetime holiday. Three weeks before you leave, you lose your job. What would you do?",
    options: [
      { value: "1", label: "Cancel the holiday" },
      { value: "2", label: "Take a much cheaper holiday" },
      { value: "3", label: "Go as planned, because you need the break before looking for a new job" },
      { value: "4", label: "Make the holiday longer, because this might be your last chance to travel in style" }
    ]
  },
  {
    id: "q_unexpected_windfall",
    question: "4. If you were suddenly given R200,000 to invest, what would you do with it?",
    options: [
      { value: "1", label: "Put it in a savings account or fixed deposit at the bank" },
      { value: "2", label: "Buy bonds, which means lending your money to the government or a big company for a steady, fixed return" },
      { value: "3", label: "Buy shares in companies, or a fund that holds shares in many companies" }
    ]
  },
  {
    id: "q_experience_comfort",
    question: "5. Based on your experience so far, how comfortable are you investing in shares, either directly or through a fund?",
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
    question: "7. Most of your savings are in government bonds. These are a safe investment that pays you steady interest. Some experts now think bonds will lose value and that things like gold, property and oil will go up. What would you do?",
    options: [
      { value: "1", label: "Keep the bonds" },
      { value: "2", label: "Sell the bonds. Keep half the money in a savings account and put half into gold, property or similar" },
      { value: "3", label: "Sell the bonds and put all the money into gold, property or similar" },
      { value: "4", label: "Sell the bonds, put it all into gold, property or similar, and borrow money to buy even more" }
    ]
  },
  {
    id: "q_worst_best_case",
    question: "8. Here are four investments. Each one shows the most you could make and the most you could lose. Which would you choose?",
    options: [
      { value: "1", label: "Could make up to R2,000, at worst you get your money back" },
      { value: "2", label: "Could make up to R8,000, could lose up to R2,000" },
      { value: "3", label: "Could make up to R26,000, could lose up to R8,000" },
      { value: "4", label: "Could make up to R48,000, could lose up to R24,000" }
    ]
  },
  {
    id: "q_portfolio_allocation",
    question: "9. If you had R200,000 to invest, how would you most like to split it?",
    hint: "Safe means a savings account. Middle means large, well known companies. Risky means small or new companies.",
    options: [
      { value: "1", label: "Mostly safe: R120,000 safe, R60,000 middle, R20,000 risky" },
      { value: "2", label: "Balanced: R60,000 safe, R80,000 middle, R60,000 risky" },
      { value: "3", label: "Mostly risky: R20,000 safe, R80,000 middle, R100,000 risky" }
    ]
  },
  {
    id: "q_geologist_mine",
    question: "10. A friend is raising money to search for gold. If they find it, you could get back 50 to 100 times what you put in. If they don't, you lose everything. There is only a 1 in 5 chance they find gold. How much would you put in?",
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
    question: "11. How well do you understand money matters like budgeting, saving and investing?",
    options: [
      { value: "1", label: "1 (not at all)" }, { value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }, { value: "5", label: "5 (very well)" }
    ]
  },
  // Questions 12 to 14 test knowledge, so their wording avoids jargon without
  // explaining the idea being tested (compounding, inflation, diversification).
  {
    id: "q_financial_math",
    question: "12. You put R1,000 in a savings account that pays 2% interest a year. You leave it there for 5 years without touching it. How much will be in the account?",
    options: [
      { value: "3", label: "More than R1,020" },
      { value: "2", label: "Exactly R1,020" },
      { value: "1", label: "Less than R1,020" }
    ]
  },
  {
    id: "q_inflation",
    question: "13. Your savings account pays 1% interest a year, and prices in the shops go up by 2% a year. After one year, what could you buy with that money?",
    options: [
      { value: "1", label: "More than today" },
      { value: "2", label: "Exactly the same" },
      { value: "3", label: "Less than today" }
    ]
  },
  {
    id: "q_diversification",
    question: "14. True or false: buying shares in one company is usually safer than buying a fund that spreads your money across many companies.",
    options: [
      { value: "1", label: "True" },
      { value: "3", label: "False" }
    ]
  },
  {
    id: "q_investment_participation",
    question: "15. You can pay to enter a coin toss. Heads, you get R1,000,000. Tails, you get R500,000. What is the most you would pay to enter?",
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
      { value: "partner", label: "Not married but living with a partner" },
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
    question: "20. Roughly how much does your household earn in a year, before tax?",
    options: [
      { value: "tier_1", label: "Less than R250,000" }, // Low capacity
      { value: "tier_2", label: "R250,000 - R499,999" },
      { value: "tier_3", label: "R500,000 - R749,999" },
      { value: "tier_4", label: "R750,000 - R999,999" },
      { value: "tier_5", label: "R1,000,000 or greater" } // High capacity
    ]
  }
]

// --- PHASE 2b: GOALS ---
//
// Four questions about what the money is for, asked before the risk questions
// because they are the easier ones to answer and they frame what follows.
//
// Kept OUT of SURVEY_QUESTIONS deliberately, for two reasons. The risk scorer
// sums every answer whose id starts with `q_`, and reads `demo_age` and
// `demo_income` by name, so an id in either style would silently join someone's
// risk score. And the assessment progress counter counts SURVEY_QUESTIONS, which
// should go on measuring the assessment.
//
// Each question maps to something a fund manager already publishes — the minimum
// investment term on a fact sheet, the liquidity and income categories of the
// ASISA classification, tax-free eligibility, the stated minimums — so the funds
// page filters on disclosed labels rather than on an opinion of ours. See
// `utils/goals.ts`.
export const GOAL_QUESTIONS = [
  {
    id: "goal_horizon",
    question: "When do you expect to need this money?",
    options: [
      { value: "under_2", label: "Within the next 2 years" },
      { value: "2_to_5", label: "In 2 to 5 years" },
      { value: "5_plus", label: "In 5 years or more" }
    ]
  },
  {
    id: "goal_purpose",
    question: "What is this money for?",
    options: [
      { value: "emergency_fund", label: "An emergency fund I may need at short notice" },
      { value: "goal", label: "A particular goal, like a deposit or a car" },
      { value: "growth", label: "Long-term growth" },
      { value: "income", label: "An income I can draw on" }
    ]
  },
  {
    id: "goal_account_type",
    question: "Which kind of account are you investing through?",
    options: [
      { value: "tfsa", label: "A tax-free savings account (TFSA)" },
      { value: "discretionary", label: "An ordinary investment account" },
      { value: "unsure", label: "I am not sure yet" }
    ]
  },
  {
    id: "goal_contribution",
    question: "How do you plan to put money in?",
    options: [
      { value: "lump_sum", label: "One amount up front" },
      { value: "monthly", label: "A monthly amount" },
      { value: "both", label: "Both" }
    ]
  }
]