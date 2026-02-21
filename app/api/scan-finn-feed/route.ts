import { NextResponse } from "next/server";
import { readEnriched } from "@/lib/enriched";
import { readState, writeState } from "@/lib/storage";
import { analyzeSenti } from "@/lib/analyzeSenti";
import { outTickerSummary } from "@/lib/outTickerSummary";
import { sendDiscordNews } from "@/lib/sendDiscord";

export const runtime = "nodejs";

type FinnhubNewsItem = {
  id: number;
  datetime: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
};

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

function toYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toSimpleFinnhubMessage(row: { title: string; summary: string; published: string; link: string }) {
  const published = row.published ? ` (${row.published})` : "";
  const summaryLine = row.summary?.trim() ? [row.summary.trim(), ""] : [];

  return [
    "---",
    `${row.title}${published}`,
    "",
    ...summaryLine,
    row.link,
    "---"
  ].join("\n");
}

async function fetchFinnhubCompanyNews(ticker: string, fromDate: string, toDate: string, apiKey: string) {
  const url = new URL("https://finnhub.io/api/v1/company-news");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("from", fromDate);
  url.searchParams.set("to", toDate);
  url.searchParams.set("token", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Finnhub company-news failed for ${ticker}: ${res.status}`);
  }

  return await res.json() as FinnhubNewsItem[];
}

export async function GET() {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Missing FINNHUB_API_KEY" }, { status: 500 });
  }

  const state = readState();
  const finnhubState = state.finnhub || { seenNewsKeys: [], feedUpdateTime: null };
  const seenNewsKeys = new Set<string>(finnhubState.seenNewsKeys || []);
  const feedUpdateTime = finnhubState.feedUpdateTime ? new Date(finnhubState.feedUpdateTime) : new Date(Date.now() - 6 * 60 * 60 * 1000);

  const fromDate = toYmd(feedUpdateTime);
  const toDate = toYmd(new Date());
  const tickers = [...new Set(readEnriched().map((row) => row.ticket).filter(Boolean))];

  const rows: Array<Record<string, string>> = [];
  let scanned = 0;

  for (const ticker of tickers) {
    const items = await fetchFinnhubCompanyNews(ticker, fromDate, toDate, apiKey);
    scanned += items.length;

    for (const item of items) {
      const itemDate = new Date(item.datetime * 1000);
      if (itemDate <= feedUpdateTime) continue;

      const dedupeKey = `${item.id}|${ticker}`;
      if (seenNewsKeys.has(dedupeKey)) continue;

      const sentiment = await analyzeSenti(ticker, item.headline, item.summary || "");
      const row = outTickerSummary({
        source: "https://finnhub.io",
        sourceName: item.source || "Finnhub",
        title: item.headline,
        summary: item.summary || "",
        link: item.url,
        publishedAtRaw: itemDate.toISOString(),
        publishedDtUtc: itemDate.toISOString(),
        publishedUnix: itemDate.getTime(),
        tickers: [ticker]
      }, ticker, sentiment);

      await sendDiscordNews(toSimpleFinnhubMessage(row));
      rows.push(row);
      seenNewsKeys.add(dedupeKey);
    }
  }

  const nextFeedUpdateTime = new Date().toISOString();
  const latestScanFinnFeed = {
    ...nowPst(),
    summary: `since=${feedUpdateTime.toISOString()}, matched=${scanned}, sent=${rows.length}`
  };

  state.finnhub = {
    seenNewsKeys: [...seenNewsKeys].slice(-5000),
    feedUpdateTime: nextFeedUpdateTime,
    latestScanFinnFeed
  };
  state.botStatus.latestScanFinnFeed = latestScanFinnFeed;
  writeState(state);

  return NextResponse.json({
    ok: true,
    fromDate,
    toDate,
    sent: rows.length,
    scanned,
    rows
  });
}
