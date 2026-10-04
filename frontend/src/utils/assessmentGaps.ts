/** What still stands between the user and "Generate Profile" on onboarding step 3.
 *
 * The button stays disabled until every goal and risk question is answered and a
 * sector is picked. On a page some 7,000px long a disabled button alone does not
 * say which of those is missing, so this line sits beside it and does. Returns
 * undefined when nothing is missing. */
export function describeAssessmentGaps({
  goalsMissing,
  riskMissing,
  sectorMissing,
}: {
  goalsMissing: number;
  riskMissing: number;
  sectorMissing: boolean;
}): string | undefined {
  const questions: string[] = [];
  if (goalsMissing > 0) questions.push(`${goalsMissing} goal question${goalsMissing === 1 ? "" : "s"}`);
  if (riskMissing > 0) questions.push(`${riskMissing} risk question${riskMissing === 1 ? "" : "s"}`);

  const answer = questions.length ? `answer ${questions.join(" and ")}` : "";
  if (answer && sectorMissing) return `To continue, ${answer}, then pick at least one target sector.`;
  if (answer) return `To continue, ${answer}.`;
  if (sectorMissing) return "To continue, pick at least one target sector.";
  return undefined;
}
