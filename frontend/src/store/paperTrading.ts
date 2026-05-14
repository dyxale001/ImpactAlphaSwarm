import { create } from 'zustand';

export interface Trade {
  id: string;
  ticker: string;
  shares: number;
  price: number;
  side: "buy" | "sell";
  timestamp: string;
}

interface Holding {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
}

interface PaperTradingState {
  startingCapital: number;
  cash: number;
  holdings: Record<string, Holding>;
  trades: Trade[];
  reset: () => void;
}

const INITIAL_HOLDINGS = {
  "NVDA": { ticker: "NVDA", name: "NVIDIA Corp.", shares: 2, avgCost: 850.50 },
  "MSFT": { ticker: "MSFT", name: "Microsoft", shares: 4, avgCost: 405.20 }
};

const INITIAL_TRADES: Trade[] = [
  { id: "1", ticker: "NVDA", shares: 2, price: 850.50, side: "buy", timestamp: new Date(Date.now() - 86400000).toISOString() },
  { id: "2", ticker: "MSFT", shares: 4, price: 405.20, side: "buy", timestamp: new Date(Date.now() - 172800000).toISOString() }
];

export const usePaperTrading = create<PaperTradingState>((set) => ({
  startingCapital: 10000,
  cash: 10000 - (2 * 850.50) - (4 * 405.20),
  holdings: INITIAL_HOLDINGS,
  trades: INITIAL_TRADES,
  reset: () => set({ cash: 10000, holdings: {}, trades: [] }),
}));