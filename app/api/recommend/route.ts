import { NextRequest, NextResponse } from "next/server";
import { buildScheduleOptions } from "@/lib/scheduler";
import type { UserPreferences } from "@/lib/types";
import courses from "@/data/courses.json";

export async function POST(req: NextRequest) {
  try {
    const prefs: UserPreferences = await req.json();
    if (!prefs.year || !prefs.goals || !prefs.vibe) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const options = buildScheduleOptions(courses as any, prefs);
    return NextResponse.json({ options });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
