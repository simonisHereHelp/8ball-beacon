import { NextResponse } from "next/server";
import { readState, writeState } from "@/lib/storage";
import { scanNewsFeeds } from "@/lib/scanNewsFeeds";
import { analyzeSenti } from "@/lib/analyzeSenti";
import { outTickerSummary, publishTickerSummary } from "@/lib/outTickerSummary";
import { getMedFeedUrls } from "@/lib/newsFeeds";
import { sendDiscordToChannelId } from "@/lib/sendDiscord";

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

function toMedChannelMessage(row: { title: string; summary: string; published: string; link: string }) {
  const published = row.published ? ` (${row.published})` : "";
  const summary = String(row.summary || "").trim();
  const summaryLine = summary ? [summary, ""] : [];

  return [
    "---",
    `${row.title}${published}`,
    "",
    ...summaryLine,
    `<${row.link}>`,
    "---"
  ].join("\n");
}

export async function GET() {
  try {
    const state = readState();
    state.botStatus = state.botStatus || {};
    const medState = state.med || { seenNewsKeys: [] };
    const medChannelId = process.env.DISCORD_MED_CHANNEL_ID;

    if (medChannelId) {
      await sendDiscordToChannelId(medChannelId, "Scan Med Feed API");
    }

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
          if (medChannelId) {
            await sendDiscordToChannelId(medChannelId, toMedChannelMessage(row));
          } else {
            await publishTickerSummary(row);
          }
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
      summary: latestMedFeedsLog.summary,
      feedUpdateTime: nextFeedUpdateTime,
      effectiveSince: new Date(effectiveSince).toISOString(),
      sent: sentRows.length,
      rows: sentRows,
      medFeedUrls,
      medChannelId: medChannelId || null,
      latestScanMedFeed: state.botStatus.latestScanMedFeed,
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
