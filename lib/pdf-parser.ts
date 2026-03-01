// lib/pdf-parser.ts
// Utility to parse PDFs server-side using pdf-parse

export async function parsePDF(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid SSR issues
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text;
}

export function extractCourseCode(text: string): string {
  // Match patterns like "COMS 4771", "STAT 5703", "IEOR 4150", "ENGL 3845W"
  const match = text.match(/\b([A-Z]{2,5})\s*(\d{4}[A-Z]?)\b/);
  if (match) return `${match[1]} ${match[2]}`;
  return "";
}

export function extractTitle(text: string, courseCode: string): string {
  // Try to find course title near the course code
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i];
    if (line.includes(courseCode) || (i < 5 && line.length > 5 && line.length < 80)) {
      // Return a cleaned title
      const cleaned = line.replace(courseCode, "").replace(/[:–—-]+/, "").trim();
      if (cleaned.length > 3) return cleaned;
    }
  }
  // Fallback: first substantial line
  return lines.find((l) => l.length > 10 && l.length < 100) || "Untitled Course";
}

export function extractWorkloadIndex(text: string): number {
  const lower = text.toLowerCase();
  let score = 3; // baseline

  const workloadIndicators = [
    { pattern: /weekly assignment/gi, weight: 1.5 },
    { pattern: /problem set/gi, weight: 1 },
    { pattern: /homework/gi, weight: 0.8 },
    { pattern: /midterm/gi, weight: 1 },
    { pattern: /final exam/gi, weight: 1 },
    { pattern: /project/gi, weight: 0.7 },
    { pattern: /attendance/gi, weight: 0.5 },
    { pattern: /presentation/gi, weight: 0.5 },
    { pattern: /research paper/gi, weight: 1.2 },
    { pattern: /lab/gi, weight: 0.8 },
  ];

  for (const { pattern, weight } of workloadIndicators) {
    const matches = (text.match(pattern) || []).length;
    score += matches * weight * 0.4;
  }

  return Math.min(10, Math.max(1, Math.round(score)));
}

export function extractAssignmentFrequency(text: string): number {
  const lower = text.toLowerCase();
  // Look for weekly assignment mentions
  const weekly = (lower.match(/weekly/g) || []).length;
  const biweekly = (lower.match(/bi-?weekly|every other week/g) || []).length;
  const monthly = (lower.match(/monthly/g) || []).length;
  
  return Math.round(weekly * 1 + biweekly * 0.5 + monthly * 0.25 + 0.5);
}

export function extractSkills(text: string): string[] {
  const skillKeywords = [
    "machine learning", "deep learning", "statistics", "probability",
    "programming", "python", "r", "matlab", "data analysis", "data science",
    "algorithms", "optimization", "linear algebra", "calculus",
    "econometrics", "regression", "hypothesis testing", "bayesian",
    "natural language processing", "nlp", "computer vision", "neural networks",
    "finance", "financial modeling", "portfolio", "risk management",
    "research methods", "writing", "communication", "leadership",
    "entrepreneurship", "product management", "marketing", "strategy",
    "database", "sql", "cloud", "distributed systems", "networking",
    "ethics", "policy", "governance", "law", "contracts",
    "stochastic processes", "time series", "forecasting", "simulation",
    "operations research", "supply chain", "logistics",
    "healthcare", "biology", "chemistry", "physics",
  ];

  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const skill of skillKeywords) {
    if (lower.includes(skill)) {
      found.push(skill);
    }
  }

  // Also extract from "Learning Objectives" section
  const objMatch = text.match(/learning objectives?[:\s]+([\s\S]{0,500})/i);
  if (objMatch) {
    const objText = objMatch[1].toLowerCase();
    // Extract noun phrases (simplified)
    const words = objText.match(/\b[a-z]{4,}\b/g) || [];
    const stopwords = new Set(["will", "course", "students", "learn", "able", "understand", "apply", "upon", "completion", "this", "that", "with", "from", "have", "been", "their", "they", "also"]);
    for (const word of words) {
      if (!stopwords.has(word) && !found.includes(word) && found.length < 15) {
        found.push(word);
      }
    }
  }

  return Array.from(new Set(found)).slice(0, 12);
}

