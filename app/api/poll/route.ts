import { NextResponse } from "next/server";
import { readEnriched, writeEnriched, isNewerDate } from "@/lib/enriched";
import { normalizeCik, fetchSubmissionsByCik, pickNewest10Q10K } from "@/lib/sec";
import { readState, writeState } from "@/lib/storage";
import { sendDiscord } from "@/lib/discord";

export const runtime = "nodejs";

export async function GET() {
  const includeAmendments = (process.env.INCLUDE_AMENDMENTS || "true") === "true";
  const rows = readEnriched();
  const state = readState();
  const results: Array<Record<string, string>> = [];

  for (const row of rows) {
    const cik10 = normalizeCik(row.CIK);
    try {
      const sub = await fetchSubmissionsByCik(cik10);
      const newest = pickNewest10Q10K(sub, includeAmendments);

      if (!newest) {
        results.push({ ticket: row.ticket, cik: cik10, status: "no_recent_match" });
        continue;
      }

      const reportDate = newest.reportDate || newest.filedAt;
      if (!reportDate || !isNewerDate(reportDate, row.latest_closing)) {
        results.push({ ticket: row.ticket, cik: cik10, status: "no_change", reportDate });
        continue;
      }

      row.latest_closing = reportDate;
      row.latest_form_found = newest.form;

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
      const msg = `${row.ticket} new filing: ${reportDate} ${newest.form}`;
      await sendDiscord(msg);

      results.push({ ticket: row.ticket, cik: cik10, status: "NEW", reportDate });
    } catch (e: any) {
      results.push({ ticket: row.ticket, cik: cik10, status: "error", error: String(e?.message || e) });
    }
  }

  writeEnriched(rows);
  return NextResponse.json({ ok: true, results });
}
