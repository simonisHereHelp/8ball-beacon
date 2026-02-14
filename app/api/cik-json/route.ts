import { NextResponse } from "next/server";
import { fetchSubmissionsByCik, normalizeCik } from "@/lib/sec";
import { sendDiscord } from "@/lib/sendDiscord";
import { readState, writeState } from "@/lib/storage";

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cikParam = searchParams.get("cik");
  if (!cikParam) {
    return NextResponse.json({ ok: false, error: "Missing cik query param" }, { status: 400 });
  }
  const cik10 = normalizeCik(cikParam);
  const data = await fetchSubmissionsByCik(cik10);
  await sendDiscord(`cik-json: fetched ${cik10}`);

  const state = readState();
  const { date, timePst } = getPstDateTime();
  state.botStatus.latestCikJson = {
    date,
    timePst,
    summary: `cik=${cik10}, ok=true`
  };
  writeState(state);

  return NextResponse.json({ ok: true, cik: cik10, data });
}
