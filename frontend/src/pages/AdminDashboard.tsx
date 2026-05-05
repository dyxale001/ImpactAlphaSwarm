

import { Link } from 'react-router-dom';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { formatDbString } from '../utils/stringFormatters';

export default function AdminDashboard() {
  const { users, loading, error, deleteUser } = useAdminUsers();

  const handleDelete = async (userId: string) => {
    if (window.confirm("Are you sure you want to permanently delete this user?")) {
      await deleteUser(userId);
    }
  };

  if (loading) return <div className="p-10 text-brand-fg flex justify-center">Loading platform users...</div>;

  return (
    <div className="p-8 min-h-screen bg-brand-bg text-brand-fg">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Platform Users</h1>
            <p className="text-sm text-brand-muted-fg mt-2">Manage user accounts and view investor profiles.</p>
          </div>
          <div className="text-sm font-medium text-brand-muted-fg bg-brand-secondary px-4 py-2 rounded-full border border-brand-border">
            Total Users: {users.length}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-semantic-danger/10 border border-semantic-danger/30 text-semantic-danger rounded-brand flex items-center gap-3">
            <span className="text-xl"></span> {error}
          </div>
        )}

        <div className="bg-brand-secondary border border-brand-border rounded-brand overflow-hidden shadow-card">
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
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-brand-bg/30 transition-colors group">
                    <td className="p-5">
                      <div className="font-semibold text-brand-fg text-base">
                        {user.first_name} {user.last_name}
                      </div>
                      <div className="text-brand-muted-fg text-sm flex items-center gap-2 mt-1">
                         {user.email}
                      </div>
                    </td>
                    
                    <td className="p-5">
                      {user.user_preferences?.investor_archetype ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-brand-accent/10 border border-brand-accent/20 text-brand-accent">
                          {user.user_preferences.investor_archetype}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-brand-border text-brand-muted-fg">
                          Assessment Pending
                        </span>
                      )}
                    </td>
                    
                    <td className="p-5">
                      <div className="grid grid-cols-1 gap-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-brand-muted-fg w-16">Style:</span>
                          <span className="font-medium text-brand-fg">
                            {formatDbString(user.user_preferences?.ai_derived_sentiment)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-brand-muted-fg w-16">Exp:</span>
                          <span className="font-medium text-brand-fg">
                            {formatDbString(user.user_preferences?.ai_derived_expertise)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-brand-muted-fg w-16">Vol:</span>
                          <span className="font-medium text-brand-fg">
                            {formatDbString(user.user_preferences?.ai_derived_volatility)}
                          </span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="p-5 text-right space-x-4">
                      <Link 
                        to={`/admin/edit/${user.id}`}
                        className="text-brand-primary hover:text-brand-primary-glow font-semibold text-sm transition-colors"
                      >
                        Edit
                      </Link>
                      <button 
                        onClick={() => handleDelete(user.id)}
                        className="text-semantic-danger hover:text-red-400 font-semibold text-sm transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {users.length === 0 && (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <span className="text-4xl mb-3"></span>
              <h3 className="text-lg font-medium text-brand-fg">No users found</h3>
              <p className="text-brand-muted-fg mt-1">Platform is currently empty.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}