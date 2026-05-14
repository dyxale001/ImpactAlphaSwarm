export const determinePsychometrics = (surveyAnswers: Record<string, string>) => {
  let riskToleranceScore = 0;

  // 1. Calculate Base Risk Tolerance (Questions 1 - 15)
  Object.keys(surveyAnswers).forEach((key) => {
    if (key.startsWith('q_') && !['q_financial_knowledge_self', 'q_financial_math', 'q_inflation', 'q_diversification'].includes(key)) {
      const val = parseInt(surveyAnswers[key] || "0", 10);
      riskToleranceScore += val;
    }
  });

  // Approx Max score for pure risk questions is ~45
  const baseTolerancePercentage = Math.min((riskToleranceScore / 45) * 100, 100);

  // 2. Assess Risk Capacity (Demographics)
  let capacityMultiplier = 1.0; 

  const age = surveyAnswers['demo_age'];
  if (age === 'under_25' || age === '25_34') capacityMultiplier += 0.15; 
  if (age === '55_64') capacityMultiplier -= 0.15; 
  if (age === '65_74' || age === '75_over') capacityMultiplier -= 0.30; 

  const income = surveyAnswers['demo_income'];
  if (income === 'tier_1') capacityMultiplier -= 0.15; 
  if (income === 'tier_4' || income === 'tier_5') capacityMultiplier += 0.10; 

  // 3. Calculate Final Adjusted Score
  const finalRiskScore = baseTolerancePercentage * capacityMultiplier;

  let calculatedArchetype = "Moderate Growth Investor"; 
  let calculatedExpertise: 'novice' | 'intermediate' | 'advanced' = 'intermediate';

  // 4. Expertise check
  const literacyScore = 
    parseInt(surveyAnswers['q_financial_knowledge_self'] || "0") + 
    (parseInt(surveyAnswers['q_financial_math'] || "0") > 1 ? 1 : 0) +
    (parseInt(surveyAnswers['q_inflation'] || "0") === 3 ? 1 : 0) +
    (parseInt(surveyAnswers['q_diversification'] || "0") === 3 ? 1 : 0);
    
  if (literacyScore >= 6) calculatedExpertise = 'advanced';
  else if (literacyScore <= 3) calculatedExpertise = 'novice';

  // 5. Assign Final Institutional Profile
  if (finalRiskScore >= 80) {
    calculatedArchetype = calculatedExpertise === 'advanced' ? "Aggressive Active Investor" : "Aggressive Growth Investor";
  } else if (finalRiskScore >= 60) {
    calculatedArchetype = "Moderate Growth Investor";
  } else if (finalRiskScore >= 40) {
    calculatedArchetype = "Conservative Investor";
  } else {
    calculatedArchetype = "Capital Preservation Portfolio";
  }

  // 6. Derive Sentiment Bias (Based on Speculation vs Fundamentals)
  // Q6 (word for risk: 4 = Thrill) and Q10 (Gold mine speculation: 4 = 6 months salary)
  const sentimentScore = parseInt(surveyAnswers['q_word_risk'] || "2") + parseInt(surveyAnswers['q_geologist_mine'] || "1");
  let sentimentBias = 'fundamentals';
  if (sentimentScore >= 6) {
    sentimentBias = 'momentum_and_hype'; 
  } else if (sentimentScore <= 3) {
    sentimentBias = 'fundamentals';
  } else {
    sentimentBias = 'contrarian'; 
  }

  // 7. Derive Volatility Reaction (Based on Losses / Shock Events)
  // Q3 (Vacation / Job loss shock: 1=Cancel, 4=Extend) and Q8 (Willingness to take worst-case loss)
  const volatilityScore = parseInt(surveyAnswers['q_vacation_loss'] || "2") + parseInt(surveyAnswers['q_worst_best_case'] || "2");
  let volatilityReaction = 'hold_steady';
  if (volatilityScore >= 6) {
    volatilityReaction = 'buy_the_dip';
  } else if (volatilityScore <= 3) {
    volatilityReaction = 'protective';
  } else {
    volatilityReaction = 'hold_steady';
  }
  
  return { 
    calculatedExpertise, 
    calculatedArchetype,
    sentimentBias,
    volatilityReaction
  };
};