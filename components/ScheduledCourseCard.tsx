"use client";

import { useState, useEffect } from "react";
import type { ScheduledCourse } from "@/lib/types";
import { Clock, BookOpen, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

interface Props {
  course: ScheduledCourse;
  index: number;
}

const TIER_STYLES = {
  favorite:   { bg: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  great:      { bg: "bg-blue-100 text-blue-800 border-blue-200",         dot: "bg-blue-500" },
  good:       { bg: "bg-amber-100 text-amber-800 border-amber-200",      dot: "bg-amber-500" },
  acceptable: { bg: "bg-red-100 text-red-800 border-red-200",            dot: "bg-red-400" },
};

const PROB_COLOR = (p: number) =>
  p >= 0.70 ? "text-emerald-600" : p >= 0.45 ? "text-amber-600" : "text-red-500";

export default function ScheduledCourseCard({ course, index }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [enriched, setEnriched] = useState<{ professorBio: string; whyTakeThis: string } | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);

  // Use scraped data from courses.json if available (populated by npm run scrape)
  const scrapedBio = (course as any).professorBio as string | undefined;
  const scrapedTitle = (course as any).professorTitle as string | undefined;
  const syllabusNotes = (course as any).syllabusNotes as string | undefined;

  const tierStyle = TIER_STYLES[course.recommendedRanking];
  const prob = course.probabilityForUser;
  const sec = course.assignedSection;

  async function loadEnrichment() {
    // If we already have scraped bio from npm run scrape, skip the API call
    if (scrapedBio || enriched || enrichLoading) return;
    setEnrichLoading(true);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseCode: course.code,
          courseTitle: course.title,
          instructor: course.instructor,
          description: course.description,
          skills: course.skills,
        }),
      });
      const data = await res.json();
      if (!data.error) setEnriched(data);
    } catch {}
    setEnrichLoading(false);
  }

  function handleExpand() {
    setExpanded(!expanded);
    if (!expanded) loadEnrichment();
  }

  return (
    <div className="course-card bg-white rounded-2xl border border-columbia-blue/20 overflow-hidden shadow-sm">
      {/* Match bar */}
      <div className="h-1" style={{
        background: `linear-gradient(90deg, #003087 0%, #B9D9EB ${course.matchScore}%, transparent ${course.matchScore}%)`
      }} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <span className="font-mono text-xs text-columbia-mid uppercase tracking-wider">{course.code}</span>
            {course.division && (
              <span className="ml-2 text-xs font-mono text-columbia-dark/30">· {course.division}</span>
            )}
            <h3 className="font-display font-semibold text-lg text-columbia-navy leading-tight mt-0.5 line-clamp-2">
              {course.title}
            </h3>
            {course.instructor && (
              <p className="text-xs text-columbia-dark/50 mt-0.5 font-body">{course.instructor}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-display text-3xl font-bold text-columbia-navy leading-none">
              {course.matchScore}
            </div>
            <div className="text-[10px] font-mono text-columbia-dark/40">match</div>
          </div>
        </div>

        {/* Ranking recommendation — the key new feature */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border mb-3 ${tierStyle.bg}`}>
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tierStyle.dot}`} />
          <div className="flex-1">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider">
              Rank as: {course.recommendedRanking.charAt(0).toUpperCase() + course.recommendedRanking.slice(1)}
            </span>
            <span className="text-xs font-mono ml-2 opacity-70">
              → {Math.round(prob * 100)}% enrollment odds
            </span>
          </div>
        </div>

        {/* Schedule + Credits */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {sec?.days?.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-columbia-dark/60">
              <Clock size={11} />
              {sec.days.map(d => d.slice(0,3)).join("/")}
              {sec.startTime && ` · ${sec.startTime}`}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs font-mono text-columbia-dark/60">
            <BookOpen size={11} />
            {course.credits} credits
          </div>
          {course.term && (
            <span className="text-xs font-mono text-columbia-dark/40">{course.term}</span>
          )}
        </div>

        {/* TL;DR */}
        <p className="text-sm font-body text-columbia-dark/65 leading-relaxed mb-3 line-clamp-2">
          {course.tldr}
        </p>

        {/* Keywords */}
        {course.matchedKeywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {course.matchedKeywords.map(kw => (
              <span key={kw} className="px-2 py-0.5 bg-columbia-light text-columbia-navy text-xs font-mono rounded-full border border-columbia-blue/30">
                {kw}
              </span>
            ))}
          </div>
        )}

        {/* Prerequisites */}
        {course.prerequisites.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-mono uppercase tracking-wider text-columbia-dark/40 mb-1.5">Prerequisites</p>
            <div className="flex flex-wrap gap-1">
              {course.prerequisites.map(p => (
                <span key={p} className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-mono rounded-md">{p}</span>
              ))}
            </div>
          </div>
        )}

        {/* Expand toggle */}
        <button onClick={handleExpand}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-mono text-columbia-mid hover:text-columbia-navy transition-colors py-1.5 border-t border-columbia-blue/15 mt-1">
          {expanded ? "Less" : "More"} · Prof bio & odds breakdown
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {/* Expanded */}
        {expanded && (
          <div className="mt-4 space-y-4 pt-4 border-t border-columbia-blue/15 animate-fade-up">
            {/* Professor & course insights — scraped data first, AI fallback */}
            <div className="p-3 rounded-xl bg-columbia-light/60 border border-columbia-blue/20">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={12} className="text-columbia-mid" />
                <span className="text-xs font-mono uppercase tracking-wider text-columbia-dark/50">
                  {scrapedBio ? "CBS Profile" : "AI Insights"}
                </span>
                {(course as any).enriched && (
                  <span className="ml-auto text-[9px] font-mono text-columbia-mid bg-columbia-blue/20 px-1.5 py-0.5 rounded-full">
                    scraped
                  </span>
                )}
              </div>

              {/* Scraped bio — shown if npm run scrape was run */}
              {scrapedBio ? (
                <div className="space-y-2">
                  <p className="text-xs font-body text-columbia-dark/70 leading-relaxed">
                    <span className="font-semibold text-columbia-dark/80">
                      {scrapedTitle || "Professor"}:{" "}
                    </span>
                    {scrapedBio}
                  </p>
                  {syllabusNotes && (
                    <p className="text-xs font-body text-columbia-dark/60 leading-relaxed italic">
                      {syllabusNotes}
                    </p>
                  )}
                </div>
              ) : enrichLoading ? (
                <div className="shimmer h-12 rounded-lg" />
              ) : enriched ? (
                <div className="space-y-2">
                  {enriched.professorBio && (
                    <p className="text-xs font-body text-columbia-dark/70 leading-relaxed">
                      <span className="font-semibold text-columbia-dark/80">Professor: </span>
                      {enriched.professorBio}
                    </p>
                  )}
                  {enriched.whyTakeThis && (
                    <p className="text-xs font-body text-columbia-dark/70 leading-relaxed">
                      <span className="font-semibold text-columbia-dark/80">Why take this: </span>
                      {enriched.whyTakeThis}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-columbia-dark/40 font-mono">
                  Run <span className="bg-columbia-blue/30 px-1 rounded">npm run scrape</span> for CBS bios,
                  or add ANTHROPIC_API_KEY to .env.local for AI insights.
                </p>
              )}
            </div>

            {/* Full odds breakdown */}
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-columbia-dark/40 mb-2">All ranking odds ({course.year === 1 ? "Year 1" : course.year === 2 ? "Year 2" : "both years"})</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(["favorite","great","good","acceptable"] as const).map(tier => {
                  const yearKey = `year${1}` as "year1" | "year2";
                  const p = course.enrollmentProbabilities.year1[tier];
                  const isRec = tier === course.recommendedRanking;
                  return (
                    <div key={tier} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border ${isRec ? "border-columbia-navy bg-columbia-light" : "border-columbia-blue/20 bg-white"}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${TIER_STYLES[tier].dot}`} />
                      <span className="text-xs font-mono text-columbia-dark/60 flex-1 capitalize">{tier}</span>
                      <span className={`text-xs font-mono font-bold ${PROB_COLOR(p)}`}>{Math.round(p * 100)}%</span>
                      {isRec && <span className="text-[9px] font-mono text-columbia-navy">✓ rec</span>}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
