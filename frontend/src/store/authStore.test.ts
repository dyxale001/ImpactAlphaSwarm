import { beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ fetchProfile: vi.fn(), signOut: vi.fn() }));
vi.mock("../services/supabase/authService", () => ({ fetchUserProfileData: mocks.fetchProfile }));
vi.mock("../lib/supabase", () => ({ supabase: { auth: { signOut: mocks.signOut } } }));
import { useAuthStore } from "./authStore";
const session = { user: { id: "user" }, access_token: "token" } as Session;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValue({ error: null });
  useAuthStore.getState().setSession(null);
});
it("clears local access when a refreshed account is inactive", async () => {
  useAuthStore.getState().setSession(session);
  mocks.fetchProfile.mockResolvedValueOnce({ profile: { id: "user", is_active: true }, analysis: null, error: null });
  await useAuthStore.getState().fetchProfile("user");
  expect(useAuthStore.getState().session).toBe(session);
  mocks.fetchProfile.mockResolvedValueOnce({ profile: { id: "user", is_active: false }, analysis: null, error: null });
  await useAuthStore.getState().fetchProfile("user");
  expect(useAuthStore.getState().session).toBeNull();
  expect(useAuthStore.getState().profile).toBeNull();
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
});
it("surfaces failed session verification so protected routes stay blocked", async () => {
  useAuthStore.getState().setSession(session);
  mocks.fetchProfile.mockResolvedValue({ error: new Error("Cannot verify session") });
  await useAuthStore.getState().fetchProfile("user");
  expect(useAuthStore.getState().profileError).toBe("Cannot verify session");
  expect(useAuthStore.getState().hasResolvedProfile).toBe(false);
});
