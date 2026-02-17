import { readEnriched } from "@/lib/enriched";

let cachedTickets: string[] | null = null;

export function getTrackedTickets(): string[] {
  if (cachedTickets) return cachedTickets;

  const rows = readEnriched();
  const tickets = rows
    .map((row) => String(row.ticket || "").trim().toUpperCase())
    .filter(Boolean);

  cachedTickets = [...new Set(tickets)];
  return cachedTickets;
}

export const US_ACTIVE_RSS = [
  "https://feeds.bloomberg.com/markets/news.rss",
  "https://feeds.bloomberg.com/economics/news.rss",
  "https://feeds.bloomberg.com/business/news.rss",
  "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  "https://feeds.marketwatch.com/marketwatch/topstories/",
  "https://feeds.content.dowjones.io/public/rss/mw_marketpulse",
  "https://finance.yahoo.com/news/rssindex",
  "https://finance.yahoo.com/rss/",
  "https://seekingalpha.com/market_currents.xml",
  "https://news.alphastreet.com/feed/",
  "https://insight.factset.com/rss.xml",
  "https://www.nasdaq.com/feed/nasdaq-original/rss.xml",
  "https://www.nasdaq.com/feed/rssoutbound?category=Earnings",
  "https://www.nasdaq.com/feed/rssoutbound?category=Markets",
  "https://www.nasdaq.com/feed/rssoutbound?category=Stocks",
  "https://www.nasdaq.com/feed/rssoutbound?category=Technology",
  "https://www.nasdaq.com/feed/rssoutbound?category=Financial+Advisors",
  "https://www.nasdaq.com/feed/rssoutbound?category=Nasdaq",
  "https://www.nasdaq.com/feed/rssoutbound?category=Innovation",
  "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain",
  "https://www.investing.com/rss/news_14.rss",
  "https://www.investing.com/rss/news_25.rss",
  "https://libertystreeteconomics.newyorkfed.org/feed/",
  "https://rss.app/feeds/WpnRvu5SRsRAhZpQ.xml",
  "https://www.reutersagency.com/feed/?best-sectors=economy&post_type=best"
];

export type FeedItem = {
  title: string;
  summary: string;
  link: string;
  source: string;
  sourceName: string;
  publishedAtRaw?: string;
  publishedDtUtc?: string;
  publishedUnix?: number;
};

export type NewsHit = FeedItem & { tickers: string[] };

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value: string): string {
  return decodeEntities(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function readTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return stripTags(match?.[1] || "");
}

function readAtomLink(block: string): string {
  const hrefMatch = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>(?:<\/link>)?/i);
  return hrefMatch?.[1]?.trim() || "";
}

function parsePublishedDate(raw?: string): { isoUtc?: string; unix?: number } {
  if (!raw) return {};
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return {};
  return { isoUtc: d.toISOString(), unix: d.getTime() };
}

function sourceNameFromUrl(source: string): string {
  try {
    const host = new URL(source).hostname.replace(/^www\./i, "");
    const base = host.split(".")[0] || host;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return source;
  }
}

function normalizeItem(base: Omit<FeedItem, "sourceName" | "publishedDtUtc" | "publishedUnix">): FeedItem {
  const parsed = parsePublishedDate(base.publishedAtRaw);
  return {
    ...base,
    sourceName: sourceNameFromUrl(base.source),
    publishedDtUtc: parsed.isoUtc,
    publishedUnix: parsed.unix
  };
}

function parseRssItems(xml: string, source: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = readTag(block, "title");
    const summary = readTag(block, "description");
    const link = readTag(block, "link");
    const publishedAtRaw = readTag(block, "pubDate") || readTag(block, "dc:date") || undefined;

    if (!title) continue;
    items.push(normalizeItem({ title, summary, link, publishedAtRaw, source }));
  }

  return items;
}

function parseAtomEntries(xml: string, source: string): FeedItem[] {
  const entries: FeedItem[] = [];
  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = readTag(block, "title");
    const summary = readTag(block, "summary") || readTag(block, "content");
    const link = readAtomLink(block);
    const publishedAtRaw = readTag(block, "updated") || readTag(block, "published") || undefined;

    if (!title) continue;
    entries.push(normalizeItem({ title, summary, link, publishedAtRaw, source }));
  }

  return entries;
}

export async function fetchAllNewsFeedItems() {
  const headers = {
    "User-Agent": process.env.SEC_USER_AGENT || "8ball-beacon/0.1 news scanner",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml"
  };

  const allItems: FeedItem[] = [];
  const fetchStats: Array<{ source: string; ok: boolean; status?: number; count: number; error?: string }> = [];

  for (const source of US_ACTIVE_RSS) {
    try {
      const res = await fetch(source, { headers, cache: "no-store" });
      if (!res.ok) {
        fetchStats.push({ source, ok: false, status: res.status, count: 0 });
        continue;
      }
      const xml = await res.text();
      const items = [...parseRssItems(xml, source), ...parseAtomEntries(xml, source)];
      allItems.push(...items);
      fetchStats.push({ source, ok: true, status: res.status, count: items.length });
    } catch (error) {
      fetchStats.push({
        source,
        ok: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { allItems, fetchStats };
}

export function detectTickers(item: FeedItem): string[] {
  const text = `${item.title}\n${item.summary}`.toUpperCase();
  return getTrackedTickets().filter((ticker) => new RegExp(`\\b${ticker}\\b`, "i").test(text));
}
