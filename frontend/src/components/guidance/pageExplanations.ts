export type ExplanationCard = { title: string; body: string };
export type PageExplanation = {
  title: string;
  introduction: string;
  process: { title: string; steps: ExplanationCard[] };
  interpretation?: { title: string; cards: ExplanationCard[] };
  example: { title: string; body: string };
  limitations: { title: string; paragraphs: string[] };
  nextSteps?: { title: string; body: string };
  caveat: string;
};

/** Static guidance only; all claims describe existing page and source behaviour. */
export const PAGE_EXPLANATIONS = {
  stocks: {
    title: 'How Stocks works',
    introduction: 'Each analysis run reads the news, social posts and price history for the US stocks in your sectors and on your watchlist, measures every stock two ways, and lists them in order for your profile. Every place comes with a plain-language reason, so you can see what the evidence shows and decide for yourself.',
    process: { title: 'From your run to this list', steps: [
      { title: 'Gather the evidence', body: 'News from the past 7 days, social posts from the past 2 days and about a year of daily prices, for every stock in your sectors and on your watchlist.' },
      { title: 'Measure it two ways', body: 'One engine reads the tone of what is being written; the other measures how the price has behaved. Neither sees the other’s answer.' },
      { title: 'Order it for you', body: 'Four disclosed factors decide each place. Saved sector preferences and watched stocks affect subsequent runs. Changing them does not rewrite an older run.' },
      { title: 'Explain each place', body: 'The top result and the shortlist carry a written reason. Also scored lists every other stock from the run in the same order.' },
    ] },
    example: { title: 'Same news, different evidence', body: 'Two stocks can have similar sentiment but different price evidence. Their analysis can differ even when the headlines sound alike. This illustrates the inputs; it does not predict which stock will perform better.' },
    limitations: { title: 'Dates and missing evidence', paragraphs: [
      'The displayed run price was captured for that analysis; it is not a live quote. The analysis-run timestamp identifies the run, not the latest market observation. The sentiment update time and exchange clock describe different things.',
      'Check the source dates and available evidence before interpreting a result. Missing evidence limits the conclusion; it should not be read as proof of a neutral result.',
    ] },
    caveat: 'Rankings describe the recorded analysis. They are not instructions to buy, sell or hold, and no score is a probability of profit.',
  },
  funds: {
    title: 'How Funds works',
    introduction: 'Browse the catalogue or explore the funds returned by AlphaSwarm’s fixed matching rules. Each view answers a different question.',
    process: { title: 'How matching works', steps: [
      { title: 'Read your saved inputs', body: 'The rules use your risk profile and available goal answers.' },
      { title: 'Apply the fund rules', body: 'Published risk, fund category, time horizon and purpose can affect the result. Choosing a tax-free account also requires TFSA eligibility. A match does not confirm that contributions are affordable.' },
      { title: 'Explain the result', body: 'The page shows the applied inputs and a reason for each match. The rules filter the available catalogue; they do not select a fund for you.' },
    ] },
    interpretation: { title: 'Two ways to explore', cards: [
      { title: 'Matched funds', body: 'This section applies your saved risk profile and available goal answers to the fund information on record. Read the explanation beside each result.' },
      { title: 'Browse the catalogue', body: 'Browse independently using the category navigator and filters. Appearing in the catalogue does not mean a fund matches your profile.' },
    ] },
    example: { title: 'A stated term is a real constraint', body: 'If your horizon is two years and a factsheet states a five-year minimum term, that fund fails the horizon check. If the factsheet states no minimum term, the rule does not infer one or exclude the fund on that basis.' },
    limitations: { title: 'Read risk and missing information', paragraphs: [
      'Managers’ published indicators are mapped to a common five-level scale; seven-level indicators are converted. The original indicator is retained where available. If no usable published risk indicator is recorded, the fund remains browsable but cannot pass risk-based matching.',
      'Without a profile, the page asks you to complete it. With risk information but no usable goals, it can show risk-only matches. An empty matched section can also mean no available fund passed the rules.',
      'Review the factsheet date, costs, stated term and missing fields. A match does not mean the information is current or complete, and historical returns do not guarantee future results.',
    ] },
    nextSteps: { title: 'Continue exploring', body: 'Use the matching-input explanation and its existing profile link to review your answers, or browse the catalogue below the matched section.' },
    caveat: 'Matching is rule-based information, not a finding of suitability or financial advice.',
  },
  whales: {
    title: 'How Whale Watching works',
    introduction: 'Company insiders and big investors have to report what they own and what they trade. Whale Watching gathers those reports for the stocks AlphaSwarm tracks, so you can see who owns a company and who has been buying or selling it.',
    process: { title: 'What the page brings together', steps: [
      { title: 'Find a company', body: 'Browse a universe or search by name or ticker. A company opens with two tabs: Insider Trading and Big Investors.' },
      { title: 'Insider trading', body: 'Directors and executives report their own trades to the SEC on a Form 4. Open-market Buy/Sell labels differ from grants, exercises and other routine entries.' },
      { title: 'Big investors', body: 'Funds, banks and pension managers report what they hold once a quarter on a 13F filing, up to 45 days after the quarter ends.' },
      { title: 'Top funds', body: 'The largest holders across the companies we cover, and where each one is most invested. It is not a ranking of investment quality or a complete view of every fund.' },
    ] },
    interpretation: { title: 'Three dates on every record', cards: [
      { title: 'Traded', body: 'The transaction date: when the activity happened.' },
      { title: 'Filed', body: 'The filing or reporting date: when it was disclosed, or the date a reported holding describes. These dates are not interchangeable.' },
      { title: 'Fetched', body: 'When the information was fetched by AlphaSwarm. A newly retrieved record may still describe older activity, and reported holdings are a delayed snapshot, so a position may already have changed.' },
    ] },
    example: { title: 'More shares does not always mean a purchase', body: 'A share grant can increase an insider’s holding without an open-market purchase. An option exercise is also different from an ordinary share purchase. Likewise, a reported institutional holding does not establish that the institution still holds those shares today.' },
    limitations: { title: 'Sources and coverage', paragraphs: [
      'Insider records are obtained through Finnhub; institutional-holder information is obtained through yfinance. Results may be cached. Check the source and dates shown in the relevant panel. An empty result does not establish that no activity occurred.',
      'Disclosures do not reveal every transaction or an investor’s reasons. Top Funds reflects the reported positions available for tracked companies, not the whole market or each organisation’s complete portfolio.',
    ] },
    caveat: 'Observed disclosures do not predict future prices or provide a reason to copy a trade. Whale Watching research does not determine AlphaSwarm’s stock rankings.',
  },
} satisfies Record<string, PageExplanation>;
export type ExplanationPage = keyof typeof PAGE_EXPLANATIONS;
