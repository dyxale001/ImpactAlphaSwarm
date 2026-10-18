import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root, RootContent, Heading } from 'mdast';

const parser = unified().use(remarkParse);
const normalize = (text: string) => text.normalize('NFKC')
  .replace(/[\u200B\uFEFF]/g, '')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[‐‑–—]/g, '-')
  .replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');

type TextNode = { type: string; value?: string; alt?: string | null; children?: TextNode[] };
function headingText(node: TextNode): string {
  if (node.type === 'image') return node.alt ?? '';
  if (node.type === 'break') return ' ';
  return node.value ?? node.children?.map(headingText).join('') ?? '';
}

function isTitlePreamble(node: RootContent): boolean {
  return node.type === 'definition' ||
    (node.type === 'html' && node.value.replace(/<!--[\s\S]*?-->/g, '').trim() === '');
}

/** Only the opening title position is eligible. Never search past authored
 * prose, code, lists, quotes or a different heading for a coincidental match. */
function equivalentTitle(tree: Root, title: string) {
  const first = tree.children.find(node => !isTitlePreamble(node));
  return first && (first.type === 'heading' || first.type === 'paragraph') &&
    Boolean(normalize(title)) && normalize(headingText(first)) === normalize(title)
    ? first : undefined;
}

export function equivalentArticleTitleOffset(content: string, title: string): number | undefined {
  return equivalentTitle(parser.parse(content), title)?.position?.start.offset;
}

export function hasEquivalentArticleTitle(content: string, title: string): boolean {
  return equivalentArticleTitleOffset(content, title) !== undefined;
}

/** Normalize the title in the same Markdown tree, preserving inline formatting,
 * reference definitions and all remaining content. Metadata is inserted as text,
 * never interpreted as Markdown. Comments/definitions stay in the tree. */
export function remarkArticleTitle({ title }: { title: string }) {
  return (tree: Root) => {
    const existing = equivalentTitle(tree, title);
    const heading: Heading = {
      type: 'heading',
      depth: 1,
      children: existing?.children ?? [{ type: 'text', value: title }],
      position: existing?.position,
      data: { hProperties: { 'data-article-title': true } },
    };
    if (existing) tree.children.splice(tree.children.indexOf(existing), 1);
    tree.children.unshift(heading);
  };
}
