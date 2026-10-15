/**
 * Resolve a schedule into an array of actual challenge dates.
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {{ type: "weekdays" | "custom" | "explicit", days?: number[], dates?: string[] }} schedule
 * @returns {Date[]}
 */
export function resolveChallengeDays(startDate, endDate, schedule) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Normalize to midnight UTC to avoid time-of-day issues
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);

  if (start > end) return dates;

  if (schedule.type === "explicit") {
    // User supplied exact dates
    if (!Array.isArray(schedule.dates)) return dates;
    for (const iso of schedule.dates) {
      const d = new Date(iso);
      if (!isNaN(d) && d >= start && d <= end) {
        d.setUTCHours(0, 0, 0, 0);
        dates.push(d);
      }
    }
    // Sort ascending
    dates.sort((a, b) => a - b);
    return dates;
  }

  // weekdays or custom: use weekday filter
  const allowedDays =
    schedule.type === "weekdays"
      ? [1, 2, 3, 4, 5] // Mon–Fri (JS: 0=Sun, 1=Mon, ...)
      : Array.isArray(schedule.days)
        ? schedule.days
        : [];

  if (allowedDays.length === 0) return dates;

  const cursor = new Date(start);
  while (cursor <= end) {
    if (allowedDays.includes(cursor.getUTCDay())) {
      dates.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}