import type { LearningArticle, LearningCategory, LearningQuizStatus } from "../../types/learning";
import LearningCard from "./LearningCard";

type Props = {
  category: LearningCategory;
  onOpenArticle: (article: LearningArticle) => void;
  onTakeQuiz: (article: LearningArticle) => void;
  getArticleQuizScore: (articleId: string) => number | null;
  getArticleQuizStatus?: (articleId: string) => LearningQuizStatus | undefined;
};

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
        <h2
          className="
text-xl font-semibold text-brand-fg
"
        >
          {category.name}
        </h2>

        <p
          className="
text-sm text-brand-muted-fg
"
        >
          {category.description}
        </p>
      </div>

      <div className="flex gap-4 overflow-x-auto py-6 pb-10 scroll-smooth [scrollbar-width:thin] [scrollbar-color:theme(colors.brand-border)_transparent]">
        {category.articles.map((article) => (
          <div key={article.id} className="w-[min(20rem,80vw)] shrink-0 snap-start">
            <LearningCard
              article={article}
              onOpenArticle={onOpenArticle}
              onTakeQuiz={onTakeQuiz}
              canTakeQuiz={(article.quiz_question_count ?? 0) > 0}
              hasPerfectScore={getArticleQuizScore(article.id) === 100}
              quizStatus={getArticleQuizStatus?.(article.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
