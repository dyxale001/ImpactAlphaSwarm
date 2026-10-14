import { beforeEach, expect, it, vi } from "vitest";
import { fetchUserProfileData, signInActiveAccount } from "./authService";
const deactivatedMessage = "Your account has been deactivated. Please contact an administrator to reactivate your account.";
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn(), getUser: vi.fn(), from: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("../../lib/supabase", () => ({ supabase: {
  auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut, getUser: mocks.getUser }, from: mocks.from,
} }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signIn.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: mocks.maybeSingle });
});
it.each(["user", "admin"])("preserves active %s login", async (role) => {
  mocks.maybeSingle.mockResolvedValue({ data: { role, is_active: true }, error: null });
  await expect(signInActiveAccount("email", "password")).resolves.toEqual({ role, is_active: true });
  expect(mocks.signOut).not.toHaveBeenCalled();
});
it.each([false, null])("rejects inactive/unknown status %s and signs out", async (active) => {
  mocks.maybeSingle.mockResolvedValue({ data: { is_active: active }, error: null });
  await expect(signInActiveAccount("email", "password")).rejects.toThrow(deactivatedMessage);
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
});
it("fails closed when status cannot be loaded", async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error("offline") });
  await expect(signInActiveAccount("email", "password")).rejects.toThrow("verify account status");
  expect(mocks.signOut).toHaveBeenCalled();
});
it("preserves new-account profile creation", async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(signInActiveAccount("email", "password")).resolves.toBeNull();
});
it.each([
  ["self-deactivated", { code: "user_banned", message: "User is banned" }],
  ["admin-deactivated", { code: "user_banned", message: "Account blocked" }],
  ["legacy Auth response", { message: "User is banned" }],
])("shows the exact message for a %s account rejected by Auth", async (_scenario, error) => {
  mocks.signIn.mockResolvedValue({ data: { user: null, session: null }, error });
  await expect(signInActiveAccount("email", "password")).rejects.toThrow(deactivatedMessage);
  // Auth rejected sign-in: never attempt an unauthenticated account lookup.
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.getUser).not.toHaveBeenCalled();
});
it.each([
  { code: "invalid_credentials", message: "Invalid login credentials" },
  { code: "invalid_credentials", message: "Authentication failed" },
  { message: "Invalid login credentials" },
])("preserves incorrect-credential handling: %j", async (error) => {
  mocks.signIn.mockResolvedValue({ data: { user: null, session: null }, error });
  await expect(signInActiveAccount("email", "wrong-password")).rejects.toThrow("Incorrect email or password. Please try again.");
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.getUser).not.toHaveBeenCalled();
});
it.each([
  { code: "over_request_rate_limit", message: "Too many requests" },
  { code: "email_not_confirmed", message: "Email not confirmed" },
  { code: "unexpected_failure", message: "Service unavailable; banned-account checks could not run" },
])("preserves other Auth failures: %j", async (error) => {
  mocks.signIn.mockResolvedValue({ data: { user: null, session: null }, error });
  await expect(signInActiveAccount("email", "password")).rejects.toThrow(error.message);
  expect(mocks.from).not.toHaveBeenCalled();
});
it("checks restored sessions against Auth before reading profile data", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("User is banned") });
  expect((await fetchUserProfileData("user")).error?.message).toBe("User is banned");
  expect(mocks.from).not.toHaveBeenCalled();
});
