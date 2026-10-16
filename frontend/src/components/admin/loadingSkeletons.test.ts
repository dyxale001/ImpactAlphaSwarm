// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AdminReportsSkeleton, { type ReportSkeletonVariant } from "./AdminReportsSkeleton";
import AdminFundsSkeleton from "./AdminFundsSkeleton";
import AdminFundEditSkeleton from "./AdminFundEditSkeleton";
import AdminQuestionListSkeleton from "./AdminQuestionListSkeleton";

function dom(element: ReturnType<typeof createElement>) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

describe("report layout placeholders", () => {
  it.each([
    ["Overview", 4, 0, 0],
    ["Users", 3, 1, 1],
    ["Learners", 2, 1, 0],
    ["Badges", 2, 1, 1],
    ["Assets", 1, 2, 0],
    ["Retention", 5, 0, 0],
    ["Chatbot", 5, 2, 0],
  ] as const)("%s reserves its actual KPI, chart and table regions", (variant, kpis, charts, tables) => {
    const host = dom(createElement(AdminReportsSkeleton, { variant }));
    expect(host.querySelectorAll('[data-placeholder="kpi"]')).toHaveLength(kpis);
    expect(host.querySelectorAll('[data-placeholder="chart"]')).toHaveLength(charts);
    expect(host.querySelectorAll('[data-placeholder="table"]')).toHaveLength(tables);
    const table = host.querySelector('[data-placeholder="table"] > div');
    if (table) expect(table.children).toHaveLength(variant === "Users" ? 2 : 3);
    expect(host.textContent).not.toContain("No data");
  });

  it("reserves latency only when a prior response establishes that metric", () => {
    const host = dom(createElement(AdminReportsSkeleton, { variant: "Chatbot", showLatency: true }));
    expect(host.querySelectorAll('[data-placeholder="kpi"]')).toHaveLength(6);
  });

  it.each(["Overview", "Users", "Learners", "Badges", "Assets", "Retention", "Chatbot"] as ReportSkeletonVariant[])(
    "%s announces loading once and keeps shapes noninteractive",
    variant => {
      const host = dom(createElement(AdminReportsSkeleton, { variant }));
      expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
      expect(host.querySelector('[aria-hidden="true"][aria-busy="true"]')).toBeTruthy();
      expect(host.querySelector("button, input, a, [tabindex]")).toBeNull();
      expect(host.querySelector(".motion-safe\\:animate-pulse")).toBeTruthy();
      expect(host.querySelector(".animate-pulse")).toBeNull();
    },
  );
});

it("fund catalogue reserves five rows and five correctly ordered columns in a local scroller", () => {
  const host = dom(createElement(AdminFundsSkeleton));
  expect([...host.querySelectorAll("th")].map(el => el.textContent)).toEqual(["Fund", "Category", "Fact sheet", "Listed", "Actions"]);
  expect(host.querySelectorAll("tbody tr")).toHaveLength(5);
  for (const row of host.querySelectorAll("tbody tr")) {
    expect(row.children).toHaveLength(5);
    expect(row.children[0].children).toHaveLength(3);
  }
  expect(host.querySelector("table")?.className).toContain("min-w-[720px]");
  expect(host.querySelector("table")?.parentElement?.className).toContain("overflow-x-auto");
});

it("secondary admin placeholders represent forms and question answers without fake controls", () => {
  const fund = dom(createElement(AdminFundEditSkeleton));
  const questions = dom(createElement(AdminQuestionListSkeleton));
  expect(fund.querySelectorAll(".h-10")).toHaveLength(10);
  expect(questions.querySelectorAll(".h-10")).toHaveLength(8);
  for (const host of [fund, questions]) {
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(host.querySelector("input, button")).toBeNull();
  }
});
