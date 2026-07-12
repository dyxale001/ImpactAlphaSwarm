import type { LearningArticle } from "../../data/learningContent";

type Props = {
  article: LearningArticle | null;
  onClose: () => void;
};

export default function ArticleViewerModal({ article, onClose }: Props) {
  if (!article) return null;

  return (
    <div
      className="
fixed
inset-0
bg-black/40
flex
items-center
justify-center
z-50
 p-4
"
    >
      <div
        className="
bg-brand-card
rounded-3xl
max-w-4xl
w-full
max-h-[85vh]
overflow-hidden
border
border-brand-border/60
shadow-xl
flex
flex-col
"
      >
        <div className="flex items-center justify-between gap-4 border-b border-brand-border/60 bg-brand-bg/60 px-6 py-4">
          <h1 className="text-xl font-semibold text-brand-fg">
            {article.title}
          </h1>
          <button
            onClick={onClose}
            className="rounded-full border border-brand-border/60 px-3 py-1.5 text-sm text-brand-muted-fg transition-colors hover:bg-brand-bg hover:text-brand-fg"
          >
            Close
          </button>
        </div>

        <div className="learning-modal-scrollbar overflow-y-auto px-6 py-6">
          <div className="prose prose-sm max-w-none text-brand-fg prose-headings:text-brand-fg prose-p:text-brand-muted-fg prose-li:text-brand-muted-fg">
            {article.content}
          </div>
        </div>
      </div>
    </div>
  );
}
