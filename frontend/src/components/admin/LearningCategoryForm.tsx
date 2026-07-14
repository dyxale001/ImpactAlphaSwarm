import { type FormEvent } from "react";
import { BookOpen, RotateCcw, Save } from "lucide-react";
import type { LearningCategoryFormValues } from "../../hooks/useAdminLearningCategories";

type LearningCategoryFormProps = {
  values: LearningCategoryFormValues;
  isEditing: boolean;
  isSaving: boolean;
  formError: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  onChange: <K extends keyof LearningCategoryFormValues>(
    field: K,
    value: LearningCategoryFormValues[K],
  ) => void;
};

export default function LearningCategoryForm({
  values,
  isEditing,
  isSaving,
  formError,
  onSubmit,
  onReset,
  onChange,
}: LearningCategoryFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="bg-background border border-brand-border rounded-brand overflow-hidden shadow-card"
    >
      <div className="border-b border-brand-border/50 bg-brand-bg/50 px-6 py-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-fg">
            {isEditing ? "Edit Category" : "Create Category"}
          </h2>
          <p className="text-sm text-brand-muted-fg mt-1">
            Manage the category name, slug, description and display order.
          </p>
        </div>
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-brand-primary/10 text-brand-primary">
          <BookOpen className="h-5 w-5" />
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
              Name
            </label>
            <input
              value={values.name}
              onChange={(event) => onChange("name", event.target.value)}
              required
              className="bg-brand-bg border border-brand-border text-brand-fg p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary"
              placeholder="Investing Basics"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
              Slug
            </label>
            <input
              value={values.slug}
              onChange={(event) => onChange("slug", event.target.value)}
              required
              className="bg-brand-bg border border-brand-border text-brand-fg p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary"
              placeholder="investing-basics"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
              Description
            </label>
            <textarea
              value={values.description}
              onChange={(event) => onChange("description", event.target.value)}
              rows={4}
              required
              className="bg-brand-bg border border-brand-border text-brand-fg p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary resize-y"
              placeholder="Short summary..."
            />
          </div>

          <div className="flex flex-col gap-1 max-w-40">
            <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
              Display order
            </label>
            <input
              type="number"
              value={values.display_order}
              onChange={(event) =>
                onChange("display_order", Number(event.target.value))
              }
              required
              min={0}
              className="bg-brand-bg border border-brand-border text-brand-fg p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
        </div>

        {formError && (
          <div className="p-4 bg-semantic-danger/10 border border-semantic-danger/30 text-semantic-danger rounded-brand text-sm">
            {formError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-accent/95 hover:shadow-glow-accent text-brand-fg text-sm font-medium hover:bg-accent/70 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving
              ? "Saving..."
              : isEditing
                ? "Update Category"
                : "Create Category"}
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-brand-surface border border-brand-border text-sm font-medium text-brand-fg hover:bg-brand-bg/70 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>
    </form>
  );
}
