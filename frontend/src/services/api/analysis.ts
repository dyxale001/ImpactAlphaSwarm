import { supabase } from "../../lib/supabase";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

export async function startAnalysis(payload: {
  universes: string[];
  watchlist?: string[];
  risk_tolerance?: string;
  expertise_level?: string;
}) {
  const token = await getToken();
  console.log("Token from session:", token ? "✓ exists" : "✗ null");
  
  if (!token) {
    throw new Error("No auth token — user may not be logged in");
  }

  const res = await fetch(`${BASE}/api/analysis/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getStatus(runId: string) {
  const res = await fetch(`${BASE}/api/analysis/status/${runId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getResult(runId: string) {
  const res = await fetch(`${BASE}/api/analysis/result/${runId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminDeleteUser(userId: string) {
  const token = await getToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(`${BASE}/api/admin/delete-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: userId }),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminResetPassword(userId: string, email: string) {
  const token = await getToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(`${BASE}/api/admin/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: userId, email }),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminToggleUserStatus(userId: string, isActive: boolean) {
  const token = await getToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(`${BASE}/api/admin/toggle-user-status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: userId, is_active: isActive }),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminSetUserRole(userId: string, role: 'admin' | 'user') {
  const token = await getToken();
  if (!token) throw new Error("No auth token");

  const res = await fetch(`${BASE}/api/admin/set-user-role`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: userId, role }),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}