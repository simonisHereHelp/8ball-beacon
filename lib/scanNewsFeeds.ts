import { detectTickers, fetchAllFeedItems, fetchAllNewsFeedItems, type NewsHit } from "@/lib/newsFeeds";

const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

function newsKey(hit: NewsHit) {
  return `${hit.link || hit.title}|${hit.publishedDtUtc || ""}|${hit.tickers.join(",")}`;
}

export async function scanNewsFeeds(feedUpdateTime?: string, seenNewsKeys: string[] = [], feedUrls?: string[]) {
  const seen = new Set(seenNewsKeys);
  const now = Date.now();
  const fifteenDaysAgo = now - FIFTEEN_DAYS_MS;
  const feedUpdateMs = feedUpdateTime ? Date.parse(feedUpdateTime) : NaN;
  const effectiveSince = Number.isFinite(feedUpdateMs) ? Math.max(feedUpdateMs, fifteenDaysAgo) : fifteenDaysAgo;

  const { allItems, fetchStats } = feedUrls
    ? await fetchAllFeedItems(feedUrls)
    : await fetchAllNewsFeedItems();
  const candidates = new Map<string, NewsHit>();

  for (const item of allItems) {
    const tickers = detectTickers(item);
    if (tickers.length === 0) continue;
    if (!item.publishedUnix) continue;
    if (item.publishedUnix < effectiveSince) continue;

    const hit: NewsHit = { ...item, tickers };
    const key = newsKey(hit);
    if (seen.has(key)) continue;
    candidates.set(key, hit);
  }

  const hits = [...candidates.values()].sort((a, b) => (b.publishedUnix || 0) - (a.publishedUnix || 0));
  const newKeys = hits.map(newsKey);

  return {
    now,
    effectiveSince,
    hits,
    newKeys,
    fetchStats
  };
}
