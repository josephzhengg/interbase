const TAG_LABELS: Record<string, string> = {
  paid: "Paid",
  "sponsors-visa": "Sponsors visa",
  "no-sponsorship": "No sponsorship",
  "new-grad-ok": "New grad OK",
  "freshman-ok": "Freshman friendly",
};

export function TagPill({ tag, label }: { tag?: string; label?: string }) {
  const text = label ?? TAG_LABELS[tag ?? ""] ?? tag ?? "";
  const green = tag === "paid";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${green ? "bg-ok-soft text-ok" : "bg-bg text-muted"}`}>
      {text}
    </span>
  );
}
