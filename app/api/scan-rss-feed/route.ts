import { NextResponse } from "next/server";
import { readEnriched, writeEnriched } from "@/lib/enriched";
import { normalizeCik, fetchSubmissionsByCik, pickNewest10Q10K } from "@/lib/sec";
import { readState, writeState } from "@/lib/storage";
import { sendDiscord } from "@/lib/sendDiscord";
import { fetchRssEntries, formatAcceptedPst, formatPstTimestamp } from "@/lib/scanHelpers";

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

export async function GET() {
  const includeAmendments = (process.env.INCLUDE_AMENDMENTS || "true") === "true";
  const rows = readEnriched();
  const state = readState();
  const results: Array<Record<string, string>> = [];
  const nowIso = new Date().toISOString();
  const nowPst = formatPstTimestamp(new Date());


  const rowByCik = new Map(rows.map((row) => [normalizeCik(row.CIK), row]));
  const qFeed = await fetchRssEntries("10-Q");
  const kFeed = await fetchRssEntries("10-K");
  const rssEntries = [...qFeed.entries, ...kFeed.entries];
  const atomBytes = qFeed.atomBytes + kFeed.atomBytes;
  const matchedCiks = new Set(rssEntries.map((entry) => normalizeCik(entry.cik)).filter((cik) => rowByCik.has(cik)));

  for (const cik10 of matchedCiks) {
    const row = rowByCik.get(cik10);
    if (!row) continue;

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

      if (state.lastSeenByCik[cik10] === newest.accession) {
        results.push({ ticket: row.ticket, cik: cik10, status: "no_change", reportDate });
        continue;
      }

      row["latest filing date"] = newest.filedAt;
      row["latest filing type"] = newest.form;
      row["latest filing period"] = reportDate;
      row["latest filing note"] = row["latest filing note"] || "--";

      state.events.unshift({
        ticket: row.ticket,
        cik: cik10,
        form: newest.form,
        accession: newest.accession,
        filedAt: newest.filedAt,
        primaryDoc: newest.primaryDoc,
        secUrl: newest.secUrl
      });
      state.events = state.events.slice(0, 200);
      state.lastSeenByCik[cik10] = newest.accession;

      writeState(state);
      const acceptedPst = formatAcceptedPst(newest.acceptedAt);
      const acceptedMessage = acceptedPst ? ` (accepted ${acceptedPst} PST)` : ` (uploaded ${nowPst} PST)`;
      const msg = `${row.ticket} new filing: ${newest.form.replace(/-/g, "")} ${reportDate}${acceptedMessage}`;
      await sendDiscord(msg);

      results.push({ ticket: row.ticket, cik: cik10, status: "NEW", reportDate });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ ticket: row.ticket, cik: cik10, status: "error", error: message });
    }
  }

  writeEnriched(rows);
  state.logs = [{
    latest: nowIso,
    "SEC Edgar (atom):": `${Math.max(1, Math.round(atomBytes / 1024))}k bytes`
  }];
  const { date, timePst } = getPstDateTime();
  state.botStatus.latestScanRssFeed = {
    date,
    timePst,
    summary: `matched=${matchedCiks.size}, results=${results.length}`
  };
  writeState(state);

  return NextResponse.json({ ok: true, results });
}
