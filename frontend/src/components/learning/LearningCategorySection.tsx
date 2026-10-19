import type { LearningArticle, LearningCategory, LearningQuizStatus } from "../../types/learning";
import LearningCard from "./LearningCard";

type Props = {
  category: LearningCategory;
  onOpenArticle: (article: LearningArticle) => void;
  onTakeQuiz: (article: LearningArticle) => void;
  getArticleQuizScore: (articleId: string) => number | null;
  getArticleQuizStatus?: (articleId: string) => LearningQuizStatus | undefined;
};

// A category's lessons as a wrapping grid, so every lesson is in view without a
// sideways scroll (the cards used to run off the right edge in one row).
export default function LearningCategorySection({
  category,
  onOpenArticle,
  onTakeQuiz,
  getArticleQuizScore,
  getArticleQuizStatus,
}: Props) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-[-0.015em] text-forest-900">{category.name}</h2>
        {category.description && <p className="mt-1 text-sm text-brand-muted-fg">{category.description}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {category.articles.map((article) => (
          <LearningCard
            key={article.id}
            article={article}
            onOpenArticle={onOpenArticle}
            onTakeQuiz={onTakeQuiz}
            canTakeQuiz={(article.quiz_question_count ?? 0) > 0}
            hasPerfectScore={getArticleQuizScore(article.id) === 100}
            quizStatus={getArticleQuizStatus?.(article.id)}
          />
        ))}
      </div>
    </section>
  );
}
