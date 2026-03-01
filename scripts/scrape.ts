#!/usr/bin/env ts-node
/**
 * scripts/scrape.ts
 * Run with: npm run scrape
 *
 * What it does:
 *  1. Parses data/matrix.pdf → builds enrollment probability map
 *  2. Discovers all MBA course codes from courses.business.columbia.edu (Puppeteer)
 *  3. Adds stub entries to data/courses.json for any new courses found
 *  4. Enriches each CBS course: description, instructor, prereqs, schedule
 *  5. Applies matrix enrollment probabilities to matched courses
 *  6. Fetches professor bios from the CBS faculty directory
 *  7. Writes everything back to data/courses.json + data/professors.json
 *
 * Safe to re-run — skips already-enriched courses and duplicate IDs.
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import puppeteer from "puppeteer";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TierProbs {
  favorite: number;
  great: number;
  good: number;
  acceptable: number;
}

interface EnrollmentProbabilities {
  year1: TierProbs;
  year2: TierProbs;
}

interface Professor {
  name: string;
  slug: string;
  title?: string;
  bio?: string;
  researchInterests?: string[];
  profileUrl?: string;
}

interface CourseEnrichment {
  title?: string;
  description?: string;
  syllabusNotes?: string;
  prerequisites?: string[];
  applicationOnly?: boolean;
  instructor?: string;
  credits?: number;
  division?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toD(v: number) {
  return v > 1 ? v / 100 : v;
}

function defaultProbs(): EnrollmentProbabilities {
  const base = Math.round(Math.random() * 60 + 30) / 100;
  return {
    year2: {
      favorite: Math.min(1, base + 0.2),
      great: Math.min(1, base + 0.08),
      good: Math.max(0, base - 0.12),
      acceptable: Math.max(0, base - 0.22),
    },
    year1: {
      favorite: Math.min(1, base + 0.1),
      great: Math.min(1, base - 0.02),
      good: Math.max(0, base - 0.18),
      acceptable: Math.max(0, base - 0.28),
    },
  };
}

// ── Matrix PDF parsing ────────────────────────────────────────────────────────

async function parsePDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  return data.text as string;
}

function parseMatrix(text: string): Map<string, EnrollmentProbabilities> {
  const map = new Map<string, EnrollmentProbabilities>();
  const seen = new Set<string>();

  for (const line of text.split("\n")) {
    // Match CBS course codes: B7330, B8138, FINCB8306, etc.
    const m = line.match(/\b([A-Z]{0,6}B\d{4}[A-Z]?)\b/);
    if (!m) continue;

    // Normalize to just the B-number portion (e.g. "B8138")
    const rawCode = m[1];
    const normalized = rawCode.match(/B\d{4}[A-Z]?$/)?.[0] || rawCode;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const nums: number[] = [];
    for (const match of line.matchAll(/(\d{1,3})%/g)) {
      const n = parseFloat(match[1]);
      if (n >= 0 && n <= 100) nums.push(n);
    }
    if (nums.length < 4) continue;

    const p = nums.slice(-8);
    const safe = (v: number, fb: number) => (isNaN(v) ? fb : toD(v));

    map.set(normalized, {
      year2: {
        favorite: safe(p[0], 0.85),
        great: safe(p[1], 0.65),
        good: safe(p[2], 0.35),
        acceptable: safe(p[3], 0.2),
      },
      year1: {
        favorite: safe(p[4], 0.75),
        great: safe(p[5], 0.55),
        good: safe(p[6], 0.25),
        acceptable: safe(p[7], 0.12),
      },
    });
  }

  return map;
}

// ── Skill / workload extraction (for stub courses) ───────────────────────────

function extractSkills(text: string): string[] {
  const kws = [
    "machine learning", "deep learning", "statistics", "probability", "programming",
    "python", "r", "matlab", "data analysis", "data science", "algorithms", "optimization",
    "linear algebra", "econometrics", "regression", "hypothesis testing", "bayesian",
    "natural language processing", "nlp", "computer vision", "neural networks", "finance",
    "financial modeling", "portfolio", "risk management", "research methods", "writing",
    "communication", "leadership", "entrepreneurship", "product management", "strategy",
    "database", "sql", "cloud", "distributed systems", "ethics", "policy", "governance",
    "accounting", "marketing", "operations", "supply chain", "negotiation", "valuation",
    "private equity", "venture capital", "real estate", "investment", "corporate finance",
    "excel", "tableau", "organizational behavior", "innovation", "healthcare", "forecasting",
  ];
  const lower = text.toLowerCase();
  return kws.filter((k) => lower.includes(k)).slice(0, 12);
}

function extractWorkload(text: string): number {
  let score = 3;
  const indicators: [RegExp, number][] = [
    [/weekly assignment/gi, 1.5], [/problem set/gi, 1], [/homework/gi, 0.8],
    [/midterm/gi, 1], [/final exam/gi, 1], [/project/gi, 0.7],
    [/attendance/gi, 0.5], [/presentation/gi, 0.5], [/research paper/gi, 1.2],
    [/case study/gi, 0.8], [/group project/gi, 0.7],
  ];
  for (const [pat, w] of indicators) {
    score += (text.match(pat) || []).length * w * 0.4;
  }
  return Math.min(10, Math.max(1, Math.round(score)));
}

function generateTLDR(description: string, skills: string[], workload: number): string {
  const wdesc =
    workload >= 8 ? "Heavy workload" : workload >= 5 ? "Moderate workload" : "Light workload";
  const snippet = description
    ? description.split(/[.!?]/)[0].trim().slice(0, 120)
    : `Covers ${skills.slice(0, 3).join(", ") || "core MBA topics"}`;
  return `${snippet}. ${wdesc}.`;
}

// ── HTTP fetch (plain Node https — no extra deps) ─────────────────────────────

function httpFetch(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "identity",
          Connection: "keep-alive",
          "Cache-Control": "max-age=0",
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpFetch(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error(`Timeout: ${url}`));
    });
  });
}

// ── HTML parsers ──────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "")
    .replace(/\s{2,}/g, " ").trim();
}

function parseCoursePageHtml(html: string): CourseEnrichment {
  const result: CourseEnrichment = {};

  // Title — from the HTML <title> tag, e.g. "Business Analytics | Columbia Business School"
  const pageTitleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (pageTitleMatch) {
    const raw = stripTags(pageTitleMatch[1])
      .replace(/\s*\|.*$/, "")   // strip " | Columbia Business School"
      .replace(/\s*-\s*CBS$/, "") // strip " - CBS"
      .replace(/^[A-Z]\d{4}[A-Z]?\s*[-–:]\s*/, "") // strip leading code e.g. "B8103 - "
      .trim();
    if (raw.length > 3 && raw.length < 150) result.title = raw;
  }

  // Description
  const descPatterns = [
    /<div[^>]*class="[^"]*course-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]*class="[^"]*course-body[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
    /<main[^>]*>([\s\S]{200,}?)<\/main>/i,
  ];
  for (const pat of descPatterns) {
    const m = html.match(pat);
    if (m) {
      const text = stripTags(m[1]).trim();
      if (text.length > 40) { result.description = text.slice(0, 1000); break; }
    }
  }
  if (!result.description) {
    const paragraphs = html.match(/<p[^>]*>([\s\S]{80,600}?)<\/p>/gi) || [];
    for (const p of paragraphs) {
      const text = stripTags(p).trim();
      if (text.length > 80 && !text.toLowerCase().includes("columbia university")) {
        result.description = text.slice(0, 800);
        break;
      }
    }
  }

  // Instructor
  const instrMatch = html.match(/(?:Instructor|Professor|Faculty)[:\s]+([A-Z][a-z]+(?: [A-Z][a-z.-]+){1,3})/);
  if (instrMatch) result.instructor = instrMatch[1].trim();

  // Credits
  const credMatch = html.match(/(\d+(?:\.\d+)?)\s*credit/i);
  if (credMatch) result.credits = parseFloat(credMatch[1]);

  // Division
  const divMatch = html.match(/(?:Division|Department)[:\s]+([A-Za-z, &]+?)(?:<|[\n\r])/);
  if (divMatch) result.division = divMatch[1].trim().slice(0, 80);

  // Application only
  result.applicationOnly =
    html.toLowerCase().includes("application only") ||
    html.toLowerCase().includes("app only");

  // Prerequisites
  const prereqMatch = html.match(
    /(?:prerequisite|pre-requisite|prereq)[s]?[:\s]+([\s\S]{10,300}?)(?:<\/p>|<\/li>|<br)/i
  );
  if (prereqMatch) {
    const codes = stripTags(prereqMatch[1]).match(/[A-Z]{0,6}B?\d{4}[A-Z]?/g) || [];
    if (codes.length) result.prerequisites = codes.slice(0, 5);
  }

  // Syllabus notes
  const syllMatch = html.match(
    /(?:grading|assignments?|weekly|attendance)[:\s]+([\s\S]{20,200}?)(?:<\/p>|<\/li>|<br)/i
  );
  if (syllMatch) result.syllabusNotes = stripTags(syllMatch[1]).slice(0, 300);

  return result;
}

