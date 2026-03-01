export type RankingTier = "favorite" | "great" | "good" | "acceptable";

export interface EnrollmentProbabilities {
  year1: { favorite: number; great: number; good: number; acceptable: number };
  year2: { favorite: number; great: number; good: number; acceptable: number };
}

// A course section = one specific timeslot for a course
export interface CourseSection {
  sectionNumber: number;
  days: string[];       // ["Monday", "Wednesday"]
  startTime: string;    // "9:00 AM"
  endTime: string;      // "10:30 AM"
  startMinutes: number; // minutes from midnight, for conflict detection
  endMinutes: number;
  morning: boolean;
  friday: boolean;
  instructor?: string;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  description: string;
  instructor?: string;
  credits: number;
  year: 1 | 2 | "both";
  enrollmentProbabilities: EnrollmentProbabilities;
  workloadIndex: number;
  assignmentFrequency: number;
  skills: string[];
  prerequisites: string[];
  // Multiple sections for conflict-aware scheduling
  sections: CourseSection[];
  // Legacy single schedule (fallback)
  schedule?: {
    days: string[];
    time: string;
    morning: boolean;
    friday: boolean;
  };
  tldr: string;
  rawExtracted?: boolean;
  division?: string;      // "Finance", "Marketing", etc.
  term?: string;          // "Full Term", "A Term", "B Term"
}

export interface MatrixEntry {
  courseCode: string;
  probabilities: EnrollmentProbabilities;
}

export interface UserPreferences {
  year: 1 | 2;
  goals: string;
  vibe: "rigor" | "balance" | "skills";
  targetCredits: number;
  noFriday: boolean;
  noMorning: boolean;
}

// A course assigned to a specific section, with ranking advice
export interface ScheduledCourse extends Course {
  matchScore: number;
  probabilityForUser: number;
  matchedKeywords: string[];
  recommendedRanking: RankingTier; // what tier we advise the student to use
  assignedSection: CourseSection;  // the specific section chosen
}

// One complete schedule option (e.g. "Option A")
export interface ScheduleOption {
  id: "A" | "B" | "C";
  label: string;
  description: string;
  courses: ScheduledCourse[];
  totalCredits: number;
  avgProbability: number;
  avgMatchScore: number;
}
