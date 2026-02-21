import { readEnriched, writeEnriched } from "@/lib/enriched";
import { normalizeCik, type EnrichedRow } from "@/lib/sec";

const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

type SecTickerEntry = {
  cik_str: number;
  ticker: string;
  title: string;
};

export function parseListingsCommand(content: string) {
  const value = String(content || "").trim();
  const addMatch = value.match(/^add\s+ticker\s*,\s*([a-z.\-]+)$/i);
  if (addMatch) {
    return { action: "add" as const, ticker: addMatch[1].toUpperCase() };
  }

  const removeMatch = value.match(/^remove\s+ticker\s*,\s*([a-z.\-]+)$/i);
  if (removeMatch) {
    return { action: "remove" as const, ticker: removeMatch[1].toUpperCase() };
  }

  return null;
}

async function fetchSecTickerBySymbol(ticker: string): Promise<SecTickerEntry | null> {
  const response = await fetch(SEC_TICKERS_URL, {
    headers: {
      "User-Agent": process.env.SEC_USER_AGENT || "SECBeacon/0.1 (example@example.com)",
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`SEC ticker lookup failed: ${response.status}`);
  }

  const payload = await response.json() as Record<string, SecTickerEntry>;
  const entry = Object.values(payload).find((item) => item.ticker?.toUpperCase() === ticker.toUpperCase());
  return entry || null;
}

export async function addTickerToEnriched(ticker: string) {
  const rows = readEnriched();
  const exists = rows.find((row) => row.ticket?.toUpperCase() === ticker.toUpperCase());
  if (exists) {
    return { ok: false, message: `${ticker} already exists in listings.` };
  }

  const secTicker = await fetchSecTickerBySymbol(ticker);
  if (!secTicker) {
    return { ok: false, message: `${ticker} not found in SEC ticker map.` };
  }

  const newRow: EnrichedRow = {
    ticket: ticker.toUpperCase(),
    name: secTicker.title,
    filer: "",
    CIK: normalizeCik(String(secTicker.cik_str)),
    accession: "",
    "latest filing date": null,
    "latest filing type": "",
    "latest filing period": "",
    "latest filing note": ""
  };

  rows.push(newRow);
  writeEnriched(rows);

  return { ok: true, message: `Added ${newRow.ticket} (${newRow.name}) CIK=${newRow.CIK}.` };
}

export function removeTickerFromEnriched(ticker: string) {
  const rows = readEnriched();
  const filtered = rows.filter((row) => row.ticket?.toUpperCase() !== ticker.toUpperCase());
  if (filtered.length === rows.length) {
    return { ok: false, message: `${ticker} was not found in listings.` };
  }

  writeEnriched(filtered);
  return { ok: true, message: `Removed ${ticker.toUpperCase()} from listings.` };
}
