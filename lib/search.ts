// Client-side search over creators, coins and posts.
// Every token must match at least one field (AND semantics), and each token
// contributes its best field score, so "gajanan coin" narrows instead of widening.
import { coins, creators, posts, type Coin, type Creator, type Post } from "./data";

export type SearchHit =
  | { kind: "creator"; key: string; score: number; creator: Creator; href: string }
  | { kind: "coin"; key: string; score: number; coin: Coin; href: string }
  | { kind: "post"; key: string; score: number; post: Post; href: string };

export type SearchResults = { creators: Creator[]; coins: Coin[]; posts: Post[]; total: number };

type Field = { text: string; weight: number };

const norm = (s: string) => s.toLowerCase().replace(/^@/, "").trim();
const isBoundary = (ch: string) => /[\s\-_.$@/]/.test(ch);

/** 0 = no match. Exact > prefix > word-boundary > substring. */
function fieldScore(needle: string, field: Field): number {
  const h = norm(field.text);
  if (!h) return 0;
  if (h === needle) return field.weight * 4;
  if (h.startsWith(needle)) return field.weight * 3;
  const at = h.indexOf(needle);
  if (at < 0) return 0;
  return isBoundary(h[at - 1] ?? " ") ? field.weight * 2 : field.weight;
}

/** Sum of per-token best scores; 0 as soon as one token matches nothing. */
function scoreTokens(tokens: string[], fields: Field[]): number {
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const field of fields) {
      const s = fieldScore(token, field);
      if (s > best) best = s;
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

const creatorFields = (c: Creator): Field[] => [
  { text: c.username, weight: 10 },
  { text: c.name, weight: 8 },
  { text: c.bio, weight: 3 },
  { text: c.location, weight: 2 },
  { text: c.coinId ?? "", weight: 4 },
];

const coinFields = (c: Coin): Field[] => [
  { text: c.symbol, weight: 10 },
  { text: c.symbol.replace(/^\$/, ""), weight: 9 },
  { text: c.id, weight: 7 },
  { text: c.name, weight: 8 },
  { text: c.creator, weight: 3 },
];

const postFields = (p: Post): Field[] => [
  { text: p.caption, weight: 5 },
  { text: p.creator, weight: 3 },
  { text: p.kind, weight: 2 },
  { text: p.coinId ?? "", weight: 4 },
];

/** Small deterministic nudge so equal-scoring hits order by popularity. */
const popularity = (n: number) => Math.round(Math.log10(n + 1) * 3);

export function parseQuery(q: string): string[] {
  return norm(q).split(/\s+/).filter(Boolean);
}

const EMPTY: SearchResults = { creators: [], coins: [], posts: [], total: 0 };

export function search(q: string, limit = 6): SearchResults {
  const tokens = parseQuery(q);
  if (tokens.length === 0) return EMPTY;

  const cHits: { creator: Creator; score: number }[] = [];
  for (const creator of creators) {
    const s = scoreTokens(tokens, creatorFields(creator));
    if (s > 0) cHits.push({ creator, score: s + popularity(creator.followers) });
  }

  const kHits: { coin: Coin; score: number }[] = [];
  for (const coin of coins) {
    const s = scoreTokens(tokens, coinFields(coin));
    if (s > 0) kHits.push({ coin, score: s + popularity(coin.marketCap) });
  }

  const pHits: { post: Post; score: number }[] = [];
  for (const post of posts) {
    const s = scoreTokens(tokens, postFields(post));
    if (s > 0) pHits.push({ post, score: s + popularity(post.collects * 20 + post.likes) });
  }

  const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;
  cHits.sort(byScore); kHits.sort(byScore); pHits.sort(byScore);

  return {
    creators: cHits.slice(0, limit).map((x) => x.creator),
    coins: kHits.slice(0, limit).map((x) => x.coin),
    posts: pHits.slice(0, limit).map((x) => x.post),
    total: cHits.length + kHits.length + pHits.length,
  };
}

/** Flat, ordered list for keyboard navigation; group order is fixed. */
export function toHits(r: SearchResults): SearchHit[] {
  return [
    ...r.creators.map((creator): SearchHit => ({ kind: "creator", key: `c:${creator.username}`, score: 0, creator, href: `/creator/${creator.username}` })),
    ...r.coins.map((coin): SearchHit => ({ kind: "coin", key: `k:${coin.id}`, score: 0, coin, href: `/coins/${coin.id}` })),
    ...r.posts.map((post): SearchHit => ({ kind: "post", key: `p:${post.id}`, score: 0, post, href: `/post/${post.id}` })),
  ];
}

export const postById = (id: string) => posts.find((p) => p.id === id);

/** Wraps query-token matches in <mark>; used to highlight result titles. */
export function highlight(text: string, tokens: string[]): { t: string; hit: boolean }[] {
  if (tokens.length === 0 || !text) return [{ t: text, hit: false }];
  const lower = text.toLowerCase();
  const marks: [number, number][] = [];
  for (const token of tokens) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(token, from);
      if (at < 0) break;
      marks.push([at, at + token.length]);
      from = at + token.length;
    }
  }
  if (marks.length === 0) return [{ t: text, hit: false }];
  marks.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
    else merged.push([m[0], m[1]]);
  }
  const out: { t: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s > cursor) out.push({ t: text.slice(cursor, s), hit: false });
    out.push({ t: text.slice(s, e), hit: true });
    cursor = e;
  }
  if (cursor < text.length) out.push({ t: text.slice(cursor), hit: false });
  return out;
}
