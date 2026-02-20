import { NextResponse } from "next/server";
import { readState, writeState } from "@/lib/storage";
import { scanNewsFeeds } from "@/lib/scanNewsFeeds";
import { analyzeSenti } from "@/lib/analyzeSenti";
import { outTickerSummary, publishTickerSummary } from "@/lib/outTickerSummary";

export const runtime = "nodejs";

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

export async function GET() {
  const state = readState();
  const newsState = state.news || { seenNewsKeys: [] };

  const {
    now,
    effectiveSince,
    hits,
    newKeys,
    fetchStats
  } = await scanNewsFeeds(newsState.feedUpdateTime, newsState.seenNewsKeys || []);

  const sentRows: Array<Record<string, string>> = [];

  for (const hit of hits) {
    for (const ticker of hit.tickers) {
      const sentiment = await analyzeSenti(ticker, hit.title, hit.summary);
      const row = outTickerSummary(hit, ticker, sentiment);
      await publishTickerSummary(row);
      sentRows.push(row);
    }
  }

  const nextFeedUpdateTime = new Date(now).toISOString();
  const latestNewsFeedsLog = {
    ...nowPst(),
    summary: `since=${new Date(effectiveSince).toISOString()}, matched=${hits.length}, sent=${sentRows.length}`,
    feedUpdateTime: nextFeedUpdateTime
  };

  state.news = {
    seenNewsKeys: [...(newsState.seenNewsKeys || []), ...newKeys].slice(-5000),
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
