import { useState, type FormEvent } from "react";
import { Eye, PencilLine, Save, RotateCcw } from "lucide-react";
import MarkdownRenderer from "../learning/MarkdownRenderer";
import MarkdownSyntaxHelper from "./MarkdownSyntaxHelper";
import type { LearningCategory } from "../../data/learningContent";
import type { LearningArticleFormValues } from "../../hooks/useAdminLearningArticles";

const difficultyOptions = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

type LearningArticleFormProps = {
  values: LearningArticleFormValues;
  categories: LearningCategory[];
  isEditing: boolean;
  isSaving: boolean;
  formError: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  onChange: <K extends keyof LearningArticleFormValues>(
    field: K,
    value: LearningArticleFormValues[K],
  ) => void;
};

export default function LearningArticleForm({
  values,
  categories,
  isEditing,
  isSaving,
  formError,
  onSubmit,
  onReset,
  onChange,
}: LearningArticleFormProps) {
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [showMarkdownGuide, setShowMarkdownGuide] = useState(false);

  return (
    <form
      onSubmit={onSubmit}
      className="bg-background border border-brand-border rounded-brand overflow-hidden shadow-card"
    >
      <div className="border-b border-brand-border/50 bg-brand-bg/50 px-5 lg:px-6 py-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-fg">
            {isEditing ? "Edit Article" : "Create Article"}
          </h2>
          <p className="text-sm text-brand-muted-fg mt-1">
            Manage the title, slug, summary, markdown content and category
            assignment.
          </p>
        </div>
      </div>

      <div className="p-5 lg:p-6 space-y-5">
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
              Title
            </label>
            <input
              value={values.title}
              onChange={(event) => onChange("title", event.target.value)}
              required
              className="bg-brand-bg border border-brand-border text-brand-fg p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary"
              placeholder="Understanding the JSE"
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
              placeholder="understanding-the-jse"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
              Difficulty Level
            </label>
            <select
              value={values.difficulty_level}
              onChange={(event) =>
                onChange("difficulty_level", event.target.value)
              }
              required
              className="bg-brand-bg border border-brand-border text-brand-fg p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary resize-y"
            >
              <option value="">Select a difficulty level</option>
              {difficultyOptions.map((difficultyLevel) => (
                <option key={difficultyLevel} value={difficultyLevel}>
                  {difficultyLevel}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
              Summary
            </label>
            <textarea
              value={values.summary}
              onChange={(event) => onChange("summary", event.target.value)}
              rows={3}
              required
              className="bg-brand-bg border border-brand-border text-brand-fg p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary resize-y"
              placeholder="Short summary..."
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
              Category
            </label>
            <select
              value={values.category_id}
              onChange={(event) => onChange("category_id", event.target.value)}
              required
              className="bg-brand-bg border border-brand-border text-brand-fg p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary resize-y"
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode("edit")}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                viewMode === "edit"
                  ? "bg-brand-fg text-brand-bg"
                  : "border border-brand-border bg-brand-card text-brand-muted-fg hover:text-brand-fg"
              }`}
            >
              <PencilLine className="w-4 h-4" />
              Editor
            </button>
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                viewMode === "preview"
                  ? "bg-brand-fg text-brand-bg"
                  : "border border-brand-border bg-brand-card text-brand-muted-fg hover:text-brand-fg"
              }`}
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
          </div>

          {viewMode === "edit" ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                  Markdown Content
                </label>
                <button
                  type="button"
                  onClick={() => setShowMarkdownGuide((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-card px-3 py-1.5 text-xs font-semibold text-brand-muted-fg transition-colors hover:text-brand-fg"
                >
                  {showMarkdownGuide ? "Hide guide" : "Show guide"}
                </button>
              </div>
              <textarea
                value={values.content}
                onChange={(event) => onChange("content", event.target.value)}
                rows={14}
                required
                className="bg-brand-bg border border-brand-border text-brand-fg p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-primary resize-y font-mono text-sm leading-7"
                placeholder="Write the article in markdown..."
              />

              {showMarkdownGuide && <MarkdownSyntaxHelper className="mt-3" />}
            </div>
          ) : (
            <div className="rounded-2xl border border-brand-border/60 bg-brand-card overflow-hidden">
              <div className="border-b border-brand-border/50 bg-brand-bg/50 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-brand-primary font-semibold">
                    Preview
                  </p>
                  <p className="text-sm text-brand-muted-fg">
                    Rendered exactly as the Learning Centre shows it.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-card px-3 py-1 text-xs text-brand-muted-fg">
                  <Eye className="w-3.5 h-3.5" />
                  Markdown preview
                </div>
              </div>
              <div className="article-viewer-scrollbar max-h-130 overflow-y-auto px-5 py-6">
                <div className="mx-auto max-w-3xl">
                  {values.content ? (
                    <MarkdownRenderer content={values.content} />
                  ) : (
                    <div className="rounded-2xl border border-dashed border-brand-border bg-brand-bg/40 p-8 text-center text-sm text-brand-muted-fg">
                      Start typing markdown to see the preview here.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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
                ? "Update Article"
                : "Create Article"}
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
