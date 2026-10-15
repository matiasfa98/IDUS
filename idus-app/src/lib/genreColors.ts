// src/lib/genreColors.ts
//
// Genre → accent color. Used for message bubble borders and avatar rings.
// Keep this tasteful — one accent per genre, dark-mode friendly.

const COLORS: Record<string, string> = {
  shonen: "#f97316", // orange
  seinen: "#64748b", // slate
  shojo: "#ec4899", // pink
  josei: "#a855f7", // purple
  isekai: "#06b6d4", // cyan
  mecha: "#eab308", // yellow
  "slice-of-life": "#22c55e", // green
  psychological: "#8b5cf6", // violet
  sports: "#ef4444", // red
  supernatural: "#14b8a6", // teal
  historical: "#b45309", // amber
  cyberpunk: "#22d3ee", // bright cyan
  fantasy: "#a3e635", // lime
  "sci-fi": "#3b82f6", // blue
  mystery: "#6366f1", // indigo
  horror: "#7f1d1d", // dark red
};

const FALLBACK = "#6b7280"; // neutral gray

export function genreAccent(genre: string | undefined | null): string {
  if (!genre) return FALLBACK;
  return COLORS[genre] ?? FALLBACK;
}