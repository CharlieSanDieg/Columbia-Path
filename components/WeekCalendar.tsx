"use client";

import type { ScheduledCourse } from "@/lib/types";

interface Props {
  courses: ScheduledCourse[];
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const COLORS = [
  "bg-columbia-navy text-white border-columbia-dark",
  "bg-columbia-mid text-white border-columbia-dark/50",
  "bg-emerald-600 text-white border-emerald-800",
  "bg-amber-500 text-white border-amber-700",
  "bg-violet-600 text-white border-violet-800",
  "bg-rose-500 text-white border-rose-700",
  "bg-teal-600 text-white border-teal-800",
];

function formatHour(h: number) {
  if (h === 12) return "12 PM";
  if (h > 12) return `${h - 12} PM`;
  return `${h} AM`;
}

function parseMinutes(t: string): number {
  if (!t) return 0;
  const m = t.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  const min = parseInt(m[2] || "0");
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

export default function WeekCalendar({ courses }: Props) {
  const MIN_HOUR = 8, MAX_HOUR = 21;
  const TOTAL_MINS = (MAX_HOUR - MIN_HOUR) * 60;
  const ROW_HEIGHT = 480; // px

  // Build event blocks
  const events: {
    day: string; top: number; height: number;
    course: ScheduledCourse; color: string; code: string;
  }[] = [];

  courses.forEach((course, idx) => {
    const sec = course.assignedSection;
    if (!sec?.days?.length) return;
    const color = COLORS[idx % COLORS.length];
    const startM = sec.startMinutes || parseMinutes(sec.startTime);
    const endM = sec.endMinutes || (startM + 90);
    const top = ((startM - MIN_HOUR * 60) / TOTAL_MINS) * ROW_HEIGHT;
    const height = Math.max(30, ((endM - startM) / TOTAL_MINS) * ROW_HEIGHT);

    for (const day of sec.days) {
      if (DAYS.includes(day)) {
        events.push({ day, top, height, course, color, code: course.code });
      }
    }
  });

  const hasScheduleData = events.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-columbia-blue/20 overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-columbia-blue/20 flex items-center justify-between">
        <h3 className="font-display font-semibold text-columbia-navy">Weekly Schedule</h3>
        <span className="text-xs font-mono text-columbia-dark/40">
          {courses.filter(c => c.assignedSection?.days?.length).length} of {courses.length} courses placed
        </span>
      </div>

      {!hasScheduleData && (
        <div className="px-5 py-10 text-center">
          <p className="text-columbia-dark/50 font-body text-sm mb-1">No schedule data available for these courses.</p>
          <p className="text-columbia-dark/30 font-mono text-xs">Run <span className="bg-columbia-blue/20 px-1.5 py-0.5 rounded">npm run scrape</span> to fetch real schedules from Columbia's catalog.</p>
        </div>
      )}

      {hasScheduleData && (
        <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Day headers */}
          <div className="grid grid-cols-[48px_repeat(5,1fr)] border-b border-columbia-blue/20">
            <div />
            {DAYS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-mono uppercase tracking-wider text-columbia-dark/50 border-l border-columbia-blue/10">
                {d.slice(0, 3)}
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="relative grid grid-cols-[48px_repeat(5,1fr)]" style={{ height: ROW_HEIGHT }}>
            {/* Hour lines + labels */}
            {HOURS.map(h => {
              const top = ((h - MIN_HOUR) / (MAX_HOUR - MIN_HOUR)) * 100;
              return (
                <div key={h} className="absolute left-0 right-0 flex items-start pointer-events-none"
                  style={{ top: `${top}%` }}>
                  <span className="w-10 text-right text-[10px] font-mono text-columbia-dark/30 pr-2 -translate-y-2 flex-shrink-0">
                    {formatHour(h)}
                  </span>
                  <div className="flex-1 border-t border-columbia-blue/10" />
                </div>
              );
            })}

            {/* Day column backgrounds */}
            {DAYS.map((d, i) => (
              <div key={d} className={`relative ${i === 0 ? "col-start-2" : ""} border-l border-columbia-blue/10`}>
                {/* Events for this day */}
                {events.filter(e => e.day === d).map((e, ei) => (
                  <div key={ei} className={`absolute left-1 right-1 rounded-lg border overflow-hidden cursor-default ${e.color}`}
                    style={{ top: e.top, height: e.height }}>
                    <div className="px-1.5 py-1">
                      <div className="font-mono text-[10px] font-bold leading-tight truncate opacity-90">
                        {e.code.replace(/\s+/, "")}
                      </div>
                      {e.height > 45 && (
                        <div className="font-body text-[9px] leading-tight mt-0.5 opacity-80 line-clamp-2">
                          {e.course.title}
                        </div>
                      )}
                      {e.height > 70 && e.course.assignedSection?.startTime && (
                        <div className="font-mono text-[9px] mt-1 opacity-70">
                          {e.course.assignedSection.startTime}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Legend */}
      <div className="px-5 py-3 border-t border-columbia-blue/10 flex flex-wrap gap-3">
        {courses.map((c, i) => (
          <div key={c.id} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${COLORS[i % COLORS.length].split(" ")[0]}`} />
            <span className="text-xs font-mono text-columbia-dark/60">{c.code}</span>
            {c.title && (
              <span className="text-xs font-body text-columbia-dark/40">· {c.title}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
