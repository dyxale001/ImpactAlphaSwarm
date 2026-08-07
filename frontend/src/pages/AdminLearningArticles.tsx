import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Edit3, Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import {
  type LearningArticleFormValues,
  useAdminLearningArticles,
} from "../hooks/useAdminLearningArticles";
import LearningArticleForm from "../components/admin/LearningArticleForm";
import AdminLearningArticlesSkeleton from "../components/admin/AdminLearningArticlesSkeleton";

type EditingArticleState = {
  id: string | null;
  values: LearningArticleFormValues;
};

export default function AdminLearningArticles() {
  const {
    articles,
    categories,
    categoryById,
    loading,
    error,
    createArticle,
    updateArticle,
    deleteArticle,
    emptyFormValues,
  } = useAdminLearningArticles();
  const { setSession } = useAuthStore();
  const navigate = useNavigate();

  const [editingArticle, setEditingArticle] = useState<EditingArticleState>({
    id: null,
    values: emptyFormValues,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const isEditing = Boolean(editingArticle.id);
  const articleCount = useMemo(() => articles.length, [articles.length]);

  const filteredArticles = useMemo(() => {
    if (categoryFilter === "all") {
      return articles;
    }

    return articles.filter((article) => article.category_id === categoryFilter);
  }, [articles, categoryFilter]);

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
    setEditingArticle({ id: null, values: emptyFormValues });
    setFormError(null);
  };

  const closeForm = () => {
    resetForm();
    setIsFormOpen(false);
  };

  const openCreateForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  useEffect(() => {
    if (!successMessage) return;

    const timeout = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      if (editingArticle.id) {
        await updateArticle(editingArticle.id, editingArticle.values);
        setSuccessMessage("Article updated successfully.");
      } else {
        await createArticle(editingArticle.values);
        setSuccessMessage("Article created successfully.");
      }

      closeForm();
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save article",
      );
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (article: (typeof articles)[number]) => {
    setEditingArticle({
      id: article.id,
      values: {
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        content: article.content,
        category_id: article.category_id,
        difficulty_level: article.difficulty_level,
      },
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const updateField = <K extends keyof LearningArticleFormValues>(
    field: K,
    value: LearningArticleFormValues[K],
  ) => {
    setEditingArticle((current) => ({
      ...current,
      values: {
        ...current.values,
        [field]: value,
      },
    }));
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete article "${title}"? This cannot be undone.`)) {
      return;
    }

    setFormError(null);
    setSuccessMessage(null);

    try {
      await deleteArticle(id);
      if (editingArticle.id === id) {
        closeForm();
      }
      setSuccessMessage(`Article \"${title}\" deleted successfully.`);
    } catch (deleteError) {
      setFormError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete article",
      );
    }
  };

  if (loading) {
    return <AdminLearningArticlesSkeleton />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-brand-bg text-brand-fg">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 bg-brand-bg/60 backdrop-blur-xl rounded-lg p-4 -mx-4 px-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-brand-primary font-semibold">
              Admin
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Learning Articles
            </h1>
            <p className="text-sm text-brand-muted-fg max-w-3xl">
              Create, edit, and publish articles for the Learning Centre.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-sm font-medium text-brand-muted-fg bg-brand-secondary px-4 py-2 rounded-full border border-brand-border">
              Total Articles: {articleCount}
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-border bg-brand-card text-sm text-brand-muted-fg hover:text-brand-fg transition-colors"
          >
            Categories
          </Link>
          <Link
            to="/admin/learning-articles"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-fg text-brand-bg text-sm font-medium"
          >
            Articles
          </Link>
          <Link
            to="/admin/learning-questions"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-border bg-brand-card text-sm text-brand-muted-fg hover:text-brand-fg transition-colors"
          >
            Questions &amp; Answers
          </Link>
          <Link
            to="/admin/badges"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-border bg-brand-card text-sm text-brand-muted-fg hover:text-brand-fg transition-colors"
          >
            Badges
          </Link>
        </div>

        {error && (
          <div className="p-4 bg-semantic-danger/10 border border-semantic-danger/30 text-semantic-danger rounded-brand flex items-center gap-3">
            <span className="text-xl"></span> {error}
          </div>
        )}

        {successMessage && (
          <div className="p-4 bg-semantic-success/5 border border-semantic-success/20 text-semantic-success rounded-brand flex items-center gap-3">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-semantic-success/10 text-semantic-success text-sm">
              ✓
            </span>
            <span>{successMessage}</span>
          </div>
        )}

        <section className="bg-background border border-brand-border rounded-brand overflow-hidden shadow-card">
          <div className="border-b border-brand-border/50 bg-brand-bg/50 px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-brand-fg">
                Existing Articles
              </h2>
              <p className="text-sm text-brand-muted-fg mt-1">
                Edit the article content, slug or category assignment from here.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                Filter
              </label>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="bg-brand-bg border border-brand-border text-brand-fg px-3 py-2 rounded-full focus:outline-none focus:ring-1 focus:ring-brand-primary"
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={openCreateForm}
                className="inline-flex items-center gap-2 rounded-full bg-brand-fg px-4 py-2.5 text-sm font-medium text-brand-bg"
              >
                Create Article
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border/50 bg-brand-bg/50">
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                    Title
                  </th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                    Category
                  </th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                    Difficulty
                  </th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                    Slug
                  </th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                    Summary
                  </th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/50">
                {filteredArticles.map((article) => {
                  const category = categoryById.get(article.category_id);

                  return (
                    <tr
                      key={article.id}
                      className="hover:bg-brand-bg/30 transition-colors group"
                    >
                      <td className="p-5 align-top">
                        <div className="font-semibold text-brand-fg text-base">
                          {article.title}
                        </div>
                      </td>
                      <td className="p-5 align-top text-sm text-brand-fg">
                        {category?.name ?? "Unassigned"}
                      </td>
                      <td className="p-5 align-top text-sm text-brand-fg">
                        <span className="inline-flex rounded-full border border-brand-border bg-brand-bg/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-primary">
                          {article.difficulty_level}
                        </span>
                      </td>
                      <td className="p-5 align-top text-sm text-brand-muted-fg font-mono">
                        {article.slug}
                      </td>
                      <td className="p-5 align-top text-sm text-brand-muted-fg max-w-md line-clamp-3">
                        {article.summary}
                      </td>
                      <td className="p-5 align-top text-right whitespace-nowrap space-x-3">
                        <button
                          type="button"
                          onClick={() => startEdit(article)}
                          className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-card px-3 py-2 text-xs font-medium text-brand-fg transition-colors hover:bg-brand-bg/70"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDelete(article.id, article.title)
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-semantic-danger/30 bg-semantic-danger/10 px-3 py-2 text-xs font-medium text-semantic-danger transition-colors hover:bg-semantic-danger/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredArticles.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-brand-muted-fg"
                    >
                      No articles match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {isFormOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={closeForm}
          >
            <div
              className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl border border-brand-border/60 bg-brand-bg shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={closeForm}
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-border bg-brand-card text-brand-muted-fg transition-colors hover:text-brand-fg"
                aria-label="Close article form"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="p-2 lg:p-3">
                <LearningArticleForm
                  values={editingArticle.values}
                  categories={categories}
                  isEditing={isEditing}
                  isSaving={saving}
                  formError={formError}
                  onSubmit={handleSubmit}
                  onReset={resetForm}
                  onChange={updateField}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
