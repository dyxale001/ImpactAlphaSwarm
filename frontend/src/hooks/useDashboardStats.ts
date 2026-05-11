import { useState, useMemo } from "react";
import { MOCK_RECOMMENDATIONS, type AssetRecommendation } from "../data/mockData";

export function useDashboardStats() {
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    const topPick = MOCK_RECOMMENDATIONS[0];
    const total = MOCK_RECOMMENDATIONS.length;

    const filteredRecs = MOCK_RECOMMENDATIONS.slice(1).filter(
      (a: AssetRecommendation) =>
        a.ticker.toLowerCase().includes(search.toLowerCase()) ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.category.toLowerCase().includes(search.toLowerCase())
    );

    const avgConfidence = Math.round(
      MOCK_RECOMMENDATIONS.reduce((s: number, a: AssetRecommendation) => s + a.confidenceScore, 0) / total
    );
    
    const hypeCount = MOCK_RECOMMENDATIONS.filter((a: AssetRecommendation) => a.hypeAlert).length;
    const strong = MOCK_RECOMMENDATIONS.filter((a: AssetRecommendation) => a.confidenceScore >= 70).length;
    const moderate = MOCK_RECOMMENDATIONS.filter((a: AssetRecommendation) => a.confidenceScore >= 50 && a.confidenceScore < 70).length;
    const cautious = MOCK_RECOMMENDATIONS.filter((a: AssetRecommendation) => a.confidenceScore < 50).length;

    const pct = (n: number) => Math.round((n / total) * 100);
    const sparkPoints = MOCK_RECOMMENDATIONS.map((a: AssetRecommendation, i: number) => `${i * 18},${40 - (a.confidenceScore / 100) * 32}`).join(" ");

    return {
      topPick,
      filteredRecs,
      avgConfidence,
      hypeCount,
      strong,
      moderate,
      cautious,
      total,
      pct,
      sparkPoints
    };
  }, [search]);

  return { search, setSearch, ...stats };
}