// lib/scheduler.ts
// Builds 3 schedule options from ranked courses, resolving section conflicts.

import type {
  Course, CourseSection, UserPreferences, ScheduledCourse,
  ScheduleOption, RankingTier, EnrollmentProbabilities
} from "./types";

// ── helpers ──────────────────────────────────────────────────────────────────

function parseTime(t: string): number {
  // "9:00 AM" → minutes from midnight
  if (!t) return 0;
  const m = t.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  const min = parseInt(m[2] || "0");
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function sectionsOverlap(a: CourseSection, b: CourseSection): boolean {
  const sharedDay = a.days.some(d => b.days.includes(d));
  if (!sharedDay) return false;
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

function conflictsWithSchedule(section: CourseSection, scheduled: CourseSection[]): boolean {
  return scheduled.some(s => sectionsOverlap(s, section));
}

export function getEnrollmentProb(
  probs: EnrollmentProbabilities,
  year: 1 | 2,
  tier: RankingTier
): number {
  return probs[year === 1 ? "year1" : "year2"][tier];
}

// Recommend the best ranking tier that gives ≥70% odds, or the best available
export function recommendRanking(
  probs: EnrollmentProbabilities,
  year: 1 | 2
): RankingTier {
  const tiers: RankingTier[] = ["acceptable", "good", "great", "favorite"];
  const yearProbs = probs[year === 1 ? "year1" : "year2"];
  // Find lowest tier that gives ≥70%
  for (const tier of tiers) {
    if (yearProbs[tier] >= 0.70) return tier;
  }
  // Otherwise return the tier with the best odds
  return tiers.reduce((best, t) =>
    yearProbs[t] > yearProbs[best] ? t : best
  , "acceptable" as RankingTier);
}

// Tokenize for keyword matching
function tokenize(t: string): string[] {
  return t.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 3);
}

function matchScore(goals: string, course: Course): { score: number; matched: string[] } {
  const g = tokenize(goals);
  const c = [
    ...tokenize(course.title),
    ...tokenize(course.description),
    ...course.skills.flatMap(tokenize),
    ...tokenize(course.tldr),
  ];
  const matched = g.filter(w => c.includes(w));
  const setG = new Set(g), setC = new Set(c);
  const inter = [...setG].filter(w => setC.has(w)).length;
  const sim = (setG.size && setC.size) ? inter / Math.sqrt(setG.size * setC.size) : 0;
  return { score: Math.round(Math.min(1, sim * 3) * 100), matched: [...new Set(matched)].slice(0, 5) };
}

// Pick the best non-conflicting section for a course
function pickSection(
  course: Course,
  locked: CourseSection[],
  prefs: UserPreferences
): CourseSection | null {
  const sections = course.sections?.length ? course.sections : legacySection(course);
  for (const sec of sections) {
    if (prefs.noFriday && sec.friday) continue;
    if (prefs.noMorning && sec.morning) continue;
    if (!conflictsWithSchedule(sec, locked)) return sec;
  }
  return null;
}

// Build a CourseSection from legacy schedule field
function legacySection(course: Course): CourseSection[] {
  const s = course.schedule;
  if (!s) return [{
    sectionNumber: 1, days: [], startTime: "", endTime: "",
    startMinutes: 0, endMinutes: 0, morning: false, friday: false
  }];
  const start = parseTime(s.time);
  return [{
    sectionNumber: 1,
    days: s.days,
    startTime: s.time,
    endTime: "",
    startMinutes: start,
    endMinutes: start + 90,
    morning: s.morning,
    friday: s.friday,
    instructor: course.instructor,
  }];
}

// ── main builder ─────────────────────────────────────────────────────────────

interface ScoredCourse extends Course {
  score: number;
  matched: string[];
  recRanking: RankingTier;
  prob: number;
}

function scoreCourses(courses: Course[], prefs: UserPreferences): ScoredCourse[] {
  return courses
    .filter(c => c.year === "both" || c.year === prefs.year)
    .map(c => {
      const { score, matched } = matchScore(prefs.goals, c);
      const recRanking = recommendRanking(c.enrollmentProbabilities, prefs.year);
      const prob = getEnrollmentProb(c.enrollmentProbabilities, prefs.year, recRanking);
      let vibeBonus = 0;
      if (prefs.vibe === "rigor") vibeBonus = (c.workloadIndex / 10) * 20;
      if (prefs.vibe === "balance") vibeBonus = prob * 20;
      if (prefs.vibe === "skills") vibeBonus = (c.skills.length / 12) * 20;
      return { ...c, score: score + vibeBonus, matched, recRanking, prob };
    })
    .sort((a, b) => b.score - a.score);
}

function buildOption(
  scored: ScoredCourse[],
  prefs: UserPreferences,
  strategy: "best" | "safe" | "diverse",
  targetCredits: number
): ScheduledCourse[] {
  const selected: ScheduledCourse[] = [];
  const lockedSections: CourseSection[] = [];
  let credits = 0;

  // For "safe" option: sort by probability desc
  // For "diverse" option: shuffle by division
  const pool = strategy === "safe"
    ? [...scored].sort((a, b) => b.prob - a.prob)
    : strategy === "diverse"
    ? diverseShuffle(scored)
    : scored;

  for (const course of pool) {
    if (credits >= targetCredits) break;

    const section = pickSection(course, lockedSections, prefs);
    if (!section) continue;

    selected.push({
      ...course,
      matchScore: Math.round(course.score),
      probabilityForUser: course.prob,
      matchedKeywords: course.matched,
      recommendedRanking: course.recRanking,
      assignedSection: section,
    });

    lockedSections.push(section);
    credits += course.credits;
  }

  return selected;
}

function diverseShuffle(courses: ScoredCourse[]): ScoredCourse[] {
  // Interleave by division to ensure variety
  const byDiv = new Map<string, ScoredCourse[]>();
  for (const c of courses) {
    const div = c.division || "Other";
    if (!byDiv.has(div)) byDiv.set(div, []);
    byDiv.get(div)!.push(c);
  }
  const result: ScoredCourse[] = [];
  const queues = [...byDiv.values()];
  let i = 0;
  while (result.length < courses.length) {
    const q = queues[i % queues.length];
    if (q.length) result.push(q.shift()!);
    i++;
    if (queues.every(q => !q.length)) break;
  }
  return result;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function buildScheduleOptions(
  courses: Course[],
  prefs: UserPreferences
): ScheduleOption[] {
  const scored = scoreCourses(courses, prefs);
  const target = prefs.targetCredits + 6;

  const optA = buildOption(scored, prefs, "best", target);
  const remainingAfterA = scored.filter(c => !optA.some(sc => sc.id === c.id));

  const optB = buildOption(remainingAfterA, prefs, "safe", target);
  const remainingAfterB = remainingAfterA.filter(c => !optB.some(sc => sc.id === c.id));

  const optC = buildOption(remainingAfterB, prefs, "diverse", target);

  const makeOption = (
    id: "A" | "B" | "C",
    label: string,
    desc: string,
    courses: ScheduledCourse[]
  ): ScheduleOption => ({
    id, label, description: desc, courses,
    totalCredits: courses.reduce((s, c) => s + c.credits, 0),
    avgProbability: Math.round(avg(courses.map(c => c.probabilityForUser)) * 100),
    avgMatchScore: Math.round(avg(courses.map(c => c.matchScore))),
  });

  return [
    makeOption("A", "Best Match", "Highest alignment with your stated goals", optA),
    makeOption("B", "Highest Odds", "Best enrollment probability across all courses", optB),
    makeOption("C", "Broadest Exposure", "Diverse mix across departments", optC),
  ];
}
