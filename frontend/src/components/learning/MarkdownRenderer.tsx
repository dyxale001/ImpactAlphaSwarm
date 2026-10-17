import type { ReactNode } from "react";
import { remarkArticleTitle } from "../../utils/learningArticleTitle";
import ReactMarkdown, { type Components } from "react-markdown";

function ArticleHeading({ children }: { children?: ReactNode }) {
  return (
    <h1 className="mt-2 rounded-2xl border border-brand-accent/60 bg-brand-accent/15 px-5 py-5 text-2xl font-semibold tracking-tight text-brand-primary md:text-3xl">
      {children}
    </h1>
  );
}

const markdownComponents: Components = {
  h1: ArticleHeading,

  h2: ({ children }) => (
    <h2 className="mt-8 border-l-4 border-brand-accent pl-4 text-xl font-semibold tracking-tight text-brand-primary md:text-2xl first:mt-0">
      {children}
    </h2>
  ),

  h3: ({ children }) => (
    <h3 className="mt-6 border-b border-brand-accent/60 pb-2 text-lg font-semibold tracking-tight text-brand-primary first:mt-0">
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
    <ul className="list-disc space-y-3 py-1 pl-6 text-brand-fg/82 marker:text-brand-primary">{children}</ul>
  ),

  ol: ({ children }) => (
    <ol className="list-decimal space-y-3 py-1 pl-6 text-brand-fg/82 marker:font-semibold marker:text-brand-primary">{children}</ol>
  ),

  li: ({ children }) => (
    <li className="pl-1 text-[15px] leading-7 text-brand-fg/82 [&>p]:my-2 [&>ul]:mt-3 [&>ol]:mt-3">
      {children}
    </li>
  ),

  blockquote: ({ children }) => (
    <blockquote className="my-8 overflow-hidden rounded-2xl border border-brand-accent/60 border-l-4 border-l-brand-primary bg-linear-to-br from-brand-accent/20 via-brand-accent/10 to-brand-card px-5 py-5 shadow-sm">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-accent">
        Insight
      </div>
      <div className="space-y-3 text-[15px] leading-8 text-brand-fg/88">
        {children}
      </div>
    </blockquote>
  ),

  hr: () => <hr className="my-8 border-brand-accent/70" />,

  strong: ({ children }) => (
    <strong className="font-semibold text-brand-primary">{children}</strong>
  ),

  a: ({ children, href }) => (
    <a
      href={href}
      className="rounded-sm font-medium text-brand-primary underline decoration-brand-accent decoration-2 underline-offset-4 transition-colors hover:bg-brand-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
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
        <code className="block overflow-x-auto rounded-2xl border border-brand-border/60 bg-brand-bg px-4 py-3 font-mono text-[13px] leading-7 text-brand-fg">
          {children}
        </code>
      );
    }

    return (
      <code className="rounded-md border border-brand-accent/60 bg-brand-accent/15 px-1.5 py-0.5 font-mono text-[0.92em] text-brand-fg">
        {children}
      </code>
    );
  },

  pre: ({ children }) => (
    <pre className="my-8 overflow-hidden rounded-2xl border border-brand-border/60 bg-brand-bg text-brand-fg shadow-sm">
      {children}
    </pre>
  ),

  table: ({ children }) => (
    <div className="my-8 overflow-x-auto rounded-2xl border border-brand-border/60 shadow-sm">
      <table className="w-full border-collapse bg-brand-card text-left text-sm text-brand-fg">
        {children}
      </table>
    </div>
  ),

  thead: ({ children }) => <thead className="bg-brand-primary">{children}</thead>,

  th: ({ children }) => (
    <th className="border-b border-brand-accent/30 px-4 py-3 text-xs font-semibold uppercase tracking-eyebrow text-brand-accent">
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

type MarkdownRendererProps = {
  content: string;
  articleTitle?: { title: string; afterTitle: ReactNode };
};

export default function MarkdownRenderer({ content, articleTitle }: MarkdownRendererProps) {
  const components = { ...markdownComponents };
  if (articleTitle) {
    components.h1 = ({ node, ...props }) => <>
      <ArticleHeading>{props.children}</ArticleHeading>
      {node?.properties?.["data-article-title"] && articleTitle.afterTitle}
    </>;
  }
  return (
    <ReactMarkdown
      components={components}
      remarkPlugins={articleTitle ? [[remarkArticleTitle, { title: articleTitle.title }]] : []}
    >
      {content}
    </ReactMarkdown>
  );
}
