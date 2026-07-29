export type LearningDifficultyLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

export type LearningQuizStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type LearningAnswer = {
  id: string;
  question_id: string;
  answer: string;
  is_correct: boolean;
  display_order: number;
};

export type LearningQuestion = {
  id: string;
  article_id: string;
  question: string;
  display_order: number;
  answers: LearningAnswer[];
};

export type LearningArticle = {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  difficulty_level: LearningDifficultyLevel;
  created_at: string;
  questions: LearningQuestion[];
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

export type LearningProgress = {
  id: string;
  user_id: string;
  article_id: string;
  status: LearningQuizStatus;
  quiz_score: number | null;
};

export type LearningBadge = {
  id: string;
  name: string;
  description: string;
  icon_path: string;
  icon_url?: string | null;
  criteria_type: string;
  criteria_value: string;
  created_at: string;
};

export type LearningQuizResult = {
  score: number;
  passed: boolean;
  xpEarned: number;
  newlyEarnedBadges: LearningBadge[];
  updatedLearningXp: number;
};