function parseFacultyPageHtml(html: string, name: string): Partial<Professor> {
  const result: Partial<Professor> = { name };

  const titlePatterns = [
    /<[^>]*class="[^"]*faculty-title[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<[^>]*class="[^"]*position[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<[^>]*class="[^"]*job-title[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i,
  ];
  for (const pat of titlePatterns) {
    const m = html.match(pat);
    if (m) {
      const t = stripTags(m[1]).trim();
      if (t.length > 3 && t.length < 200) { result.title = t; break; }
    }
  }

  const bioPatterns = [
    /<[^>]*class="[^"]*bio[^"]*"[^>]*>([\s\S]{100,}?)<\/(?:div|section)>/i,
    /<[^>]*class="[^"]*about[^"]*"[^>]*>([\s\S]{100,}?)<\/(?:div|section)>/i,
    /<[^>]*class="[^"]*profile-body[^"]*"[^>]*>([\s\S]{100,}?)<\/(?:div|section)>/i,
  ];
  for (const pat of bioPatterns) {
    const m = html.match(pat);
    if (m) {
      const t = stripTags(m[1]).trim();
      if (t.length > 80) { result.bio = t.slice(0, 600); break; }
    }
  }
  if (!result.bio) {
    const paragraphs = html.match(/<p[^>]*>([\s\S]{100,800}?)<\/p>/gi) || [];
    for (const p of paragraphs) {
      const t = stripTags(p).trim();
      const lower = t.toLowerCase();
      if (
        t.length > 100 &&
        !lower.includes("columbia university in the city") &&
        (lower.includes("professor") || lower.includes("research") ||
          lower.includes("phd") || lower.includes("finance") ||
          lower.includes("economics") || lower.includes("management"))
      ) {
        result.bio = t.slice(0, 600);
        break;
      }
    }
  }

  const riMatch = html.match(
    /(?:research interests?|areas? of (?:research|expertise))[:\s]+([\s\S]{10,300}?)(?:<\/p>|<\/li>|<\/ul>|<br)/i
  );
  if (riMatch) {
    result.researchInterests = stripTags(riMatch[1])
      .split(/[,;•\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3 && s.length < 80)
      .slice(0, 6);
  }

  return result;
}

// ── URL helpers ───────────────────────────────────────────────────────────────

function courseCodeToUrl(code: string): string | null {
  // CBS MBA courses end in B + 4 digits (e.g. B8306 or FINCB8306)
  const m = code.match(/B(\d{4}[A-Z]?)$/i);
  if (!m) return null;
  return `https://courses.business.columbia.edu/B${m[1]}`;
}

function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s-]/g, "").trim().replace(/\s+/g, "-");
}

