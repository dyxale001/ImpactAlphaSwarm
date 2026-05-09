import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export interface Trade {
  id: string;
  ticker: string;
  name: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  timestamp: number;
}

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
}

interface PaperTradingState {
  cash: number;
  startingCapital: number;
  holdings: Record<string, Holding>;
  trades: Trade[];
  buy: (asset: { ticker: string; name: string; price: number }, shares: number) => { ok: boolean; error?: string };
  sell: (asset: { ticker: string; name: string; price: number }, shares: number) => { ok: boolean; error?: string };
  reset: () => void;
}

const STARTING_CAPITAL = 10000;
const STORAGE_KEY = "alphaswarm_paper_v1";

const PaperCtx = createContext<PaperTradingState | null>(null);

interface Persisted {
  cash: number;
  holdings: Record<string, Holding>;
  trades: Trade[];
}

function loadInitial(): Persisted {
  if (typeof window === "undefined") return { cash: STARTING_CAPITAL, holdings: {}, trades: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cash: STARTING_CAPITAL, holdings: {}, trades: [] };
    return JSON.parse(raw);
  } catch {
    return { cash: STARTING_CAPITAL, holdings: {}, trades: [] };
  }
}

export function PaperTradingProvider({ children }: { children: ReactNode }) {
  const initial = loadInitial();
  const [cash, setCash] = useState<number>(initial.cash);
  const [holdings, setHoldings] = useState<Record<string, Holding>>(initial.holdings);
  const [trades, setTrades] = useState<Trade[]>(initial.trades);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cash, holdings, trades }));
    } catch {
      // ignore
    }
  }, [cash, holdings, trades]);

  const value = useMemo<PaperTradingState>(() => ({
    cash,
    startingCapital: STARTING_CAPITAL,
    holdings,
    trades,
    buy: (asset, shares) => {
      if (shares <= 0) return { ok: false, error: "Enter a quantity greater than zero." };
      const cost = shares * asset.price;
      if (cost > cash) return { ok: false, error: "Not enough cash for this order." };
      setCash((c) => +(c - cost).toFixed(2));
      setHoldings((h) => {
        const existing = h[asset.ticker];
        if (!existing) {
          return { ...h, [asset.ticker]: { ticker: asset.ticker, name: asset.name, shares, avgCost: asset.price } };
        }
        const totalShares = existing.shares + shares;
        const avgCost = (existing.avgCost * existing.shares + asset.price * shares) / totalShares;
        return { ...h, [asset.ticker]: { ...existing, shares: totalShares, avgCost: +avgCost.toFixed(4) } };
      });
      setTrades((t) => [
        { id: crypto.randomUUID(), ticker: asset.ticker, name: asset.name, side: "buy", shares, price: asset.price, timestamp: Date.now() },
        ...t,
      ]);
      return { ok: true };
    },
    sell: (asset, shares) => {
      if (shares <= 0) return { ok: false, error: "Enter a quantity greater than zero." };
      const existing = holdings[asset.ticker];
      if (!existing || existing.shares < shares) return { ok: false, error: "You don't have enough shares to sell." };
      const proceeds = shares * asset.price;
      setCash((c) => +(c + proceeds).toFixed(2));
      setHoldings((h) => {
        const remaining = existing.shares - shares;
        if (remaining <= 0) {
          const { [asset.ticker]: _removed, ...rest } = h;
          return rest;
        }
        return { ...h, [asset.ticker]: { ...existing, shares: remaining } };
      });
      setTrades((t) => [
        { id: crypto.randomUUID(), ticker: asset.ticker, name: asset.name, side: "sell", shares, price: asset.price, timestamp: Date.now() },
        ...t,
      ]);
      return { ok: true };
    },
    reset: () => {
      setCash(STARTING_CAPITAL);
      setHoldings({});
      setTrades([]);
    },
  }), [cash, holdings, trades]);

  return <PaperCtx.Provider value={value}>{children}</PaperCtx.Provider>;
}

export function usePaperTrading() {
  const ctx = useContext(PaperCtx);
  if (!ctx) throw new Error("usePaperTrading must be used within PaperTradingProvider");
  return ctx;
}
