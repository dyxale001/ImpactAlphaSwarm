import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  LearningArticle,
  LearningCategory,
} from "../data/learningContent";

export type AdminLearningArticle = LearningArticle & {
  category_name: string;
  category_display_order: number;
};

export type AdminLearningAnswer = {
  id: string;
  question_id: string;
  answer: string;
  is_correct: boolean;
  display_order: number;
};

export type AdminLearningQuestion = {
  id: string;
  article_id: string;
  question: string;
  display_order: number;
  answers: AdminLearningAnswer[];
};

export type LearningQuestionFormValues = {
  question: string;
  display_order: number;
};

export type LearningAnswerFormValues = {
  answer: string;
  display_order: number;
  is_correct: boolean;
};

const emptyQuestionFormValues: LearningQuestionFormValues = {
  question: "",
  display_order: 1,
};

const emptyAnswerFormValues: LearningAnswerFormValues = {
  answer: "",
  display_order: 1,
  is_correct: false,
};

export function useAdminLearningQuestions() {
  const [articles, setArticles] = useState<AdminLearningArticle[]>([]);
  const [categories, setCategories] = useState<LearningCategory[]>([]);
  const [questions, setQuestions] = useState<AdminLearningQuestion[]>([]);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const articleById = useMemo(
    () => new Map(articles.map((article) => [article.id, article])),
    [articles],
  );

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const fetchArticles = useCallback(async () => {
    setLoadingArticles(true);
    setError(null);

    const [categoriesResult, articlesResult] = await Promise.all([
      supabase
        .from("learning_categories")
        .select("id, name, display_order")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("learning_articles")
        .select(
          "id, category_id, title, slug, summary, content, difficulty_level, created_at",
        )
        .order("title", { ascending: true }),
    ]);

    if (categoriesResult.error) {
      setError(categoriesResult.error.message);
      setLoadingArticles(false);
      return;
    }

    if (articlesResult.error) {
      setError(articlesResult.error.message);
      setLoadingArticles(false);
      return;
    }

    const categoryMap = new Map(
      ((categoriesResult.data ?? []) as LearningCategory[]).map((category) => [
        category.id,
        category,
      ]),
    );

    const nextArticles = ((articlesResult.data ?? []) as LearningArticle[])
      .map((article) => {
        const category = categoryMap.get(article.category_id);

        return {
          ...article,
          category_name: category?.name ?? "Uncategorized",
          category_display_order:
            category?.display_order ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .sort(
        (left, right) =>
          left.category_display_order - right.category_display_order ||
          left.category_name.localeCompare(right.category_name) ||
          left.title.localeCompare(right.title),
      );

    setArticles(nextArticles);
    setCategories((categoriesResult.data ?? []) as LearningCategory[]);
    setLoadingArticles(false);
  }, []);

  const fetchQuestions = useCallback(async (articleId: string) => {
    setLoadingQuestions(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("learning_questions")
      .select(
        `
          id,
          article_id,
          question,
          display_order,
          answers:learning_answers(
            id,
            question_id,
            answer,
            is_correct,
            display_order
          )
        `,
      )
      .eq("article_id", articleId)
      .order("display_order", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      setQuestions([]);
      setLoadingQuestions(false);
      return;
    }

    setQuestions(
      ((data ?? []) as AdminLearningQuestion[]).map((question) => ({
        ...question,
        display_order: Number(question.display_order),
        answers: [...(question.answers ?? [])].sort(
          (left, right) =>
            Number(left.display_order) - Number(right.display_order),
        ),
      })),
    );
    setLoadingQuestions(false);
  }, []);

  useEffect(() => {
    void fetchArticles();
  }, [fetchArticles]);

  useEffect(() => {
    if (!activeArticleId) {
      setQuestions([]);
      return;
    }

    void fetchQuestions(activeArticleId);
  }, [activeArticleId, fetchQuestions]);

  const selectArticle = (articleId: string | null) => {
    setActiveArticleId(articleId);
  };

  const refreshQuestions = useCallback(async () => {
    if (!activeArticleId) {
      setQuestions([]);
      return;
    }

    await fetchQuestions(activeArticleId);
  }, [activeArticleId, fetchQuestions]);

  const hasQuestionDisplayOrderConflict = useCallback(
    async (articleId: string, displayOrder: number, questionId?: string) => {
      const { data, error: conflictError } = await supabase
        .from("learning_questions")
        .select("id")
        .eq("article_id", articleId)
        .eq("display_order", displayOrder);

      if (conflictError) {
        throw new Error(conflictError.message);
      }

      return (data ?? []).some((question) => question.id !== questionId);
    },
    [],
  );

  const createQuestion = async (
    articleId: string,
    values: LearningQuestionFormValues,
  ) => {
    const hasDuplicateDisplayOrder = await hasQuestionDisplayOrderConflict(
      articleId,
      values.display_order,
    );

    if (hasDuplicateDisplayOrder) {
      throw new Error(
        `Question display order ${values.display_order} already exists for this article.`,
      );
    }

    const { error: createError } = await supabase
      .from("learning_questions")
      .insert({
        article_id: articleId,
        question: values.question.trim(),
        display_order: values.display_order,
      });

    if (createError) {
      if (createError.code === "23505") {
        throw new Error(
          `Question display order ${values.display_order} already exists for this article.`,
        );
      }

      throw new Error(createError.message);
    }

    await refreshQuestions();
  };

  const updateQuestion = async (
    id: string,
    values: LearningQuestionFormValues,
  ) => {
    const existingQuestion = questions.find((question) => question.id === id);

    if (!existingQuestion) {
      throw new Error("The selected question could not be found.");
    }

    const hasDuplicateDisplayOrder = await hasQuestionDisplayOrderConflict(
      existingQuestion.article_id,
      values.display_order,
      id,
    );

    if (hasDuplicateDisplayOrder) {
      throw new Error(
        `Question display order ${values.display_order} already exists for this article.`,
      );
    }

    const { error: updateError } = await supabase
      .from("learning_questions")
      .update({
        question: values.question.trim(),
        display_order: values.display_order,
      })
      .eq("id", id);

    if (updateError) {
      if (updateError.code === "23505") {
        throw new Error(
          `Question display order ${values.display_order} already exists for this article.`,
        );
      }

      throw new Error(updateError.message);
    }

    await refreshQuestions();
  };

  const deleteQuestion = async (id: string) => {
    const { error: deleteError } = await supabase
      .from("learning_questions")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    await refreshQuestions();
  };

  const createAnswer = async (
    questionId: string,
    values: LearningAnswerFormValues,
  ) => {
    const question = questions.find((entry) => entry.id === questionId);

    if (!question) {
      throw new Error("The selected question could not be found.");
    }

    const hasDuplicateDisplayOrder = question.answers.some(
      (answer) => answer.display_order === values.display_order,
    );

    if (hasDuplicateDisplayOrder) {
      throw new Error(
        `Answer display order ${values.display_order} already exists for this question.`,
      );
    }

    if (!values.is_correct) {
      const hasExistingCorrectAnswer = question.answers.some(
        (answer) => answer.is_correct,
      );

      if (!hasExistingCorrectAnswer) {
        throw new Error("Each question must have exactly one correct answer.");
      }
    }

    if (values.is_correct) {
      const { error: updateOthersError } = await supabase
        .from("learning_answers")
        .update({ is_correct: false })
        .eq("question_id", questionId);

      if (updateOthersError) {
        throw new Error(updateOthersError.message);
      }
    }

    const { error: createError } = await supabase
      .from("learning_answers")
      .insert({
        question_id: questionId,
        answer: values.answer.trim(),
        display_order: values.display_order,
        is_correct: values.is_correct,
      });

    if (createError) {
      throw new Error(createError.message);
    }

    await refreshQuestions();
  };

  const updateAnswer = async (
    questionId: string,
    answerId: string,
    values: LearningAnswerFormValues,
  ) => {
    const question = questions.find((entry) => entry.id === questionId);

    if (!question) {
      throw new Error("The selected question could not be found.");
    }

    const existingAnswer = question.answers.find(
      (answer) => answer.id === answerId,
    );

    if (!existingAnswer) {
      throw new Error("The selected answer could not be found.");
    }

    const hasDuplicateDisplayOrder = question.answers.some(
      (answer) =>
        answer.id !== answerId &&
        answer.display_order === values.display_order &&
        values.display_order !== existingAnswer.display_order,
    );

    if (hasDuplicateDisplayOrder) {
      throw new Error(
        `Answer display order ${values.display_order} already exists for this question.`,
      );
    }

    if (!values.is_correct) {
      const hasAnotherCorrectAnswer = question.answers.some(
        (answer) => answer.id !== answerId && answer.is_correct,
      );

      if (!hasAnotherCorrectAnswer) {
        throw new Error("Each question must have exactly one correct answer.");
      }
    }

    if (values.is_correct) {
      const { error: updateOthersError } = await supabase
        .from("learning_answers")
        .update({ is_correct: false })
        .eq("question_id", questionId)
        .neq("id", answerId);

      if (updateOthersError) {
        throw new Error(updateOthersError.message);
      }
    }

    const { error: updateError } = await supabase
      .from("learning_answers")
      .update({
        answer: values.answer.trim(),
        display_order: values.display_order,
        is_correct: values.is_correct,
      })
      .eq("id", answerId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await refreshQuestions();
  };

  const deleteAnswer = async (questionId: string, answerId: string) => {
    const question = questions.find((entry) => entry.id === questionId);

    if (!question) {
      throw new Error("The selected question could not be found.");
    }

    const answer = question.answers.find((entry) => entry.id === answerId);

    if (!answer) {
      throw new Error("The selected answer could not be found.");
    }

    if (answer.is_correct) {
      const hasAnotherCorrectAnswer = question.answers.some(
        (entry) => entry.id !== answerId && entry.is_correct,
      );

      if (!hasAnotherCorrectAnswer) {
        throw new Error(
          "Set another answer as correct before deleting this one.",
        );
      }
    }

    const { error: deleteError } = await supabase
      .from("learning_answers")
      .delete()
      .eq("id", answerId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    await refreshQuestions();
  };

  return {
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
    refreshQuestions,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    createAnswer,
    updateAnswer,
    deleteAnswer,
    emptyQuestionFormValues,
    emptyAnswerFormValues,
  };
}
