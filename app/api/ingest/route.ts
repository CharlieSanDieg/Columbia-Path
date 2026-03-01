// app/api/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  extractCourseCode,
  extractTitle,
  extractWorkloadIndex,
  extractAssignmentFrequency,
  extractSkills,
  extractPrerequisites,
  extractSchedule,
  generateTLDR,
  extractDescription,
  extractInstructor,
  extractCredits,
} from "@/lib/pdf-parser";
import type { Course } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as "syllabus" | "matrix";

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Dynamic import to avoid SSR issues
    const pdfParse = (await import("pdf-parse")).default;
    const { text } = await pdfParse(buffer);

    if (type === "matrix") {
      // Parse matrix and return entries
      const lines = text.split("\n");
      const entries = [];
      for (const line of lines) {
        const m = line.match(/([A-Z]{2,5}\s*\d{4}[A-Z]?)/);
        if (!m) continue;
        const nums = (line.match(/(\d{1,3}(?:\.\d+)?)%?/g) || [])
          .map(Number)
          .filter((n) => n >= 0 && n <= 100);
        if (nums.length >= 2) {
          entries.push({
            courseCode: m[1],
            year1Probability: nums[0] > 1 ? nums[0] / 100 : nums[0],
            year2Probability: nums[1] > 1 ? nums[1] / 100 : nums[1],
          });
        }
      }
      return NextResponse.json({ type: "matrix", entries, rawText: text.slice(0, 500) });
    }

    // Parse as syllabus
    const code = extractCourseCode(text);
    const skills = extractSkills(text);
    const workload = extractWorkloadIndex(text);

    const course: Partial<Course> = {
      id: code.toLowerCase().replace(/\s+/, "") || `course_${Date.now()}`,
      code: code || "UNKNOWN",
      title: extractTitle(text, code),
      description: extractDescription(text),
      instructor: extractInstructor(text),
      credits: extractCredits(text),
      year: "both",
      enrollmentProbability: 0.5,
      workloadIndex: workload,
      assignmentFrequency: extractAssignmentFrequency(text),
      skills,
      prerequisites: extractPrerequisites(text),
      schedule: extractSchedule(text),
      tldr: generateTLDR(text, skills, workload),
      rawExtracted: true,
    };

    return NextResponse.json({ type: "syllabus", course, charCount: text.length });
  } catch (err) {
    console.error("Ingest error:", err);
    return NextResponse.json({ error: "Failed to process PDF" }, { status: 500 });
  }
}
