import type { LearningArticle } from "../../data/learningContent";
import ReactMarkdown, { type Components } from "react-markdown";

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

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-brand-fg md:text-3xl">
      {children}
    </h1>
  ),

  h2: ({ children }) => (
    <h2 className="mt-8 text-xl font-semibold tracking-tight text-brand-fg md:text-2xl first:mt-0">
      {children}
    </h2>
  ),

  h3: ({ children }) => (
    <h3 className="mt-6 text-lg font-semibold tracking-tight text-brand-fg first:mt-0">
      {children}
    </h3>
  ),

  h4: ({ children }) => (
    <h4 className="mt-5 text-sm font-semibold uppercase tracking-eyebrow text-brand-primary first:mt-0">
      {children}
    </h4>
  ),

  p: ({ children }) => (
    <p className="text-[15px] leading-8 text-brand-fg/82">{children}</p>
  ),

  ul: ({ children }) => (
    <ul className="space-y-3 py-1 pl-0 text-brand-fg/82">{children}</ul>
  ),

  ol: ({ children }) => (
    <ol className="space-y-3 py-1 pl-0 text-brand-fg/82">{children}</ol>
  ),

  li: ({ children }) => (
    <li className="flex gap-3 text-[15px] leading-7 text-brand-fg/82">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary/75" />
      <span className="min-w-0">{children}</span>
    </li>
  ),

  blockquote: ({ children }) => (
    <blockquote className="my-8 overflow-hidden rounded-2xl border border-brand-border/60 bg-linear-to-br from-brand-bg via-brand-surface to-brand-bg px-5 py-5 shadow-sm">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-primary/15 bg-brand-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
        Insight
      </div>
      <div className="space-y-3 text-[15px] leading-8 text-brand-fg/88">
        {children}
      </div>
    </blockquote>
  ),

  hr: () => <hr className="my-8 border-brand-border/70" />,

  strong: ({ children }) => (
    <strong className="font-semibold text-brand-fg">{children}</strong>
  ),

  a: ({ children, href }) => (
    <a
      href={href}
      className="font-medium text-brand-primary underline decoration-brand-primary/35 underline-offset-4 transition-opacity hover:opacity-80"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),

  code: ({ children, className }) => {
    const isBlockCode = typeof children === "string" && children.includes("\n");

    if (isBlockCode || className?.includes("language-")) {
      return (
        <code className="block overflow-x-auto rounded-2xl border border-brand-border/60 bg-brand-forest-950 px-4 py-3 font-mono text-[13px] leading-7 text-brand-bg">
          {children}
        </code>
      );
    }

    return (
      <code className="rounded-md border border-brand-border/60 bg-brand-bg px-1.5 py-0.5 font-mono text-[0.92em] text-brand-fg">
        {children}
      </code>
    );
  },

  pre: ({ children }) => (
    <pre className="my-8 overflow-hidden rounded-2xl border border-brand-border/60 bg-brand-forest-950 shadow-sm">
      {children}
    </pre>
  ),

  table: ({ children }) => (
    <div className="my-8 overflow-hidden rounded-2xl border border-brand-border/60 shadow-sm">
      <table className="w-full border-collapse bg-brand-card text-left text-sm text-brand-fg">
        {children}
      </table>
    </div>
  ),

  thead: ({ children }) => <thead className="bg-brand-bg/70">{children}</thead>,

  th: ({ children }) => (
    <th className="border-b border-brand-border/60 px-4 py-3 text-xs font-semibold uppercase tracking-eyebrow text-brand-muted-fg">
      {children}
    </th>
  ),

  td: ({ children }) => (
    <td className="border-b border-brand-border/40 px-4 py-3 align-top text-sm leading-7 text-brand-fg/82">
      {children}
    </td>
  ),

  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt}
      className="my-8 w-full rounded-2xl border border-brand-border/60 shadow-sm"
    />
  ),
};

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
              <ReactMarkdown components={markdownComponents}>
                {article.content}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
