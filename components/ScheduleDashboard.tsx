"use client";

import { useState } from "react";
import type { ScheduleOption, UserPreferences } from "@/lib/types";
import ScheduledCourseCard from "./ScheduledCourseCard";
import WeekCalendar from "./WeekCalendar";
import { ArrowLeft, Calendar, LayoutGrid } from "lucide-react";

interface Props {
  options: ScheduleOption[];
  prefs: UserPreferences;
  onReset: () => void;
}

const OPTION_STYLES = {
  A: { accent: "border-columbia-navy", badge: "bg-columbia-navy text-white", glow: "shadow-columbia-navy/15" },
  B: { accent: "border-emerald-500",   badge: "bg-emerald-600 text-white",   glow: "shadow-emerald-500/15" },
  C: { accent: "border-violet-500",    badge: "bg-violet-600 text-white",    glow: "shadow-violet-500/15" },
};

const VIBE_LABELS = {
  rigor:   { emoji: "🏆", label: "Academic Rigor" },
  balance: { emoji: "⚖️", label: "Work-Life Balance" },
  skills:  { emoji: "⚡", label: "Skill Acquisition" },
};

export default function ScheduleDashboard({ options, prefs, onReset }: Props) {
  const [active, setActive] = useState<"A"|"B"|"C">("A");
  const [view, setView] = useState<"cards"|"calendar">("cards");

  const option = options.find(o => o.id === active)!;
  const vibeInfo = VIBE_LABELS[prefs.vibe];
  const hasScheduleData = option?.courses.some(c => c.assignedSection?.days?.length > 0);

  if (!option) return null;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-cream/90 backdrop-blur-md border-b border-columbia-blue/30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={onReset}
              className="flex items-center gap-2 text-sm font-mono text-columbia-mid hover:text-columbia-navy transition-colors">
              <ArrowLeft size={15} /> New Search
            </button>
            <div className="w-px h-5 bg-columbia-blue/50" />
            <span className="font-display font-semibold text-columbia-navy hidden sm:block">Columbia Path</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-columbia-dark/50">
            <span>Year {prefs.year}</span>
            <span className="text-columbia-blue">·</span>
            <span>{vibeInfo.emoji} {vibeInfo.label}</span>
            <span className="text-columbia-blue">·</span>
            <span>{prefs.targetCredits} credits</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Page title */}
        <div className="mb-8">
          <p className="font-mono text-columbia-mid text-sm uppercase tracking-widest mb-2">Your Schedule Options</p>
          <h2 className="font-display text-4xl font-bold text-columbia-navy mb-2">3 Paths Forward</h2>
          <p className="text-columbia-dark/60 font-body">
            Based on: <em className="text-columbia-dark/80">"{prefs.goals.slice(0, 80)}{prefs.goals.length > 80 ? "…" : ""}"</em>
          </p>
        </div>

        {/* Option tabs */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {options.map(opt => {
            const style = OPTION_STYLES[opt.id];
            const isActive = active === opt.id;
            return (
              <button key={opt.id} onClick={() => setActive(opt.id)}
                className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 shadow-lg ${
                  isActive ? `${style.accent} bg-white ${style.glow}` : "border-columbia-blue/20 bg-white/60 hover:bg-white"
                }`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${style.badge}`}>
                    Option {opt.id}
                  </span>
                  <span className="text-xs font-mono text-columbia-dark/40">{opt.totalCredits} cr</span>
                </div>
                <div className="font-display font-semibold text-columbia-navy mb-1">{opt.label}</div>
                <p className="text-xs text-columbia-dark/50 font-body">{opt.description}</p>
                <div className="flex gap-3 mt-3">
                  <div>
                    <div className="text-lg font-display font-bold text-columbia-navy">{opt.avgMatchScore}%</div>
                    <div className="text-[10px] font-mono text-columbia-dark/40">avg match</div>
                  </div>
                  <div>
                    <div className="text-lg font-display font-bold text-emerald-600">{opt.avgProbability}%</div>
                    <div className="text-[10px] font-mono text-columbia-dark/40">avg odds</div>
                  </div>
                  <div>
                    <div className="text-lg font-display font-bold text-columbia-mid">{opt.courses.length}</div>
                    <div className="text-[10px] font-mono text-columbia-dark/40">courses</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Ranking strategy summary */}
        <div className="bg-columbia-navy rounded-2xl p-5 mb-8 text-white">
          <p className="font-mono text-columbia-blue text-xs uppercase tracking-widest mb-3">
            📋 Enrollment Strategy for Option {active}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {option.courses.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-white/10 rounded-xl px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-columbia-blue/80 truncate">{c.code}</div>
                  <div className="font-display text-sm font-semibold truncate">{c.title}</div>
                </div>
                <div className={`px-2 py-1 rounded-lg text-xs font-mono font-bold border flex-shrink-0 ${
                  c.recommendedRanking === "favorite" ? "bg-emerald-500/20 border-emerald-400 text-emerald-300" :
                  c.recommendedRanking === "great"    ? "bg-blue-500/20 border-blue-400 text-blue-300" :
                  c.recommendedRanking === "good"     ? "bg-amber-500/20 border-amber-400 text-amber-300" :
                  "bg-red-500/20 border-red-400 text-red-300"
                }`}>
                  {c.recommendedRanking}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-semibold text-columbia-navy">
            Option {active}: {option.label}
            <span className="ml-3 text-sm font-mono font-normal text-columbia-dark/40">
              {option.totalCredits} credits · {option.courses.length} courses
            </span>
          </h3>
          <div className="flex gap-1 bg-columbia-light rounded-xl p-1">
            <button onClick={() => setView("cards")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                view === "cards" ? "bg-columbia-navy text-white shadow-sm" : "text-columbia-dark/60 hover:text-columbia-dark"
              }`}>
              <LayoutGrid size={12} /> Courses
            </button>
            {hasScheduleData && (
              <button onClick={() => setView("calendar")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                  view === "calendar" ? "bg-columbia-navy text-white shadow-sm" : "text-columbia-dark/60 hover:text-columbia-dark"
                }`}>
                <Calendar size={12} /> Calendar
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {view === "calendar" ? (
          <WeekCalendar courses={option.courses} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {option.courses.map((course, i) => (
              <div key={course.id} className="animate-fade-up opacity-0"
                style={{ animationDelay: `${i * 80}ms` }}>
                <ScheduledCourseCard course={course} index={i} />
              </div>
            ))}
          </div>
        )}

        <p className="mt-12 text-center text-xs font-mono text-columbia-dark/30">
          Recommendations based on historical enrollment data and keyword matching.
          Always verify with the CBS course directory and CourseMatch.
        </p>
      </main>
    </div>
  );
}
