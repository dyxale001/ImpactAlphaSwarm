// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "../../store/authStore";
import UserSpotlightTour from "./UserSpotlightTour";
import { SPOTLIGHT_KEY, spotlightSteps } from "../../utils/spotlightTour";
vi.mock("../../store/authStore", async () => {
  const { create } = await import("zustand");
  return {
    useAuthStore: create(() => ({ user: null, profile: null, analysis: null })),
  };
});
const mocks = vi.hoisted(() => ({ claim: vi.fn(), finish: vi.fn() }));
vi.mock("../../services/supabase/spotlightTourService", () => ({
  claimSpotlightTour: mocks.claim,
  finishSpotlightTour: mocks.finish,
}));
let root: Root, host: HTMLDivElement;
const state = (id = "new") => ({
  user: { id, user_metadata: { [SPOTLIGHT_KEY]: "eligible" } },
  profile: { id, role: "user", is_active: true },
  analysis: { user_id: id },
  isLoading: false,
  isProfileLoading: false,
  hasResolvedProfile: true,
  isRecovery: false,
});
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.claim.mockResolvedValue(true);
  mocks.finish.mockResolvedValue(undefined);
  useAuthStore.setState(state() as any);
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1280,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.querySelectorAll("[data-test-nav]").forEach((el) => el.remove());
});
async function mount() {
  await act(async () => root.render(createElement(UserSpotlightTour)));
}
async function click(text: string) {
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === text)!
      .click(),
  );
}
it("excludes existing users even with no browser completion flag", async () => {
  useAuthStore.setState({ user: { id: "new", user_metadata: {} } } as any);
  await mount();
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("waits for profile and required analysis resolution", async () => {
  useAuthStore.setState({ isProfileLoading: true, analysis: null });
  await mount();
  expect(mocks.claim).not.toHaveBeenCalled();
  await act(async () => useAuthStore.setState(state() as any));
  expect(mocks.claim).toHaveBeenCalledWith("new");
  expect(document.querySelector("h2")?.textContent).toBe(
    "Welcome to AlphaSwarm",
  );
});
it("supports next, back, skip and finishing without navigating", async () => {
  const before = window.location.href;
  await mount();
  await click("Next");
  expect(document.querySelector("h2")?.textContent).toBe("Dashboard");
  await click("Back");
  expect(document.querySelector("h2")?.textContent).toBe(
    "Welcome to AlphaSwarm",
  );
  for (let index = 1; index < spotlightSteps().length; index++)
    await click("Next");
  await click("Finish");
  expect(mocks.finish).toHaveBeenCalledWith("new", "finished");
  expect(window.location.href).toBe(before);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("skips using the button and persists the status", async () => {
  await mount();
  await click("Skip tour");
  expect(mocks.finish).toHaveBeenCalledWith("new", "skipped");
});
it("supports Escape and restores focus without blocking dashboard controls", async () => {
  const button = document.createElement("button");
  button.textContent = "Existing control";
  button.dataset.testNav = "";
  document.body.append(button);
  button.focus();
  await mount();
  expect(document.activeElement?.tagName).toBe("H2");
  expect(document.querySelector('[aria-modal="true"]')).toBeNull();
  expect(document.body.style.overflow).not.toBe("hidden");
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(mocks.finish).toHaveBeenCalledWith("new", "skipped");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(button);
});
it("does not reopen when auth metadata changes during a claimed tour", async () => {
  await mount();
  await act(async () =>
    useAuthStore.setState({
      user: { id: "new", user_metadata: { [SPOTLIGHT_KEY]: "started" } },
    } as any),
  );
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  expect(mocks.claim).toHaveBeenCalledOnce();
});
it("suppresses stale claims on account switching", async () => {
  let resolve!: (value: boolean) => void;
  mocks.claim.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await mount();
  await act(async () =>
    useAuthStore.setState({
      ...state("old"),
      user: { id: "old", user_metadata: {} },
    } as any),
  );
  await act(async () => resolve(true));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("reports start and completion failures safely", async () => {
  mocks.claim.mockRejectedValueOnce(new Error("offline"));
  await mount();
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "could not start",
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => useAuthStore.setState(state("another") as any));
  mocks.finish.mockRejectedValueOnce(new Error("offline"));
  await click("Skip tour");
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "final status could not be synced",
  );
});
it("uses the mobile menu button without opening it or targeting desktop links", async () => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 375,
  });
  const menu = document.createElement("button");
  menu.dataset.spotlight = "mobile-navigation";
  menu.dataset.testNav = "";
  menu.setAttribute("aria-expanded", "false");
  const rect = vi.fn(() => ({
    left: 320,
    top: 8,
    right: 360,
    bottom: 48,
    width: 40,
    height: 40,
  }));
  menu.getBoundingClientRect = rect as any;
  document.body.append(menu);
  await mount();
  await click("Next");
  expect(rect).toHaveBeenCalled();
  expect(menu.getAttribute("aria-expanded")).toBe("false");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Find Dashboard in the navigation menu",
  );
});
it("keeps optional features flag-aware while covering every visible navigation entry", () => {
  expect(spotlightSteps(false, false, false)).toHaveLength(10);
  expect(spotlightSteps(true, true, true)).toHaveLength(13);
  expect(
    spotlightSteps(false, false, false).some(
      (step) => step.path === "/funds" || step.path === "/compare",
    ),
  ).toBe(false);
});

