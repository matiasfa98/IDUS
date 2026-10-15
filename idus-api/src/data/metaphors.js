// src/data/metaphors.js
//
// Static catalog for user metaphors. Curated, versioned with the codebase.
// When this needs to be editable without a deploy, lift it into a Mongo
// collection with the same shape and swap the import. Don't do that yet.

export const GENRES = [
  "shonen",
  "seinen",
  "shojo",
  "josei",
  "isekai",
  "mecha",
  "slice-of-life",
  "psychological",
  "sports",
  "supernatural",
  "historical",
  "cyberpunk",
  "fantasy",
  "sci-fi",
  "mystery",
  "horror",
];

export const ARCHETYPES = [
  "ronin",
  "alchemist",
  "shinobi",
  "strategist",
  "berserker",
  "healer",
  "mentor",
  "rival",
  "prodigy",
  "wanderer",
  "trickster",
  "guardian",
  "scholar",
  "artisan",
  "hunter",
  "monarch",
];

export const VIBES = [
  "stoic",
  "chaotic",
  "wholesome",
  "melancholic",
  "heroic",
  "trickster",
  "determined",
  "curious",
  "serene",
  "fierce",
];

// Optional: guided onboarding — pick a genre, suggest archetypes.
// Not enforced server-side; just a hint the frontend can use.
export const ARCHETYPES_BY_GENRE = {
  shonen: ["prodigy", "rival", "berserker", "guardian"],
  seinen: ["ronin", "strategist", "scholar", "hunter"],
  shojo: ["healer", "artisan", "scholar", "guardian"],
  josei: ["strategist", "artisan", "mentor", "healer"],
  isekai: ["wanderer", "alchemist", "trickster", "monarch"],
  mecha: ["prodigy", "strategist", "guardian", "berserker"],
  "slice-of-life": ["artisan", "healer", "mentor", "wanderer"],
  psychological: ["strategist", "trickster", "scholar", "rival"],
  sports: ["prodigy", "rival", "mentor", "determined"],
  supernatural: ["shinobi", "monarch", "hunter", "alchemist"],
  historical: ["ronin", "strategist", "artisan", "mentor"],
  cyberpunk: ["hacker", "trickster", "hunter", "monarch"],
  fantasy: ["alchemist", "guardian", "wanderer", "monarch"],
  "sci-fi": ["strategist", "scholar", "prodigy", "guardian"],
  mystery: ["scholar", "strategist", "hunter", "trickster"],
  horror: ["hunter", "monarch", "trickster", "ronin"],
};

// Defaults applied when a user hasn't picked anything yet.
// Chosen to be neutral and non-presumptuous.
export const DEFAULT_METAPHOR = {
  genre: "slice-of-life",
  archetype: "wanderer",
  vibe: "curious",
  displayName: null,
  tagline: null,
  art: null,
};

export const METAPHOR_LIMITS = {
  displayNameMax: 40,
  taglineMax: 120,
  attributionMax: 200,
};

export function isValidGenre(g) {
  return GENRES.includes(g);
}
export function isValidArchetype(a) {
  return ARCHETYPES.includes(a);
}
export function isValidVibe(v) {
  return VIBES.includes(v);
}