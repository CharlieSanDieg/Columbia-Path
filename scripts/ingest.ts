#!/usr/bin/env ts-node
// scripts/ingest.ts
// Run with: npm run ingest
// Parses matrix.pdf and all syllabi/*.pdf → writes data/courses.json

import fs from "fs";
import path from "path";

// Dynamic import shim for pdf-parse in CommonJS context
async function parsePDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  return data.text as string;
}

// ---- Extraction helpers (mirrored from lib/pdf-parser.ts for standalone use) ----

function extractCourseCode(text: string): string {
  const match = text.match(/\b([A-Z]{2,5})\s*(\d{4}[A-Z]?)\b/);
  return match ? `${match[1]} ${match[2]}` : "";
}

function extractTitle(text: string, code: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    if (line.includes(code)) {
      const cleaned = line.replace(code, "").replace(/^[:–—\s-]+/, "").trim();
      if (cleaned.length > 3 && cleaned.length < 100) return cleaned;
    }
  }
  return lines.find((l) => l.length > 10 && l.length < 80 && /[A-Z]/.test(l)) || "Untitled";
}

function extractWorkload(text: string): number {
  let score = 3;
  const indicators = [
    [/weekly assignment/gi, 1.5], [/problem set/gi, 1], [/homework/gi, 0.8],
    [/midterm/gi, 1], [/final exam/gi, 1], [/project/gi, 0.7],
    [/attendance/gi, 0.5], [/presentation/gi, 0.5], [/research paper/gi, 1.2],
  ];
  for (const [pat, w] of indicators as [RegExp, number][]) {
    score += (text.match(pat) || []).length * w * 0.4;
  }
  return Math.min(10, Math.max(1, Math.round(score)));
}

function extractSkills(text: string): string[] {
  const kws = [
    "machine learning","deep learning","statistics","probability","programming",
    "python","r","matlab","data analysis","data science","algorithms","optimization",
    "linear algebra","econometrics","regression","hypothesis testing","bayesian",
    "natural language processing","nlp","computer vision","neural networks","finance",
    "financial modeling","portfolio","risk management","research methods","writing",
    "communication","leadership","entrepreneurship","product management","strategy",
    "database","sql","cloud","distributed systems","ethics","policy","governance",
    "stochastic processes","time series","forecasting","simulation","healthcare",
  ];
  const lower = text.toLowerCase();
  return kws.filter((k) => lower.includes(k)).slice(0, 12);
}

function extractPrereqs(text: string): string[] {
  const m = text.match(/(?:prerequisite|prereq|co-?requisite)[s]?[:\s]+([\s\S]{0,300})/i);
  if (!m) return [];
  return (m[1].match(/[A-Z]{2,5}\s*\d{4}[A-Z]?/g) || []).slice(0, 5);
}

function extractSchedule(text: string) {
  const days: string[] = [];
  if (/monday|\bMW\b/i.test(text)) days.push("Monday");
  if (/tuesday|\bTR\b|\bTTH\b/i.test(text)) days.push("Tuesday");
  if (/wednesday|\bMW\b/i.test(text) && !days.includes("Wednesday")) days.push("Wednesday");
  if (/thursday|\bTR\b|\bTTH\b/i.test(text)) days.push("Thursday");
  if (/friday|\bWF\b/i.test(text)) days.push("Friday");
  const timeMatch = text.match(/\b(1[0-2]|[1-9])(?::[0-5]\d)?\s*(?:AM|PM|am|pm)\b/);
  const time = timeMatch ? timeMatch[0] : "";
  const morning = time ? parseInt(time) < 12 && /AM/i.test(time) : false;
  return { days, time, morning, friday: days.includes("Friday") };
}

function generateTLDR(text: string, skills: string[], workload: number): string {
  const topics = skills.slice(0, 3).join(", ");
  const wdesc = workload >= 8 ? "Heavy workload" : workload >= 5 ? "Moderate workload" : "Light workload";
  const m = text.match(/(?:course description|overview)[:\s]+([\s\S]{30,200})/i);
  const snippet = m ? m[1].split(/[.!?]/)[0].trim() : `Covers ${topics || "core topics"}`;
  return `${snippet}. ${wdesc}.`;
}

// ---- Matrix parser ----

interface TierProbs { favorite: number; great: number; good: number; acceptable: number }
interface MatrixEntry {
  code: string;
  probabilities: { year1: TierProbs; year2: TierProbs };
}

function toD(v: number) { return v > 1 ? v / 100 : v; }

