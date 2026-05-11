import { useResearchData } from "../hooks/useResearchData";
import HypeAlerts from "../components/research/HypeAlerts";
import SentimentScout from "../components/research/SentimentScout";
import QuantAnalyst from "../components/research/QuantAnalyst";

export default function ResearchPage() {
  const { hypeAlerts, sentimentData, quantData } = useResearchData();

  return (
    <div className="space-y-8 max-w-7xl mx-auto pt-10 px-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-brand-fg">Research Deep Dive</h1>
        <p className="text-brand-muted-fg text-sm mt-1">Explore the reasoning traces behind every recommendation.</p>
      </div>

      <HypeAlerts alerts={hypeAlerts} />
      <SentimentScout data={sentimentData} />
      <QuantAnalyst data={quantData} />
    </div>
  );
}