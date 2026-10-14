import { beforeEach, afterEach, expect, it, vi } from "vitest";
import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
const { state } = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("../store/authStore", () => ({ useAuthStore: () => state }));
beforeEach(() => {
  vi.stubGlobal("React", React);
  Object.assign(state, { session: { user: { id: "user" } }, profile: { role: "user", is_active: true },
    analysis: {}, isLoading: false, isProfileLoading: false, hasResolvedProfile: true, profileError: null, isRecovery: false });
});
afterEach(() => vi.unstubAllGlobals());
function render() {
  return renderToString(createElement(MemoryRouter, null, createElement(Routes, null,
    createElement(Route, { element: createElement(ProtectedRoute) },
      createElement(Route, { path: "/", element: createElement("p", null, "Protected content") })))));
}
it("allows verified active accounts", () => expect(render()).toContain("Protected content"));
it("blocks inactive accounts even with an existing admin session", () => {
  state.profile = { role: "admin", is_active: false };
  expect(render()).not.toContain("Protected content");
});
it("blocks access when a background account check fails", () => {
  state.profileError = "Cannot verify account";
  expect(render()).not.toContain("Protected content");
});