// ── Puppeteer: discover all MBA course codes ──────────────────────────────────

async function discoverMBACourses(): Promise<{ code: string; title: string }[]> {
  console.log("  Launching browser to load MBA catalog SPA...");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  try {
    await page.goto(
      "https://courses.business.columbia.edu/?degree_program=mba",
      { waitUntil: "networkidle2", timeout: 60000 }
    );

    // Wait for any course content to appear
    await page.waitForFunction(
      () => document.body.innerText.length > 1000,
      { timeout: 20000 }
    ).catch(() => {});

    // Try clicking "load more" / paginate until all courses are visible
    let prevCount = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      const loadMoreBtn = await page.$(
        "a[href*='all'], button.load-more, a.load-more, .pager__item--next a, [aria-label*='Next']"
      ).catch(() => null);
      if (!loadMoreBtn) break;
      await loadMoreBtn.click().catch(() => {});
      await sleep(1500);
      const newCount = await page.evaluate(
        () => document.body.innerText.match(/\bB\d{4}\b/g)?.length || 0
      );
      if (newCount === prevCount) break;
      prevCount = newCount;
    }

    const courses = await page.evaluate(() => {
      const results: { code: string; title: string }[] = [];
      const seen = new Set<string>();
      const text = document.body.innerText;

      // Extract all B-code mentions from the page
      const matches = text.matchAll(/\b(B\d{4}[A-Z]?)\b/g);
      for (const m of matches) {
        const code = m[1];
        if (seen.has(code)) continue;
        seen.add(code);

        // Try to find the title near this code
        const idx = text.indexOf(code);
        const surrounding = text.slice(Math.max(0, idx - 5), idx + 120);
        const afterCode = surrounding.slice(code.length).replace(/^\W+/, "").split("\n")[0].trim();
        const title = afterCode.length > 3 && afterCode.length < 100 ? afterCode : "";

        results.push({ code, title });
      }

      return results;
    });

    await browser.close();
    return courses;
  } catch (err) {
    await browser.close();
    throw err;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dataDir = path.join(__dirname, "../data");
  const coursesPath = path.join(dataDir, "courses.json");
  const professorsPath = path.join(dataDir, "professors.json");

  console.log("🎓 Columbia Path — CBS Scraper\n");

  // ── 1. Parse matrix.pdf ───────────────────────────────────────────────────
  const matrixPath = path.join(dataDir, "matrix.pdf");
  let matrixMap = new Map<string, EnrollmentProbabilities>();

  if (fs.existsSync(matrixPath)) {
    console.log("📊 Parsing matrix.pdf...");
    const buf = fs.readFileSync(matrixPath);
    const text = await parsePDF(buf);
    matrixMap = parseMatrix(text);
    console.log(`   Found ${matrixMap.size} enrollment probability entries.\n`);
  } else {
    console.warn("⚠️  data/matrix.pdf not found — will use random probabilities.\n");
  }

  // ── 2. Discover all MBA courses from the catalog ──────────────────────────
  console.log("🌐 Discovering MBA courses from Columbia catalog...");
  let discovered: { code: string; title: string }[] = [];
  try {
    discovered = await discoverMBACourses();
    console.log(`   Found ${discovered.length} course codes on the catalog page.\n`);
  } catch (err: any) {
    console.warn(`   ⚠️  Catalog discovery failed: ${err.message}`);
    console.warn("   Proceeding with courses already in courses.json.\n");
  }

  // ── 3. Load existing courses + add stubs for new ones ────────────────────
  let courses: any[] = fs.existsSync(coursesPath)
    ? JSON.parse(fs.readFileSync(coursesPath, "utf-8"))
    : [];

  const existingIds = new Set(courses.map((c: any) => c.id as string));
  let stubsAdded = 0;

  for (const { code, title } of discovered) {
    const id = code.toLowerCase();
    if (existingIds.has(id)) continue;

    // Look up enrollment probabilities from matrix
    const probs = matrixMap.get(code) || defaultProbs();

    courses.push({
      id,
      code,
      title: title || code,
      description: "",
      instructor: "",
      credits: 3,
      year: "both",
      enrollmentProbabilities: probs,
      workloadIndex: 5,
      assignmentFrequency: 2,
      skills: [],
      prerequisites: [],
      sections: [
        {
          sectionNumber: 1,
          days: [],
          startTime: "",
          endTime: "",
          startMinutes: 0,
          endMinutes: 0,
          morning: false,
          friday: false,
        },
      ],
      schedule: { days: [], time: "", morning: false, friday: false },
      tldr: `${title || code}. Moderate workload.`,
      rawExtracted: true,
    });

    existingIds.add(id);
    stubsAdded++;
  }

  console.log(`📝 Added ${stubsAdded} new course stubs. Total: ${courses.length} courses.\n`);

  // Save after discovery so progress isn't lost if enrichment crashes
  fs.writeFileSync(coursesPath, JSON.stringify(courses, null, 2));

  // ── 4. Enrich each CBS course with page data ──────────────────────────────
  const professors: Record<string, Professor> = fs.existsSync(professorsPath)
    ? JSON.parse(fs.readFileSync(professorsPath, "utf-8"))
    : {};

  let coursesFetched = 0, coursesSkipped = 0;

  console.log(`📚 Enriching ${courses.length} courses from CBS course pages...\n`);

  for (const course of courses) {
    // Apply matrix probs even to already-enriched courses that have defaults
    const bCode = course.code.match(/B\d{4}[A-Z]?$/)?.[0];
    if (bCode && matrixMap.has(bCode)) {
      course.enrollmentProbabilities = matrixMap.get(bCode)!;
    }

    // Skip only if already enriched AND has a real title (not just the course code)
    const titleIsCode = /^[A-Z]\d{4}[A-Z]?$/.test((course.title || "").trim());
    if (course.enriched && !titleIsCode) {
      coursesSkipped++;
      continue;
    }

    const url = courseCodeToUrl(course.code);
    if (!url) {
      process.stdout.write(`  ⏭  ${course.code} — not a CBS course, skipping\n`);
      coursesSkipped++;
      continue;
    }

    process.stdout.write(`  📄 ${course.code}... `);

    try {
      const html = await httpFetch(url);
      const enrichment = parseCoursePageHtml(html);

      if (enrichment.title) course.title = enrichment.title;
      if (enrichment.description) course.description = enrichment.description;
      if (enrichment.instructor && !course.instructor) course.instructor = enrichment.instructor;
      if (enrichment.credits) course.credits = enrichment.credits;
      if (enrichment.division) course.division = enrichment.division;
      if (enrichment.applicationOnly) course.applicationOnly = true;
      if (enrichment.prerequisites?.length && !course.prerequisites?.length) {
        course.prerequisites = enrichment.prerequisites;
      }
      if (enrichment.syllabusNotes) course.syllabusNotes = enrichment.syllabusNotes;

      // Recompute skills + tldr from real description
      if (enrichment.description) {
        const combinedText = enrichment.description + " " + (enrichment.syllabusNotes || "");
        course.skills = extractSkills(combinedText);
        course.workloadIndex = extractWorkload(combinedText);
        course.assignmentFrequency = Math.max(1, Math.round(course.workloadIndex / 3));
        course.tldr = generateTLDR(enrichment.description, course.skills, course.workloadIndex);
      }

      course.enriched = true;
      course.coursePageUrl = url;
      coursesFetched++;
      console.log("✅");
    } catch (err: any) {
      console.log(`❌ ${err.message?.slice(0, 60)}`);
      course.enrichAttempted = true;
    }

    await sleep(1200);
  }

  fs.writeFileSync(coursesPath, JSON.stringify(courses, null, 2));
  console.log(`\n✅ Courses: ${coursesFetched} enriched, ${coursesSkipped} skipped\n`);

  // ── 5. Fetch professor bios ───────────────────────────────────────────────
  const instructorNames = new Set<string>();
  for (const c of courses) {
    if (c.instructor && !c.instructor.includes(",")) instructorNames.add(c.instructor.trim());
  }

  console.log(`👨‍🏫 Fetching bios for ${instructorNames.size} instructors...\n`);

  let profsFetched = 0, profsSkipped = 0;
  for (const name of instructorNames) {
    const slug = nameToSlug(name);
    if (professors[slug]?.bio) { profsSkipped++; continue; }

    process.stdout.write(`  👤 ${name}... `);
    const primaryUrl = `https://academics.business.columbia.edu/faculty/${slug}`;
    const altUrl = `https://business.columbia.edu/faculty/${slug}`;

    let fetched = false;
    for (const url of [primaryUrl, altUrl]) {
      try {
        const html = await httpFetch(url);
        const profData = parseFacultyPageHtml(html, name);
        professors[slug] = { name, slug, profileUrl: url, ...profData };
        fetched = true;
        profsFetched++;
        console.log(profData.bio ? "✅ bio found" : "✅ (no bio)");
        break;
      } catch {
        // try next url
      }
    }
    if (!fetched) {
      console.log("❌ not found");
      professors[slug] = { name, slug };
    }

    await sleep(1200);
  }

  // ── 6. Merge professor bios into courses ──────────────────────────────────
  for (const course of courses) {
    if (!course.instructor) continue;
    const slug = nameToSlug(course.instructor);
    const prof = professors[slug];
    if (prof?.bio && !course.professorBio) course.professorBio = prof.bio;
    if (prof?.title && !course.professorTitle) course.professorTitle = prof.title;
  }

  // ── 7. Save ───────────────────────────────────────────────────────────────
  fs.writeFileSync(coursesPath, JSON.stringify(courses, null, 2));
  fs.writeFileSync(professorsPath, JSON.stringify(professors, null, 2));

  console.log(`\n✅ Faculty: ${profsFetched} fetched, ${profsSkipped} skipped`);
  console.log(`\n📁 Saved:`);
  console.log(`   data/courses.json    — ${courses.length} courses`);
  console.log(`   data/professors.json — ${Object.keys(professors).length} professor profiles`);
  console.log(`\n🎓 Done! Run npm run dev to see the full catalogue.\n`);
}

main().catch((err) => {
  console.error("\n💥 Scraper crashed:", err.message);
  process.exit(1);
});
