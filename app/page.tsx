"use client";

import { useState } from "react";
import VibeCheckForm from "@/components/VibeCheckForm";
import ScheduleDashboard from "@/components/ScheduleDashboard";
import type { UserPreferences, ScheduleOption } from "@/lib/types";

export default function HomePage() {
  const [step, setStep] = useState<"onboarding" | "results">("onboarding");
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [options, setOptions] = useState<ScheduleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(p: UserPreferences) {
    setLoading(true);
    setError("");
    setPrefs(p);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      setOptions(data.options);
      setStep("results");
    } catch (err: any) {
      setError(err.message || "Failed to fetch recommendations");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen">
      {step === "onboarding" ? (
        <VibeCheckForm onSubmit={handleSubmit} loading={loading} error={error} />
      ) : (
        <ScheduleDashboard options={options} prefs={prefs!} onReset={() => setStep("onboarding")} />
      )}
    </main>
  );
}
