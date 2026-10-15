import { unified } from 'unified';
import remarkParse from 'remark-parse';

const parser = unified().use(remarkParse);
const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');

type TextNode = { type: string; value?: string; alt?: string | null; children?: TextNode[] };
function headingText(node: TextNode): string {
  if (node.type === 'image') return node.alt ?? '';
  if (node.type === 'break') return ' ';
  return node.value ?? node.children?.map(headingText).join('') ?? '';
}

/** Only a leading article heading can replace the metadata title. Later
 * headings and examples in code blocks remain ordinary educational content. */
export function equivalentArticleTitleOffset(content: string, title: string): number | undefined {
  const first = parser.parse(content).children[0];
  return first?.type === 'heading' && Boolean(normalize(title)) &&
    normalize(headingText(first)) === normalize(title) ? first.position?.start.offset : undefined;
}

export function hasEquivalentArticleTitle(content: string, title: string): boolean {
  return equivalentArticleTitleOffset(content, title) !== undefined;
}
