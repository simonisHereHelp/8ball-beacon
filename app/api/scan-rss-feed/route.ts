import { NextResponse } from "next/server";
import { readEnriched, writeEnriched } from "@/lib/enriched";
import { normalizeCik, fetchSubmissionsByCik, pickNewest10Q10K } from "@/lib/sec";
import { readState, writeState } from "@/lib/storage";
import { sendDiscord } from "@/lib/sendDiscord";
import { fetchRssEntries } from "@/lib/scanHelpers";

export const runtime = "nodejs";

function getPstDateTime() {
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

function formatPstEventTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  const hms = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
  return `${ymd} ${hms} PST`;
}

export async function GET() {
  const includeAmendments = (process.env.INCLUDE_AMENDMENTS || "true") === "true";
  const rows = readEnriched();
  const state = readState();
  const results: Array<Record<string, string>> = [];

  const rowByCik = new Map(rows.map((row) => [normalizeCik(row.CIK), row]));
  const qFeed = await fetchRssEntries("10-Q");
  const kFeed = await fetchRssEntries("10-K");
  const rssEntries = [...qFeed.entries, ...kFeed.entries];
  const atomBytes = qFeed.atomBytes + kFeed.atomBytes;

  const latestRssByCik = new Map<string, { updated?: string; accession?: string }>();
  for (const entry of rssEntries) {
    const cik = normalizeCik(entry.cik);
    const prev = latestRssByCik.get(cik);
    if (!prev || (entry.updated && prev.updated && new Date(entry.updated).getTime() > new Date(prev.updated).getTime()) || (!prev?.updated && entry.updated)) {
      latestRssByCik.set(cik, { updated: entry.updated, accession: entry.accession });
    }
  }

  const matchedCiks = new Set(rssEntries.map((entry) => normalizeCik(entry.cik)).filter((cik) => rowByCik.has(cik)));
  let newListingCount = 0;

  for (const cik10 of matchedCiks) {
    const row = rowByCik.get(cik10);
    if (!row) continue;

    const rssAccession = latestRssByCik.get(cik10)?.accession || null;
    const existingAccession = row.accession || null;
    const newListing = Boolean(rssAccession) && rssAccession !== existingAccession;

    if (rssAccession) {
      row.accession = rssAccession;
    }

    if (!newListing) {
      results.push({ ticket: row.ticket, cik: cik10, status: "no_change", reportDate: row["latest filing period"] || "" });
      continue;
    }

    try {
      const sub = await fetchSubmissionsByCik(cik10);
      const newest = pickNewest10Q10K(sub, includeAmendments);

      if (!newest) {
        results.push({ ticket: row.ticket, cik: cik10, status: "no_recent_match" });
        continue;
      }

      const reportDate = newest.reportDate || newest.filedAt;
      if (!reportDate) {
        results.push({ ticket: row.ticket, cik: cik10, status: "no_change", reportDate: "" });
        continue;
      }

      row["latest filing date"] = newest.filedAt;
      row["latest filing type"] = newest.form;
      row["latest filing period"] = reportDate;
      row["latest filing note"] = row["latest filing note"] || "--";

      const atPst = formatPstEventTime(latestRssByCik.get(cik10)?.updated);
      const msg = `${row.ticket} new filing: ${newest.form.replace(/-/g, "")} ${reportDate}${atPst ? ` (at ${atPst})` : ""}`;
      await sendDiscord(msg);

      results.push({ ticket: row.ticket, cik: cik10, status: "NEW", reportDate });
      newListingCount += 1;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ ticket: row.ticket, cik: cik10, status: "error", error: message });
    }
  }

  writeEnriched(rows);
  const { date, timePst } = getPstDateTime();
  state.logs = [{
    latest: `${date} PST ${timePst}`,
    "SEC Edgar (atom):": `${Math.max(1, Math.round(atomBytes / 1024))}k bytes`
  }];
  state.botStatus.latestScanRssFeed = {
    date,
    timePst,
    summary: `matched=${matchedCiks.size}, newListing=${newListingCount}, results=${results.length}`
  };
  writeState(state);

  return NextResponse.json({ ok: true, results });
}
