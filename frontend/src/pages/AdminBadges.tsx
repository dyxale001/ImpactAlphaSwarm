import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Edit3, ImageOff, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import AdminBadgesSkeleton from "../components/admin/AdminBadgesSkeleton";
import BadgeFormModal from "../components/admin/BadgeFormModal";
import {
  type BadgeFormValues,
  type BadgeCriteriaType,
  useAdminBadges,
} from "../hooks/useAdminBadges";

type EditingBadgeState = {
  id: string | null;
  values: BadgeFormValues;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminBadges() {
  const {
    badges,
    categories,
    loading,
    error,
    createBadge,
    updateBadge,
    deleteBadge,
    emptyFormValues,
  } = useAdminBadges();
  const { setSession } = useAuthStore();
  const navigate = useNavigate();

  const [editingBadge, setEditingBadge] = useState<EditingBadgeState>({
    id: null,
    values: emptyFormValues,
  });
  const [selectedIconFile, setSelectedIconFile] = useState<File | null>(null);
  const [selectedIconPreviewUrl, setSelectedIconPreviewUrl] = useState<
    string | null
  >(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [brokenIconIds, setBrokenIconIds] = useState<Set<string>>(new Set());

  const isEditing = Boolean(editingBadge.id);
  const badgeCount = useMemo(() => badges.length, [badges.length]);

  useEffect(() => {
    if (!successMessage) return;

    const timeout = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  useEffect(() => {
    return () => {
      if (selectedIconPreviewUrl) {
        URL.revokeObjectURL(selectedIconPreviewUrl);
      }
    };
  }, [selectedIconPreviewUrl]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore sign out errors
    }

    setSession(null);
    navigate("/", { replace: true });
  };

  const resetForm = () => {
    setEditingBadge({ id: null, values: emptyFormValues });
    setFormError(null);
    setSelectedIconFile(null);
    setSelectedIconPreviewUrl(null);
  };

  const closeModal = () => {
    resetForm();
    setIsModalOpen(false);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (badge: (typeof badges)[number]) => {
    resetForm();
    setEditingBadge({
      id: badge.id,
      values: {
        name: badge.name,
        description: badge.description,
        criteria_type: badge.criteria_type as BadgeCriteriaType,
        criteria_value: badge.criteria_value,
      },
    });
    setIsModalOpen(true);
  };

  const updateField = <K extends keyof BadgeFormValues>(
    field: K,
    value: BadgeFormValues[K],
  ) => {
    setEditingBadge((current) => {
      if (field !== "criteria_type") {
        return {
          ...current,
          values: {
            ...current.values,
            [field]: value,
          },
        };
      }

      const nextType = value as BadgeCriteriaType;
      const nextCriteriaValue =
        nextType === "CATEGORY_COMPLETED" ? (categories[0]?.name ?? "") : "1";

      return {
        ...current,
        values: {
          ...current.values,
          criteria_type: nextType,
          criteria_value: nextCriteriaValue,
        },
      };
    });
  };

  const updateIconFile = (file: File | null) => {
    if (selectedIconPreviewUrl) {
      URL.revokeObjectURL(selectedIconPreviewUrl);
    }

    setSelectedIconFile(file);
    setSelectedIconPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const trimmedName = editingBadge.values.name.trim();
    const trimmedDescription = editingBadge.values.description.trim();
    const trimmedCriteriaValue = editingBadge.values.criteria_value.trim();

    if (!trimmedName) {
      setFormError("Badge name is required.");
      return;
    }

    if (!trimmedDescription) {
      setFormError("Badge description is required.");
      return;
    }

    if (!editingBadge.id && !selectedIconFile) {
      setFormError("Badge icon is required.");
      return;
    }

    const duplicateName = badges.some(
      (badge) =>
        badge.id !== editingBadge.id &&
        badge.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );

    if (duplicateName) {
      setFormError(`A badge named "${trimmedName}" already exists.`);
      return;
    }

    let normalizedCriteriaValue = trimmedCriteriaValue;

    if (editingBadge.values.criteria_type === "CATEGORY_COMPLETED") {
      if (!trimmedCriteriaValue) {
        setFormError("Select a learning category.");
        return;
      }

      const selectedCategory = categories.find(
        (category) => category.name === trimmedCriteriaValue,
      );

      if (!selectedCategory) {
        setFormError("Select a valid learning category.");
        return;
      }

      normalizedCriteriaValue = selectedCategory.name;
    } else {
      const numericValue = Number.parseInt(trimmedCriteriaValue, 10);

      if (!Number.isInteger(numericValue) || numericValue <= 0) {
        setFormError("Criteria value must be a positive whole number.");
        return;
      }

      normalizedCriteriaValue = String(numericValue);
    }

    setSaving(true);

    try {
      const payload: BadgeFormValues = {
        name: trimmedName,
        description: trimmedDescription,
        criteria_type: editingBadge.values.criteria_type,
        criteria_value: normalizedCriteriaValue,
      };

      if (editingBadge.id) {
        await updateBadge(editingBadge.id, payload, selectedIconFile);
        setSuccessMessage("Badge updated successfully.");
      } else if (selectedIconFile) {
        await createBadge(payload, selectedIconFile);
        setSuccessMessage("Badge created successfully.");
      }

      closeModal();
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save badge.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (
    badgeId: string,
    name: string,
    iconPath: string,
  ) => {
    if (!window.confirm(`Delete badge "${name}"? This cannot be undone.`)) {
      return;
    }

    setFormError(null);
    setSuccessMessage(null);

    try {
      await deleteBadge(badgeId, iconPath);
      if (editingBadge.id === badgeId) {
        closeModal();
      }
      setSuccessMessage(`Badge "${name}" deleted successfully.`);
    } catch (deleteError) {
      setFormError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete badge.",
      );
    }
  };

  if (loading) {
    return <AdminBadgesSkeleton />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-brand-bg text-brand-fg">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 bg-brand-bg/60 backdrop-blur-xl rounded-lg p-4 -mx-4 px-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-brand-primary font-semibold">
              Admin
            </p>
            <h1 className="text-3xl font-bold tracking-tight">Badges</h1>
            <p className="text-sm text-brand-muted-fg max-w-3xl">
              Create, edit, and manage the badges shown in the Learning Centre.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-sm font-medium text-brand-muted-fg bg-brand-secondary px-4 py-2 rounded-full border border-brand-border">
              Total Badges: {badgeCount}
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-border bg-brand-card text-sm text-brand-muted-fg hover:text-brand-fg transition-colors"
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-fg text-brand-bg text-sm font-medium"
          >
            Badges
          </Link>
        </div>

        {error && (
          <div className="p-4 bg-semantic-danger/10 border border-semantic-danger/30 text-semantic-danger rounded-brand flex items-center gap-3">
            <span className="text-xl">⚠</span> {error}
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
                Existing Badges
              </h2>
              <p className="text-sm text-brand-muted-fg mt-1">
                Edit badge data, criteria and icons from here.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-full bg-brand-fg px-4 py-2.5 text-sm font-medium text-brand-bg"
            >
              Create Badge
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border/50 bg-brand-bg/50">
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                    Icon
                  </th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                    Name
                  </th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                    Description
                  </th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                    Criteria Type
                  </th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider">
                    Criteria Value
                  </th>
                  <th className="p-5 text-xs font-semibold text-brand-muted-fg uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/50">
                {badges.map((badge) => {
                  const showFallback =
                    brokenIconIds.has(badge.id) || !badge.icon_url;

                  return (
                    <tr
                      key={badge.id}
                      className="transition-colors hover:bg-brand-bg/30"
                    >
                      <td className="p-5 align-top">
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-brand-border bg-brand-bg/70">
                          {!showFallback ? (
                            <img
                              src={badge.icon_url ?? undefined}
                              alt={badge.name}
                              className="h-full w-full object-cover"
                              onError={() =>
                                setBrokenIconIds((current) =>
                                  new Set(current).add(badge.id),
                                )
                              }
                            />
                          ) : (
                            <ImageOff className="h-5 w-5 text-brand-muted-fg" />
                          )}
                        </div>
                      </td>
                      <td className="p-5 align-top">
                        <div className="font-semibold text-brand-fg text-base">
                          {badge.name}
                        </div>
                      </td>
                      <td className="p-5 align-top text-sm text-brand-muted-fg max-w-md">
                        {badge.description}
                      </td>
                      <td className="p-5 align-top text-sm text-brand-fg">
                        <span className="inline-flex rounded-full border border-brand-border bg-brand-bg/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-primary">
                          {badge.criteria_type}
                        </span>
                      </td>
                      <td className="p-5 align-top text-sm text-brand-fg">
                        {badge.criteria_value}
                      </td>
                      <td className="p-5 align-top text-right whitespace-nowrap space-x-3">
                        <button
                          type="button"
                          onClick={() => openEditModal(badge)}
                          className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-card px-3 py-2 text-xs font-medium text-brand-fg transition-colors hover:bg-brand-bg/70"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDelete(badge.id, badge.name, badge.icon_path)
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

                {badges.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-brand-muted-fg"
                    >
                      No badges have been created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <BadgeFormModal
        isOpen={isModalOpen}
        isEditing={isEditing}
        isSaving={saving}
        formError={formError}
        values={editingBadge.values}
        categories={categories}
        existingIconUrl={
          editingBadge.id
            ? (badges.find((badge) => badge.id === editingBadge.id)?.icon_url ??
              null)
            : null
        }
        selectedIconPreviewUrl={selectedIconPreviewUrl}
        selectedIconFileName={selectedIconFile?.name ?? null}
        onClose={closeModal}
        onSubmit={handleSubmit}
        onChange={updateField}
        onIconFileChange={updateIconFile}
      />
    </div>
  );
}
