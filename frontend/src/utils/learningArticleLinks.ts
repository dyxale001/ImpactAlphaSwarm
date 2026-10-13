export function articleLinkParams(params: URLSearchParams, articleId: string | null) {
  const next = new URLSearchParams(params);
  next.delete("quiz");
  if (articleId === null) next.delete('article'); else next.set('article', articleId);
  return next;
}
export function resolveArticle<T extends { id: string }>(articles: T[], params: URLSearchParams): T | null {
  const id = params.get('article');
  return articles.find(article => String(article.id) === id) ?? null;
}
