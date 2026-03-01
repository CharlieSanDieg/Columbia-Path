# Columbia Path 🎓
### AI-Powered Academic Recommendation Engine

A Next.js application that recommends courses by analyzing enrollment probability data and course syllabi, personalized by your academic goals and "Optimization Vibe."

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run development server
npm run dev

# 3. Open http://localhost:3000
```

## Adding Your Own Data

### Step 1: Add PDFs

```
data/
├── matrix.pdf          ← Enrollment probability matrix
└── syllabi/
    ├── COMS4771.pdf    ← Course syllabi
    ├── STAT5703.pdf
    └── ...             ← Add as many as you want
```

### Step 2: Ingest PDFs

```bash
npm run ingest
```

This will:
- Parse `data/matrix.pdf` for Year 1/Year 2 enrollment probabilities
- Parse every PDF in `data/syllabi/`
- Extract: course code, title, workload, skills, prerequisites, schedule
- Write all results to `data/courses.json`

> **Note:** The app ships with 12 sample courses in `data/courses.json`. Running ingest will append new courses from your PDFs to this file (it won't overwrite existing entries).

---

## Architecture

```
columbia-path/
├── app/
│   ├── page.tsx                    ← Root page (onboarding → dashboard)
│   ├── layout.tsx                  ← Fonts, metadata
│   ├── globals.css                 ← Columbia Blue theme
│   └── api/
│       ├── recommend/route.ts      ← POST /api/recommend
│       └── ingest/route.ts         ← POST /api/ingest (live PDF upload)
├── components/
│   ├── VibeCheckForm.tsx           ← Onboarding form
│   ├── Dashboard.tsx               ← Results dashboard
│   └── CourseCard.tsx              ← Individual course card
├── lib/
│   ├── types.ts                    ← TypeScript interfaces
│   ├── pdf-parser.ts               ← PDF text extraction utilities
│   ├── matrix-parser.ts            ← Enrollment probability parser
│   └── recommender.ts              ← Vibe-based ranking algorithm
├── scripts/
│   └── ingest.ts                   ← Standalone PDF ingestion script
└── data/
    ├── courses.json                ← Parsed course database
    ├── matrix.pdf                  ← (add your own)
    └── syllabi/                    ← (add your own)
```

---

## The Recommendation Algorithm

### Three Optimization Vibes

| Vibe | Logic |
|------|-------|
| **Academic Rigor** | `workload(60%) + (1 - enrollmentProb)(40%)` — High workload + exclusive courses |
| **Work-Life Balance** | `enrollmentProb(50%) + lowAssignments(50%)` — Easy to get in + light load |
| **Skill Acquisition** | `keywordMatch(70%) + skillCount(30%)` — Goals ↔ syllabus keyword cosine similarity |

### PDF Extraction

For each syllabus, the parser extracts:
- **Course Code & Title** — regex pattern matching
- **Workload Index** — keyword frequency (assignments, exams, projects, etc.)
- **Skills/Keywords** — domain vocabulary + Learning Objectives section
- **Prerequisites** — "Prerequisite" / "Prereq" section detection
- **Schedule** — day/time pattern matching (morning/friday flags)
- **TL;DR** — auto-generated from description + skills + workload

---

## Live PDF Upload

In the Vibe Check form, click **"Upload your own PDFs"** to:
1. Upload `matrix.pdf` → parses enrollment probabilities live
2. Upload any syllabus PDF → extracts course data and adds it to recommendations

---

## Design System

- **Columbia Blue:** `#B9D9EB`
- **Navy:** `#003087`
- **Background:** `#F7F3EE` (warm cream)
- **Fonts:** Playfair Display (headings) + DM Sans (body) + JetBrains Mono (data)

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **PDF Processing:** `pdf-parse`
- **Language:** TypeScript
- **Data:** Static JSON (no database required)
