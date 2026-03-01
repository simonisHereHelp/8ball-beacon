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

function parseFeedUpdateTime(value?: string | null) {
  if (!value) return new Date(Date.now() - 6 * 60 * 60 * 1000);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(Date.now() - 6 * 60 * 60 * 1000);
  }
  return parsed;
}

function normalizeUrl(url: string) {
  const normalized = String(url || "").trim();
  if (!normalized) return "";

  try {
    const parsed = new URL(normalized);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function makeDedupeCandidates(item: FinnhubNewsItem, ticker: string) {
  const normalizedTicker = ticker.toUpperCase();
  const normalizedUrl = normalizeUrl(item.url);
  const normalizedHeadline = stripHtml(item.headline || "").toLowerCase();
  const normalizedDate = item.datetime ? new Date(item.datetime * 1000).toISOString().slice(0, 16) : "";

  return [
    item.id ? `id:${item.id}|${normalizedTicker}` : "",
    normalizedUrl ? `url:${normalizedUrl}|${normalizedTicker}` : "",
    (normalizedHeadline && normalizedDate) ? `title:${normalizedHeadline}|${normalizedDate}|${normalizedTicker}` : ""
  ].filter(Boolean);
}


function stripHtml(value: string) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function toSimpleFinnhubMessage(row: { title: string; summary: string; published: string; link: string }) {
  const published = row.published ? ` (${row.published})` : "";
  const title = stripHtml(row.title);
  const summary = stripHtml(row.summary);
  const summaryLine = summary ? [summary, ""] : [];

  return [
    "---",
    `${title}${published}`,
    "",
    ...summaryLine,
    `<${row.link}>`,
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
  state.botStatus = state.botStatus || {};
  const finnhubState = state.finnhub || { seenNewsKeys: [], feedUpdateTime: null };
  const seenNewsKeys = new Set<string>(finnhubState.seenNewsKeys || []);
  const feedUpdateTime = parseFeedUpdateTime(finnhubState.feedUpdateTime);

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

      const dedupeCandidates = makeDedupeCandidates(item, ticker);
      if (dedupeCandidates.some((key) => seenNewsKeys.has(key))) continue;

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
      for (const key of dedupeCandidates) {
        seenNewsKeys.add(key);
      }
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
  state.botStatus.latestScanFinnFeeds = latestScanFinnFeed;
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
