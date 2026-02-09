import { NextResponse } from "next/server";
import { readEnriched, writeEnriched } from "@/lib/enriched";
import { normalizeCik, fetchSubmissionsByCik, pickNewest10Q10K, secHeaders } from "@/lib/sec";
import { readState, writeState } from "@/lib/storage";
import { sendDiscord } from "@/lib/discord";

export const runtime = "nodejs";

function formatPstTimestamp(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function isEasternDst(date: Date) {
  const year = date.getUTCFullYear();
  const march = new Date(Date.UTC(year, 2, 1));
  const marchDay = march.getUTCDay();
  const secondSunday = 14 - marchDay;
  const dstStart = new Date(Date.UTC(year, 2, secondSunday, 7));

  const november = new Date(Date.UTC(year, 10, 1));
  const novemberDay = november.getUTCDay();
  const firstSunday = 7 - novemberDay;
  const dstEnd = new Date(Date.UTC(year, 10, firstSunday, 6));

  return date >= dstStart && date < dstEnd;
}

function formatAcceptedPst(acceptedAt?: string) {
  if (!acceptedAt) return null;
  const match = acceptedAt.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const baseUtc = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ));
  const offsetHours = isEasternDst(baseUtc) ? 4 : 5;
  const utcDate = new Date(baseUtc.getTime() + offsetHours * 60 * 60 * 1000);
  return formatPstTimestamp(utcDate);
}

function extractTag(content: string, tag: string): string | null {
  const match = content.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function extractCategoryTerm(content: string): string | null {
  const match = content.match(/<category[^>]*term="([^"]+)"[^>]*>/i);
  return match?.[1]?.trim() ?? null;
}

function extractCik(title: string): string | null {
  const match = title.match(/\((\d{10})\)/);
  return match?.[1] ?? null;
}

async function fetchRssEntries(formType: "10-Q" | "10-K") {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&CIK=&type=${formType}&company=&dateb=&owner=include&start=0&count=100&output=atom`;
  const res = await fetch(url, {
    headers: {
      ...secHeaders(),
      "Accept": "application/atom+xml, application/xml, text/xml"
    }
  });
  if (!res.ok) {
    throw new Error(`SEC RSS failed for ${formType}: ${res.status}`);
  }
  const xml = await res.text();
  const entries: Array<{ cik: string; form: string; updated?: string }> = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const title = extractTag(entry, "title");
    if (!title) continue;
    const cik = extractCik(title);
    if (!cik) continue;
    const form = extractCategoryTerm(entry) || formType;
    entries.push({ cik, form, updated: extractTag(entry, "updated") ?? undefined });
  }
  return entries;
}

export async function GET() {
  const includeAmendments = (process.env.INCLUDE_AMENDMENTS || "true") === "true";
  const rows = readEnriched();
  const state = readState();
  const results: Array<Record<string, string>> = [];
  const nowIso = new Date().toISOString();
  const nowPst = formatPstTimestamp(new Date());

  if (state.logs.length === 0) {
    state.logs.push({ at: nowIso, message: "beacon on...." });
  }
  state.logs.push({ at: nowIso, message: "GET api/scan-rss-feed...." });
  await sendDiscord("scanning SEC RSS feed...");

  const rowByCik = new Map(rows.map(row => [normalizeCik(row.CIK), row]));
  const rssEntries = [
    ...(await fetchRssEntries("10-Q")),
    ...(await fetchRssEntries("10-K"))
  ];
  const matchedCiks = new Set(
    rssEntries
      .map(entry => normalizeCik(entry.cik))
      .filter(cik => rowByCik.has(cik))
  );
  await sendDiscord(`scan-rss-feed: ${matchedCiks.size} matched CIKs`);

  for (const cik10 of matchedCiks) {
    const row = rowByCik.get(cik10);
    if (!row) continue;
    try {
      const sub = await fetchSubmissionsByCik(cik10);
      await sendDiscord(`cik-json: fetched ${cik10}`);
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
      const formShort = newest.form.replace(/-/g, "");
      const msg = `${row.ticket} new filing: ${formShort} ${reportDate}${acceptedMessage}`;
      await sendDiscord(msg);

      results.push({ ticket: row.ticket, cik: cik10, status: "NEW", reportDate });
    } catch (e: any) {
      results.push({ ticket: row.ticket, cik: cik10, status: "error", error: String(e?.message || e) });
    }
  }

  writeEnriched(rows);
  state.logs.push({ at: new Date().toISOString(), message: `GET response ${results.length} results` });
  writeState(state);
  return NextResponse.json({ ok: true, results });
}
