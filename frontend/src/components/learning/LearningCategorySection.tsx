import type { LearningArticle, LearningCategory } from "../../types/learning";
import LearningCard from "./LearningCard";

type Props = {
  category: LearningCategory;
  onOpenArticle: (article: LearningArticle) => void;
  onTakeQuiz: (article: LearningArticle) => void;
  getArticleQuizScore: (articleId: string) => number | null;
};

export default function LearningCategorySection({
  category,
  onOpenArticle,
  onTakeQuiz,
  getArticleQuizScore,
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

      <div
        className="
grid grid-cols-1
md:grid-cols-2
xl:grid-cols-3
gap-4
"
      >
        {category.articles.map((article) => (
          <LearningCard
            key={article.id}
            article={article}
            onOpenArticle={onOpenArticle}
            onTakeQuiz={onTakeQuiz}
            canTakeQuiz={true}
            hasPerfectScore={getArticleQuizScore(article.id) === 100}
          />
        ))}
      </div>
    </section>
  );
}
