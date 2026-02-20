import { NextResponse } from "next/server";
import { readEnriched } from "@/lib/enriched";
import { sendDiscordNews } from "@/lib/sendDiscord";

export const runtime = "nodejs";

type FinnhubEarning = {
  symbol?: string;
  date?: string;
  hour?: string;
  quarter?: number;
  year?: number;
  epsEstimate?: number;
  revenueEstimate?: number;
  currentEps?: number | null;
};

type FinnhubCalendarResponse = {
  earningsCalendar?: FinnhubEarning[];
};

type FinnhubMetricResponse = {
  metric?: {
    epsTTM?: number;
  };
};

function toIsoDate(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function asTickerSet() {
  const rows = readEnriched() as Array<Record<string, unknown>>;
  return Array.from(new Set(
    rows
      .map((row) => {
        const value = row.ticket ?? row.ticker;
        return String(value || "").trim().toUpperCase();
      })
      .filter(Boolean)
  ));
}

async function getCalendarForTicker(from: string, to: string, symbol: string, token: string): Promise<FinnhubEarning[]> {
  const url = new URL("https://finnhub.io/api/v1/calendar/earnings");
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("token", token);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Finnhub calendar ${response.status} for ${symbol}`);
  }

  const data = await response.json() as FinnhubCalendarResponse;
  return Array.isArray(data.earningsCalendar) ? data.earningsCalendar : [];
}

async function getCurrentEpsForTicker(symbol: string, token: string): Promise<number | null> {
  const url = new URL("https://finnhub.io/api/v1/stock/metric");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("metric", "all");
  url.searchParams.set("token", token);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Finnhub metric ${response.status} for ${symbol}`);
  }

  const data = await response.json() as FinnhubMetricResponse;
  const eps = data.metric?.epsTTM;
  return typeof eps === "number" ? eps : null;
}

function formatRows(rows: FinnhubEarning[]): string {
  return rows
    .map((row) => {
      const sym = row.symbol || "N/A";
      const when = row.date || "unknown-date";
      const hour = row.hour ? ` ${row.hour}` : "";
      const quarter = row.quarter ? ` Q${row.quarter}` : "";
      const year = row.year ? ` ${row.year}` : "";
      const currentEps = typeof row.currentEps === "number" ? ` | current EPS: ${row.currentEps}` : "";
      return `- ${sym}: ${when}${hour}${quarter}${year}${currentEps}`;
    })
    .join("\n");
}

export async function GET() {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Missing FINNHUB_API_KEY" }, { status: 500 });
  }

  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - 5);
  const from = toIsoDate(fromDate);

  const toDate = new Date();
  toDate.setUTCDate(toDate.getUTCDate() + 120);
  const to = toIsoDate(toDate);

  const tickers = asTickerSet();
  const events: FinnhubEarning[] = [];
  const errors: Array<{ ticker: string; error: string }> = [];
  const processedTickers: string[] = [];
  const currentEpsByTicker: Record<string, number | null> = {};

  for (const ticker of tickers) {
    processedTickers.push(ticker);
    try {
      currentEpsByTicker[ticker] = await getCurrentEpsForTicker(ticker, apiKey);
    } catch (error) {
      currentEpsByTicker[ticker] = null;
      errors.push({
        ticker,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      const rows = await getCalendarForTicker(from, to, ticker, apiKey);
      events.push(...rows.map((row) => {
        const symbol = row.symbol || ticker;
        return {
          ...row,
          symbol,
          currentEps: currentEpsByTicker[symbol] ?? currentEpsByTicker[ticker] ?? null
        };
      }));
    } catch (error) {
      errors.push({
        ticker,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const deduped = Array.from(new Map(events
    .map((event) => {
      const key = [event.symbol || "", event.date || "", event.hour || ""].join("|");
      return [key, event] as const;
    })).values());

  deduped.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const header = `📅 Next earnings calendar (${from} → ${to}) for ${tickers.length} tickers`;
  const coverage = `Processed ${processedTickers.length}/${tickers.length} ticker(s).`;
  const body = deduped.length ? formatRows(deduped.slice(0, 80)) : "- No upcoming earnings events found.";
  const suffix = errors.length
    ? `\n\n⚠️ Errors for ${errors.length} ticker(s): ${errors.slice(0, 10).map((e) => e.ticker).join(", ")}`
    : "";

  await sendDiscordNews(`${header}\n${coverage}\n${body}${suffix}`);

  return NextResponse.json({
    ok: true,
    from,
    to,
    tickersRequested: tickers.length,
    tickersProcessed: processedTickers.length,
    processedTickers,
    currentEpsByTicker,
    events: deduped,
    errors
  });
}
