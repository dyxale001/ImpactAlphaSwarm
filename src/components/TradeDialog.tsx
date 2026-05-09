import { useMemo, useState, type ChangeEvent } from "react";
import { usePaperTrading } from "@/store/paperTrading";
import { toast } from "@/hooks/use-toast";
import { ShieldAlert, TrendingUp, Wallet, X } from "lucide-react";

interface TradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: { ticker: string; name: string; price: number };
}

export default function TradeDialog({ open, onOpenChange, asset }: TradeDialogProps) {
  const { cash, holdings, buy, sell } = usePaperTrading();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [sharesInput, setSharesInput] = useState("1");

  const shares = Math.max(0, Number(sharesInput) || 0);
  const total = shares * asset.price;
  const holding = holdings[asset.ticker];
  const ownedShares = holding?.shares ?? 0;

  const maxBuyShares = useMemo(() => Math.floor(cash / asset.price), [cash, asset.price]);

  if (!open) return null;

  const handleSubmit = () => {
    const result = side === "buy" ? buy(asset, shares) : sell(asset, shares);

    if (!result.ok) {
      toast({
        title: "Order rejected",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: `${side === "buy" ? "Bought" : "Sold"} ${shares} ${
        shares === 1 ? "share" : "shares"
      } of ${asset.ticker}`,
      description: `Paper trade at $${asset.price.toFixed(2)} per share. Total $${total.toFixed(2)}.`,
    });

    onOpenChange(false);
    setSharesInput("1");
  };

  const setMax = () => {
    if (side === "buy") setSharesInput(String(maxBuyShares));
    else setSharesInput(String(ownedShares));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              Trade {asset.ticker}
              <span className="text-xs font-normal text-muted-foreground">{asset.name}</span>
            </h2>

            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5 text-warning" />
              Paper trading only. No real money is moved.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close trade dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary/60 p-1">
          <button
            type="button"
            onClick={() => setSide("buy")}
            className={`rounded-md py-2 text-sm font-semibold transition-colors ${
              side === "buy"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Buy
          </button>

          <button
            type="button"
            onClick={() => setSide("sell")}
            className={`rounded-md py-2 text-sm font-semibold transition-colors ${
              side === "sell"
                ? "bg-danger text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sell
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border border-border/60 bg-secondary/40 p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Price</p>
            <p className="mt-1 text-sm font-mono font-semibold">${asset.price.toFixed(2)}</p>
          </div>

          <div className="rounded-lg border border-border/60 bg-secondary/40 p-3">
            <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              <Wallet className="h-3 w-3" /> Cash
            </p>
            <p className="mt-1 text-sm font-mono font-semibold">${cash.toFixed(2)}</p>
          </div>

          <div className="rounded-lg border border-border/60 bg-secondary/40 p-3">
            <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              <TrendingUp className="h-3 w-3" /> Owned
            </p>
            <p className="mt-1 text-sm font-mono font-semibold">{ownedShares}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="shares" className="text-sm font-medium">
              Shares
            </label>

            <button
              type="button"
              onClick={setMax}
              className="text-xs text-primary hover:underline"
            >
              Max ({side === "buy" ? maxBuyShares : ownedShares})
            </button>
          </div>

          <input
            id="shares"
            type="number"
            min="0"
            step="1"
            value={sharesInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSharesInput(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/40 p-3">
          <span className="text-sm text-muted-foreground">Estimated total</span>
          <span className="text-lg font-mono font-bold">${total.toFixed(2)}</span>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={shares <= 0}
            className={`rounded-md px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
              side === "sell"
                ? "bg-danger text-primary-foreground hover:bg-danger/90"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {side === "buy" ? "Place Buy Order" : "Place Sell Order"}
          </button>
        </div>
      </div>
    </div>
  );
}