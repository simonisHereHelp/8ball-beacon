import { sendDiscordNews } from "@/lib/sendDiscord";
import type { NewsHit } from "@/lib/newsFeeds";
import type { Sentiment } from "@/lib/analyzeSenti";

export type TickerSummaryRow = {
  ticker: string;
  title: string;
  summary: string;
  link: string;
  source: string;
  published: string;
  published_dt_utc: string;
};

function formatPstDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
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

export function outTickerSummary(hit: NewsHit, ticker: string, sentiment: Sentiment): TickerSummaryRow {
  return {
    ticker: makeTickerLabel(ticker, sentiment),
    title: hit.title,
    summary: summarize(hit.summary) || summarize(hit.title),
    link: hit.link,
    source: hit.sourceName,
    published: hit.publishedUnix ? `${formatPstDateTime(new Date(hit.publishedUnix))} PST` : "",
    published_dt_utc: hit.publishedDtUtc || ""
  };
}

function toPlainTextSummary(row: TickerSummaryRow): string {
  const published = row.published ? ` (${row.published})` : "";
  return [
    "---",
    `${row.title}${published}`,
    "",
    row.link,
    "---"
  ].join("\n");
}

export async function publishTickerSummary(row: TickerSummaryRow) {
  await sendDiscordNews(toPlainTextSummary(row));
}
