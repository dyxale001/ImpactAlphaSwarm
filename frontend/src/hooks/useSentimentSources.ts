import { useMemo, useState } from "react";
import {
  sentimentBucket,
  sortItems,
  type SentimentBucket,
  type SortKey,
} from "../components/research/sourcePageControls";

type SourceItem = {
  date?: string;
  influence?: number;
  sentiment?: string;
  sentiment_score?: number;
  tier?: number | null;
};

// State and derived data for the full news / social sentiment pages: sentiment
// and tier filters, the sort key, per-bucket counts and the visible list.
export function useSentimentSources<T extends SourceItem>(items: T[]) {
  const [sentimentFilter, setSentimentFilter] = useState<
    SentimentBucket | "All"
  >("All");
  const [tierFilter, setTierFilter] = useState<number>(0); // 0 = all tiers
  const [sort, setSort] = useState<SortKey>("influence");

  const bucketCounts = useMemo(() => {
    const counts: Record<SentimentBucket, number> = {
      Positive: 0,
      Neutral: 0,
      Negative: 0,
    };
    for (const item of items) counts[sentimentBucket(item.sentiment)] += 1;
    return counts;
  }, [items]);

  const shown = useMemo(() => {
    let list = items;
    if (sentimentFilter !== "All") {
      list = list.filter(
        (item) => sentimentBucket(item.sentiment) === sentimentFilter,
      );
    }
    if (tierFilter !== 0) {
      list = list.filter((item) => item.tier === tierFilter);
    }
    return sortItems(list, sort);
  }, [items, sentimentFilter, tierFilter, sort]);

  return {
    sentimentFilter,
    setSentimentFilter,
    tierFilter,
    setTierFilter,
    sort,
    setSort,
    bucketCounts,
    shown,
  };
}
