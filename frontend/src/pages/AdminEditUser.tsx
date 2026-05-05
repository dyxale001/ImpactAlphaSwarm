import { useParams, useNavigate } from 'react-router-dom';
import { useEditUser } from '../hooks/useEditUser';

export default function AdminEditUser() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loading, saving, error, formData, setFormData, handleSubmit } = useEditUser(id);

  if (loading) return <div className="p-10 text-brand-fg flex justify-center">Loading user details...</div>;

  return (
    <div className="p-8 min-h-screen bg-brand-bg text-brand-fg">
      <div className="max-w-xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Edit User Detail</h1>
          <button onClick={() => navigate('/admin')} className="text-brand-muted-fg hover:text-brand-fg">
            Cancel
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-semantic-danger/10 border border-semantic-danger text-semantic-danger rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-brand-secondary border border-brand-border rounded-lg p-6 shadow-card flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-brand-muted-fg font-medium uppercase tracking-wide">First Name</label>
            <input 
              type="text" 
              value={formData.first_name} 
              onChange={(e) => setFormData({...formData, first_name: e.target.value})}
              className="bg-brand-bg border border-brand-border text-brand-fg p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary"
              required 
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-brand-muted-fg font-medium uppercase tracking-wide">Last Name</label>
            <input 
              type="text" 
              value={formData.last_name} 
              onChange={(e) => setFormData({...formData, last_name: e.target.value})}
              className="bg-brand-bg border border-brand-border text-brand-fg p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary"
              required 
            />
          </div>

          <button 
            type="submit" 
            disabled={saving}
            className="mt-4 bg-brand-primary hover:bg-brand-accent text-brand-fg font-medium p-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving changes...' : 'Save User Details'}
          </button>
        </form>
      </div>
    </div>
  );
}