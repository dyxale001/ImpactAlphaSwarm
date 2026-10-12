export const isRiskAnswer = (key: string) =>
  key.startsWith('q_') && !['q_financial_knowledge_self', 'q_financial_math', 'q_inflation', 'q_diversification'].includes(key);

export const psychometricBreakdown = (surveyAnswers: Record<string, string>) => {
  let riskToleranceScore = 0;

  // 1. Calculate Base Risk Tolerance (Questions 1 - 15)
  Object.keys(surveyAnswers).forEach((key) => {
    if (isRiskAnswer(key)) {
      const val = parseInt(surveyAnswers[key] || "0", 10);
      riskToleranceScore += val;
    }
  });

  const baseTolerancePercentage = Math.min((riskToleranceScore / 45) * 100, 100);

  // 2. Assess Risk Capacity (Demographics)
  let capacityMultiplier = 1.0; 

  const age = surveyAnswers['demo_age'];
  const beforeAge = capacityMultiplier;
  if (age === 'under_25' || age === '25_34') capacityMultiplier += 0.15; 
  if (age === '55_64') capacityMultiplier -= 0.15; 
  if (age === '65_74' || age === '75_over') capacityMultiplier -= 0.30; 
  const ageAdjustment = capacityMultiplier - beforeAge;

  const income = surveyAnswers['demo_income'];
  const beforeIncome = capacityMultiplier;
  if (income === 'tier_1') capacityMultiplier -= 0.15; 
  if (income === 'tier_4' || income === 'tier_5') capacityMultiplier += 0.10; 
  const incomeAdjustment = capacityMultiplier - beforeIncome;

  // 3. Calculate Final Adjusted Score
  const finalRiskScore = baseTolerancePercentage * capacityMultiplier;

  let calculatedExpertise: 'novice' | 'intermediate' | 'advanced' = 'intermediate';

  // 4. Expertise check
  const literacyScore = 
    parseInt(surveyAnswers['q_financial_knowledge_self'] || "0") + 
    (parseInt(surveyAnswers['q_financial_math'] || "0") === 3 ? 1 : 0) +
    (parseInt(surveyAnswers['q_inflation'] || "0") === 3 ? 1 : 0) +
    (parseInt(surveyAnswers['q_diversification'] || "0") === 3 ? 1 : 0);
    
  if (literacyScore >= 6) calculatedExpertise = 'advanced';
  else if (literacyScore <= 3) calculatedExpertise = 'novice';

  // 5. Assign Final Tolerance Level
  let riskTolerance = "Moderate";
  if (finalRiskScore >= 70) {
    riskTolerance = "Aggressive";
  } else if (finalRiskScore >= 40) {
    riskTolerance = "Moderate";
  } else {
    riskTolerance = "Conservative";
  }

  
  return { 
    calculatedExpertise, 
    riskTolerance,
    riskToleranceScore,
    baseTolerancePercentage,
    ageAdjustment,
    incomeAdjustment,
    capacityMultiplier,
    finalRiskScore,
  };
};

// Keep the original public result unchanged for onboarding and retakes.
export const determinePsychometrics = (surveyAnswers: Record<string, string>) => {
  const { calculatedExpertise, riskTolerance } = psychometricBreakdown(surveyAnswers);
  return { calculatedExpertise, riskTolerance };
};
