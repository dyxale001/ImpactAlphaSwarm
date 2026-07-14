import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import {
  type LearningCategoryFormValues,
  useAdminLearningCategories,
} from "../hooks/useAdminLearningCategories";
import LearningCategoryForm from "../components/admin/LearningCategoryForm";

type EditingCategoryState = {
  id: string | null;
  values: LearningCategoryFormValues;
};

export default function AdminLearningCategories() {
  const {
    categories,
    loading,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
    emptyFormValues,
  } = useAdminLearningCategories();
  const { setSession } = useAuthStore();
  const navigate = useNavigate();

  const [editingCategory, setEditingCategory] = useState<EditingCategoryState>({
    id: null,
    values: emptyFormValues,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(editingCategory.id);
  const categoriesCount = useMemo(() => categories.length, [categories.length]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // ignore sign out errors
    }

    setSession(null);
    navigate("/", { replace: true });
  };

  const resetForm = () => {
    setEditingCategory({ id: null, values: emptyFormValues });
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);

    try {
      if (editingCategory.id) {
        await updateCategory(editingCategory.id, editingCategory.values);
      } else {
        await createCategory(editingCategory.values);
      }

      resetForm();
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save category",
      );
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (category: (typeof categories)[number]) => {
    setEditingCategory({
      id: category.id,
      values: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        display_order: category.display_order,
      },
    });
    setFormError(null);
  };

  const updateField = <K extends keyof LearningCategoryFormValues>(
    field: K,
    value: LearningCategoryFormValues[K],
  ) => {
    setEditingCategory((current) => ({
      ...current,
      values: {
        ...current.values,
        [field]: value,
      },
    }));
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete category \"${name}\"? This cannot be undone.`))
      return;

    setFormError(null);

    try {
      await deleteCategory(id);
      if (editingCategory.id === id) {
        resetForm();
      }
    } catch (deleteError) {
      setFormError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete category",
      );
    }
  };

  if (loading) {
    return (
      <div className="p-10 text-brand-fg flex justify-center">
        Loading learning categories...
      </div>
    );
  }

  return (
    <div className="p-8 min-h-screen bg-brand-bg text-brand-fg">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 bg-brand-bg/60 backdrop-blur-xl rounded-lg p-4 -mx-4 px-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-brand-primary font-semibold">
              Admin
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Learning Categories
            </h1>
            <p className="text-sm text-brand-muted-fg max-w-3xl">
              Create and manage the Learning Centre category structure shown on
              the public site.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-sm font-medium text-brand-muted-fg bg-brand-secondary px-4 py-2 rounded-full border border-brand-border">
              Total Categories: {categoriesCount}
            </div>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-danger/30 border border-danger hover:border-danger hover:text-background hover:bg-danger text-danger text-sm font-medium text-semantic-danger"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-border bg-brand-card text-sm text-brand-muted-fg hover:text-brand-fg transition-colors"
          >
            Users
          </Link>
          <Link
            to="/admin/learning-categories"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-fg text-brand-bg text-sm font-medium"
          >
            Categories
          </Link>
          <Link
            to="/admin/learning-articles"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-border bg-brand-card text-sm text-brand-muted-fg hover:text-brand-fg transition-colors"
          >
            Articles
          </Link>
        </div>

        {error && (
          <div className="p-4 bg-semantic-danger/10 border border-semantic-danger/30 text-semantic-danger rounded-brand flex items-center gap-3">
            <span className="text-xl"></span> {error}
          </div>
        )}

        <section className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6 items-start">
          <LearningCategoryForm
            values={editingCategory.values}
            isEditing={isEditing}
            isSaving={saving}
            formError={formError}
            onSubmit={handleSubmit}
            onReset={resetForm}
            onChange={updateField}
          />

          <div className="bg-background border border-brand-border rounded-brand overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-border/50 bg-brand-bg/50">
                    <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                      Name
                    </th>
                    <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                      Slug
                    </th>
                    <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                      Order
                    </th>
                    <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                      Articles
                    </th>
                    <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/50">
                  {categories.map((category) => (
                    <tr
                      key={category.id}
                      className="hover:bg-brand-bg/30 transition-colors group"
                    >
                      <td className="p-5">
                        <div className="font-semibold text-brand-fg text-base">
                          {category.name}
                        </div>
                        <div className="text-brand-muted-fg text-sm mt-1 max-w-md line-clamp-2">
                          {category.description}
                        </div>
                      </td>
                      <td className="p-5 text-sm text-brand-muted-fg font-mono">
                        {category.slug}
                      </td>
                      <td className="p-5 text-sm font-medium text-brand-fg">
                        {category.display_order}
                      </td>
                      <td className="p-5 text-sm font-medium text-brand-fg">
                        {category.articles?.length ?? 0}
                      </td>
                      <td className="p-5 text-right space-x-4">
                        <button
                          type="button"
                          onClick={() => startEdit(category)}
                          className="text-brand-primary hover:text-brand-primary-glow font-semibold text-sm transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDelete(category.id, category.name)
                          }
                          className="text-semantic-danger hover:text-red-400 font-semibold text-sm transition-colors inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {categories.length === 0 && (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <h3 className="text-lg font-medium text-brand-fg">
                  No categories found
                </h3>
                <p className="text-brand-muted-fg mt-1">
                  Create the first learning category to get started.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
