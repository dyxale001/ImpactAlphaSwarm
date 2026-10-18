// @vitest-environment jsdom
import { expect, it } from "vitest";
import { revealSidebarTarget, spotlightPosition } from "./spotlightPosition";
import { spotlightSteps } from "./spotlightTour";
import { getVisibleNavigation } from "../data/appNavigation";
it("matches the exact displayed navigation order with separate welcome and assistant steps", () => {
  const steps = spotlightSteps(true, true, true);
  expect(steps.map((step) => step.title)).toEqual([
    "Welcome to AlphaSwarm",
    "Dashboard",
    "Stocks",
    "Market News",
    "Funds",
    "Compare",
    "Learning",
    "Financial Tools",
    "Watchlist",
    "Ask AlphaSwarm",
    "Whale Watching",
    "Settings",
    "Ask AlphaSwarm: quick help",
  ]);
  expect(steps[0].target).toBe("welcome");
  expect(steps.at(-1)?.target).toBe("assistant");
  expect(
    steps
      .filter((step) => step.target === "navigation")
      .map((step) => step.path),
  ).toEqual(
    getVisibleNavigation({ funds: true, compare: true, news: true }).map(
      (item) => item.path,
    ),
  );
});
it.each([false, true])(
  "excludes only disabled features when news=%s",
  (news) => {
    const steps = spotlightSteps(false, false, news);
    expect(
      steps.some((step) => step.path === "/funds" || step.path === "/compare"),
    ).toBe(false);
    expect(steps.some((step) => step.path === "/news")).toBe(news);
    expect(
      steps
        .filter((step) => step.target === "navigation")
        .map((step) => step.path),
    ).toEqual(
      getVisibleNavigation({ funds: false, compare: false, news }).map(
        (item) => item.path,
      ),
    );
  },
);
it("scrolls only the independently scrolling sidebar to reveal a low item", () => {
  const main = document.createElement("main");
  main.scrollTop = 300;
  const aside = document.createElement("aside");
  aside.scrollTop = 20;
  const link = document.createElement("a");
  aside.append(link);
  aside.getBoundingClientRect = () =>
    ({ top: 0, bottom: 300, height: 300 }) as DOMRect;
  link.getBoundingClientRect = () => ({ top: 350, bottom: 390 }) as DOMRect;
  revealSidebarTarget(link);
  expect(aside.scrollTop).toBe(118);
  expect(main.scrollTop).toBe(300);
  link.getBoundingClientRect = () => ({ top: -10, bottom: 30 }) as DOMRect;
  revealSidebarTarget(link);
  expect(aside.scrollTop).toBe(100);
});
it("puts the final tooltip above the floating button and inside a narrow viewport", () => {
  const point = spotlightPosition({
    rect: {
      left: 310,
      right: 358,
      top: 720,
      bottom: 768,
      width: 48,
      height: 48,
    },
    viewportWidth: 375,
    viewportHeight: 800,
    cardHeight: 250,
    mobile: true,
    navigation: false,
    assistant: true,
  });
  expect(point.left).toBeGreaterThanOrEqual(16);
  expect(point.left + 320).toBeLessThanOrEqual(359);
  expect(point.top + 250).toBeLessThan(720);
});
it("clamps a low sidebar tooltip into a short viewport", () => {
  const point = spotlightPosition({
    rect: {
      left: 16,
      right: 240,
      top: 290,
      bottom: 330,
      width: 224,
      height: 40,
    },
    viewportWidth: 1280,
    viewportHeight: 350,
    cardHeight: 250,
    mobile: false,
    navigation: true,
    assistant: false,
  });
  expect(point).toEqual({ left: 252, top: 84 });
});
