import { Globe2, Newspaper, Tags, TextQuote } from 'lucide-react';
import {
  FILING_13F_LAG_DAYS,
  INSIDER_TTL_HOURS,
  INSIDER_WINDOW_DAYS,
  INSTITUTIONS_TTL_DAYS,
  MACRO_PULL_TIMES,
  MACRO_TAG_THRESHOLD_PCT,
} from '../../data/rankingMethodology';
import { Body, Bullets, Cards, Lead, MoreDetail, NotInRanking, Section, Steps, Strong, Timeline } from './MethodologyParts';

// The three reference tabs: who owns the stock, what its insiders did, and the news
// about its sector. None of them feeds the ranking.

export function InvestorsMethodology() {
  return (
    <>
      <Lead>
        Which funds, banks and pension managers own the stock, from the holdings large
        US investors must report every quarter.
      </Lead>

      <Section title="The three headline figures">
        <Cards cards={[
          { title: 'Held by institutions', body: 'The share of the company owned by institutions such as funds, banks and pension managers.' },
          { title: 'Institutions', body: 'How many reporting institutions hold the stock at all.' },
          { title: 'Insiders hold', body: "The share owned by the company's own executives and directors." },
          { title: 'Top holders', body: 'The largest holders, each with its stake, the value of that stake and how it changed in the latest filing.' },
        ]} />
      </Section>

      <Section title="How it reaches you">
        <Timeline points={[
          { title: 'Quarter ends', body: 'Large US investors must report what they held.' },
          { title: '13F filed', body: `Up to ${FILING_13F_LAG_DAYS} days later, so the picture is always a little behind.` },
          { title: 'Yahoo Finance', body: 'Compiles the filings into ownership figures.' },
          { title: 'This page', body: `Refreshed at most every ${INSTITUTIONS_TTL_DAYS} days, dated by the filing.` },
        ]} />
      </Section>

      <NotInRanking what="Ownership" />

      <MoreDetail title="More detail">
        <Bullets items={[
          <><Strong>Only the ten largest.</Strong> The source lists each company's ten largest holders, so a fund appears only where it is one of them, and a fund that sold out entirely cannot appear.</>,
          <><Strong>Dates.</Strong> Each holder is dated by its own filing, not by when we fetched it.</>,
          <><Strong>The written summary.</Strong> Where shown, an AI model explains the headline figures and top holders from the latest filing. Every number must be one it was given, and wording that advises or predicts is rejected. It describes who reported owning the stock, not the share price.</>,
          <><Strong>Coverage.</Strong> US-listed stocks only. A famous name on the list is not by itself a sign of quality.</>,
        ]} />
      </MoreDetail>
    </>
  );
}

export function InsidersMethodology() {
  return (
    <>
      <Lead>
        Shares the company's own executives, directors and large owners bought or sold,
        from the forms they must file with the US regulator within two business days of
        a trade.
      </Lead>

      <Section title="Which dealings count as buying or selling">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="as-inset flex flex-col gap-2 p-4">
            <div className="flex flex-wrap gap-1.5">
              <span className="chip chip-up">Bought</span>
              <span className="chip chip-down">Sold</span>
            </div>
            <p className="text-xs leading-relaxed text-brand-muted-fg">
              Only open-market purchases and sales: a decision to buy or sell at the market
              price. These show a price and a value.
            </p>
          </div>
          <div className="as-inset flex flex-col gap-2 p-4">
            <div className="flex flex-wrap gap-1.5">
              {['Grant', 'Option exercise', 'Tax withholding', 'Gift'].map(label => <span key={label} className="chip">{label}</span>)}
            </div>
            <p className="text-xs leading-relaxed text-brand-muted-fg">
              Everything else is pay or paperwork, so it gets a neutral label and no value.
              An option exercised at an old strike price is not a purchase.
            </p>
          </div>
        </div>
      </Section>

      <Section title="How it reaches you">
        <Timeline points={[
          { title: 'Insider trades', body: 'An executive, director or large owner deals in the shares.' },
          { title: 'Form 4 filed', body: 'Within about two business days, with the US regulator.' },
          { title: 'Finnhub', body: 'Collects the filings, with roles from Yahoo Finance.' },
          { title: 'This page', body: `The last ${INSIDER_WINDOW_DAYS} days, refreshed at most every ${INSIDER_TTL_HOURS} hours.` },
        ]} />
      </Section>

      <NotInRanking what="Insider dealing" />

      <MoreDetail title="More detail">
        <Bullets items={[
          <><Strong>Batches.</Strong> One person's same-day dealings of the same kind are added into one row, shown as "N shares in K trades" at their average price.</>,
          <><Strong>The window.</Strong> A dealing leaves the list on the day it falls outside the last {INSIDER_WINDOW_DAYS} days.</>,
          <><Strong>The written summary.</Strong> Where shown, an AI model describes the most notable dealing and any cluster of insiders trading together. It states any price move since as a fact, never as caused by the dealing, and it never says what you should do.</>,
          <><Strong>Coverage.</Strong> US-listed stocks only.</>,
        ]} />
      </MoreDetail>
    </>
  );
}

export function MarketNewsMethodology() {
  return (
    <>
      <Lead>
        News about the stock's sector and the wider market, not about the company itself.
      </Lead>

      <Section title="How it is put together">
        <Steps steps={[
          { icon: Newspaper, title: 'Collect', body: <>General market news from Tier 1 and Tier 2 publishers, three times a day ({MACRO_PULL_TIMES.join(', ')} New York time).</> },
          { icon: Tags, title: 'Tag by sector', body: <>An AI model rates how relevant each story is to the market and to each sector. A story is tagged where relevance is {MACRO_TAG_THRESHOLD_PCT}% or more.</> },
          { icon: TextQuote, title: 'Summarise', body: <>A short overview per sector, which never says whether the news is good or bad, predicts or advises.</> },
          { icon: Globe2, title: 'Match the stock', body: <>This tab shows the overview and stories for the stock's own sector, plus market-wide news.</> },
        ]} />
        <Body>
          Relevance is how closely a story concerns a sector, <Strong>not</Strong> whether it
          is positive or negative, and not a likelihood of any price move.
        </Body>
      </Section>

      <NotInRanking what="Market news" />
    </>
  );
}
