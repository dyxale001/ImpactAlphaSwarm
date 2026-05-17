import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AdminUserView } from '../types/auth';
import { adminDeleteUser } from '../services/api/analysis';

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [{ data: userRows, error: usersError }, { data: analysisRows, error: analysisError }] = await Promise.all([
      supabase
        .from('users')
        .select('*')
        .eq('role', 'user')
        .order('created_at', { ascending: false }),
      supabase
        .from('user_analysis')
        .select('user_id, investment_universe, ai_derived_expertise, risk_tolerance, capital')
    ]);

    if (usersError) {
      console.error('Error fetching users:', usersError.message);
      setError(usersError.message);
      setLoading(false);
      return;
    }

    if (analysisError) {
      console.error('Error fetching user analysis:', analysisError.message);
      setError(analysisError.message);
      setLoading(false);
      return;
    }

    const analysisByUserId = new Map(
      (analysisRows || []).map((row) => [row.user_id, row])
    );

    setUsers(
      (userRows || []).map((user) => ({
        ...user,
        user_preferences: analysisByUserId.get(user.id) || null,
      })) as AdminUserView[]
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const deleteUser = async (userId: string) => {
  try {
    await adminDeleteUser(userId);
    setUsers((currentUsers) => currentUsers.filter((u) => u.id !== userId));
    return true;
  } catch (err: any) {
    console.error('Error deleting user:', err?.message || err);
    setError('Failed to delete user');
    return false;
  }
};

  return { users, loading, error, deleteUser, refreshUsers: fetchUsers };
}