import ReactMarkdown, { type Components } from "react-markdown";

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
    <div className="my-8 overflow-x-auto rounded-2xl border border-brand-border/60 shadow-sm">
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

type MarkdownRendererProps = {
  content: string;
};

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>;
}