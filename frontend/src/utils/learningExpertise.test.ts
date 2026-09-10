import { describe, expect, it } from "vitest";
import { classifyLearningExpertise } from "./learningExpertise";

describe("expertise guidance", () => {
  it.each([
    ["novice", "BEGINNER", "within"],
    ["novice", "INTERMEDIATE", "other"],
    ["novice", "ADVANCED", "other"],
    ["intermediate", "BEGINNER", "other"],
    ["intermediate", "INTERMEDIATE", "within"],
    ["intermediate", "ADVANCED", "other"],
    ["advanced", "BEGINNER", "other"],
    ["advanced", "INTERMEDIATE", "other"],
    ["advanced", "ADVANCED", "within"],
  ] as const)("%s / %s is %s", (expertise, difficulty, expected) => {
    expect(classifyLearningExpertise(expertise, difficulty)).toBe(expected);
  });
  it("does not invent guidance without expertise", () => {
    expect(classifyLearningExpertise(undefined, "BEGINNER")).toBeUndefined();
  });
});

import { isOptionalOtherLevelLesson } from "./learningExpertise";

describe("optional other-level presentation", () => {
  it("groups only untouched other-level lessons", () => {
    expect(isOptionalOtherLevelLesson("novice", "ADVANCED", undefined, false)).toBe(true);
    expect(isOptionalOtherLevelLesson("novice", "INTERMEDIATE", "NOT_STARTED", false)).toBe(true);
    expect(isOptionalOtherLevelLesson("intermediate", "BEGINNER", undefined, false)).toBe(true);
    expect(isOptionalOtherLevelLesson("advanced", "ADVANCED", undefined, false)).toBe(false);
    expect(isOptionalOtherLevelLesson(undefined, "ADVANCED", undefined, false)).toBe(false);
  });
  it.each(["COMPLETED", "IN_PROGRESS"] as const)("keeps %s other-level lessons prominent", status => {
    expect(isOptionalOtherLevelLesson("novice", "ADVANCED", status, false)).toBe(false);
  });
  it("always keeps the recommendation prominent", () => {
    expect(isOptionalOtherLevelLesson("novice", "ADVANCED", undefined, true)).toBe(false);
  });
});