function parseMatrix(text: string): MatrixEntry[] {
  const entries: MatrixEntry[] = [];
  const seen = new Set<string>();

  for (const line of text.split("\n")) {
    const m = line.match(/\b([A-Z]{2,6}B?\d{4}[A-Z]?)\b/);
    if (!m) continue;
    const code = m[1];
    if (seen.has(code)) continue;
    seen.add(code);

    const nums: number[] = [];
    for (const match of line.matchAll(/(\d{1,3})%/g)) {
      const n = parseFloat(match[1]);
      if (n >= 0 && n <= 100) nums.push(n);
    }
    if (nums.length < 4) continue;

    const p = nums.slice(-8);
    const safe = (v: number, fb: number) => isNaN(v) ? fb : toD(v);

    entries.push({
      code,
      probabilities: {
        year2: { favorite: safe(p[0], 0.85), great: safe(p[1], 0.65), good: safe(p[2], 0.35), acceptable: safe(p[3], 0.20) },
        year1: { favorite: safe(p[4], 0.75), great: safe(p[5], 0.55), good: safe(p[6], 0.25), acceptable: safe(p[7], 0.12) },
      },
    });
  }
  return entries;
}

// ---- Main ----

async function main() {
  const dataDir = path.join(__dirname, "../data");
  const syllabiDir = path.join(dataDir, "syllabi");
  const outputPath = path.join(dataDir, "courses.json");

  console.log("🎓 Columbia Path — PDF Ingestion Script\n");

  // 1. Parse matrix.pdf (enrollment probabilities)
  let matrixEntries: MatrixEntry[] = [];
  const matrixPath = path.join(dataDir, "matrix.pdf");
  if (fs.existsSync(matrixPath)) {
    console.log("📊 Parsing matrix.pdf...");
    const buf = fs.readFileSync(matrixPath);
    const text = await parsePDF(buf);
    matrixEntries = parseMatrix(text);
    console.log(`   Found ${matrixEntries.length} enrollment probability entries.`);
  } else {
    console.warn("⚠️  matrix.pdf not found — enrollment probabilities will be random.");
  }

  const matrixMap = new Map(matrixEntries.map((e) => [
    e.code.toLowerCase().replace(/\s+/, ""), e
  ]));

  // 2. Parse each syllabus PDF
  if (!fs.existsSync(syllabiDir)) {
    console.warn("⚠️  No syllabi/ directory found. Creating it.");
    fs.mkdirSync(syllabiDir, { recursive: true });
  }

  const pdfFiles = fs.readdirSync(syllabiDir).filter((f) => f.endsWith(".pdf"));
  console.log(`\n📚 Found ${pdfFiles.length} syllabus PDFs.\n`);

  // Load existing courses.json if it exists (to merge, not overwrite)
  let existingCourses: any[] = [];
  if (fs.existsSync(outputPath)) {
    existingCourses = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
  }

  const existingIds = new Set(existingCourses.map((c: any) => c.id));
  const newCourses = [];

  for (const file of pdfFiles) {
    const filePath = path.join(syllabiDir, file);
    console.log(`  📄 Processing: ${file}`);

    try {
      const buf = fs.readFileSync(filePath);
      const text = await parsePDF(buf);

      const code = extractCourseCode(text);
      const title = extractTitle(text, code);
      const skills = extractSkills(text);
      const workload = extractWorkload(text);
      const assignmentFrequency = Math.max(1, Math.round(workload / 3));
      const prereqs = extractPrereqs(text);
      const schedule = extractSchedule(text);
      const tldr = generateTLDR(text, skills, workload);

      const key = code.toLowerCase().replace(/\s+/, "");
      const matrixEntry = matrixMap.get(key);

      // Build full probability matrix — from matrix.pdf if available, else sensible defaults
      const enrollmentProbabilities = matrixEntry
        ? matrixEntry.probabilities
        : (() => {
            const base = Math.round(Math.random() * 60 + 30) / 100;
            return {
              year2: { favorite: Math.min(1, base + 0.20), great: Math.min(1, base + 0.08), good: Math.max(0, base - 0.12), acceptable: Math.max(0, base - 0.22) },
              year1: { favorite: Math.min(1, base + 0.10), great: Math.min(1, base - 0.02), good: Math.max(0, base - 0.18), acceptable: Math.max(0, base - 0.28) },
            };
          })();

      const id = (code || file.replace(".pdf", "")).toLowerCase().replace(/\s+/, "");

      if (existingIds.has(id)) {
        console.log(`    ↩️  Skipping (already in courses.json): ${id}`);
        continue;
      }

      const course = {
        id,
        code: code || file.replace(".pdf", "").toUpperCase(),
        title,
        description: "",
        credits: 3,
        year: "both",
        enrollmentProbabilities,
        workloadIndex: workload,
        assignmentFrequency,
        skills,
        prerequisites: prereqs,
        schedule,
        tldr,
        rawExtracted: true,
      };

      newCourses.push(course);
      console.log(`    ✅ Extracted: ${code} — ${title}`);
    } catch (err) {
      console.error(`    ❌ Failed: ${file}`, err);
    }
  }

  const finalCourses = [...existingCourses, ...newCourses];
  fs.writeFileSync(outputPath, JSON.stringify(finalCourses, null, 2));
  console.log(`\n✨ Done! Wrote ${finalCourses.length} courses to data/courses.json`);
  console.log(`   (${existingCourses.length} existing + ${newCourses.length} newly extracted)\n`);
}

main().catch(console.error);
