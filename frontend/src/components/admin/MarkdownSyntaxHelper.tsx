type MarkdownSyntaxHelperProps = {
  className?: string;
};

const examples = [
  {
    label: "Heading 1",
    code: "# Article title",
  },
  {
    label: "Heading 2",
    code: "## Section heading",
  },
  {
    label: "Heading 3",
    code: "### Subsection heading",
  },
  {
    label: "Bold",
    code: "**Important insight**",
  },
  {
    label: "Inline code",
    code: "'code'",
  },
  {
    label: "Bullet list",
    code: "- First point\n- Second point\n- Third point",
  },
  {
    label: "Numbered list",
    code: "1. First step\n2. Second step\n3. Third step",
  },
  {
    label: "Divider",
    code: "---",
  },
  {
    label: "Link",
    code: "[Read the report](https://example.com)",
  },
  {
    label: "Callout",
    code: "> Insight: keep the summary short and practical.",
  },
  {
    label: "Code block",
    code: "```\nconst example = true\n```",
  },
];

export default function MarkdownSyntaxHelper({
  className = "",
}: MarkdownSyntaxHelperProps) {
  return (
    <aside
      className={`rounded-2xl border border-brand-border/60 bg-brand-card overflow-hidden ${className}`}
    >
      <div className="border-b border-brand-border/50 bg-brand-bg/50 px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-brand-primary font-semibold">
            Markdown guide
          </p>
          <p className="text-sm text-brand-muted-fg mt-1">
            Copy these snippets into the editor to format article content.
          </p>
        </div>
      </div>

      <div className="max-h-96 lg:max-h-128 overflow-y-auto article-viewer-scrollbar px-4 py-4 space-y-3">
        {examples.map((example) => (
          <div
            key={example.label}
            className="rounded-xl border border-brand-border/60 bg-brand-bg/40 p-3"
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-brand-muted-fg">
                {example.label}
              </span>
              <span className="text-[11px] text-brand-muted-fg">
                Copy-friendly
              </span>
            </div>
            <pre className="overflow-x-auto text-xs leading-6 text-brand-fg font-mono whitespace-pre-wrap wrap-break-word m-0">
              <code>{example.code}</code>
            </pre>
          </div>
        ))}
      </div>
    </aside>
  );
}
