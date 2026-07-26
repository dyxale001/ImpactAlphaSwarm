import type { LearningArticle } from "../../data/learningContent";
import MarkdownRenderer from "./MarkdownRenderer";

const scrollbarStyles = `
  .article-viewer-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(27, 53, 48, 0.32) rgba(231, 236, 233, 0.9);
    scrollbar-gutter: stable;
  }

  .article-viewer-scrollbar::-webkit-scrollbar {
    width: 10px;
  }

  .article-viewer-scrollbar::-webkit-scrollbar-track {
    background: rgba(231, 236, 233, 0.9);
    border-radius: 999px;
  }

  .article-viewer-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(27, 53, 48, 0.32);
    border: 2px solid rgba(231, 236, 233, 0.9);
    border-radius: 999px;
  }

  .article-viewer-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(27, 53, 48, 0.48);
  }
`;

type Props = {
  article: LearningArticle | null;
  onClose: () => void;
};

export default function ArticleViewerModal({ article, onClose }: Props) {
  if (!article) return null;

  return (
    <>
      <style>{scrollbarStyles}</style>
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
          <div className="border-b border-brand-border/60 bg-brand-bg/70 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-3">
                <span className="inline-flex items-center rounded-full border border-brand-primary/15 bg-brand-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
                  Learning Article
                </span>
                <div className="inline-flex rounded-full border border-brand-border bg-brand-bg/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-primary">
                  {article.difficulty_level}
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-full border border-brand-border/60 bg-brand-card px-3 py-1.5 text-sm text-brand-muted-fg shadow-sm transition-colors hover:bg-brand-bg hover:text-brand-fg"
              >
                Close
              </button>
            </div>
          </div>

          <div className="article-viewer-scrollbar overflow-y-auto px-6 py-7">
            <div className="mx-auto max-w-3xl space-y-8 text-brand-fg">
              <MarkdownRenderer content={article.content} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
