// lib/matrix-parser.ts
// Parses the matrix.pdf — 8 probability columns per course:
// [2nd Year: Fav, Great, Good, Acceptable] [1st Year: Fav, Great, Good, Acceptable]

import type { MatrixEntry, EnrollmentProbabilities, Course } from "./types";

function toDecimal(val: number): number {
  return val > 1 ? val / 100 : val;
}

function buildProbabilities(nums: number[]): EnrollmentProbabilities {
  const p = [...nums, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN].slice(0, 8);
  const safe = (v: number, fallback: number) => (isNaN(v) ? fallback : toDecimal(v));
  return {
    year2: {
      favorite:   safe(p[0], 0.85),
      great:      safe(p[1], 0.65),
      good:       safe(p[2], 0.35),
      acceptable: safe(p[3], 0.20),
    },
    year1: {
      favorite:   safe(p[4], 0.75),
      great:      safe(p[5], 0.55),
      good:       safe(p[6], 0.25),
      acceptable: safe(p[7], 0.12),
    },
  };
}

export function parseMatrixText(text: string): MatrixEntry[] {
  const entries: MatrixEntry[] = [];
  const seen = new Set<string>();

  for (const line of text.split("\n")) {
    const codeMatch = line.match(/\b([A-Z]{2,6}B?\d{4}[A-Z]?)\b/);
    if (!codeMatch) continue;
    const code = codeMatch[1];
    if (seen.has(code)) continue;
    seen.add(code);

    const nums: number[] = [];
    for (const m of line.matchAll(/(\d{1,3})%/g)) {
      const n = parseFloat(m[1]);
      if (n >= 0 && n <= 100) nums.push(n);
    }
    if (nums.length < 4) continue;

    entries.push({ courseCode: code, probabilities: buildProbabilities(nums.slice(-8)) });
  }
  return entries;
}

export function mergeMatrixWithCourses(courses: Course[], matrix: MatrixEntry[]): Course[] {
  const map = new Map<string, MatrixEntry>();
  for (const e of matrix) map.set(e.courseCode.toLowerCase().replace(/\s+/g, ""), e);

  return courses.map((c) => {
    const key = c.code.toLowerCase().replace(/\s+/g, "");
    const entry = map.get(key);
    return entry ? { ...c, enrollmentProbabilities: entry.probabilities } : c;
  });
}
