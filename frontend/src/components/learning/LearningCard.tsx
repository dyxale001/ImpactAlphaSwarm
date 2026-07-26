import type { LearningArticle } from "../../data/learningContent";

type Props = {
  article: LearningArticle;
  onOpenArticle: (article: LearningArticle) => void;
};

export default function LearningCard({ article, onOpenArticle }: Props) {
  return (
    <article
      className="
glass-card
rounded-2xl
p-5
"
    >
      <div className="mb-3 inline-flex rounded-full border border-brand-border bg-brand-bg/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-primary">
        {article.difficulty_level}
      </div>

      <h3
        className="
font-semibold
text-brand-fg
"
      >
        {article.title}
      </h3>

      <p
        className="
text-sm
text-brand-muted-fg
mt-2
"
      >
        {article.summary}
      </p>

      <button
        onClick={() => onOpenArticle(article)}
        className="
mt-5
px-4
py-2
rounded-full
bg-brand-surface
border
border-brand-border
text-sm
"
      >
        Read Article
      </button>
    </article>
  );
}
