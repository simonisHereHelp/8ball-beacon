import { NextResponse } from "next/server";
import { loadEnriched } from "@/lib/schedule";
import {
  normalizeCik,
  fetchSubmissionsByCik,
  pickNewest10Q10K,
  fetchFilingHtml
} from "@/lib/sec";
import { readState, writeState, saveFilingHtml } from "@/lib/storage";
import { sendDiscord } from "@/lib/discord";

export const runtime = "nodejs";

export async function POST() {
  const includeAmendments = (process.env.INCLUDE_AMENDMENTS || "true") === "true";

  const rows = loadEnriched();
  const state = readState();

  const results: any[] = [];

  for (const row of rows) {
    const cik10 = normalizeCik(row.CIK);
    try {
      const sub = await fetchSubmissionsByCik(cik10);
      const newest = pickNewest10Q10K(sub, includeAmendments);

      if (!newest) {
        results.push({ ticket: row.ticket, cik: cik10, status: "no_recent_match" });
        continue;
      }

      const lastSeen = state.lastSeenByCik[cik10];
      if (lastSeen === newest.accession) {
        results.push({ ticket: row.ticket, cik: cik10, status: "no_change", accession: newest.accession });
        continue;
      }

      // New filing detected
      const html = await fetchFilingHtml(newest.secUrl);
      const localPath = saveFilingHtml(row.ticket, newest.accession, html);

      state.lastSeenByCik[cik10] = newest.accession;
      state.events.unshift({
        ticket: row.ticket,
        cik: cik10,
        form: newest.form,
        accession: newest.accession,
        filedAt: newest.filedAt,
        primaryDoc: newest.primaryDoc,
        secUrl: newest.secUrl,
        localHtmlPath: localPath
      });
      state.events = state.events.slice(0, 200);

      writeState(state);

      // Discord message (simple & compatible with your curl structure)
      const msg = `${row.ticket} ${newest.form} 下蛋了 | filed ${newest.filedAt} | ${newest.secUrl}`;
      await sendDiscord(msg);

      results.push({ ticket: row.ticket, cik: cik10, status: "NEW", form: newest.form, accession: newest.accession });
    } catch (e: any) {
      results.push({ ticket: row.ticket, cik: cik10, status: "error", error: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, results });
}
