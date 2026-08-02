import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Edit3, ListOrdered, Plus, Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";
import AdminLearningQuestionsSkeleton from "../components/admin/AdminLearningQuestionsSkeleton";
import {
  type AdminLearningAnswer,
  type AdminLearningQuestion,
  type LearningAnswerFormValues,
  type LearningQuestionFormValues,
  useAdminLearningQuestions,
} from "../hooks/useAdminLearningQuestions";

type QuestionFormState = {
  id: string | null;
  values: LearningQuestionFormValues;
};

type AnswerFormState = {
  id: string | null;
  values: LearningAnswerFormValues;
};

export default function AdminLearningQuestions() {
  const {
    articles,
    categories,
    articleById,
    categoryById,
    questions,
    activeArticleId,
    loadingArticles,
    loadingQuestions,
    error,
    selectArticle,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    createAnswer,
    updateAnswer,
    deleteAnswer,
    emptyQuestionFormValues,
    emptyAnswerFormValues,
  } = useAdminLearningQuestions();
  const { setSession } = useAuthStore();
  const navigate = useNavigate();

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [isAnswerModalOpen, setIsAnswerModalOpen] = useState(false);
  const [questionForm, setQuestionForm] = useState<QuestionFormState>({
    id: null,
    values: emptyQuestionFormValues,
  });
  const [answerForm, setAnswerForm] = useState<AnswerFormState>({
    id: null,
    values: emptyAnswerFormValues,
  });
  const [managedQuestionId, setManagedQuestionId] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [savingAnswer, setSavingAnswer] = useState(false);

  const isEditingQuestion = Boolean(questionForm.id);
  const isEditingAnswer = Boolean(answerForm.id);

  const selectedArticle = activeArticleId
    ? articleById.get(activeArticleId)
    : null;
  const managedQuestion = managedQuestionId
    ? (questions.find((question) => question.id === managedQuestionId) ?? null)
    : null;

  const filteredArticles = useMemo(() => {
    if (categoryFilter === "all") {
      return articles;
    }

    return articles.filter((article) => article.category_id === categoryFilter);
  }, [articles, categoryFilter]);

  const sortedQuestions = useMemo(
    () =>
      [...questions].sort(
        (left, right) => left.display_order - right.display_order,
      ),
    [questions],
  );

  useEffect(() => {
    if (!successMessage) return;

    const timeout = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore sign out errors
    }

    setSession(null);
    navigate("/", { replace: true });
  };

  const resetQuestionForm = () => {
    setQuestionForm({ id: null, values: emptyQuestionFormValues });
    setActionError(null);
  };

  const resetAnswerForm = () => {
    setAnswerForm({ id: null, values: emptyAnswerFormValues });
    setActionError(null);
  };

  const openCreateQuestionModal = () => {
    if (!selectedArticle) {
      setActionError("Select an article before creating a question.");
      return;
    }

    resetQuestionForm();
    setIsQuestionModalOpen(true);
  };

  const openEditQuestionModal = (question: AdminLearningQuestion) => {
    setQuestionForm({
      id: question.id,
      values: {
        question: question.question,
        display_order: Number(question.display_order),
      },
    });
    setActionError(null);
    setIsQuestionModalOpen(true);
  };

  const openManageAnswers = (question: AdminLearningQuestion) => {
    setManagedQuestionId(question.id);
    setIsAnswerModalOpen(true);
    resetAnswerForm();
  };

  const closeQuestionModal = () => {
    setIsQuestionModalOpen(false);
    resetQuestionForm();
  };

  const closeAnswerModal = () => {
    setIsAnswerModalOpen(false);
    setManagedQuestionId(null);
    resetAnswerForm();
  };

  const handleArticleSelect = (articleId: string) => {
    selectArticle(articleId);
    setActionError(null);
    closeQuestionModal();
    closeAnswerModal();
  };

  const handleQuestionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedArticle) {
      setActionError("Select an article before saving a question.");
      return;
    }

    const trimmedQuestion = questionForm.values.question.trim();
    if (!trimmedQuestion) {
      setActionError("Question cannot be empty.");
      return;
    }

    if (
      !Number.isInteger(questionForm.values.display_order) ||
      questionForm.values.display_order <= 0
    ) {
      setActionError("Display order must be a positive integer.");
      return;
    }

    const hasDuplicateQuestionDisplayOrder = questions.some(
      (question) =>
        question.id !== questionForm.id &&
        question.display_order === questionForm.values.display_order,
    );

    if (hasDuplicateQuestionDisplayOrder) {
      setActionError(
        `Question display order ${questionForm.values.display_order} already exists for this article.`,
      );
      return;
    }

    setSavingQuestion(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      if (questionForm.id) {
        await updateQuestion(questionForm.id, questionForm.values);
        setSuccessMessage("Question updated successfully.");
      } else {
        await createQuestion(selectedArticle.id, questionForm.values);
        setSuccessMessage("Question created successfully.");
      }

      closeQuestionModal();
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save question.",
      );
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleAnswerSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!managedQuestion) {
      setActionError("Select a question before saving an answer.");
      return;
    }

    const trimmedAnswer = answerForm.values.answer.trim();
    if (!trimmedAnswer) {
      setActionError("Answer cannot be empty.");
      return;
    }

    if (
      !Number.isInteger(answerForm.values.display_order) ||
      answerForm.values.display_order <= 0
    ) {
      setActionError("Display order must be a positive integer.");
      return;
    }

    const hasDuplicateAnswerDisplayOrder = managedQuestion.answers.some(
      (answer) =>
        answer.id !== answerForm.id &&
        answer.display_order === answerForm.values.display_order,
    );

    if (hasDuplicateAnswerDisplayOrder) {
      setActionError(
        `Answer display order ${answerForm.values.display_order} already exists for this question.`,
      );
      return;
    }

    setSavingAnswer(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      if (answerForm.id) {
        await updateAnswer(
          managedQuestion.id,
          answerForm.id,
          answerForm.values,
        );
        setSuccessMessage("Answer updated successfully.");
      } else {
        await createAnswer(managedQuestion.id, answerForm.values);
        setSuccessMessage("Answer created successfully.");
      }

      resetAnswerForm();
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save answer.",
      );
    } finally {
      setSavingAnswer(false);
    }
  };

  const startEditAnswer = (answer: AdminLearningAnswer) => {
    setAnswerForm({
      id: answer.id,
      values: {
        answer: answer.answer,
        display_order: answer.display_order,
        is_correct: answer.is_correct,
      },
    });
    setActionError(null);
  };

  const handleDeleteQuestion = async (question: AdminLearningQuestion) => {
    if (!window.confirm("Are you sure you want to delete this question?")) {
      return;
    }

    setActionError(null);
    setSuccessMessage(null);

    try {
      await deleteQuestion(question.id);
      if (managedQuestionId === question.id) {
        closeAnswerModal();
      }
      setSuccessMessage("Question deleted successfully.");
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete question.",
      );
    }
  };

  const handleDeleteAnswer = async (answer: AdminLearningAnswer) => {
    if (!managedQuestion) {
      return;
    }

    if (!window.confirm("Are you sure you want to delete this answer?")) {
      return;
    }

    setActionError(null);
    setSuccessMessage(null);

    try {
      await deleteAnswer(managedQuestion.id, answer.id);
      if (answerForm.id === answer.id) {
        resetAnswerForm();
      }
      setSuccessMessage("Answer deleted successfully.");
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete answer.",
      );
    }
  };

  if (loadingArticles) {
    return <AdminLearningQuestionsSkeleton />;
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
              Questions &amp; Answers
            </h1>
            <p className="text-sm text-brand-muted-fg max-w-3xl">
              Manage quiz questions and answers for each learning article.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-fg text-brand-bg text-sm font-medium"
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
            <span className="text-xl">⚠</span> {error}
          </div>
        )}

        {actionError && (
          <div className="p-4 bg-semantic-danger/10 border border-semantic-danger/30 text-semantic-danger rounded-brand flex items-center gap-3">
            <span className="text-xl">⚠</span> {actionError}
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

        <section className="space-y-6">
          <div className="rounded-brand border border-brand-border bg-background shadow-card p-5 lg:p-6 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-brand-fg">
                  Select an Article
                </h2>
                <p className="text-sm text-brand-muted-fg">
                  Filter by category, then choose the article whose quiz
                  questions you want to manage.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg whitespace-nowrap">
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

                {selectedArticle ? (
                  <div className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-card px-3 py-1.5 text-xs font-medium text-brand-fg">
                    {selectedArticle.category_name} → {selectedArticle.title}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-124 rounded-2xl border border-brand-border bg-brand-card">
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
                    const isSelected = article.id === activeArticleId;

                    return (
                      <tr
                        key={article.id}
                        className={`transition-colors group ${
                          isSelected
                            ? "bg-brand-primary/5"
                            : "hover:bg-brand-bg/30"
                        }`}
                      >
                        <td className="p-5 align-top">
                          <div className="font-semibold text-brand-fg text-base">
                            {article.title}
                          </div>
                        </td>
                        <td className="p-5 align-top text-sm text-brand-fg">
                          {category?.name ??
                            article.category_name ??
                            "Unassigned"}
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
                            onClick={() => handleArticleSelect(article.id)}
                            className="text-brand-primary hover:text-brand-primary-glow font-semibold text-sm transition-colors"
                          >
                            {isSelected ? "Selected" : "Select"}
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
          </div>

          {!selectedArticle ? (
            <div className="rounded-brand border border-dashed border-brand-border bg-background/70 p-8 text-center text-sm text-brand-muted-fg shadow-card">
              Select an article to view and manage its quiz questions.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-brand-fg">
                    Questions List
                  </h2>
                  <p className="text-sm text-brand-muted-fg">
                    Questions are ordered by display order and scoped to the
                    selected article.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreateQuestionModal}
                  className="inline-flex items-center gap-2 rounded-full bg-brand-fg px-4 py-2.5 text-sm font-medium text-brand-bg"
                >
                  <Plus className="h-4 w-4" />
                  Add Question
                </button>
              </div>

              {loadingQuestions ? (
                <div className="rounded-brand border border-brand-border bg-background p-8 text-sm text-brand-muted-fg shadow-card">
                  Loading questions...
                </div>
              ) : sortedQuestions.length === 0 ? (
                <div className="rounded-brand border border-brand-border bg-background p-8 text-sm text-brand-muted-fg shadow-card">
                  No questions exist for this article yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedQuestions.map((question) => (
                    <article
                      key={question.id}
                      className="rounded-brand border border-brand-border bg-background shadow-card p-5 space-y-4"
                    >
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-2">
                          <div className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-muted-fg">
                            <ListOrdered className="h-3.5 w-3.5 text-brand-primary" />
                            Display Order: {question.display_order}
                          </div>
                          <h3 className="text-lg font-semibold text-brand-fg">
                            {question.question}
                          </h3>
                          <p className="text-sm text-brand-muted-fg">
                            {question.answers.length} answers
                          </p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => openEditQuestionModal(question)}
                            className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-card px-3 py-2 text-xs font-medium text-brand-fg transition-colors hover:bg-brand-bg/70"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(question)}
                            className="inline-flex items-center gap-2 rounded-full border border-semantic-danger/30 bg-semantic-danger/10 px-3 py-2 text-xs font-medium text-semantic-danger transition-colors hover:bg-semantic-danger/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => openManageAnswers(question)}
                            className="inline-flex items-center gap-2 rounded-full bg-brand-fg px-3 py-2 text-xs font-medium text-brand-bg"
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            Manage Answers
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {isQuestionModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={closeQuestionModal}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-3xl border border-brand-border/60 bg-brand-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-brand-border/60 bg-brand-bg/70 px-6 py-5">
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full border border-brand-primary/15 bg-brand-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
                  Quiz Question
                </span>
                <h3 className="text-xl font-semibold text-brand-fg">
                  {isEditingQuestion ? "Edit Question" : "Add Question"}
                </h3>
                <p className="text-sm text-brand-muted-fg">
                  {selectedArticle?.category_name} → {selectedArticle?.title}
                </p>
              </div>

              <button
                type="button"
                onClick={closeQuestionModal}
                className="rounded-full border border-brand-border/60 bg-brand-card px-3 py-2 text-sm text-brand-muted-fg transition-colors hover:text-brand-fg"
                aria-label="Close question modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleQuestionSubmit}
              className="space-y-5 px-6 py-6"
            >
              {actionError ? (
                <div className="rounded-2xl border border-semantic-danger/30 bg-semantic-danger/10 px-4 py-3 text-sm text-semantic-danger flex items-center gap-3">
                  <span className="text-xl">⚠</span>
                  <span>{actionError}</span>
                </div>
              ) : null}

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                  Question
                </label>
                <textarea
                  value={questionForm.values.question}
                  onChange={(event) =>
                    setQuestionForm((current) => ({
                      ...current,
                      values: {
                        ...current.values,
                        question: event.target.value,
                      },
                    }))
                  }
                  rows={4}
                  className="w-full rounded-lg border border-brand-border bg-brand-bg p-3 text-sm text-brand-fg placeholder:text-brand-muted-fg focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  placeholder="Enter the quiz question"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={questionForm.values.display_order}
                    onChange={(event) =>
                      (() => {
                        const nextDisplayOrder =
                          event.currentTarget.valueAsNumber;

                        setQuestionForm((current) =>
                          Number.isNaN(nextDisplayOrder)
                            ? current
                            : {
                                ...current,
                                values: {
                                  ...current.values,
                                  display_order: nextDisplayOrder,
                                },
                              },
                        );
                      })()
                    }
                    className="w-full rounded-lg border border-brand-border bg-brand-bg p-3 text-sm text-brand-fg focus:outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={savingQuestion}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-fg px-4 py-2.5 text-sm font-medium text-brand-bg disabled:opacity-50"
                >
                  {savingQuestion
                    ? "Saving..."
                    : isEditingQuestion
                      ? "Update Question"
                      : "Create Question"}
                </button>
                <button
                  type="button"
                  onClick={closeQuestionModal}
                  disabled={savingQuestion}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-border bg-brand-card px-4 py-2.5 text-sm font-medium text-brand-fg disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isAnswerModalOpen && managedQuestion ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={closeAnswerModal}
        >
          <div
            className="flex w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-brand-border/60 bg-brand-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-brand-border/60 bg-brand-bg/70 px-6 py-5">
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-brand-fg">
                  {managedQuestion.question}
                </h3>
                <p className="text-sm text-brand-muted-fg">
                  Answers are ordered by display order and exactly one must be
                  correct.
                </p>
              </div>

              <button
                type="button"
                onClick={closeAnswerModal}
                className="rounded-full border border-brand-border/60 bg-brand-card px-3 py-2 text-sm text-brand-muted-fg transition-colors hover:text-brand-fg"
                aria-label="Close answers modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-[360px_1fr]">
              <form
                onSubmit={handleAnswerSubmit}
                className="space-y-5 rounded-2xl border border-brand-border bg-brand-bg/50 p-5"
              >
                {actionError ? (
                  <div className="rounded-2xl border border-semantic-danger/30 bg-semantic-danger/10 px-4 py-3 text-sm text-semantic-danger flex items-center gap-3">
                    <span className="text-xl">⚠</span>
                    <span>{actionError}</span>
                  </div>
                ) : null}

                <div className="space-y-1">
                  <h4 className="text-base font-semibold text-brand-fg">
                    {isEditingAnswer ? "Edit Answer" : "Add Answer"}
                  </h4>
                  <p className="text-sm text-brand-muted-fg">
                    Create or update answers for the selected question.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                    Answer text
                  </label>
                  <textarea
                    value={answerForm.values.answer}
                    onChange={(event) =>
                      setAnswerForm((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          answer: event.target.value,
                        },
                      }))
                    }
                    rows={4}
                    className="w-full rounded-lg border border-brand-border bg-brand-bg p-3 text-sm text-brand-fg placeholder:text-brand-muted-fg focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    placeholder="Enter the answer text"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                      Display Order
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={answerForm.values.display_order}
                      onChange={(event) =>
                        (() => {
                          const nextDisplayOrder =
                            event.currentTarget.valueAsNumber;

                          setAnswerForm((current) =>
                            Number.isNaN(nextDisplayOrder)
                              ? current
                              : {
                                  ...current,
                                  values: {
                                    ...current.values,
                                    display_order: nextDisplayOrder,
                                  },
                                },
                          );
                        })()
                      }
                      className="w-full rounded-lg border border-brand-border bg-brand-bg p-3 text-sm text-brand-fg focus:outline-none focus:ring-1 focus:ring-brand-primary"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 rounded-2xl border border-brand-border bg-brand-card px-4 py-3 text-sm text-brand-fg">
                  <input
                    type="checkbox"
                    checked={answerForm.values.is_correct}
                    onChange={(event) =>
                      setAnswerForm((current) => ({
                        ...current,
                        values: {
                          ...current.values,
                          is_correct: event.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary"
                  />
                  Correct Answer
                </label>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={savingAnswer}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-fg px-4 py-2.5 text-sm font-medium text-brand-bg disabled:opacity-50"
                  >
                    {savingAnswer
                      ? "Saving..."
                      : isEditingAnswer
                        ? "Update Answer"
                        : "Create Answer"}
                  </button>
                  <button
                    type="button"
                    onClick={resetAnswerForm}
                    disabled={savingAnswer}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-border bg-brand-card px-4 py-2.5 text-sm font-medium text-brand-fg disabled:opacity-50"
                  >
                    Reset
                  </button>
                </div>
              </form>

              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-brand-fg">
                      Answers
                    </h4>
                    <p className="text-sm text-brand-muted-fg">
                      Ordered by display order.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {managedQuestion.answers.length === 0 ? (
                    <div className="rounded-2xl border border-brand-border bg-brand-bg/60 p-6 text-sm text-brand-muted-fg">
                      No answers have been added yet.
                    </div>
                  ) : (
                    managedQuestion.answers.map((answer) => {
                      const isEditingThisAnswer = answerForm.id === answer.id;

                      return (
                        <article
                          key={answer.id}
                          className={`rounded-2xl border p-4 shadow-card ${
                            isEditingThisAnswer
                              ? "border-brand-primary/40 bg-brand-primary/5"
                              : "border-brand-border bg-background"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                                    answer.is_correct
                                      ? "bg-semantic-success/10 text-semantic-success"
                                      : "bg-brand-border/20 text-brand-muted-fg"
                                  }`}
                                >
                                  {answer.is_correct ? "Correct" : "Incorrect"}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-brand-border bg-brand-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-muted-fg">
                                  Order: {answer.display_order}
                                </span>
                              </div>
                              <p className="text-sm leading-6 text-brand-fg">
                                {answer.answer}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => startEditAnswer(answer)}
                                className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-card px-3 py-2 text-xs font-medium text-brand-fg transition-colors hover:bg-brand-bg/70"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAnswer(answer)}
                                className="inline-flex items-center gap-2 rounded-full border border-semantic-danger/30 bg-semantic-danger/10 px-3 py-2 text-xs font-medium text-semantic-danger transition-colors hover:bg-semantic-danger/20"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
