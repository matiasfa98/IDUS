/**
 * Validate Gemini's output against the challenge spec.
 * Throws a descriptive error if invalid.
 */
export function validateProgression(progression, spec) {
  const { availableDays, dailyMinutes } = spec;

  // ── Shape checks ──────────────────────────────────
  if (!progression || typeof progression !== "object") {
    throw new Error("Progression is not an object");
  }
  if (!Array.isArray(progression.phases) || progression.phases.length === 0) {
    throw new Error("Progression has no phases");
  }

  // ── Collect all days ──────────────────────────────
  const allDays = [];
  for (const phase of progression.phases) {
    if (!phase.title || !Array.isArray(phase.days)) {
      throw new Error(`Phase "${phase.title ?? "(untitled)"}" is malformed`);
    }
    for (const day of phase.days) {
      allDays.push(day);
    }
  }

  // ── Day count must match ──────────────────────────
  if (allDays.length !== availableDays) {
    throw new Error(
      `Expected ${availableDays} days, got ${allDays.length}`
    );
  }

  // ── Day numbers must be 1..N, unique ──────────────
  const seen = new Set();
  for (const day of allDays) {
    if (typeof day.dayNumber !== "number") {
      throw new Error(`Day "${day.title}" missing dayNumber`);
    }
    if (day.dayNumber < 1 || day.dayNumber > availableDays) {
      throw new Error(`Day number ${day.dayNumber} out of range 1..${availableDays}`);
    }
    if (seen.has(day.dayNumber)) {
      throw new Error(`Duplicate day number: ${day.dayNumber}`);
    }
    seen.add(day.dayNumber);
  }
  for (let i = 1; i <= availableDays; i++) {
    if (!seen.has(i)) {
      throw new Error(`Missing day number: ${i}`);
    }
  }

  // ── Last day must be FINAL ────────────────────────
  const lastDay = allDays.find((d) => d.dayNumber === availableDays);
  if (lastDay?.type !== "FINAL") {
    throw new Error(`Last day (${availableDays}) must have type "FINAL"`);
  }

  // ── Estimated minutes sanity ──────────────────────
  const maxMinutes = dailyMinutes * 1.5;
  for (const day of allDays) {
    if (typeof day.estimatedMinutes !== "number" || day.estimatedMinutes <= 0) {
      throw new Error(`Day ${day.dayNumber} has invalid estimatedMinutes`);
    }
    if (day.estimatedMinutes > maxMinutes) {
      throw new Error(
        `Day ${day.dayNumber} exceeds time budget: ${day.estimatedMinutes} > ${maxMinutes}`
      );
    }
  }

  // ── Requirements must be a non-empty array ────────
  for (const day of allDays) {
    if (!Array.isArray(day.requirements) || day.requirements.length === 0) {
      throw new Error(`Day ${day.dayNumber} has no requirements`);
    }
  }

  return true;
}

/**
 * Sort days within each phase by dayNumber, and sort phases by their first day.
 * Fixes out-of-order output from Gemini.
 */
export function normalizeProgression(progression) {
  for (const phase of progression.phases) {
    phase.days.sort((a, b) => a.dayNumber - b.dayNumber);
  }
  progression.phases.sort((a, b) => {
    const aFirst = Math.min(...a.days.map((d) => d.dayNumber));
    const bFirst = Math.min(...b.days.map((d) => d.dayNumber));
    return aFirst - bFirst;
  });
  return progression;
}