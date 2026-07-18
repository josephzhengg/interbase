"use client";

import { useState } from "react";

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [status, setStatus] = useState<"idle" | "busy" | "sent" | "already" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, frequency }),
      });
      if (!res.ok) throw new Error("bad status");
      const data = (await res.json()) as { status: string };
      setStatus(data.status === "already-subscribed" ? "already" : "sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") return <p className="text-sm text-ok">Check your inbox to confirm your subscription.</p>;
  if (status === "already") return <p className="text-sm text-muted">You're already subscribed.</p>;

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@school.edu"
        className="w-56 rounded-md border border-border bg-bg px-3 py-1.5 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <select
        value={frequency}
        onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}
        className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-muted focus:outline-none"
      >
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
      </select>
      <button
        type="submit"
        disabled={status === "busy"}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        Get new internships by email
      </button>
      {status === "error" && <span className="text-xs text-muted">Something went wrong — try again.</span>}
    </form>
  );
}
