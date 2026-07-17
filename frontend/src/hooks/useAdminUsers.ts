import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { AdminUserView } from "../types/auth";

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [
      { data: userRows, error: usersError },
      { data: analysisRows, error: analysisError },
    ] = await Promise.all([
      supabase
        .from("users")
        .select("*")
        // No role filter — fetch all users so admins are visible and manageable
        .order("created_at", { ascending: false }),
      supabase
        .from("user_analysis")
        .select(
          "user_id, investment_universe, ai_derived_expertise, risk_tolerance, capital",
        ),
    ]);

    if (usersError) {
      setError(usersError.message);
      setLoading(false);
      return;
    }
    if (analysisError) {
      setError(analysisError.message);
      setLoading(false);
      return;
    }

    const analysisByUserId = new Map(
      (analysisRows || []).map((row) => [row.user_id, row]),
    );

    setUsers(
      (userRows || []).map((user) => ({
        ...user,
        is_active: user.is_active ?? true,
        user_preferences: analysisByUserId.get(user.id) || null,
      })) as AdminUserView[],
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!error) return;

    const timeout = window.setTimeout(() => {
      setError(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [error]);

  const filteredUsers = users.filter((user) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      user.email?.toLowerCase().includes(q) ||
      user.first_name?.toLowerCase().includes(q) ||
      user.last_name?.toLowerCase().includes(q)
    );
  });

  const deleteUser = async (userId: string) => {
    try {
      const { error: analysisDeleteError } = await supabase
        .from("user_analysis")
        .delete()
        .eq("user_id", userId);

      if (analysisDeleteError) {
        console.error(
          "Failed to delete user analysis before user delete:",
          analysisDeleteError,
        );
        throw analysisDeleteError;
      }

      const { error: deleteError } = await supabase
        .from("users")
        .delete()
        .eq("id", userId);

      if (deleteError) {
        console.error("Failed to delete user:", deleteError);
        throw deleteError;
      }

      setUsers((current) => current.filter((u) => u.id !== userId));
      return true;
    } catch (err: any) {
      console.error("Admin delete user action failed:", err);
      setError("Failed to delete user");
      return false;
    }
  };

  const resetPassword = async (
    _userId: string,
    email: string,
  ): Promise<boolean> => {
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );

      if (resetError) {
        console.error("Failed to send password reset:", resetError);
        throw resetError;
      }

      return true;
    } catch (err: any) {
      console.error("Admin reset password action failed:", err);
      setError(
        `Failed to send password reset: ${err?.message ?? "unknown error"}`,
      );
      return false;
    }
  };

  const toggleUserStatus = async (
    userId: string,
    isActive: boolean,
  ): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from("users")
        .update({ is_active: isActive })
        .eq("id", userId);

      if (updateError) {
        console.error("Failed to update user status:", updateError);
        throw updateError;
      }

      setUsers((current) =>
        current.map((u) =>
          u.id === userId ? { ...u, is_active: isActive } : u,
        ),
      );
      return true;
    } catch (err: any) {
      console.error("Admin toggle user status action failed:", err);
      setError(
        `Failed to update user status: ${err?.message ?? "unknown error"}`,
      );
      return false;
    }
  };

  const setUserRole = async (
    userId: string,
    role: "admin" | "user",
  ): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from("users")
        .update({ role })
        .eq("id", userId);

      if (updateError) {
        console.error("Failed to update user role:", updateError);
        throw updateError;
      }

      setUsers((current) =>
        current.map((u) => (u.id === userId ? { ...u, role } : u)),
      );
      return true;
    } catch (err: any) {
      console.error("Admin set user role action failed:", err);
      setError(
        `Failed to update user role: ${err?.message ?? "unknown error"}`,
      );
      return false;
    }
  };

  return {
    users,
    filteredUsers,
    loading,
    error,
    search,
    setSearch,
    deleteUser,
    resetPassword,
    toggleUserStatus,
    setUserRole,
    refreshUsers: fetchUsers,
  };
}
