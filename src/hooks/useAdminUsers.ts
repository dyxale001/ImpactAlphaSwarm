import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase'
import type { AdminUserView } from '../types/auth';

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const { data, error: fetchError } = await supabase
      .from('users')
      .select(`
        *,
        user_preferences!left(investor_archetype, ai_derived_expertise, ai_derived_sentiment, ai_derived_volatility)
      `)
      .eq('role', 'user')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error("Error fetching users:", fetchError.message);
      setError(fetchError.message);
    } else {
      setUsers(data as AdminUserView[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const deleteUser = async (userId: string) => {
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);
    
    if (deleteError) {
      console.error('Error deleting user:', deleteError.message);
      setError('Failed to delete user');
      return false;
    }
    
    setUsers(currentUsers => currentUsers.filter(u => u.id !== userId));
    return true;
  };

  return { users, loading, error, deleteUser, refreshUsers: fetchUsers };
}