import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getStatus, setAdminUserStatus } from "./analysis";
import { pollUntilComplete } from "./poll";
import { AnalysisAccessError } from "../../types/analysisLifecycle";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../../lib/supabase", () => ({ supabase: { auth: { getSession } } }));
const request = vi.fn();
beforeEach(() => {
  request.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: "token" } } });
  vi.stubGlobal("fetch", request);
});
afterEach(() => vi.unstubAllGlobals());

it.each([false, true])("admin status=%s uses the authenticated backend", async (active) => {
  request.mockResolvedValue(new Response(JSON.stringify({ ok: true, is_active: active })));
  await setAdminUserStatus("target", active);
  expect(request).toHaveBeenCalledWith(expect.stringContaining("/api/admin/toggle-user-status"), {
    method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "target", is_active: active }),
  });
});
it("surfaces partial failures", async () => {
  request.mockResolvedValue(new Response(JSON.stringify({ detail: "Auth and profile status may differ" }), { status: 502 }));
  await expect(setAdminUserStatus("target", false)).rejects.toThrow("may differ");
});
it("does not accept unconfirmed success", async () => {
  request.mockResolvedValue(new Response(JSON.stringify({ ok: true, is_active: true })));
  await expect(setAdminUserStatus("target", false)).rejects.toThrow("could not be confirmed");
});
it("does not send a status change without a session", async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  await expect(setAdminUserStatus("target", false)).rejects.toThrow("sign in");
  expect(request).not.toHaveBeenCalled();
});
it("stops analysis polling when account access is denied", async () => {
  request.mockResolvedValue(new Response("inactive", { status: 403 }));
  const getResult = vi.fn();
  await expect(pollUntilComplete("run", getStatus, getResult)).rejects.toBeInstanceOf(AnalysisAccessError);
  expect(request).toHaveBeenCalledTimes(1);
  expect(getResult).not.toHaveBeenCalled();
});
