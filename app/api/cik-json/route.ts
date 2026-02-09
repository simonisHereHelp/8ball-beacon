import { NextResponse } from "next/server";
import { fetchSubmissionsByCik, normalizeCik } from "@/lib/sec";
import { sendDiscord } from "@/lib/discord";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cikParam = searchParams.get("cik");
  if (!cikParam) {
    return NextResponse.json({ ok: false, error: "Missing cik query param" }, { status: 400 });
  }
  const cik10 = normalizeCik(cikParam);
  const data = await fetchSubmissionsByCik(cik10);
  await sendDiscord(`cik-json: fetched ${cik10}`);
  return NextResponse.json({ ok: true, cik: cik10, data });
}