export function extractPrerequisites(text: string): string[] {
  const prereqMatch = text.match(
    /(?:prerequisite|prereq|co-?requisite|required background)[s]?[:\s]+([\s\S]{0,300})/i
  );
  if (!prereqMatch) return [];

  const prereqText = prereqMatch[1];
  // Find course codes
  const codes = prereqText.match(/[A-Z]{2,5}\s*\d{4}[A-Z]?/g) || [];
  
  // Also find course name mentions
  const lines = prereqText.split(/[.,;]/).map((l) => l.trim()).filter((l) => l.length > 3 && l.length < 60);
  
  return [...codes, ...lines.slice(0, 3)].slice(0, 5);
}

export function extractSchedule(text: string): {
  days: string[];
  time: string;
  morning: boolean;
  friday: boolean;
} {
  const days: string[] = [];
  const dayPatterns: [RegExp, string][] = [
    [/\bmonday\b|\bMW\b|\bmon\b/i, "Monday"],
    [/\btuesday\b|\bTR\b|\bTTH\b|\btue\b/i, "Tuesday"],
    [/\bwednesday\b|\bMW\b|\bWF\b|\bwed\b/i, "Wednesday"],
    [/\bthursday\b|\bTR\b|\bTTH\b|\bthu\b/i, "Thursday"],
    [/\bfriday\b|\bWF\b|\bfri\b/i, "Friday"],
  ];

  for (const [pattern, day] of dayPatterns) {
    if (pattern.test(text) && !days.includes(day)) {
      days.push(day);
    }
  }

  // Extract time
  const timeMatch = text.match(/\b(1[0-2]|[1-9])(?::[0-5]\d)?\s*(?:AM|PM|am|pm)\b/);
  const time = timeMatch ? timeMatch[0] : "";

  const morning = time ? (
    parseInt(time) < 12 && time.toUpperCase().includes("AM")
  ) : false;

  const friday = days.includes("Friday");

  return { days, time, morning, friday };
}

export function extractDescription(text: string): string {
  // Look for course description section
  const descMatch = text.match(
    /(?:course description|overview|about this course)[:\s]+([\s\S]{50,600})/i
  );
  if (descMatch) {
    return descMatch[1].split("\n")[0].trim().slice(0, 400);
  }
  // Fallback: first substantial paragraph
  const paragraphs = text.split(/\n\n+/);
  for (const p of paragraphs) {
    const clean = p.trim();
    if (clean.length > 80 && clean.length < 500) {
      return clean.slice(0, 300);
    }
  }
  return "";
}

export function generateTLDR(text: string, skills: string[], workload: number): string {
  const topics = skills.slice(0, 3).join(", ");
  const workloadDesc =
    workload >= 8 ? "Heavy workload" :
    workload >= 6 ? "Moderate-to-heavy workload" :
    workload >= 4 ? "Moderate workload" : "Light workload";

  const descMatch = text.match(/(?:course description|overview)[:\s]+([\s\S]{30,200})/i);
  const snippet = descMatch
    ? descMatch[1].split(/[.!?]/)[0].trim()
    : `Covers ${topics || "core topics"}`;

  return `${snippet}. ${workloadDesc} with focus on ${topics || "foundational concepts"}.`;
}

export function extractInstructor(text: string): string {
  const match = text.match(/(?:instructor|professor|taught by|faculty)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/);
  return match ? match[1] : "";
}

export function extractCredits(text: string): number {
  const match = text.match(/(\d)\s*(?:credit|point|unit)/i);
  return match ? parseInt(match[1]) : 3;
}
