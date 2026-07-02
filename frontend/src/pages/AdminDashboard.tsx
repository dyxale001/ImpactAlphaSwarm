import { useState } from 'react';
import { Search, Mail, ShieldOff, ShieldCheck, Trash2, Pencil, Crown, UserMinus } from 'lucide-react';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { formatDbString, formatNumberWithSpaces } from '../utils/stringFormatters';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';

export default function AdminDashboard() {
  const {
    filteredUsers,
    users,
    loading,
    error,
    search,
    setSearch,
    deleteUser,
    resetPassword,
    toggleUserStatus,
    setUserRole,
  } = useAdminUsers();

  const { session, setSession } = useAuthStore();
  const navigate = useNavigate();
  const currentUserId = session?.user?.id;

  const [resettingPW, setResettingPW] = useState<Set<string>>(new Set());
  const [togglingStatus, setTogglingStatus] = useState<Set<string>>(new Set());
  const [togglingRole, setTogglingRole] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const showFeedback = (userId: string, message: string) => {
    setFeedback((prev) => ({ ...prev, [userId]: message }));
    setTimeout(() => {
      setFeedback((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }, 3000);
  };

  const handleSignOut = async () => {
    try { await supabase.auth.signOut(); } catch {}
    setSession(null);
    navigate('/', { replace: true });
  };

  const handleResetPassword = async (userId: string, email: string) => {
    setResettingPW((prev) => new Set(prev).add(userId));
    const ok = await resetPassword(userId, email);
    setResettingPW((prev) => { const next = new Set(prev); next.delete(userId); return next; });
    if (ok) showFeedback(userId, `Reset email sent to ${email}`);
  };

  const handleToggleStatus = async (userId: string, currentlyActive: boolean) => {
    setTogglingStatus((prev) => new Set(prev).add(userId));
    const ok = await toggleUserStatus(userId, !currentlyActive);
    setTogglingStatus((prev) => { const next = new Set(prev); next.delete(userId); return next; });
    if (ok) showFeedback(userId, currentlyActive ? 'Account deactivated' : 'Account activated');
  };

  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const confirmMsg = newRole === 'admin'
      ? 'Promote this user to admin? They will have full platform access.'
      : 'Remove admin access from this user?';
    if (!window.confirm(confirmMsg)) return;
    setTogglingRole((prev) => new Set(prev).add(userId));
    const ok = await setUserRole(userId, newRole);
    setTogglingRole((prev) => { const next = new Set(prev); next.delete(userId); return next; });
    if (ok) showFeedback(userId, newRole === 'admin' ? 'Promoted to admin' : 'Admin access removed');
  };

  const handleDelete = async (userId: string, name: string) => {
    if (window.confirm(`Permanently delete ${name}? This cannot be undone.`)) {
      await deleteUser(userId);
    }
  };

  if (loading) {
    return <div className="p-10 text-brand-fg flex justify-center">Loading platform users...</div>;
  }

  return (
    <div className="p-8 min-h-screen bg-brand-bg text-brand-fg">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-end mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Platform Users</h1>
            <p className="text-sm text-brand-muted-fg mt-2">Manage user accounts and view investor profiles.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium text-brand-muted-fg bg-brand-secondary px-4 py-2 rounded-full border border-brand-border">
              Total Users: {users.length}
            </div>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-danger/30 border border-danger hover:border-danger hover:text-background hover:bg-danger text-danger text-sm font-medium"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-muted-fg pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-background border border-brand-border rounded-brand text-sm text-brand-fg placeholder:text-brand-muted-fg focus:outline-none focus:ring-1 focus:ring-brand-primary transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-muted-fg hover:text-brand-fg text-xs">
              Clear
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 p-4 bg-semantic-danger/10 border border-semantic-danger/30 text-semantic-danger rounded-brand flex items-center gap-3">
            <span className="text-xl">⚠</span> {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-background border border-brand-border rounded-brand overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border/50 bg-brand-bg/50">
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">Investor</th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">Classification</th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">Strategy Profile</th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/50">
                {filteredUsers.map((user) => {
                  const isActive = user.is_active ?? true;
                  const isAdmin = user.role === 'admin';
                  const isSelf = user.id === currentUserId;
                  const fullName = `${user.first_name} ${user.last_name}`.trim();
                  const isResetting = resettingPW.has(user.id);
                  const isToggling = togglingStatus.has(user.id);
                  const isTogglingRole = togglingRole.has(user.id);
                  const rowFeedback = feedback[user.id];

                  return (
                    <tr key={user.id} className={`hover:bg-brand-bg/30 transition-colors group ${!isActive ? 'opacity-60' : ''}`}>

                      {/* Investor cell */}
                      <td className="p-5">
                        <div className="font-semibold text-brand-fg text-base flex items-center gap-2">
                          {fullName}
                          {isAdmin && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-500/10 border border-yellow-500/30 text-yellow-500">
                              <Crown size={10} /> Admin
                            </span>
                          )}
                          {isSelf && (
                            <span className="text-xs text-brand-muted-fg">(you)</span>
                          )}
                        </div>
                        <div className="text-brand-muted-fg text-sm mt-1">{user.email}</div>
                        <div className="mt-2">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-semantic-success/10 border border-semantic-success/30 text-semantic-success">
                              <span className="w-1.5 h-1.5 rounded-full bg-semantic-success" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-border text-brand-muted-fg border border-brand-border">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-muted-fg" /> Inactive
                            </span>
                          )}
                        </div>
                        {rowFeedback && (
                          <div className="mt-1.5 text-xs text-semantic-success font-medium">✓ {rowFeedback}</div>
                        )}
                      </td>

                      {/* Classification cell */}
                      <td className="p-5">
                        {user.user_preferences?.ai_derived_expertise ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-brand-accent/10 border border-primary/20 text-primary">
                            {formatDbString(user.user_preferences.ai_derived_expertise)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-brand-border text-brand-muted-fg">
                            Assessment Pending
                          </span>
                        )}
                      </td>

                      {/* Strategy Profile cell */}
                      <td className="p-5">
                        <div className="grid grid-cols-1 gap-1.5 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-brand-muted-fg w-24">Universe:</span>
                            <span className="font-medium text-brand-fg">
                              {user.user_preferences?.investment_universe?.length
                                ? user.user_preferences.investment_universe.join(', ')
                                : 'N/A'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-brand-muted-fg w-24">Risk:</span>
                            <span className="font-medium text-brand-fg">
                              {user.user_preferences?.risk_tolerance ? formatDbString(user.user_preferences.risk_tolerance) : 'N/A'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-brand-muted-fg w-24">Capital:</span>
                            <span className="font-medium text-brand-fg">
                              {user.user_preferences?.capital != null
                                ? `R ${formatNumberWithSpaces(user.user_preferences.capital as string | number)}`
                                : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Actions cell */}
                      <td className="p-5">
                        <div className="flex items-center justify-end gap-2 flex-wrap">

                          {/* Edit */}
                          <Link
                            to={`/admin/edit/${user.id}`}
                            title="Edit user details"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-brand-border text-brand-muted-fg hover:text-brand-fg hover:border-brand-fg transition-colors"
                          >
                            <Pencil size={12} /> Edit
                          </Link>

                          {/* Reset password */}
                          <button
                            onClick={() => handleResetPassword(user.id, user.email)}
                            disabled={isResetting}
                            title="Send password reset email"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-brand-primary/40 text-brand-primary hover:bg-brand-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Mail size={12} />
                            {isResetting ? 'Sending…' : 'Reset PW'}
                          </button>

                          {/* Activate / Deactivate — hidden for self */}
                          {!isSelf && (
                            <button
                              onClick={() => handleToggleStatus(user.id, isActive)}
                              disabled={isToggling}
                              title={isActive ? 'Deactivate account' : 'Activate account'}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                isActive
                                  ? 'border-semantic-warning/40 text-semantic-warning hover:bg-semantic-warning/10'
                                  : 'border-semantic-success/40 text-semantic-success hover:bg-semantic-success/10'
                              }`}
                            >
                              {isToggling ? '…' : isActive ? <><ShieldOff size={12} /> Deactivate</> : <><ShieldCheck size={12} /> Activate</>}
                            </button>
                          )}

                          {/* Make Admin / Demote — hidden for self */}
                          {!isSelf && (
                            <button
                              onClick={() => handleToggleRole(user.id, user.role)}
                              disabled={isTogglingRole}
                              title={isAdmin ? 'Remove admin access' : 'Promote to admin'}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                isAdmin
                                  ? 'border-yellow-500/40 text-yellow-500 hover:bg-yellow-500/10'
                                  : 'border-brand-primary/40 text-brand-primary hover:bg-brand-primary/10'
                              }`}
                            >
                              {isTogglingRole ? '…' : isAdmin
                                ? <><UserMinus size={12} /> Demote</>
                                : <><Crown size={12} /> Make Admin</>
                              }
                            </button>
                          )}

                          {/* Delete — hidden for self */}
                          {!isSelf && (
                            <button
                              onClick={() => handleDelete(user.id, fullName || user.email)}
                              title="Permanently delete user"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-semantic-danger/40 text-semantic-danger hover:bg-semantic-danger/10 transition-colors"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && users.length > 0 && (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <Search size={32} className="text-brand-muted-fg mb-3" />
              <h3 className="text-lg font-medium text-brand-fg">No users match "{search}"</h3>
              <p className="text-brand-muted-fg mt-1 text-sm">Try a different name or email address.</p>
            </div>
          )}

          {users.length === 0 && (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <span className="text-4xl mb-3">👥</span>
              <h3 className="text-lg font-medium text-brand-fg">No users found</h3>
              <p className="text-brand-muted-fg mt-1">Platform is currently empty.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
