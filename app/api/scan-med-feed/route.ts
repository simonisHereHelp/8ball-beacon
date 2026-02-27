import { NextResponse } from "next/server";
import { readState, writeState } from "@/lib/storage";
import { scanNewsFeeds } from "@/lib/scanNewsFeeds";
import { analyzeSenti } from "@/lib/analyzeSenti";
import { outTickerSummary, publishTickerSummary } from "@/lib/outTickerSummary";
import { getMedFeedUrls } from "@/lib/newsFeeds";

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
  try {
    const state = readState();
    state.botStatus = state.botStatus || {};
    const medState = state.med || { seenNewsKeys: [] };

    const medFeedUrls = getMedFeedUrls();

    const {
      now,
      effectiveSince,
      hits,
      newKeys,
      fetchStats
    } = await scanNewsFeeds(medState.feedUpdateTime, medState.seenNewsKeys || [], medFeedUrls);

    const sentRows: Array<Record<string, string>> = [];
    const publishErrors: Array<{ ticker: string; title: string; error: string }> = [];

    for (const hit of hits) {
      for (const ticker of hit.tickers) {
        const sentiment = await analyzeSenti(ticker, hit.title, hit.summary);
        const row = outTickerSummary(hit, ticker, sentiment);
        try {
          await publishTickerSummary(row);
          sentRows.push(row);
        } catch (error) {
          publishErrors.push({
            ticker,
            title: hit.title,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    const nextFeedUpdateTime = new Date(now).toISOString();
    const latestMedFeedsLog = {
      ...nowPst(),
      summary: `since=${new Date(effectiveSince).toISOString()}, matched=${hits.length}, sent=${sentRows.length}`,
      feedUpdateTime: nextFeedUpdateTime
    };

    state.med = {
      seenNewsKeys: [...(medState.seenNewsKeys || []), ...newKeys].slice(-5000),
      feedUpdateTime: nextFeedUpdateTime,
      latestMedFeedsLog,
      latestScanMedFeed: {
        date: latestMedFeedsLog.date,
        timePst: latestMedFeedsLog.timePst,
        summary: latestMedFeedsLog.summary
      }
    };
    state.botStatus.latestScanMedFeed = {
      date: latestMedFeedsLog.date,
      timePst: latestMedFeedsLog.timePst,
      summary: latestMedFeedsLog.summary
    };

    writeState(state);

    return NextResponse.json({
      ok: true,
      feedUpdateTime: nextFeedUpdateTime,
      effectiveSince: new Date(effectiveSince).toISOString(),
      sent: sentRows.length,
      rows: sentRows,
      fetchStats,
      publishErrors
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
