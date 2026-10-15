// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AdminReports from "./AdminReports";
import AdminFunds from "./AdminFunds";
import AdminFundEdit from "./AdminFundEdit";
import AdminLearningQuestions from "./AdminLearningQuestions";

const mocks = vi.hoisted(() => ({
  report: vi.fn(), list: vi.fn(), update: vi.fn(), signOut: vi.fn(),
  getFund: vi.fn(), getDetail: vi.fn(), questions: vi.fn(), selectArticle: vi.fn(),
}));
vi.mock("../hooks/useAdminReports", () => ({ useAdminReport: mocks.report }));
vi.mock("../hooks/useSignOut", () => ({ useSignOut: () => mocks.signOut }));
vi.mock("../services/api/adminFundCatalogue", () => ({
  listAdminFunds: mocks.list, updateAdminFund: mocks.update, getAdminFund: mocks.getFund,
}));
vi.mock("../services/api/fundCatalogue", () => ({ getCatalogueFund: mocks.getDetail }));
vi.mock("../hooks/useFundCatalogue", () => ({ useFundCatalogueMeta: () => ({ meta: null }) }));
vi.mock("../components/admin/AddFundForm", () => ({
  default: ({ onCreated }: { onCreated: () => Promise<void> }) =>
    createElement("button", { onClick: onCreated }, "Add a fund"),
}));
vi.mock("../hooks/useAdminLearningQuestions", () => ({ useAdminLearningQuestions: mocks.questions }));

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.report.mockReturnValue({ data: null, loading: true, error: null });
  mocks.list.mockImplementation(() => new Promise(() => {}));
  mocks.getFund.mockImplementation(() => new Promise(() => {}));
  mocks.getDetail.mockImplementation(() => new Promise(() => {}));
  const article = { id: "a", title: "Inflation", category_id: "c" };
  mocks.questions.mockReturnValue({
    articles: [article], categories: [], articleById: new Map([["a", article]]),
    categoryById: new Map(), questions: [], activeArticleId: "a",
    loadingArticles: false, loadingQuestions: true, error: null,
    selectArticle: mocks.selectArticle, emptyQuestionFormValues: {}, emptyAnswerFormValues: {},
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function mount(Component: typeof AdminReports) {
  await act(async () => root.render(createElement(MemoryRouter, null, createElement(Component))));
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(el => el.textContent?.trim() === text);
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
}

it("Reports keeps headings, tabs and ranges usable and focused while report content loads", async () => {
  await mount(AdminReports);
  expect(host.querySelector("h1")?.textContent).toBe("Reports & Analytics");
  expect(host.textContent).toContain("All time");
  const range = [...host.querySelectorAll("button")].find(el => el.textContent === "7 days")!;
  range.focus();
  await click("7 days");
  expect(document.activeElement).toBe(range);
  expect(mocks.report.mock.calls.at(-1)?.[1]).toBe("7d");
  expect(host.querySelector('[data-report-skeleton="Overview"]')).toBeTruthy();
  await click("Users");
  expect(host.querySelector('[data-report-skeleton="Users"]')).toBeTruthy();
  expect(host.textContent).not.toContain("No registrations");
  await click("Learners");
  expect(host.querySelector('[data-report-skeleton="Learners"]')).toBeTruthy();
  expect(host.querySelector('[data-report-skeleton="Badges"]')).toBeTruthy();
  await click("Retention");
  expect(mocks.report.mock.calls.at(-1)?.[1]).toBe("30d");
  expect(host.textContent).not.toContain("All time");
});

it("Reports prioritizes pending content, then distinguishes errors and resolved missing data", async () => {
  mocks.report.mockReturnValue({ data: null, loading: true, error: "stale error" });
  await mount(AdminReports);
  expect(host.textContent).not.toContain("stale error");
  expect(host.textContent).not.toContain("No data");
  mocks.report.mockReturnValue({ data: null, loading: false, error: "offline" });
  await mount(AdminReports);
  expect(host.textContent).toContain("Failed to load report: offline");
  expect(host.querySelector("[data-report-skeleton]")).toBeNull();
  mocks.report.mockReturnValue({ data: null, loading: false, error: null });
  await mount(AdminReports);
  expect(host.textContent).toContain("No data available for the selected range");
});

it("does not announce unavailable chatbot reports until the request has finished", async () => {
  mocks.report.mockReturnValue({ data: { available: false, message: "Not configured" }, loading: true, error: null });
  await mount(AdminReports); await click("Chatbot");
  expect(host.querySelector('[data-report-skeleton="Chatbot"]')).toBeTruthy();
  expect(host.textContent).not.toContain("Not configured");
  mocks.report.mockReturnValue({ data: { available: false, message: "Not configured" }, loading: false, error: null });
  await mount(AdminReports);
  expect(host.textContent).toContain("Not configured");
});

it("Admin Funds preserves controls during loading, sign-out wiring and successful empty output", async () => {
  let resolve!: (value: unknown) => void;
  mocks.list.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(AdminFunds);
  expect(host.querySelector("h1")?.textContent).toContain("Fund catalogue");
  expect(host.textContent).toContain("Add a fund");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(5);
  expect(host.textContent).not.toContain("Total Funds: 0");
  expect(host.textContent).not.toContain("No funds");
  await click("Sign out"); expect(mocks.signOut).toHaveBeenCalledOnce();
  await act(async () => resolve({ funds: [], count: 0, soft_stale_days: 90, stale_days: 120 }));
  expect(host.textContent).toContain("No funds in the catalogue yet.");
  expect(host.textContent).toContain("Total Funds: 0");
  expect(mocks.list).toHaveBeenCalledOnce();
});

it("fund request failures never become a successful empty catalogue", async () => {
  mocks.list.mockRejectedValueOnce(new Error("offline"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await mount(AdminFunds);
    expect(host.textContent).toContain("Unable to load the fund catalogue");
    expect(host.textContent).not.toContain("No funds in the catalogue");
    expect(host.querySelector("tbody")).toBeNull();
  } finally { log.mockRestore(); }
});

it("fund retire and reload still call the original API with the same values", async () => {
  const data = { funds: [{ id: "f1", name: "Example", manco: "Manager", isin: "ISIN", asisa_category: "Equity", is_active: true, staleness: { status: "missing" } }], count: 1, soft_stale_days: 90, stale_days: 120 };
  mocks.list.mockResolvedValue(data); mocks.update.mockResolvedValue({});
  await mount(AdminFunds); await click("Retire");
  expect(mocks.update).toHaveBeenCalledWith("f1", { is_active: false });
  expect(mocks.list).toHaveBeenCalledTimes(2);
});

it("fund edit keeps its back link and renders a form-shaped pending state", async () => {
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/admin/funds/f1"] }, createElement(Routes, null, createElement(Route, { path: "/admin/funds/:fundId", element: createElement(AdminFundEdit) })))));
  expect(mocks.getFund).toHaveBeenCalledWith("f1");
  expect(mocks.getDetail).toHaveBeenCalledWith("f1");
  expect(host.textContent).toContain("Back to the catalogue");
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Loading fund details…");
  expect(host.querySelectorAll(".h-10")).toHaveLength(10);
  expect(host.textContent).not.toContain("Not found");
});

it("selected article questions show placeholders before an empty result and preserve selection", async () => {
  await mount(AdminLearningQuestions);
  expect(host.textContent).toContain("Inflation");
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Loading questions…");
  expect(host.textContent).not.toContain("No questions exist");
  await click("Selected");
  expect(mocks.selectArticle).toHaveBeenCalledWith("a");
  mocks.questions.mockReturnValue({ ...mocks.questions(), loadingQuestions: false });
  await mount(AdminLearningQuestions);
  expect(host.textContent).toContain("No questions exist for this article yet.");
  mocks.questions.mockReturnValue({ ...mocks.questions(), error: "Question fetch failed" });
  await mount(AdminLearningQuestions);
  expect(host.textContent).toContain("Question fetch failed");
  expect(host.textContent).not.toContain("No questions exist");
});
