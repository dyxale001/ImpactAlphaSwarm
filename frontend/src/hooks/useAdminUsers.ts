import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AdminUserView } from '../types/auth';
import { adminDeleteUser, adminResetPassword, adminToggleUserStatus, adminSetUserRole } from '../services/api/analysis';

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [{ data: userRows, error: usersError }, { data: analysisRows, error: analysisError }] = await Promise.all([
      supabase
        .from('users')
        .select('*')
        // No role filter — fetch all users so admins are visible and manageable
        .order('created_at', { ascending: false }),
      supabase
        .from('user_analysis')
        .select('user_id, investment_universe, ai_derived_expertise, risk_tolerance, capital')
    ]);

    if (usersError) { setError(usersError.message); setLoading(false); return; }
    if (analysisError) { setError(analysisError.message); setLoading(false); return; }

    const analysisByUserId = new Map(
      (analysisRows || []).map((row) => [row.user_id, row])
    );

    setUsers(
      (userRows || []).map((user) => ({
        ...user,
        is_active: user.is_active ?? true,
        user_preferences: analysisByUserId.get(user.id) || null,
      })) as AdminUserView[]
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

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
      await adminDeleteUser(userId);
      setUsers((current) => current.filter((u) => u.id !== userId));
      return true;
    } catch {
      setError('Failed to delete user');
      return false;
    }
  };

  const resetPassword = async (userId: string, email: string): Promise<boolean> => {
    try {
      await adminResetPassword(userId, email);
      return true;
    } catch (err: any) {
      setError(`Failed to send password reset: ${err?.message ?? 'unknown error'}`);
      return false;
    }
  };

  const toggleUserStatus = async (userId: string, isActive: boolean): Promise<boolean> => {
    try {
      await adminToggleUserStatus(userId, isActive);
      setUsers((current) =>
        current.map((u) => (u.id === userId ? { ...u, is_active: isActive } : u))
      );
      return true;
    } catch (err: any) {
      setError(`Failed to update user status: ${err?.message ?? 'unknown error'}`);
      return false;
    }
  };

  const setUserRole = async (userId: string, role: 'admin' | 'user'): Promise<boolean> => {
    try {
      await adminSetUserRole(userId, role);
      setUsers((current) =>
        current.map((u) => (u.id === userId ? { ...u, role } : u))
      );
      return true;
    } catch (err: any) {
      setError(`Failed to update user role: ${err?.message ?? 'unknown error'}`);
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
