import { type FormEvent } from "react";
import { ImageOff, RotateCcw, Save, Upload, X } from "lucide-react";
import type { LearningCategory } from "../../types/learning";
import type { BadgeFormValues } from "../../hooks/useAdminBadges";

type BadgeFormModalProps = {
  isOpen: boolean;
  isEditing: boolean;
  isSaving: boolean;
  formError: string | null;
  values: BadgeFormValues;
  categories: LearningCategory[];
  existingIconUrl: string | null;
  selectedIconPreviewUrl: string | null;
  selectedIconFileName: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: <K extends keyof BadgeFormValues>(
    field: K,
    value: BadgeFormValues[K],
  ) => void;
  onIconFileChange: (file: File | null) => void;
};

const criteriaTypeOptions: BadgeFormValues["criteria_type"][] = [
  "ARTICLES_COMPLETED",
  "XP_REACHED",
  "CATEGORY_COMPLETED",
];

function IconPreview({
  label,
  imageUrl,
}: {
  label: string;
  imageUrl: string | null;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
        {label}
      </p>
      <div className="flex h-32 items-center justify-center overflow-hidden rounded-2xl border border-brand-border bg-brand-bg/50">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-brand-muted-fg">
            <ImageOff className="h-6 w-6" />
            <span className="text-xs">No image</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BadgeFormModal({
  isOpen,
  isEditing,
  isSaving,
  formError,
  values,
  categories,
  existingIconUrl,
  selectedIconPreviewUrl,
  selectedIconFileName,
  onClose,
  onSubmit,
  onChange,
  onIconFileChange,
}: BadgeFormModalProps) {
  if (!isOpen) {
    return null;
  }

  const showCategorySelect = values.criteria_type === "CATEGORY_COMPLETED";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-brand-border/60 bg-brand-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-brand-border/60 bg-brand-bg/70 px-6 py-5">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-brand-fg">
              {isEditing ? "Edit Badge" : "Create Badge"}
            </h3>
            <p className="text-sm text-brand-muted-fg">
              Upload an icon, define the requirement, and add a description.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-brand-border/60 bg-brand-card px-3 py-2 text-sm text-brand-muted-fg transition-colors hover:text-brand-fg disabled:opacity-50"
            aria-label="Close badge modal"
            disabled={isSaving}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto overscroll-contain space-y-5 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <IconPreview label="Current icon" imageUrl={existingIconUrl} />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                Replacement preview
              </p>
              <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-border bg-brand-bg/40 px-4 text-center">
                {selectedIconPreviewUrl ? (
                  <img
                    src={selectedIconPreviewUrl}
                    alt="Selected badge icon preview"
                    className="h-full w-full rounded-2xl object-cover"
                  />
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-brand-muted-fg" />
                    <p className="text-xs text-brand-muted-fg">
                      Upload a PNG or JPEG to preview the new icon here.
                    </p>
                  </>
                )}
              </div>
              {selectedIconFileName ? (
                <p className="text-xs text-brand-muted-fg">
                  Selected file: {selectedIconFileName}
                </p>
              ) : null}
            </div>
          </div>

          {formError ? (
            <div className="rounded-2xl border border-semantic-danger/30 bg-semantic-danger/10 px-4 py-3 text-sm text-semantic-danger flex items-center gap-3">
              <span className="text-xl">⚠</span>
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                Name
              </label>
              <input
                value={values.name}
                onChange={(event) => onChange("name", event.target.value)}
                required
                className="w-full rounded-lg border border-brand-border bg-brand-bg p-3 text-sm text-brand-fg placeholder:text-brand-muted-fg focus:outline-none focus:ring-1 focus:ring-brand-primary"
                placeholder="Investment Apprentice"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                Description
              </label>
              <textarea
                value={values.description}
                onChange={(event) =>
                  onChange("description", event.target.value)
                }
                rows={4}
                required
                className="w-full rounded-lg border border-brand-border bg-brand-bg p-3 text-sm text-brand-fg placeholder:text-brand-muted-fg focus:outline-none focus:ring-1 focus:ring-brand-primary resize-y"
                placeholder="Describe what the badge represents"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                Badge Icon
              </label>
              <input
                type="file"
                accept="image/png,image/jpg,image/jpeg"
                onChange={(event) =>
                  onIconFileChange(event.target.files?.[0] ?? null)
                }
                className="w-full rounded-lg border border-brand-border bg-brand-bg p-3 text-sm text-brand-fg file:mr-4 file:rounded-full file:border-0 file:bg-brand-fg file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-bg"
              />
              <p className="text-xs text-brand-muted-fg">
                PNG, JPG or JPEG only. A new file replaces the stored icon on
                save.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                  Criteria Type
                </label>
                <select
                  value={values.criteria_type}
                  onChange={(event) =>
                    onChange(
                      "criteria_type",
                      event.target.value as BadgeFormValues["criteria_type"],
                    )
                  }
                  required
                  className="w-full rounded-lg border border-brand-border bg-brand-bg p-3 text-sm text-brand-fg focus:outline-none focus:ring-1 focus:ring-brand-primary"
                >
                  {criteriaTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                  Criteria Value
                </label>

                {showCategorySelect ? (
                  <select
                    value={values.criteria_value}
                    onChange={(event) =>
                      onChange("criteria_value", event.target.value)
                    }
                    required
                    className="w-full rounded-lg border border-brand-border bg-brand-bg p-3 text-sm text-brand-fg focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  >
                    <option value="">Select a learning category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.name}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={values.criteria_value}
                    onChange={(event) =>
                      onChange("criteria_value", event.target.value)
                    }
                    required
                    className="w-full rounded-lg border border-brand-border bg-brand-bg p-3 text-sm text-brand-fg placeholder:text-brand-muted-fg focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    placeholder={
                      values.criteria_type === "XP_REACHED" ? "500" : "5"
                    }
                  />
                )}

                <p className="text-xs text-brand-muted-fg">
                  {values.criteria_type === "CATEGORY_COMPLETED"
                    ? "The selected category name is stored in criteria_value."
                    : "Enter a positive whole number."}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-fg px-4 py-2.5 text-sm font-medium text-brand-bg disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSaving
                ? "Saving..."
                : isEditing
                  ? "Update Badge"
                  : "Create Badge"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-border bg-brand-card px-4 py-2.5 text-sm font-medium text-brand-fg disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
