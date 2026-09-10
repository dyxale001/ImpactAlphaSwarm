import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";
import {
  fetchLearningBadges,
  fetchLearningCentreData,
  fetchLearningUserState,
} from "../services/supabase/learningService";
import type { LearningArticle, LearningBadge } from "../types/learning";

// The learning centre reduced to what a dashboard tile needs: how far along the
// user is, and what to read next.
//
// The learning page itself loads the same three sources but keeps every article,
// every question and every answer in state because it renders all of them. This
// asks the same questions and throws almost all of it away, which is the point:
// a widget that held the full content tree would make the dashboard's first
// paint wait on it.

export interface LearningSummary {
  learningXp: number;
  articlesCompleted: number;
  articlesTotal: number;
  badgesEarned: number;
  badgesTotal: number;
  /** The first article they have not finished, in category then publication
   *  order. Null once everything is done. */
  nextArticle: LearningArticle | null;
  nextArticleCategory: string | null;
  earnedBadges: LearningBadge[];
  isLoading: boolean;
  error: string | null;
}

const EMPTY: LearningSummary = {
  learningXp: 0,
  articlesCompleted: 0,
  articlesTotal: 0,
  badgesEarned: 0,
  badgesTotal: 0,
  nextArticle: null,
  nextArticleCategory: null,
  earnedBadges: [],
  isLoading: true,
  error: null,
};

export function useLearningSummary(): LearningSummary {
  const { profile } = useAuthStore();
  const userId = profile?.id;
  const [summary, setSummary] = useState<LearningSummary>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!userId) {
        setSummary({ ...EMPTY, isLoading: false });
        return;
      }
      setSummary((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const [categories, badges, userState] = await Promise.all([
          fetchLearningCentreData(),
          fetchLearningBadges(),
          fetchLearningUserState(userId),
        ]);
        if (cancelled) return;

        const articles = categories.flatMap((c) =>
          c.articles.map((a) => ({ article: a, category: c.name })),
        );

        const completed = articles.filter(
          ({ article }) =>
            userState.progressByArticleId[article.id]?.status === "COMPLETED",
        ).length;

        const next = articles.find(
          ({ article }) =>
            userState.progressByArticleId[article.id]?.status !== "COMPLETED",
        );

        setSummary({
          learningXp: userState.learningXp,
          articlesCompleted: completed,
          articlesTotal: articles.length,
          badgesEarned: userState.earnedBadgeIds.size,
          badgesTotal: badges.length,
          nextArticle: next?.article ?? null,
          nextArticleCategory: next?.category ?? null,
          earnedBadges: badges.filter((b) =>
            userState.earnedBadgeIds.has(b.id),
          ),
          isLoading: false,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        console.error("Error loading learning summary:", e);
        setSummary({
          ...EMPTY,
          isLoading: false,
          error: "Unable to load your learning progress.",
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return summary;
}