it.each(["started", "skipped", "finished"])(
  "does not show a refreshed or signed-in account with %s status",
  async (status) => {
    useAuthStore.setState({
      user: { id: "new", user_metadata: { [SPOTLIGHT_KEY]: status } },
    } as any);
    await mount();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  },
);
it("removes an active tour immediately when switching to an existing account", async () => {
  await mount();
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  await act(async () =>
    useAuthStore.setState({
      ...state("existing"),
      user: { id: "existing", user_metadata: {} },
    } as any),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.finish).not.toHaveBeenCalled();
});
it("highlights the real desktop Stocks link without following it or blocking controls", async () => {
  const aside = document.createElement("aside");
  aside.dataset.testNav = "";
  const link = document.createElement("a");
  link.dataset.spotlightNav = "/assets";
  link.href = "/assets";
  const clicked = vi.fn((event) => event.preventDefault());
  link.addEventListener("click", clicked);
  const measured = vi.fn(() => ({
    left: 16,
    right: 240,
    top: 100,
    bottom: 140,
    width: 224,
    height: 40,
  }));
  link.getBoundingClientRect = measured as any;
  aside.append(link);
  document.body.append(aside);
  const control = document.createElement("button");
  control.dataset.testNav = "";
  const used = vi.fn();
  control.addEventListener("click", used);
  document.body.append(control);
  await mount();
  await click("Next");
  await click("Next");
  expect(measured).toHaveBeenCalled();
  expect(clicked).not.toHaveBeenCalled();
  expect(document.querySelector(".pointer-events-none")).toBeTruthy();
  await act(async () => control.click());
  expect(used).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
});
it("does not display a tour if the authoritative claim rejects eligibility", async () => {
  mocks.claim.mockResolvedValue(false);
  await mount();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("ends on the real floating button without activating it", async () => {
  const floating = document.createElement("button");
  floating.dataset.spotlight = "floating-assistant";
  floating.dataset.testNav = "";
  floating.setAttribute("aria-expanded", "false");
  const activated = vi.fn();
  floating.addEventListener("click", activated);
  const rect = vi.fn(() => ({
    left: 1180,
    right: 1236,
    top: 680,
    bottom: 736,
    width: 56,
    height: 56,
  }));
  floating.getBoundingClientRect = rect as any;
  document.body.append(floating);
  await mount();
  for (let index = 1; index < spotlightSteps().length; index++)
    await click("Next");
  expect(document.querySelector("h2")?.textContent).toBe(
    "Ask AlphaSwarm: quick help",
  );
  expect(rect).toHaveBeenCalled();
  expect(activated).not.toHaveBeenCalled();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    `${spotlightSteps().length} of ${spotlightSteps().length}`,
  );
  expect(document.querySelector(".pointer-events-none")).toBeTruthy();
  await click("Back");
  expect(document.querySelector("h2")?.textContent).toBe("Settings");
  await click("Next");
  await click("Finish");
  expect(mocks.finish).toHaveBeenCalledWith("new", "finished");
});
it("handles an absent floating control without highlighting the sidebar Ask entry", async () => {
  await mount();
  for (let index = 1; index < spotlightSteps().length; index++)
    await click("Next");
  expect(document.querySelector(".pointer-events-none")).toBeNull();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "quick-help button is not currently available",
  );
  await click("Finish");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
