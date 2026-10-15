export function computeStreak(completedProgress, existingStreak) {
  const current = existingStreak?.current ?? 0;
  const longest = existingStreak?.longest ?? 0;
  const lastCompletedDate = existingStreak?.lastCompletedDate;

  if (completedProgress.length === 0) {
    return { current: 0, longest, lastCompletedDate };
  }

  const sorted = [...completedProgress].sort(
    (a, b) => new Date(a.completedAt) - new Date(b.completedAt)
  );

  let streak = 1;
  let maxStreak = 1;
  let prev = sorted[0].completedAt;

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i].completedAt;
    const days = daysBetween(prev, curr);

    if (days === 1) streak += 1;
    else if (days > 1) streak = 1;

    maxStreak = Math.max(maxStreak, streak);
    prev = curr;
  }

  const daysSinceLast = daysBetween(prev, new Date());
  if (daysSinceLast > 1) streak = 0;

  return {
    current: streak,
    longest: Math.max(longest, maxStreak),
    lastCompletedDate: prev,
  };
}

function daysBetween(a, b) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const aMid = new Date(a).setUTCHours(0, 0, 0, 0);
  const bMid = new Date(b).setUTCHours(0, 0, 0, 0);
  return Math.round(Math.abs(bMid - aMid) / MS_PER_DAY);
}