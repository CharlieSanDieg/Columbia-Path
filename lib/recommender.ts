// lib/recommender.ts
// Ranks courses using vibe scoring + keyword similarity.
// Probability is now looked up by year + intended ranking tier.

import type { Course, UserPreferences, RankedCourse, RankingTier } from "./types";

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);
}

function cosineSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((w) => setB.has(w));
  if (!setA.size || !setB.size) return 0;
  return intersection.length / Math.sqrt(setA.size * setB.size);
}

function keywordMatch(goals: string, course: Course): { score: number; matched: string[] } {
  const goalTokens = tokenize(goals);
  const courseTokens = [
    ...tokenize(course.title),
    ...tokenize(course.description),
    ...course.skills.flatMap(tokenize),
    ...tokenize(course.tldr),
  ];
  const matched = goalTokens.filter((t) => courseTokens.includes(t));
  return {
    score: Math.min(1, cosineSimilarity(goalTokens, courseTokens) * 3),
    matched: [...new Set(matched)],
  };
}

/** Pick the single probability that applies to this user */
export function getProbabilityForUser(
  course: Course,
  year: 1 | 2,
  tier: RankingTier
): number {
  const yearKey = year === 1 ? "year1" : "year2";
  return course.enrollmentProbabilities[yearKey][tier];
}

function vibeScore(
  course: Course,
  vibe: UserPreferences["vibe"],
  prob: number
): number {
  switch (vibe) {
    case "rigor":
      // High workload + low probability (exclusive/prestigious)
      return (course.workloadIndex / 10) * 0.6 + (1 - prob) * 0.4;
    case "balance":
      // High probability + low assignment frequency
      return prob * 0.5 + Math.max(0, 1 - course.assignmentFrequency / 5) * 0.5;
    case "skills":
      // Handled primarily via keyword match; boost by skill breadth
      return Math.min(1, course.skills.length / 10);
  }
}

export function rankCourses(courses: Course[], prefs: UserPreferences): RankedCourse[] {
  const results: RankedCourse[] = [];

  for (const course of courses) {
    if (course.year !== "both" && course.year !== prefs.year) continue;
    if (prefs.noFriday && course.schedule?.friday) continue;
    if (prefs.noMorning && course.schedule?.morning) continue;

    const recTier = (["acceptable","good","great","favorite"] as const)
      .find(t => course.enrollmentProbabilities[prefs.year === 1 ? "year1" : "year2"][t] >= 0.70)
      ?? "acceptable";
    const prob = getProbabilityForUser(course, prefs.year, recTier);
    const { score: kwScore, matched } = keywordMatch(prefs.goals, course);
    const vs = vibeScore(course, prefs.vibe, prob);

    const finalScore =
      prefs.vibe === "skills" ? kwScore * 0.7 + vs * 0.3 :
      prefs.vibe === "rigor"  ? vs * 0.6 + kwScore * 0.4 :
                                vs * 0.5 + kwScore * 0.5;

    results.push({
      ...course,
      matchScore: Math.round(finalScore * 100),
      vibeScore: Math.round(vs * 100),
      probabilityForUser: prob,
      matchedKeywords: matched.slice(0, 6),
    });
  }

  return results.sort((a, b) => b.matchScore - a.matchScore);
}
