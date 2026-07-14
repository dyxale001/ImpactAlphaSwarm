export type LearningArticle = {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  created_at: string;
};

export type LearningCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  display_order: number;
  created_at: string;
  articles: LearningArticle[];
};
