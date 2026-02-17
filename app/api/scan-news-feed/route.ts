import { NextResponse } from "next/server";
import { readState, writeState } from "@/lib/storage";
import { sendDiscordNews } from "@/lib/sendDiscord";
import { detectTickers, fetchAllNewsFeedItems, type NewsHit } from "@/lib/newsFeeds";

export const runtime = "nodejs";

type Sentiment = "BULL" | "BEAR" | "na";

const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

function formatPstDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function nowPst() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const timePst = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(now);
  return { date, timePst };
}

async function classifyWithGpt5(ticker: string, title: string, summary: string): Promise<Sentiment> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "na";

  const payload = {
    model: process.env.OPENAI_NEWS_MODEL || "gpt-5",
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: "Classify market sentiment for one news item. Return only one token: BULL, BEAR, or na." }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify({ ticker, title, summary }) }]
      }
    ]
  };

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) return "na";
    const json = await res.json() as { output_text?: string };
    const out = String(json.output_text || "na").trim().toUpperCase();
    if (out.includes("BULL")) return "BULL";
    if (out.includes("BEAR")) return "BEAR";
    return "na";
  } catch {
    return "na";
  }
}

function summarize(summary: string, max = 260) {
  const s = summary.trim().replace(/\s+/g, " ");
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max - 3)}...`;
}

function makeTickerLabel(ticker: string, sentiment: Sentiment) {
  if (sentiment === "BULL") return `${ticker}*BULL`;
  if (sentiment === "BEAR") return `${ticker}*BEAR`;
  return ticker;
}

function newsKey(hit: NewsHit) {
  return `${hit.link || hit.title}|${hit.publishedDtUtc || ""}|${hit.tickers.join(",")}`;
}

export async function GET() {
  const state = readState();
  const newsState = state.news || { seenNewsKeys: [] };
  const seen = new Set(newsState.seenNewsKeys || []);

  const now = Date.now();
  const fifteenDaysAgo = now - FIFTEEN_DAYS_MS;
  const feedUpdateMs = newsState.feedUpdateTime ? Date.parse(newsState.feedUpdateTime) : NaN;
  const effectiveSince = Number.isFinite(feedUpdateMs) ? Math.max(feedUpdateMs, fifteenDaysAgo) : fifteenDaysAgo;

  const { allItems, fetchStats } = await fetchAllNewsFeedItems();
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
  const newsChannelId = process.env.DISCORD_NEWS_CHANNEL_ID || "";

  const sentRows: Array<Record<string, string>> = [];
  for (const hit of hits) {
    for (const ticker of hit.tickers) {
      const sentiment = await classifyWithGpt5(ticker, hit.title, hit.summary);
      const row = {
        ticker: makeTickerLabel(ticker, sentiment),
        title: hit.title,
        summary: summarize(hit.summary) || summarize(hit.title),
        link: hit.link,
        source: hit.sourceName,
        published: hit.publishedUnix ? `${formatPstDateTime(new Date(hit.publishedUnix))} PST` : "",
        published_dt_utc: hit.publishedDtUtc || ""
      };

      const payload = newsChannelId ? { channel_id: newsChannelId, ...row } : row;
      await sendDiscordNews(`\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``);
      sentRows.push(row);
    }
  }

  const newKeys = hits.map(newsKey);
  const nextFeedUpdateTime = new Date(now).toISOString();
  const latestNewsFeedsLog = {
    ...nowPst(),
    summary: `since=${new Date(effectiveSince).toISOString()}, matched=${hits.length}, sent=${sentRows.length}`,
    feedUpdateTime: nextFeedUpdateTime
  };

  state.news = {
    seenNewsKeys: [...newsState.seenNewsKeys, ...newKeys].slice(-5000),
    feedUpdateTime: nextFeedUpdateTime,
    latestNewsFeedsLog,
    latestScanNewsFeed: {
      date: latestNewsFeedsLog.date,
      timePst: latestNewsFeedsLog.timePst,
      summary: latestNewsFeedsLog.summary
    }
  };
  state.botStatus.latestScanNewsFeed = {
    date: latestNewsFeedsLog.date,
    timePst: latestNewsFeedsLog.timePst,
    summary: latestNewsFeedsLog.summary
  };

  writeState(state);

  return NextResponse.json({
    ok: true,
    feedUpdateTime: nextFeedUpdateTime,
    effectiveSince: new Date(effectiveSince).toISOString(),
    sent: sentRows.length,
    rows: sentRows,
    fetchStats
  });
}
