// src/services/anilist.js
import { config } from "../config.js";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

// Simple in-memory cache to keep us well under the 90 req/min limit.
// key = search query (lowercased), value = { at, results }
const searchCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_ENTRIES = 200;

function cacheKey(q) {
  return q.trim().toLowerCase();
}

function pruneCache() {
  if (searchCache.size <= CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of searchCache.entries()) {
    if (now - v.at > CACHE_TTL_MS) searchCache.delete(k);
  }
}

const SEARCH_QUERY = `
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      currentPage
      hasNextPage
    }
    characters(search: $search, sort: [FAVOURITES_DESC, SEARCH_MATCH]) {
      id
      name {
        full
        native
        alternative
      }
      image {
        large
        medium
      }
      description(asHtml: false)
      favourites
      media(perPage: 3, sort: POPULARITY_DESC) {
        nodes {
          id
          title {
            romaji
            english
            native
          }
          genres
          isAdult
        }
      }
    }
  }
}
`;

/**
 * Search AniList for characters matching a query.
 * @param {string} query
 * @param {{ page?: number, perPage?: number }} [opts]
 * @returns {Promise<Array<object>>} sanitized character results
 */
export async function searchCharacters(query, { page = 1, perPage = 20 } = {}) {
  const key = cacheKey(query);
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.results;
  }

  const body = {
    query: SEARCH_QUERY,
    variables: { search: query, page, perPage },
  };

  const res = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const retry = res.headers.get("retry-after") ?? "60";
    throw Object.assign(new Error("AniList rate limited"), {
      code: "ANILIST_RATE_LIMITED",
      status: 429,
      retryAfter: Number(retry),
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(`AniList error ${res.status}`), {
      code: "ANILIST_ERROR",
      status: res.status,
      body: text.slice(0, 200),
    });
  }

  const json = await res.json();

  if (json.errors?.length) {
    const first = json.errors[0];
    throw Object.assign(new Error(first.message ?? "AniList GraphQL error"), {
      code: "ANILIST_GRAPHQL_ERROR",
      status: 400,
    });
  }

  const edges = json.data?.Page?.characters ?? [];

  // Sanitize: strip HTML from description, normalize shape.
  const results = edges.map((c) => {
    const media = c.media?.nodes?.[0] ?? null;
    return {
      externalId: String(c.id),
      name: c.name?.full ?? c.name?.native ?? "Unknown",
      nameNative: c.name?.native ?? null,
      aliases: c.name?.alternative ?? [],
      image: c.image?.large ?? c.image?.medium ?? null,
      thumb: c.image?.medium ?? null,
      description: stripHtml(c.description ?? "").slice(0, 400),
      favourites: c.favourites ?? 0,
      sourceAnime: media
        ? {
            id: String(media.id),
            title:
              media.title?.english ??
              media.title?.romaji ??
              media.title?.native ??
              null,
            genres: media.genres ?? [],
            isAdult: !!media.isAdult,
          }
        : null,
      attribution: "via AniList",
    };
  });

  searchCache.set(key, { at: Date.now(), results });
  pruneCache();
  return results;
}

/**
 * Fetch a specific character by AniList ID.
 * Used to re-verify a selection before persisting it.
 */
export async function getCharacterById(id) {
  const query = `
    query ($id: Int) {
      Character(id: $id) {
        id
        name { full native }
        image { large medium }
        description(asHtml: false)
        favourites
      }
    }
  `;

  const res = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { id: Number(id) } }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  const c = json.data?.Character;
  if (!c) return null;

  return {
    externalId: String(c.id),
    name: c.name?.full ?? c.name?.native ?? "Unknown",
    image: c.image?.large ?? c.image?.medium ?? null,
    thumb: c.image?.medium ?? null,
    attribution: "via AniList",
  };
}

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}