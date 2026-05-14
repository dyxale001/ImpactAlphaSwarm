import { useMemo } from 'react';
import { MOCK_RECOMMENDATIONS, SENTIMENT_DATA, QUANT_INDICATORS } from '../data/mockData';

export function useResearchData() {
  const hypeAlerts = useMemo(() => {
    return MOCK_RECOMMENDATIONS.filter((r) => r.hypeAlert);
  }, []);

  return {
    hypeAlerts,
    sentimentData: SENTIMENT_DATA,
    quantData: QUANT_INDICATORS
  };
}