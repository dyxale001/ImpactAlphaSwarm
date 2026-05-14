import { usePaperTrading } from "../store/paperTrading";
import { MOCK_RECOMMENDATIONS } from "../data/mockData";

export function usePortfolioStats() {
  const { cash, startingCapital, holdings, trades, reset } = usePaperTrading();

  const priceMap = Object.fromEntries(MOCK_RECOMMENDATIONS.map((a) => [a.ticker, a.price]));

  const holdingsList = Object.values(holdings).map((h) => {
    const price = priceMap[h.ticker] ?? h.avgCost; // Fetch simulated active price or fall back to buying price
    const marketValue = h.shares * price;
    const costBasis = h.shares * h.avgCost;
    const pnl = marketValue - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    return { ...h, price, marketValue, costBasis, pnl, pnlPct };
  });

  const investedValue = holdingsList.reduce((s, h) => s + h.marketValue, 0);
  const totalValue = cash + investedValue;
  const totalReturn = ((totalValue - startingCapital) / startingCapital) * 100;

  return {
    cash,
    startingCapital,
    trades,
    holdingsList,
    investedValue,
    totalValue,
    totalReturn,
    reset
  };
}