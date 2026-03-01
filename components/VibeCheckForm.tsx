"use client";

import { useState } from "react";
import type { UserPreferences } from "@/lib/types";
import { ChevronRight, AlertCircle } from "lucide-react";

interface Props {
  onSubmit: (prefs: UserPreferences) => void;
  loading: boolean;
  error: string;
}

const VIBES = [
  { id: "rigor" as const,   emoji: "🏆", label: "Academic Rigor",     desc: "Demanding & exclusive" },
  { id: "balance" as const, emoji: "⚖️", label: "Work-Life Balance",  desc: "Sustainable & manageable" },
  { id: "skills" as const,  emoji: "⚡", label: "Skill Acquisition",  desc: "Career-focused & practical" },
];

export default function VibeCheckForm({ onSubmit, loading, error }: Props) {
  const [year, setYear] = useState<1 | 2>(1);
  const [goals, setGoals] = useState("");
  const [vibe, setVibe] = useState<UserPreferences["vibe"]>("skills");
  const [targetCredits, setTargetCredits] = useState(12);
  const [constraints, setConstraints] = useState("");

  function parseConstraints(text: string): { noFriday: boolean; noMorning: boolean } {
    const lower = text.toLowerCase();
    const noFriday = /no.{0,8}fri|avoid.{0,8}fri|fri.{0,8}free/i.test(lower);
    const noMorning = /no.{0,8}morning|before \d|nothing before|early|no.{0,8}8am|no.{0,8}9am|no.{0,8}10am/i.test(lower);
    return { noFriday, noMorning };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!goals.trim()) return;
    const { noFriday, noMorning } = parseConstraints(constraints);
    onSubmit({ year, goals, vibe, targetCredits, noFriday, noMorning });
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-columbia-blue/40 bg-cream/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-columbia-navy flex items-center justify-center">
              <span className="text-white text-xs font-display font-bold">C</span>
            </div>
            <span className="font-display font-semibold text-columbia-navy text-lg tracking-tight">Columbia Path</span>
          </div>
          <span className="text-sm text-columbia-dark/60 font-mono">Course Schedule Builder</span>
        </div>
      </header>

      {/* Background gradient */}
      <div className="fixed inset-0 opacity-30 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, #B9D9EB 0%, transparent 70%)" }} />

      <section className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="relative w-full max-w-2xl">
          {/* Title */}
          <div className="text-center mb-10">
            <p className="font-mono text-columbia-mid text-sm uppercase tracking-widest mb-3">
              Columbia Business School
            </p>
            <h1 className="font-display text-5xl md:text-6xl font-bold text-columbia-navy leading-tight mb-4">
              Build Your <em className="text-columbia-mid not-italic">Schedule</em>
            </h1>
            <p className="text-columbia-dark/70 text-lg font-body max-w-md mx-auto leading-relaxed">
              Tell us your goals — we'll generate 3 schedule options with enrollment strategy for each course.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-7">
            {/* Year */}
            <div>
              <label className="block text-sm font-mono uppercase tracking-wider text-columbia-dark/70 mb-3">Year</label>
              <div className="flex gap-3">
                {[1, 2].map(y => (
                  <button key={y} type="button" onClick={() => setYear(y as 1|2)}
                    className={`flex-1 py-3 rounded-xl border-2 font-display text-lg font-semibold transition-all duration-200 ${
                      year === y
                        ? "bg-columbia-navy border-columbia-navy text-white shadow-lg shadow-columbia-navy/20"
                        : "border-columbia-blue/50 text-columbia-dark hover:border-columbia-mid hover:bg-columbia-light"
                    }`}>
                    Year {y}
                  </button>
                ))}
              </div>
            </div>

            {/* Goals */}
            <div>
              <label className="block text-sm font-mono uppercase tracking-wider text-columbia-dark/70 mb-3">
                What are your academic goals?
              </label>
              <textarea value={goals} onChange={e => setGoals(e.target.value)} required rows={3}
                placeholder="e.g. I want to break into private equity, build financial modeling skills, and understand M&A transactions..."
                className="w-full px-5 py-4 rounded-2xl border-2 border-columbia-blue/40 bg-white/60 backdrop-blur-sm text-ink placeholder:text-ink/30 font-body text-base resize-none focus:outline-none focus:border-columbia-navy transition-colors leading-relaxed" />
            </div>

            {/* Credit Target */}
            <div>
              <label className="block text-sm font-mono uppercase tracking-wider text-columbia-dark/70 mb-3">
                Target Credits: <span className="text-columbia-navy font-bold">{targetCredits}</span>
              </label>
              <div className="flex items-center gap-4">
                <input type="range" min={3} max={21} step={1.5} value={targetCredits}
                  onChange={e => setTargetCredits(Number(e.target.value))}
                  className="flex-1 accent-columbia-navy" />
                <div className="flex gap-2">
                  {[6, 9, 12, 15, 18].map(c => (
                    <button key={c} type="button" onClick={() => setTargetCredits(c)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                        targetCredits === c
                          ? "bg-columbia-navy border-columbia-navy text-white"
                          : "border-columbia-blue/40 text-columbia-dark hover:border-columbia-mid"
                      }`}>
                      {c}cr
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Vibe */}
            <div>
              <label className="block text-sm font-mono uppercase tracking-wider text-columbia-dark/70 mb-3">
                Optimization Vibe
              </label>
              <div className="grid grid-cols-3 gap-3">
                {VIBES.map(v => (
                  <button key={v.id} type="button" onClick={() => setVibe(v.id)}
                    className={`p-4 rounded-2xl text-left transition-all duration-200 border-2 ${
                      vibe === v.id
                        ? "border-columbia-navy bg-columbia-navy text-white shadow-lg scale-[1.02]"
                        : "border-columbia-blue/40 bg-white/50 hover:border-columbia-mid hover:bg-columbia-light"
                    }`}>
                    <div className="text-2xl mb-2">{v.emoji}</div>
                    <div className={`font-display font-semibold text-sm mb-1 ${vibe === v.id ? "text-white" : "text-columbia-navy"}`}>{v.label}</div>
                    <div className={`text-xs font-body ${vibe === v.id ? "text-columbia-blue" : "text-columbia-dark/50"}`}>{v.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule Constraints */}
            <div>
              <label className="block text-sm font-mono uppercase tracking-wider text-columbia-dark/70 mb-3">
                Schedule Constraints
              </label>
              <textarea value={constraints} onChange={e => setConstraints(e.target.value)} rows={2}
                placeholder="e.g. No Friday classes, nothing before 10am, prefer afternoons..."
                className="w-full px-5 py-4 rounded-2xl border-2 border-columbia-blue/40 bg-white/60 backdrop-blur-sm text-ink placeholder:text-ink/30 font-body text-base resize-none focus:outline-none focus:border-columbia-navy transition-colors leading-relaxed" />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle size={16} />{error}
              </div>
            )}

            <button type="submit" disabled={loading || !goals.trim()}
              className="w-full py-4 rounded-2xl bg-columbia-navy text-white font-display text-lg font-semibold hover:bg-columbia-dark disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-columbia-navy/25 hover:-translate-y-0.5 flex items-center justify-center gap-3">
              {loading ? (
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Building your schedules...</>
              ) : (
                <>Generate Schedule Options <ChevronRight size={20} /></>
              )}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
