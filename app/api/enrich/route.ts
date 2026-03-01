// app/api/enrich/route.ts
// Calls Claude API to generate professor bio + course context blurb

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { courseCode, courseTitle, instructor, description, skills } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }

    const prompt = `You are a Columbia Business School course advisor. For the following course, write a concise 2-sentence professor bio and a 2-sentence "why take this" blurb. Be specific, professional, and helpful for an MBA student deciding whether to enroll.

Course: ${courseCode} — ${courseTitle}
Instructor: ${instructor || "TBD"}
Description: ${description || "No description available"}
Key skills: ${(skills || []).join(", ")}

Respond in this exact JSON format (no markdown, no extra text):
{"professorBio": "...", "whyTakeThis": "..."}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Claude API error" }, { status: 500 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({ professorBio: "", whyTakeThis: text });
    }
  } catch (err) {
    console.error("Enrich error:", err);
    return NextResponse.json({ error: "Failed to enrich" }, { status: 500 });
  }
}
